import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { buildLauncher } from './build-launcher';

const root = resolve(import.meta.dir, '..');
const generated = join(root, '.tools', 'desktop-entry.ts');
await mkdir(join(root, '.tools'), { recursive: true });
await mkdir(join(root, 'release'), { recursive: true });
await buildLauncher();

const files = Array.from(
  new Bun.Glob('**/*').scanSync({ cwd: join(root, 'dist'), onlyFiles: true }),
).sort();
if (!files.includes('index.html')) throw new Error('Zuerst bun run build ausführen.');
const imports = files.map(
  (file, index) =>
    `import asset${index} from ${JSON.stringify('../dist/' + file.replaceAll('\\', '/'))} with { type: 'file' };`,
);
await writeFile(
  generated,
  [
    "import { runDesktop } from '../src/desktop/main';",
    "import launcher from './Rotator.Launcher.exe' with { type: 'file' };",
    ...imports,
    'await runDesktop({',
    ...files.map(
      (file, index) => `  ${JSON.stringify('/' + file.replaceAll('\\', '/'))}: asset${index},`,
    ),
    '}, launcher);',
  ].join('\n'),
);

const result = await Bun.build({
  entrypoints: [generated],
  minify: true,
  compile: {
    target: 'bun-windows-x64',
    outfile: join(root, 'release', 'Rotator.exe'),
    autoloadDotenv: false,
    autoloadBunfig: false,
    windows: {
      hideConsole: true,
      title: 'Rotator',
      version: '1.0.0.0',
      description: 'Rotator für Teamaufgaben',
    },
  },
});
if (!result.success) throw new AggregateError(result.logs, 'EXE konnte nicht gebaut werden.');
console.log(`EXE erstellt: ${relative(root, join(root, 'release', 'Rotator.exe'))}`);
