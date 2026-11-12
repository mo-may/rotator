import { join, resolve } from 'node:path';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DesktopSession, loadDatabasePath, settingsPath } from './session';

/** Private stdin/stdout channel: no shutdown endpoint or control token in the browser. */
export async function runDesktop(
  assets?: Readonly<Record<string, string>>,
  launcher = resolve(import.meta.dir, '../../.tools/Rotator.Launcher.exe'),
): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Der Desktop-Start benötigt Windows.');
  const settingsFile = settingsPath();
  const session = new DesktopSession(settingsFile, assets, resolve(import.meta.dir, '../../dist'));
  let databasePath = '';
  let error = '';
  try {
    databasePath = loadDatabasePath(settingsFile);
  } catch (cause) {
    error = String(cause);
  }
  const directory = mkdtempSync(join(tmpdir(), 'rotator-launcher-'));
  const executable = join(directory, 'Rotator.Launcher.exe');
  await Bun.write(executable, Bun.file(launcher));
  const child = Bun.spawn([executable], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  const reply = (value: unknown) => {
    child.stdin.write(JSON.stringify(value) + '\n');
    child.stdin.flush();
  };
  reply({ databasePath, error });
  const errors = new Response(child.stderr).text();
  let pending = '';
  const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += value;
      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (!line) continue;
        try {
          const command = JSON.parse(line) as {
            action: string;
            databasePath?: string;
            create?: boolean;
          };
          if (command.action === 'start') {
            reply({
              ok: true,
              ...session.start(command.databasePath ?? '', command.create === true),
            });
          } else if (command.action === 'stop') {
            await session.stop();
            reply({ ok: true });
          } else throw new Error('Unbekannter Desktop-Befehl.');
        } catch (cause) {
          reply({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
        }
      }
    }
    const code = await child.exited;
    if (code !== 0)
      throw new Error(`Das Startfenster konnte nicht ausgeführt werden: ${await errors}`);
  } finally {
    await session.stop();
    child.stdin.end();
    if (child.exitCode === null) child.kill();
    await child.exited;
    unlinkSync(executable);
    rmdirSync(directory);
  }
}

if (import.meta.main) await runDesktop();
