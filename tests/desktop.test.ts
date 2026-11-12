import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, openDatabase } from '../src/db';
import { DesktopSession, loadDatabasePath } from '../src/desktop/session';
import type { DrawResponse, Participant, TaskDetail } from '../src/shared/contracts';

const temporary: string[] = [];
const sessions: DesktopSession[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'rotator-desktop-'));
  temporary.push(directory);
  const filename = join(directory, 'Team Müller.sqlite3');
  const settings = join(directory, 'profile', 'settings.json');
  const session = new DesktopSession(settings);
  sessions.push(session);
  return { directory, filename, settings, session };
}
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.stop();
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function post<T>(url: string, path: string, data: unknown): Promise<T> {
  const response = await fetch(url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  expect(response.ok).toBe(true);
  return response.json() as Promise<T>;
}

describe('Desktop-Datenbank und Lebenszyklus', () => {
  test('Auswahl und Historie überleben Stoppen und Übertragen nur der SQLite-Hauptdatei', async () => {
    const { directory, filename, settings, session } = fixture();
    const { url } = session.start(filename, true);
    expect(loadDatabasePath(settings)).toBe(filename);
    expect(new URL(url).hostname).toBe('127.0.0.1');
    const person = await post<Participant>(url, '/api/participants', { name: 'Anna' });
    const task = await post<TaskDetail>(url, '/api/tasks', {
      name: 'Daily',
      participantIds: [person.id],
    });
    const draw = await post<DrawResponse>(url, `/api/tasks/${task.id}/draws`, {
      requestId: crypto.randomUUID(),
      expectedVersion: task.version,
    });
    expect(draw).toBeDefined();
    await session.stop();
    for (const suffix of ['-wal', '-shm', '-journal'])
      expect(existsSync(filename + suffix)).toBe(false);
    // Exclusive file access is possible immediately; another computer only receives this file.
    const transferred = join(directory, 'Übertragen.sqlite3');
    copyFileSync(filename, transferred);
    const { url: reopened } = session.start(transferred);
    const response = await fetch(`${reopened}/api/tasks/${task.id}`);
    const restored = (await response.json()) as TaskDetail;
    expect(restored.members[0]!.count).toBe(1);
    const history = await (await fetch(`${reopened}/api/tasks/${task.id}/history`)).json();
    expect(JSON.stringify(history)).toContain('Anna');
    await session.stop();
    await session.stop();
    const db = new Database(transferred, { readonly: true });
    expect(db.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(db.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
    db.close();
  });

  test('Fehlender gespeicherter Pfad erzeugt keine leere Ersatzdatenbank', () => {
    const { session, filename, settings } = fixture();
    expect(() => session.start(filename)).toThrow('fehlt');
    expect(existsSync(filename)).toBe(false);
    expect(existsSync(settings)).toBe(false);
  });

  test('Neue Datei überschreibt weder bestehende Daten noch beliebige andere Dateien', () => {
    const { session, filename } = fixture();
    writeFileSync(filename, 'Vorhandener Inhalt');
    expect(() => session.start(filename, true)).toThrow();
    expect(() => session.start(filename)).toThrow('keine SQLite');
    expect(readFileSync(filename, 'utf8')).toBe('Vorhandener Inhalt');
  });

  test('Pfad wird erst nach erfolgreichem Start gespeichert; Fehler bleibt korrigierbar', async () => {
    const { session, settings, filename } = fixture();
    expect(loadDatabasePath(settings)).toBe('');
    expect(() => session.start('relativ.sqlite3', true)).toThrow('auswählen');
    expect(existsSync(settings)).toBe(false);
    session.start(filename, true);
    expect(() => session.start(filename)).toThrow('läuft bereits');
    await session.stop();
    session.start(loadDatabasePath(settings));
  });

  test('Beschädigte Einstellungen werden erkennbar statt einen falschen Pfad zu verwenden', () => {
    const { directory } = fixture();
    const path = join(directory, 'invalid.json');
    writeFileSync(path, '{');
    expect(() => loadDatabasePath(path)).toThrow();
    writeFileSync(path, JSON.stringify({ databasePath: 'relative.sqlite3' }));
    expect(() => loadDatabasePath(path)).toThrow('ungültig');
  });

  test('Server bleibt bei WAL; Desktop kann vorhandene Server-Daten übernehmen', async () => {
    const { filename, session } = fixture();
    const serverDb = openDatabase(filename);
    expect(serverDb.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    serverDb
      .query('INSERT INTO participants(name, created_at) VALUES (?, ?)')
      .run('Server-Daten', new Date().toISOString());
    closeDatabase(serverDb);
    const { url } = session.start(filename);
    expect(await (await fetch(url + '/api/state')).text()).toContain('Server-Daten');
    await session.stop();
    const reopened = openDatabase(filename);
    expect(reopened.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    closeDatabase(reopened);
  });

  test('Exklusive Desktop-Verbindung verhindert zweite lokale Datenbankinstanz', async () => {
    const { filename, session } = fixture();
    session.start(filename, true);
    const contender = new DesktopSession(join(temporary.at(-1)!, 'second.json'));
    expect(() => contender.start(filename)).toThrow();
    await session.stop();
    sessions.push(contender);
    contender.start(filename);
  }, 15000);

  test('Desktop-Entwicklung liefert statische Dateien über einen absoluten Pfad', async () => {
    const { directory, settings, filename } = fixture();
    const staticRoot = join(directory, 'dist');
    mkdirSync(join(staticRoot, 'assets'), { recursive: true });
    writeFileSync(join(staticRoot, 'index.html'), '<script src="/assets/test.js"></script>');
    writeFileSync(join(staticRoot, 'assets', 'test.js'), 'console.log("Rotator");');
    const session = new DesktopSession(settings, undefined, staticRoot);
    sessions.push(session);
    const { url } = session.start(filename, true);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const html = await response.text();
    const asset = /src="(\/assets\/[^\"]+\.js)"/.exec(html)?.[1];
    expect(asset).toBeDefined();
    const script = await fetch(url + asset);
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('javascript');
  });
});
