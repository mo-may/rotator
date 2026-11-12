import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { openDatabase } from '../src/db';
import { createService, type ChooserService } from '../src/service';
import { createApp } from '../src/server';
import { nextDue } from '../src/shared/scheduling';

let db: Database;
let service: ChooserService;
let now: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  now = '2026-11-12T12:00:00.000Z';
  service = createService(db, { now: () => now, timeZone: 'Europe/Berlin', pickIndex: () => 0 });
});
afterEach(() => db.close());
function setup() {
  const anna = service.createParticipant({ name: 'Anna' });
  const ben = service.createParticipant({ name: 'Ben' });
  return service.createTask({
    name: 'Daily',
    description: 'Moderation',
    participantIds: [anna.id, ben.id],
  });
}

test('Abwesenheiten gelten inklusive lokaler Tagesgrenzen, kehren automatisch zurück und lassen manuell inaktive Personen inaktiv', () => {
  let task = setup();
  const anna = task.members[0]!;
  service.setAbsences(anna.participantId, {
    expectedVersion: 0,
    absences: [{ start: '2026-11-13', end: '2026-11-14' }],
  });
  task = service.getTask(task.id);
  expect(task.candidates).toHaveLength(2);
  now = '2026-11-12T23:00:00.000Z'; // 13.11., 00:00 Berlin
  expect(service.getTask(task.id).candidates.map((member) => member.name)).toEqual(['Ben']);
  expect(
    service.state().participants.find((person) => person.id === anna.participantId)?.absent,
  ).toBe(true);
  now = '2026-11-14T22:59:59.999Z';
  expect(service.getTask(task.id).activeCount).toBe(1);
  const draw = service.draw(task.id, { expectedVersion: task.version, requestId: 'absence' });
  expect(draw.draw.name).toBe('Ben');
  expect(draw.task.members.find((member) => member.id === anna.id)?.count).toBe(0);
  now = '2026-11-14T23:00:00.000Z';
  expect(service.getTask(task.id).candidates.map((member) => member.name)).toEqual(['Anna']);
  task = service.setMemberActive(task.id, anna.id, {
    active: false,
    expectedVersion: draw.task.version,
  });
  service.setAbsences(anna.participantId, { expectedVersion: 1, absences: [] });
  expect(service.getTask(task.id).members.find((member) => member.id === anna.id)?.active).toBe(
    false,
  );
});

test('Abwesenheiten werden teamweit versioniert und atomar protokolliert; fehlerhafte Bereiche ändern nichts', () => {
  const first = setup();
  const anna = first.members[0]!;
  const second = service.createTask({ name: 'Review', participantIds: [anna.participantId] });
  for (const absences of [
    [{ start: '2026-02-30', end: '2026-03-01' }],
    [{ start: '2026-12-02', end: '2026-12-01' }],
    [
      { start: '2026-12-01', end: '2026-12-02' },
      { start: '2026-12-02', end: '2026-12-03' },
    ],
  ]) {
    expect(() =>
      service.setAbsences(anna.participantId, { expectedVersion: 0, absences }),
    ).toThrow();
  }
  expect(service.getTask(first.id).version).toBe(first.version);
  service.setAbsences(anna.participantId, {
    expectedVersion: 0,
    absences: [{ start: '2026-11-12', end: '2026-11-13' }],
  });
  expect(() =>
    service.draw(first.id, { expectedVersion: first.version, requestId: 'stale' }),
  ).toThrow('inzwischen geändert');
  expect(() =>
    service.setAbsences(anna.participantId, { expectedVersion: 0, absences: [] }),
  ).toThrow('inzwischen geändert');
  expect(service.getTask(second.id).version).toBe(second.version + 1);
  expect(service.getTask(second.id).events[0]?.type).toBe('absences_changed');
  const current = service.getTask(first.id);
  expect(() =>
    service.draw(first.id, {
      expectedVersion: current.version,
      requestId: 'manual-absent',
      membershipId: anna.id,
    }),
  ).toThrow();
  const clara = service.createParticipant({ name: 'Clara' });
  const corrected = service.correctCount(first.id, first.members[1]!.id, {
    expectedVersion: current.version,
    count: 8,
    reason: 'Vorleistung',
  });
  const added = service.addMember(first.id, {
    participantId: clara.id,
    expectedVersion: corrected.version,
  });
  expect(added.members.find((member) => member.participantId === clara.id)?.count).toBe(8);
  db.exec(
    "CREATE TRIGGER reject_absence BEFORE INSERT ON audit_events WHEN NEW.type = 'absences_changed' BEGIN SELECT RAISE(ABORT, 'fail'); END;",
  );
  expect(() =>
    service.setAbsences(anna.participantId, { expectedVersion: 1, absences: [] }),
  ).toThrow('fail');
  expect(service.getTask(first.id)).toEqual(added);
  expect(
    service.state().participants.find((person) => person.id === anna.participantId)?.absences,
  ).toHaveLength(1);
});

test('Manuelle Übernahme kann vom Minimum abweichen, zählt einmal, erscheint in Stats und lässt sich zurücknehmen', () => {
  let task = setup();
  const anna = task.members[0]!;
  task = service.correctCount(task.id, anna.id, {
    expectedVersion: task.version,
    count: 5,
    reason: 'Vorleistung',
  });
  const input = { requestId: 'manual', expectedVersion: task.version, membershipId: anna.id };
  const result = service.draw(task.id, input);
  expect(result.draw.method).toBe('manual');
  expect(result.draw.name).toBe('Anna');
  expect(result.draw.countAfter).toBe(6);
  expect(result.task.events[0]?.type).toBe('manual_takeover');
  expect(service.draw(task.id, input).replayed).toBe(true);
  expect(() =>
    service.draw(task.id, {
      ...input,
      membershipId: task.members.find((member) => member.id !== anna.id)!.id,
    }),
  ).toThrow('Anfrage-ID');
  expect(() =>
    service.draw(task.id, { requestId: 'manual', expectedVersion: task.version }),
  ).toThrow('Anfrage-ID');
  expect(service.stats().entries.find((entry) => entry.id === anna.id)?.selections).toBe(1);
  task = service.undo(task.id, result.draw.id, { expectedVersion: result.task.version });
  expect(task.members.find((member) => member.id === anna.id)?.count).toBe(5);
  expect(task.currentDraw).toBeNull();
  expect(task.history[0]?.method).toBe('manual');
  expect(service.stats().entries.find((entry) => entry.id === anna.id)?.selections).toBe(0);
});

test('Duplizieren bewahrt Beschreibung, Teilnehmer und Status; Kopie hat eigene Zähler und keine Auswahlen', () => {
  let task = setup();
  const anna = task.members[0]!;
  task = service.draw(task.id, { requestId: 'source', expectedVersion: task.version }).task;
  task = service.setMemberActive(task.id, anna.id, {
    active: false,
    expectedVersion: task.version,
  });
  task = service.updateTask(task.id, {
    expectedVersion: task.version,
    schedule: { frequency: 'weekly', startDate: '2026-11-16' },
    archived: true,
  });
  const copy = service.duplicateTask(task.id, {
    expectedVersion: task.version,
    name: 'Daily (Kopie)',
  });
  expect(copy.id).not.toBe(task.id);
  expect(copy.description).toBe(task.description);
  expect(copy.archived).toBe(false);
  expect(copy.schedule).toEqual(task.schedule);
  expect(
    copy.members.map(({ participantId, active, count }) => ({ participantId, active, count })),
  ).toEqual(task.members.map(({ participantId, active }) => ({ participantId, active, count: 0 })));
  expect(copy.currentDraw).toBeNull();
  expect(copy.history).toEqual([]);
  expect(copy.events[0]?.type).toBe('task_duplicated');
  expect(service.getTask(task.id)).toEqual(task);
  expect(() =>
    service.duplicateTask(task.id, { expectedVersion: task.version - 1, name: 'stale' }),
  ).toThrow();
  const before = service.state();
  db.exec(
    "CREATE TRIGGER reject_duplicate BEFORE INSERT ON audit_events WHEN NEW.type = 'task_duplicated' BEGIN SELECT RAISE(ABORT, 'fail'); END;",
  );
  expect(() =>
    service.duplicateTask(task.id, { expectedVersion: task.version, name: 'Failed' }),
  ).toThrow('fail');
  expect(service.state()).toEqual(before);
});

test('Wiederholung behält Kalenderanker, überspringt verpasste Termine und berücksichtigt Schaltjahre', () => {
  expect(
    nextDue({ frequency: 'monthly', startDate: '2024-01-31' }, '2024-01-31', '2024-01-31'),
  ).toBe('2024-02-29');
  expect(
    nextDue({ frequency: 'monthly', startDate: '2024-01-31' }, '2024-02-29', '2024-02-29'),
  ).toBe('2024-03-31');
  expect(
    nextDue({ frequency: 'monthly', startDate: '2026-01-31' }, '2026-01-31', '2026-04-01'),
  ).toBe('2026-04-30');
  expect(
    nextDue({ frequency: 'weekly', startDate: '2026-03-23' }, '2026-03-23', '2026-03-29'),
  ).toBe('2026-03-30');
  expect(
    nextDue({ frequency: 'weekly', startDate: '9999-12-31' }, '9999-12-31', '9999-12-31'),
  ).toBeNull();
});

test('Übernahmen setzen Fälligkeiten atomar fort; Wiederholung, Bearbeitung, Archiv und Rücknahme bleiben konsistent', () => {
  let task = setup();
  task = service.updateTask(task.id, {
    expectedVersion: task.version,
    schedule: { frequency: 'weekly', startDate: '2026-11-09' },
  });
  expect(task.due).toBe(true);
  const input = { requestId: 'scheduled', expectedVersion: task.version };
  const result = service.draw(task.id, input);
  expect(result.task.dueDate).toBe('2026-11-16');
  expect(result.task.due).toBe(false);
  expect(service.draw(task.id, input).task.dueDate).toBe('2026-11-16');
  task = service.undo(task.id, result.draw.id, { expectedVersion: result.task.version });
  expect(task.dueDate).toBe('2026-11-09');
  const manual = service.draw(task.id, {
    requestId: 'scheduled-manual',
    expectedVersion: task.version,
    membershipId: task.members[0]!.id,
  });
  expect(manual.task.dueDate).toBe('2026-11-16');
  task = service.updateTask(task.id, {
    expectedVersion: manual.task.version,
    name: 'Renamed',
    schedule: manual.task.schedule,
  });
  expect(task.dueDate).toBe('2026-11-16');
  now = '2026-11-15T23:00:00.000Z';
  expect(service.state().tasks[0]?.due).toBe(true);
  task = service.updateTask(task.id, { expectedVersion: task.version, archived: true });
  expect(task.due).toBe(false);
  task = service.updateTask(task.id, {
    expectedVersion: task.version,
    schedule: null,
    archived: false,
  });
  expect(task.dueDate).toBeNull();
  expect(() =>
    service.updateTask(task.id, {
      expectedVersion: task.version,
      schedule: { frequency: 'weekly', startDate: '2026-02-30' },
    }),
  ).toThrow();
});

test('Neue HTTP-Verträge prüfen Eingaben und schützen veraltete Kopien', async () => {
  const task = setup();
  const app = createApp({ db, service });
  const request = (path: string, method: string, body: unknown) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  expect(
    (
      await request(`/api/participants/${task.members[0]!.participantId}/absences`, 'PATCH', {
        expectedVersion: 0,
        absences: [{ start: '2026-11-13', end: '2026-11-14' }],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(`/api/tasks/${task.id}/duplicate`, 'POST', {
        expectedVersion: task.version,
        name: 'Stale',
      })
    ).status,
  ).toBe(409);
  const current = service.getTask(task.id);
  expect(
    (
      await request(`/api/tasks/${task.id}/duplicate`, 'POST', {
        expectedVersion: current.version,
        name: 'Kopie',
      })
    ).status,
  ).toBe(201);
  const result = await request(`/api/tasks/${task.id}/draws`, 'POST', {
    expectedVersion: current.version,
    requestId: 'http-manual',
    membershipId: current.members[0]!.id,
  });
  expect(result.status).toBe(201);
  expect((await result.json()).draw.method).toBe('manual');
  for (const absences of [
    null,
    [{ start: '2026-02-30', end: '2026-03-01' }],
    [{ start: '2026-12-02', end: '2026-12-01' }],
  ])
    expect(
      (
        await request(`/api/participants/${task.members[0]!.participantId}/absences`, 'PATCH', {
          expectedVersion: 1,
          absences,
        })
      ).status,
    ).toBe(400);
  expect(
    (
      await request('/api/tasks', 'POST', {
        name: 'Bad',
        schedule: { frequency: 'yearly', startDate: '2026-11-12' },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(`/api/tasks/${task.id}/draws`, 'POST', {
        expectedVersion: current.version,
        requestId: 'bad',
        membershipId: 0,
      })
    ).status,
  ).toBe(400);
});
