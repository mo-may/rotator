import { randomUUID } from 'node:crypto';
import type { DrawResponse, Participant, TaskDetail } from '../src/shared/contracts';

// Only these uniquely named test resources are created or removed. No production volume is used.
const suffix = randomUUID().slice(0, 12);
const container = `reihum-test-${suffix}`;
const volume = `reihum-test-data-${suffix}`;
const image = `reihum-test:${suffix}`;
const password = `test-password-${randomUUID()}`;
let base = '';
const authorization = `Basic ${Buffer.from(`team:${password}`).toString('base64')}`;
let failed = false;

async function docker(args: string[], tolerateFailure = false): Promise<string> {
  const process = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0 && !tolerateFailure)
    throw new Error(`Docker ${args[0]} fehlgeschlagen:\n${err}\n${out}`);
  return out.trim();
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(base + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: authorization,
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = (await response.json()) as T;
  assert(response.ok, `HTTP ${response.status} bei ${path}: ${JSON.stringify(result)}`);
  return result;
}
async function waitUntilReady(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(base + '/healthz')).ok) return;
    } catch {
      /* Container is starting. */
    }
    await Bun.sleep(250);
  }
  throw new Error(`Container ist nicht bereit:\n${await docker(['logs', container], true)}`);
}
async function refreshAddress(): Promise<void> {
  const address = (await docker(['port', container, '3000/tcp'])).split('\n')[0]!;
  assert(/^127\.0\.0\.1:\d+$/.test(address), `Unerwartete Portfreigabe: ${address}`);
  base = `http://${address}`;
}

async function launch(): Promise<void> {
  await docker([
    'run',
    '--detach',
    '--name',
    container,
    '--label',
    'reihum.test=true',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m,mode=1777',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--mount',
    `type=volume,source=${volume},target=/data`,
    '--publish',
    '127.0.0.1::3000',
    '--env',
    'BASIC_AUTH_USER=team',
    '--env',
    `BASIC_AUTH_PASSWORD=${password}`,
    image,
  ]);
  await refreshAddress();
  await waitUntilReady();
  assert(
    (await fetch(base + '/api/state')).status === 401,
    'Optionaler Basic-Auth-Schutz ist nicht aktiv.',
  );
}

try {
  console.log('1/5 Docker-Image bauen …');
  await docker(['build', '--tag', image, '.']);
  await docker(['volume', 'create', '--label', 'reihum.test=true', volume]);
  console.log('2/5 Nonroot-Container mit schreibgeschütztem Rootdateisystem starten …');
  await launch();
  assert(
    (await docker(['exec', container, 'id', '-u'])) !== '0',
    'Container läuft unerwartet als root.',
  );
  let task = await api<TaskDetail>('/api/tasks', {
    name: 'Docker-Persistenztest',
    description: 'Isolierter automatischer Test',
  });
  for (const name of ['Testperson A', 'Testperson B']) {
    const person = await api<Participant>('/api/participants', { name });
    task = await api<TaskDetail>(`/api/tasks/${task.id}/members`, {
      participantId: person.id,
      expectedVersion: task.version,
    });
  }
  const request = { requestId: randomUUID(), expectedVersion: task.version };
  const chosen = await api<DrawResponse>(`/api/tasks/${task.id}/draws`, request);
  const replay = await api<DrawResponse>(`/api/tasks/${task.id}/draws`, request);
  assert(
    replay.replayed && replay.draw.id === chosen.draw.id,
    'Wiederholte Anfrage hat eine neue Auswahl ausgelöst.',
  );
  assert(
    chosen.task.members.reduce((sum, member) => sum + member.count, 0) === 1,
    'Auswahlstand wurde falsch erhöht.',
  );
  console.log('3/5 Laufendes WAL-Backup erstellen und prüfen …');
  await docker(['exec', container, 'bun', 'src/cli.ts', 'backup', '/data/backups/smoke.sqlite3']);
  await docker(['exec', container, 'bun', 'src/cli.ts', 'check', '/data/backups/smoke.sqlite3']);
  console.log('4/5 Container ersetzen und persistierte Daten prüfen …');
  await docker(['stop', '--time', '10', container]);
  await docker(['rm', container]);
  await launch();
  task = await api<TaskDetail>(`/api/tasks/${task.id}`);
  assert(
    task.currentDraw?.id === chosen.draw.id && task.history.length === 1,
    'Auswahl hat den Containerwechsel nicht überstanden.',
  );
  assert(
    task.members.reduce((sum, member) => sum + member.count, 0) === 1,
    'Auswahlstände haben den Containerwechsel nicht überstanden.',
  );
  const second = await api<DrawResponse>(`/api/tasks/${task.id}/draws`, {
    requestId: randomUUID(),
    expectedVersion: task.version,
  });
  assert(second.task.history.length === 2, 'Zweite Testauswahl fehlt.');
  console.log('5/5 Offline wiederherstellen und ursprünglichen Stand prüfen …');
  await docker(['stop', '--time', '10', container]);
  const restore =
    "import {copyFileSync,rmSync} from 'node:fs'; for (const suffix of ['-wal','-shm']) rmSync('/data/chooser.sqlite3'+suffix,{force:true}); copyFileSync('/data/backups/smoke.sqlite3','/data/chooser.sqlite3');";
  await docker([
    'run',
    '--rm',
    '--read-only',
    '--mount',
    `type=volume,source=${volume},target=/data`,
    image,
    'bun',
    '-e',
    restore,
  ]);
  await docker(['start', container]);
  await refreshAddress();
  await waitUntilReady();
  task = await api<TaskDetail>(`/api/tasks/${task.id}`);
  assert(
    task.history.length === 1 && task.currentDraw?.id === chosen.draw.id,
    'Backup wurde nicht korrekt wiederhergestellt.',
  );
  assert(
    task.members.reduce((sum, member) => sum + member.count, 0) === 1,
    'Wiederhergestellter Auswahlstand ist falsch.',
  );
  console.log(
    'Docker-Build, Basic Auth, Auswahl, Idempotenz, Nonroot-Persistenz und Backup/Restore erfolgreich.',
  );
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await docker(['rm', '--force', container], true);
  await docker(['volume', 'rm', volume], true);
  await docker(['image', 'rm', image], true);
}
if (failed) process.exitCode = 1;
