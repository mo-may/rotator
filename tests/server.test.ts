import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { createApp } from '../src/server';
import { openDatabase } from '../src/db';
import { createService } from '../src/service';
import type { DrawResponse, Participant, TaskDetail } from '../src/shared/contracts';

let db: Database;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(':memory:');
  app = createApp({
    db,
    service: createService(db, { pickIndex: () => 0 }),
    auth: { basicPassword: '' },
  });
});
afterEach(() => db.close());

async function write(path: string, data: unknown, method = 'POST'): Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function createTask(name = 'Daily'): Promise<TaskDetail> {
  const response = await write('/api/tasks', { name, description: 'Moderation' });
  expect(response.status).toBe(201);
  return response.json() as Promise<TaskDetail>;
}

async function createParticipant(name: string): Promise<Participant> {
  const response = await write('/api/participants', { name });
  expect(response.status).toBe(201);
  return response.json() as Promise<Participant>;
}

async function addMember(task: TaskDetail, participantId: number): Promise<TaskDetail> {
  const response = await write(`/api/tasks/${task.id}/members`, {
    participantId,
    expectedVersion: task.version,
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<TaskDetail>;
}

describe('HTTP-Integration', () => {
  test('Aufgabe mit ausgewählten Personen wird vollständig angelegt; Auswahl bleibt optional', async () => {
    const anna = await createParticipant('Anna');
    const ben = await createParticipant('Ben');
    await createParticipant('Clara');
    const response = await write('/api/tasks', {
      name: 'Daily',
      participantIds: [anna.id, ben.id],
    });
    expect(response.status).toBe(201);
    const task = (await response.json()) as TaskDetail;
    expect(task.members.map(({ name, active, count }) => ({ name, active, count }))).toEqual([
      { name: 'Anna', active: true, count: 0 },
      { name: 'Ben', active: true, count: 0 },
    ]);
    expect((await createTask('Ohne Auswahl')).members).toEqual([]);
    const empty = await write('/api/tasks', { name: 'Leere Auswahl', participantIds: [] });
    expect(empty.status).toBe(201);
    expect(((await empty.json()) as TaskDetail).members).toEqual([]);
  });

  test('Ungültige Teilnehmerlisten und inzwischen entfernte Personen hinterlassen keine Aufgabe', async () => {
    const person = await createParticipant('Anna');
    for (const participantIds of [
      null,
      '1',
      [String(person.id)],
      [0],
      [-1],
      [1.5],
      [person.id, person.id],
    ]) {
      const response = await write('/api/tasks', { name: 'Ungültig', participantIds });
      expect(response.status).toBe(400);
    }
    expect((await write(`/api/participants/${person.id}`, {}, 'DELETE')).status).toBe(200);
    expect(
      (await write('/api/tasks', { name: 'Entfernt', participantIds: [person.id] })).status,
    ).toBe(404);
    expect((await write('/api/tasks', { name: 'Unbekannt', participantIds: [99999] })).status).toBe(
      404,
    );
    expect((await (await app.request('/api/state')).json()).tasks).toEqual([]);
  });

  test('Person entfernen aktualisiert Team und Aufgabe, bewahrt aber die Auswahlhistorie', async () => {
    let task = await createTask();
    const anna = await createParticipant('Anna');
    task = await addMember(task, anna.id);
    task = await addMember(task, (await createParticipant('Ben')).id);
    const result = (await (
      await write(`/api/tasks/${task.id}/draws`, {
        requestId: 'before-http-removal',
        expectedVersion: task.version,
      })
    ).json()) as DrawResponse;

    const response = await write(`/api/participants/${anna.id}`, {}, 'DELETE');
    expect(response.status).toBe(200);
    const removal = (await response.json()) as { id: number; name: string; removedAt: string };
    expect(removal).toMatchObject({ id: anna.id, name: 'Anna' });
    expect(removal.removedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const state = (await (await app.request('/api/state')).json()) as {
      participants: Participant[];
    };
    expect(state.participants.map((person) => person.name)).toEqual(['Ben']);
    const current = (await (await app.request(`/api/tasks/${task.id}`)).json()) as TaskDetail;
    expect(current.currentDraw).toBeNull();
    expect(current.members.map((member) => member.name)).toEqual(['Ben']);
    expect(current.members[0]?.count).toBe(0);
    expect(current.history).toEqual(result.task.history);
    expect(current.events[0]?.type).toBe('participant_removed');

    const stale = await write(`/api/tasks/${task.id}/draws`, {
      requestId: 'stale-http-removal',
      expectedVersion: result.task.version,
    });
    expect(stale.status).toBe(409);
    expect((await write(`/api/participants/${anna.id}`, {}, 'DELETE')).status).toBe(404);
    expect((await write(`/api/participants/${anna.id}`, { name: 'Anne' }, 'PATCH')).status).toBe(
      404,
    );
    expect(
      (
        await write(`/api/tasks/${task.id}/members`, {
          participantId: anna.id,
          expectedVersion: current.version,
        })
      ).status,
    ).toBe(404);
  });

  test('Optionales Basic Auth behält die Browser-Challenge im API-Errorhandler', async () => {
    app = createApp({
      db,
      auth: { basicUser: 'team', basicPassword: 'intern', timeZone: 'Europe/Berlin' },
    });

    expect((await app.request('/healthz')).status).toBe(200);
    const blocked = await app.request('/api/config');
    expect(blocked.status).toBe(401);
    expect(blocked.headers.get('www-authenticate')).toBe('Basic realm="Rotator"');
    expect(await blocked.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });

    const authorization = `Basic ${Buffer.from('team:intern').toString('base64')}`;
    const config = await app.request('/api/config', { headers: { authorization } });
    expect(await config.json()).toEqual({ timeZone: 'Europe/Berlin' });

    const created = await app.request('/api/tasks', {
      method: 'POST',
      headers: { authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Daily' }),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get('set-cookie')).toBeNull();
  });

  test('Hauptablauf: anlegen, auswählen, korrigieren, deaktivieren, archivieren und Historie lesen', async () => {
    let task = await createTask();
    const anna = await createParticipant('Anna');
    const ben = await createParticipant('Ben');
    task = await addMember(task, anna.id);
    task = await addMember(task, ben.id);
    expect(task.candidates).toHaveLength(2);

    const drawResponse = await write(`/api/tasks/${task.id}/draws`, {
      requestId: 'main-flow',
      expectedVersion: task.version,
    });
    expect(drawResponse.status).toBe(201);
    const result = (await drawResponse.json()) as DrawResponse;
    expect(result.draw.name).toBe('Anna');
    expect(result.draw.countAfter).toBe(1);
    expect(result.task.currentDraw?.id).toBe(result.draw.id);

    const corrected = await write(
      `/api/tasks/${task.id}/members/${result.draw.membershipId}/corrections`,
      { count: 8, reason: 'Vorherige Übernahmen importiert', expectedVersion: result.task.version },
    );
    expect(corrected.status).toBe(200);
    task = (await corrected.json()) as TaskDetail;
    expect(task.members.find((member) => member.participantId === anna.id)?.count).toBe(8);
    expect(task.canUndo).toBe(false);

    const inactive = await write(
      `/api/tasks/${task.id}/members/${result.draw.membershipId}`,
      { active: false, expectedVersion: task.version },
      'PATCH',
    );
    expect(inactive.status).toBe(200);
    task = (await inactive.json()) as TaskDetail;
    expect(task.activeCount).toBe(1);
    expect(task.currentDraw?.name).toBe('Anna');

    const archived = await write(
      `/api/tasks/${task.id}`,
      { archived: true, expectedVersion: task.version },
      'PATCH',
    );
    expect(archived.status).toBe(200);
    task = (await archived.json()) as TaskDetail;
    expect(task.archived).toBe(true);
    const blocked = await write(`/api/tasks/${task.id}/draws`, {
      requestId: 'archived',
      expectedVersion: task.version,
    });
    expect(blocked.status).toBe(409);

    const historyResponse = await app.request(`/api/tasks/${task.id}/history`);
    expect(historyResponse.status).toBe(200);
    const history = (await historyResponse.json()) as {
      history: unknown[];
      events: { description: string }[];
    };
    expect(history.history).toHaveLength(1);
    expect(
      history.events.some((event) => event.description.includes('Vorherige Übernahmen importiert')),
    ).toBe(true);
    const stateResponse = await app.request('/api/state');
    expect(stateResponse.status).toBe(200);
    expect(await stateResponse.json()).toMatchObject({
      tasks: [{ id: task.id, archived: true }],
      participants: [{ name: 'Anna' }, { name: 'Ben' }],
    });
  });

  test('Idempotente Wiederholung erhöht nichts erneut, neuer veralteter Klick erhält 409', async () => {
    let task = await createTask();
    task = await addMember(task, (await createParticipant('Anna')).id);
    const input = { requestId: 'retry-http', expectedVersion: task.version };
    const first = (await (
      await write(`/api/tasks/${task.id}/draws`, input)
    ).json()) as DrawResponse;
    const retry = (await (
      await write(`/api/tasks/${task.id}/draws`, input)
    ).json()) as DrawResponse;
    expect(retry.replayed).toBe(true);
    expect(retry.draw.id).toBe(first.draw.id);
    expect(retry.task.members[0]?.count).toBe(1);
    const stale = await write(`/api/tasks/${task.id}/draws`, {
      ...input,
      requestId: 'new-stale-click',
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: 'VERSION_CONFLICT' } });
  });

  test('Neue Zuordnung startet auch per HTTP beim aktiven Minimum', async () => {
    let task = await createTask();
    task = await addMember(task, (await createParticipant('Anna')).id);
    const correction = await write(
      `/api/tasks/${task.id}/members/${task.members[0]!.id}/corrections`,
      { count: 7, reason: 'Bestand übernommen', expectedVersion: task.version },
    );
    task = (await correction.json()) as TaskDetail;
    task = await addMember(task, (await createParticipant('Ben')).id);
    expect(task.members.find((member) => member.name === 'Ben')?.count).toBe(7);
    expect(task.history).toHaveLength(0);
  });

  test('Rücknahme ist über den HTTP-Endpunkt atomar und sichtbar', async () => {
    let task = await createTask();
    task = await addMember(task, (await createParticipant('Anna')).id);
    const result = (await (
      await write(`/api/tasks/${task.id}/draws`, {
        requestId: 'undo-http',
        expectedVersion: task.version,
      })
    ).json()) as DrawResponse;
    const response = await write(`/api/tasks/${task.id}/draws/${result.draw.id}/undo`, {
      expectedVersion: result.task.version,
    });
    expect(response.status).toBe(200);
    task = (await response.json()) as TaskDetail;
    expect(task.currentDraw).toBeNull();
    expect(task.members[0]?.count).toBe(0);
    expect(task.history[0]?.undoneAt).not.toBeNull();
  });

  test('Globale Umbenennung und Aufgabenbearbeitung verwenden den vereinbarten Vertrag', async () => {
    let task = await createTask();
    const anna = await createParticipant('Anna');
    task = await addMember(task, anna.id);
    const rename = await write(`/api/participants/${anna.id}`, { name: 'Anne' }, 'PATCH');
    expect(rename.status).toBe(200);
    expect(await rename.json()).toMatchObject({ id: anna.id, name: 'Anne' });
    const response = await app.request(`/api/tasks/${task.id}`);
    task = (await response.json()) as TaskDetail;
    expect(task.members[0]?.name).toBe('Anne');
    const edit = await write(
      `/api/tasks/${task.id}`,
      { name: 'Daily-Moderation', description: 'Jeden Morgen', expectedVersion: task.version },
      'PATCH',
    );
    expect(edit.status).toBe(200);
    expect(await edit.json()).toMatchObject({
      name: 'Daily-Moderation',
      description: 'Jeden Morgen',
    });
  });

  test('Korrekturen ohne Pflichtbegründung werden ohne Änderung abgelehnt', async () => {
    let task = await createTask();
    task = await addMember(task, (await createParticipant('Anna')).id);
    const response = await write(
      `/api/tasks/${task.id}/members/${task.members[0]!.id}/corrections`,
      { count: 5, reason: ' ', expectedVersion: task.version },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    const current = (await (await app.request(`/api/tasks/${task.id}`)).json()) as TaskDetail;
    expect(current.members[0]?.count).toBe(0);
    expect(current.version).toBe(task.version);
  });

  test('Ungültiges JSON und unpassende JSON-Strukturen ergeben 400', async () => {
    for (const raw of ['{', 'null', '[]', '"text"']) {
      const response = await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty('error.message');
    }
  });

  test('Ungültige IDs, unbekannte Ressourcen und falsche Eingabetypen sind kontrollierte Fehler', async () => {
    for (const badId of ['abc', '0', '-1', '1.5', '9007199254740992']) {
      const response = await app.request(`/api/tasks/${badId}`);
      expect(response.status).toBe(400);
    }
    expect((await app.request('/api/tasks/99999')).status).toBe(404);
    expect((await app.request('/api/unknown')).status).toBe(404);
    const task = await createTask();
    const invalidPerson = await write(`/api/tasks/${task.id}/members`, {
      participantId: {},
      expectedVersion: task.version,
    });
    expect(invalidPerson.status).toBe(400);
    const invalidActive = await write(
      `/api/tasks/${task.id}/members/1`,
      { active: 'yes', expectedVersion: task.version },
      'PATCH',
    );
    expect(invalidActive.status).toBe(400);
  });

  test('Hono-Body-Limit erlaubt gültige JSON-Anfragen und begrenzt große Bodies', async () => {
    const valid = await write('/api/tasks', {
      name: 'Kleine Aufgabe',
      description: 'Normaler JSON-Body',
    });
    expect(valid.status).toBe(201);
    const oversized = await write('/api/tasks', {
      name: 'Große Aufgabe',
      description: 'x'.repeat(20_000),
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: { code: 'BODY_TOO_LARGE' } });
  });

  test('Healthcheck ist ohne Sitzung verfügbar und prüft den DB-Zugriff', async () => {
    const response = await app.request('/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
