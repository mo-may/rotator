import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const usage = `Rotator Datenbankverwaltung

  bun run src/cli.ts backup <zieldatei>
  bun run src/cli.ts check [datenbankdatei]

DATABASE_PATH bestimmt die Quelldatenbank (Standard: ./data/chooser.sqlite3).
Backup legt eine neue, konsistente SQLite-Datei an und überschreibt keine Datei.
Die Anwendung initialisiert die Datenbank beim ersten Start.
`;

function sourcePath(override?: string): string {
  const filename = resolve(override ?? process.env.DATABASE_PATH ?? './data/chooser.sqlite3');
  if (!existsSync(filename) || !statSync(filename).isFile()) {
    throw new Error(`Datenbankdatei existiert nicht: ${filename}`);
  }
  return filename;
}

function assertIntegrity(filename: string): void {
  const database = new Database(filename, { readonly: true, create: false, strict: true });
  try {
    const results = database.query('PRAGMA integrity_check').all() as Array<
      Record<string, unknown>
    >;
    if (results.length !== 1 || Object.values(results[0] ?? {})[0] !== 'ok') {
      throw new Error(`Integritätsprüfung fehlgeschlagen: ${JSON.stringify(results)}`);
    }
    const foreignKeys = database.query('PRAGMA foreign_key_check').all();
    if (foreignKeys.length > 0) {
      throw new Error(`Fremdschlüsselprüfung fehlgeschlagen: ${JSON.stringify(foreignKeys)}`);
    }
  } finally {
    database.close();
  }
}

function backup(targetArgument: string): void {
  const source = sourcePath();
  const target = resolve(targetArgument);
  if (source === target || existsSync(target)) {
    throw new Error(`Zieldatei existiert bereits und wird nicht überschrieben: ${target}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  const temporary = resolve(dirname(target), `.reihum-backup-${randomUUID()}.sqlite3`);
  const database = new Database(source, { readonly: true, create: false, strict: true });
  try {
    database.run('PRAGMA busy_timeout = 5000');
    // Parameterbindung hält auch Dateinamen mit Leerzeichen oder Apostrophen sicher.
    database.query('VACUUM INTO ?').run(temporary);
    assertIntegrity(temporary);
    // Hardlink im selben Verzeichnis veröffentlicht den geprüften Snapshot atomar.
    // Anders als rename überschreibt link auch bei konkurrierendem Aufruf kein Ziel.
    linkSync(temporary, target);
    console.log(`Backup erstellt und geprüft: ${target}`);
  } finally {
    database.close();
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

try {
  const [command, argument, ...extra] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || !command) {
    console.log(usage);
  } else if (command === 'backup' && argument && extra.length === 0) {
    backup(argument);
  } else if (command === 'check' && extra.length === 0) {
    const filename = sourcePath(argument);
    assertIntegrity(filename);
    console.log(`Integrität und Fremdschlüssel in Ordnung: ${filename}`);
  } else {
    throw new Error(`Ungültiger Aufruf.\n\n${usage}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
