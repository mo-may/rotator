import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const temporaryDirectories: string[] = [];
const root = resolve(import.meta.dir, '..');

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'reihum-cli-'));
  temporaryDirectories.push(directory);
  const source = join(directory, 'source.sqlite3');
  const database = new Database(source);
  database.run('PRAGMA journal_mode = WAL');
  database.run('CREATE TABLE entries (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  database.query('INSERT INTO entries (name) VALUES (?)').run('Anna');
  return { directory, source, database };
}

function cli(source: string, ...args: string[]) {
  return Bun.spawnSync([process.execPath, 'src/cli.ts', ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_PATH: source },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    // Only remove the files in our own freshly created, non-nested fixture folder.
    for (const filename of readdirSync(directory)) unlinkSync(join(directory, filename));
    rmdirSync(directory);
  }
});

describe('database CLI', () => {
  test('backs up a live WAL database including committed data and quoted paths', () => {
    const { directory, source, database } = fixture();
    const target = join(directory, "team's snapshot.sqlite3");
    try {
      const result = cli(source, 'backup', target);
      expect(new TextDecoder().decode(result.stderr)).toBe('');
      expect(result.exitCode).toBe(0);
      const snapshot = new Database(target, { readonly: true });
      try {
        expect(snapshot.query('SELECT name FROM entries').get()).toEqual({ name: 'Anna' });
      } finally {
        snapshot.close();
      }
      expect(cli(source, 'check', target).exitCode).toBe(0);
      expect(readdirSync(directory).some((name) => name.startsWith('.reihum-backup-'))).toBe(false);
    } finally {
      database.close();
    }
  });

  test('does not overwrite an existing backup', () => {
    const { directory, source, database } = fixture();
    const target = join(directory, 'snapshot.sqlite3');
    try {
      expect(cli(source, 'backup', target).exitCode).toBe(0);
      database.query('INSERT INTO entries (name) VALUES (?)').run('Ben');
      expect(cli(source, 'backup', target).exitCode).toBe(1);
      const snapshot = new Database(target, { readonly: true });
      try {
        expect(snapshot.query('SELECT COUNT(*) AS count FROM entries').get()).toEqual({ count: 1 });
      } finally {
        snapshot.close();
      }
    } finally {
      database.close();
    }
  });

  test('missing source is rejected without creating a database', () => {
    const { directory, database } = fixture();
    database.close();
    const missing = join(directory, 'missing.sqlite3');
    expect(cli(missing, 'backup', join(directory, 'snapshot.sqlite3')).exitCode).toBe(1);
    expect(existsSync(missing)).toBe(false);
    expect(cli(missing, 'check').exitCode).toBe(1);
  });

  test('foreign-key violations are rejected and no invalid backup is published', () => {
    const { directory, source, database } = fixture();
    const target = join(directory, 'invalid.sqlite3');
    try {
      database.run('PRAGMA foreign_keys = OFF');
      database.run('CREATE TABLE refs (entry_id INTEGER REFERENCES entries(id))');
      database.run('INSERT INTO refs (entry_id) VALUES (999)');
      expect(cli(source, 'check').exitCode).toBe(1);
      expect(cli(source, 'backup', target).exitCode).toBe(1);
      expect(existsSync(target)).toBe(false);
      expect(readdirSync(directory).some((name) => name.startsWith('.reihum-backup-'))).toBe(false);
    } finally {
      database.close();
    }
  });
});
