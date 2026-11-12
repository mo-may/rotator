import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Open and migrate one local SQLite database. Call close() on shutdown. */
export function openDatabase(
  path = process.env.DATABASE_PATH ?? './data/chooser.sqlite3',
  options: { create?: boolean; desktop?: boolean } = {},
): Database {
  if (path !== ':memory:' && options.create !== false)
    mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: options.create ?? true, strict: true });
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') {
      // Desktop owns the file until shutdown. DELETE avoids persistent WAL sidecars
      // in a synced folder; the regular server keeps WAL for concurrent requests.
      if (options.desktop) db.exec('PRAGMA locking_mode = EXCLUSIVE;');
      const mode = options.desktop ? 'DELETE' : 'WAL';
      const result = db.query(`PRAGMA journal_mode = ${mode}`).get() as { journal_mode: string };
      if (result.journal_mode.toUpperCase() !== mode) {
        throw new Error('Die Datenbank ist noch geöffnet. Bitte die andere Instanz beenden.');
      }
      db.exec('PRAGMA synchronous = FULL;');
    }
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Refuse a successful shutdown when another connection prevents a full checkpoint. */
export function closeDatabase(db: Database): void {
  const mode = db.query('PRAGMA journal_mode').get() as { journal_mode: string };
  if (mode.journal_mode === 'wal') {
    const checkpoint = db.query('PRAGMA wal_checkpoint(TRUNCATE)').get() as { busy: number };
    if (checkpoint.busy !== 0) {
      throw new Error(
        'Die Datenbank ist noch geöffnet. Andere Zugriffe beenden und erneut stoppen.',
      );
    }
  }
  db.close(true);
}

/** Deliberately small, ordered migrations; never replace existing tables on startup. */
export function migrate(db: Database): void {
  const migrations = [
    `CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      archived_at TEXT,
      current_draw_id TEXT REFERENCES draws(id),
      version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE participants (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE task_memberships (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      count INTEGER NOT NULL CHECK (typeof(count) = 'integer' AND count >= 0 AND count <= 1000000000),
      created_at TEXT NOT NULL,
      UNIQUE (task_id, participant_id)
    );
    CREATE TABLE draws (
      id TEXT PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      membership_id INTEGER NOT NULL REFERENCES task_memberships(id),
      participant_id INTEGER NOT NULL REFERENCES participants(id),
      winner_name TEXT NOT NULL,
      method TEXT NOT NULL CHECK (method IN ('random', 'direct')),
      count_before INTEGER NOT NULL,
      count_after INTEGER NOT NULL,
      candidates_json TEXT NOT NULL,
      previous_draw_id TEXT REFERENCES draws(id),
      request_id TEXT NOT NULL,
      expected_version INTEGER NOT NULL,
      result_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      undone_at TEXT,
      UNIQUE (task_id, request_id)
    );
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX memberships_by_task ON task_memberships(task_id, active, count);
    CREATE INDEX draws_by_task ON draws(task_id, created_at);
    CREATE INDEX audit_by_task ON audit_events(task_id, created_at);`,
    `ALTER TABLE participants ADD COLUMN deleted_at TEXT;
    CREATE INDEX participants_by_visibility ON participants(deleted_at, name);`,
    `ALTER TABLE participants ADD COLUMN absences_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE participants ADD COLUMN availability_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tasks ADD COLUMN schedule_json TEXT;
    ALTER TABLE tasks ADD COLUMN next_due_date TEXT;
    ALTER TABLE draws ADD COLUMN manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1));
    ALTER TABLE draws ADD COLUMN previous_due_date TEXT;`,
  ];

  db.transaction(() => {
    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    const current = db
      .query<{ version: number }, []>(
        'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
      )
      .get()!.version;
    if (current > migrations.length)
      throw new Error('Die Datenbank wurde mit einer neueren Anwendungsversion erstellt.');
    for (let index = current; index < migrations.length; index++) {
      db.exec(migrations[index]!);
      db.query('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(
        index + 1,
        new Date().toISOString(),
      );
    }
  }).immediate();
}
