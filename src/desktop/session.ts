import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';
import { closeDatabase, openDatabase } from '../db';
import { createApp } from '../server';

export function settingsPath(): string {
  if (!process.env.LOCALAPPDATA) throw new Error('Windows-Benutzerverzeichnis nicht gefunden.');
  return join(process.env.LOCALAPPDATA, 'Rotator', 'settings.json');
}

export function loadDatabasePath(settingsFile: string): string {
  if (!existsSync(settingsFile)) return '';
  const settings: unknown = JSON.parse(readFileSync(settingsFile, 'utf8'));
  if (
    typeof settings !== 'object' ||
    settings === null ||
    !('databasePath' in settings) ||
    typeof settings.databasePath !== 'string' ||
    !isAbsolute(settings.databasePath)
  )
    throw new Error('Der gespeicherte Datenbankpfad ist ungültig. Bitte eine Datei auswählen.');
  return settings.databasePath;
}

function saveDatabasePath(settingsFile: string, databasePath: string): void {
  mkdirSync(dirname(settingsFile), { recursive: true });
  const temporary = `${settingsFile}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ databasePath }, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, settingsFile);
}

export class DesktopSession {
  private db?: Database;
  private server?: ReturnType<typeof Bun.serve>;
  private stopping = false;

  constructor(
    private readonly settingsFile: string,
    private readonly assets?: Readonly<Record<string, string>>,
    private readonly staticRoot?: string,
  ) {}

  start(filename: string, create = false): { url: string; databasePath: string } {
    if (this.db) throw new Error('Rotator läuft bereits. Bitte zuerst stoppen.');
    if (!filename || !isAbsolute(filename)) throw new Error('Bitte eine SQLite-Datei auswählen.');
    const databasePath = resolve(filename);
    if (create) {
      // Never truncate/overwrite an existing file, even after a Save dialog confirmed it.
      const descriptor = openSync(databasePath, 'wx');
      closeSync(descriptor);
    } else {
      if (!existsSync(databasePath)) {
        throw new Error(
          'Die gespeicherte Datei fehlt. Synchronisierung prüfen oder eine andere Datei öffnen.',
        );
      }
      const header = Buffer.alloc(16);
      const descriptor = openSync(databasePath, 'r');
      try {
        readSync(descriptor, header, 0, 16, 0);
      } finally {
        closeSync(descriptor);
      }
      if (header.toString('utf8') !== 'SQLite format 3\0') {
        throw new Error(
          'Die ausgewählte Datei ist keine SQLite-Datenbank. Für eine neue Datei „Neue Datei“ wählen.',
        );
      }
    }
    const db = openDatabase(databasePath, { create: false, desktop: true });
    try {
      const app = createApp({
        db,
        assets: this.assets,
        staticRoot: this.staticRoot,
        auth: { basicPassword: '', timeZone: 'Europe/Berlin' },
      });
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: (request) =>
          this.stopping
            ? new Response('Rotator wird beendet.', { status: 503 })
            : app.fetch(request),
      });
      try {
        saveDatabasePath(this.settingsFile, databasePath);
      } catch (error) {
        void server.stop(true);
        throw error;
      }
      this.db = db;
      this.server = server;
      return { url: `http://127.0.0.1:${server.port}`, databasePath };
    } catch (error) {
      closeDatabase(db);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.db) return;
    this.stopping = true;
    try {
      // No new mutations; drain HTTP requests before releasing the database file.
      await this.server!.stop();
      closeDatabase(this.db);
      this.db = undefined;
      this.server = undefined;
    } finally {
      this.stopping = false;
    }
  }
}
