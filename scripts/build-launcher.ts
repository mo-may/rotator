import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function buildLauncher(): Promise<string> {
  if (process.platform !== 'win32') throw new Error('Die EXE wird unter Windows gebaut.');
  const root = resolve(import.meta.dir, '..');
  const output = join(root, '.tools', 'Rotator.Launcher.exe');
  await mkdir(join(root, '.tools'), { recursive: true });
  const compiler = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
  );
  const result = Bun.spawn(
    [
      compiler,
      '/nologo',
      '/target:winexe',
      '/optimize+',
      '/utf8output',
      `/out:${output}`,
      '/reference:System.Windows.Forms.dll',
      '/reference:System.Drawing.dll',
      '/reference:System.Web.Extensions.dll',
      join(root, 'src', 'desktop', 'Launcher.cs'),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
    result.exited,
  ]);
  if (code !== 0)
    throw new Error(`Windows-Startfenster konnte nicht gebaut werden:\n${stdout}\n${stderr}`);
  return output;
}

if (import.meta.main) await buildLauncher();
