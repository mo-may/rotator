import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { openDatabase } from '../src/db';
import { createService, type ChooserService } from '../src/service';
import { createApp } from '../src/server';
import { statsPeriodStart, customStatsWindow } from '../src/stats-period';

let db: Database;
let service: ChooserService;
beforeEach(() => {
  db = openDatabase(':memory:');
  let second = 0;
  service = createService(db, {
    pickIndex: () => 0,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, second++)).toISOString(),
  });
});
afterEach(() => db.close());

test('Stats enthalten leere Daten sowie Personen und Aufgaben ohne Zuordnung', async () => {
  expect(service.stats()).toEqual({
    period: 'all',
    from: null,
    to: expect.any(String),
    participants: [],
    tasks: [],
    entries: [],
  });
  const person = service.createParticipant({ name: 'Noch nicht zugeordnet' });
  const task = service.createTask({ name: 'Neue Aufgabe' });
  const app = createApp({ db, service, auth: { basicPassword: '' } });
  const response = await app.request('/api/stats');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    period: 'all',
    from: null,
    to: expect.any(String),
    participants: [{ id: person.id, name: person.name, removed: false }],
    tasks: [{ id: task.id, name: task.name, archived: false }],
    entries: [],
  });
  expect(service.getTask(task.id).version).toBe(task.version);
});

test('Zeiträume filtern inklusive Grenzen nach Auswahlzeitpunkt und lassen aktuelle Stände unverändert', async () => {
  let now = '2026-03-31T12:00:00.000Z';
  service = createService(db, { now: () => now, pickIndex: () => 0 });
  const person = service.createParticipant({ name: 'Zeitraum' });
  let task = service.createTask({ name: 'Zeitgrenzen', participantIds: [person.id] });
  const dates = [
    '2026-02-28T11:59:59.999Z',
    '2026-02-28T12:00:00.000Z',
    '2026-03-24T11:59:59.999Z',
    '2026-03-24T12:00:00.000Z',
    '2026-03-31T12:00:00.000Z',
    '2026-03-31T12:00:00.001Z',
  ];
  for (const date of dates) {
    now = date;
    const result = service.draw(task.id, { expectedVersion: task.version, requestId: date });
    task = result.task;
    if (date === '2026-03-24T12:00:00.000Z') {
      task = service.undo(task.id, result.draw.id, { expectedVersion: task.version });
    }
  }
  now = '2026-03-31T12:00:00.000Z';
  const all = service.stats();
  expect(all.entries[0]).toMatchObject({ selections: 5, undoneSelections: 1, count: 5 });
  const app = createApp({ db, service, auth: { basicPassword: '' } });
  for (const [period, from, selections] of [
    ['week', '2026-03-24T12:00:00.000Z', 1],
    ['month', '2026-02-28T12:00:00.000Z', 3],
  ] as const) {
    const response = await app.request(`/api/stats?period=${period}`);
    expect(response.status).toBe(200);
    const stats = await response.json();
    expect(stats).toMatchObject({ period, from, to: now });
    expect(stats.entries[0]).toMatchObject({
      selections,
      undoneSelections: 1,
      count: 5,
      lastSelectedAt: now,
    });
  }
  expect((await app.request('/api/stats?period=invalid')).status).toBe(400);
  expect(service.getTask(task.id).version).toBe(task.version);
});

test('Rollierender Monat berücksichtigt kurze Monate, Schaltjahre und Jahreswechsel', () => {
  expect(statsPeriodStart('month', '2026-03-31T12:34:56.000Z')).toBe('2026-02-28T12:34:56.000Z');
  expect(statsPeriodStart('month', '2028-03-31T12:34:56.000Z')).toBe('2028-02-29T12:34:56.000Z');
  expect(statsPeriodStart('month', '2026-01-15T23:00:00.000Z')).toBe('2025-12-15T23:00:00.000Z');
  expect(statsPeriodStart('week', '2026-03-31T12:34:56.000Z')).toBe('2026-03-24T12:34:56.000Z');
});

test('Benutzerdefinierte Tage berücksichtigen Zeitzone und Sommer-/Winterzeit', () => {
  const summer = customStatsWindow({ start: '2026-03-29', end: '2026-03-29' }, 'Europe/Berlin');
  expect(summer).toEqual({ from: '2026-03-28T23:00:00.000Z', to: '2026-03-29T21:59:59.999Z' });
  expect(Date.parse(summer.to) - Date.parse(summer.from) + 1).toBe(23 * 60 * 60 * 1000);
  const winter = customStatsWindow({ start: '2026-10-25', end: '2026-10-25' }, 'Europe/Berlin');
  expect(winter).toEqual({ from: '2026-10-24T22:00:00.000Z', to: '2026-10-25T22:59:59.999Z' });
  expect(Date.parse(winter.to) - Date.parse(winter.from) + 1).toBe(25 * 60 * 60 * 1000);
  expect(customStatsWindow({ start: '2028-02-29', end: '2028-02-29' }, 'UTC')).toEqual({
    from: '2028-02-29T00:00:00.000Z',
    to: '2028-02-29T23:59:59.999Z',
  });
  expect(
    customStatsWindow({ start: '2026-03-29', end: '2026-03-29' }, 'Pacific/Kiritimati'),
  ).toEqual({
    from: '2026-03-28T10:00:00.000Z',
    to: '2026-03-29T09:59:59.999Z',
  });
});

test('Benutzerdefinierter Zeitraum zählt die Randzeitpunkte, bewahrt Stände und validiert Datumsangaben', async () => {
  let now = '2026-03-31T12:00:00.000Z';
  service = createService(db, { now: () => now, pickIndex: () => 0 });
  const person = service.createParticipant({ name: 'Datumsfilter' });
  let task = service.createTask({ name: 'Ganzer Tag', participantIds: [person.id] });
  for (const date of [
    '2026-03-28T22:59:59.999Z',
    '2026-03-28T23:00:00.000Z',
    '2026-03-29T21:59:59.999Z',
    '2026-03-29T22:00:00.000Z',
  ]) {
    now = date;
    task = service.draw(task.id, { expectedVersion: task.version, requestId: date }).task;
  }
  const app = createApp({ db, service, auth: { basicPassword: '', timeZone: 'Europe/Berlin' } });
  const response = await app.request('/api/stats?period=custom&start=2026-03-29&end=2026-03-29');
  expect(response.status).toBe(200);
  const stats = await response.json();
  expect(stats).toMatchObject({
    period: 'custom',
    startDate: '2026-03-29',
    endDate: '2026-03-29',
    from: '2026-03-28T23:00:00.000Z',
    to: '2026-03-29T21:59:59.999Z',
  });
  expect(stats.entries[0]).toMatchObject({
    selections: 2,
    count: 4,
    lastSelectedAt: '2026-03-29T21:59:59.999Z',
  });
  const utcApp = createApp({ db, service, auth: { basicPassword: '', timeZone: 'UTC' } });
  const utc = await (
    await utcApp.request('/api/stats?period=custom&start=2026-03-29&end=2026-03-29')
  ).json();
  expect(utc).toMatchObject({ from: '2026-03-29T00:00:00.000Z', to: '2026-03-29T23:59:59.999Z' });
  expect(utc.entries[0].selections).toBe(2);
  expect(utc.entries[0].lastSelectedAt).toBe('2026-03-29T22:00:00.000Z');
  for (const query of [
    'period=custom',
    'period=custom&start=2026-03-29',
    'period=custom&start=2026-03-30&end=2026-03-29',
    'period=custom&start=2026-02-29&end=2026-03-29',
    'period=custom&start=2026-03-29&end=2026-04-31',
    'period=custom&start=29.03.2026&end=2026-03-29',
  ])
    expect((await app.request('/api/stats?' + query)).status).toBe(400);
  expect(service.getTask(task.id).version).toBe(task.version);
});

test('Stats zählen über 50 Auswahlen, schließen Rücknahmen aus und trennen Auswahlstände', () => {
  const person = service.createParticipant({ name: 'Anna' });
  let task = service.createTask({ name: 'Daily', participantIds: [person.id] });
  task = service.correctCount(task.id, task.members[0]!.id, {
    expectedVersion: task.version,
    count: 9,
    reason: 'Vorleistungen',
  });
  let previousDate = '';
  for (let i = 0; i < 55; i++) {
    const input = { expectedVersion: task.version, requestId: `stats-${i}` };
    const result = service.draw(task.id, input);
    task = result.task;
    if (i === 53) previousDate = result.draw.createdAt;
    expect(service.draw(task.id, input).draw.id).toBe(result.draw.id);
  }
  expect(task.history).toHaveLength(50);
  task = service.undo(task.id, task.currentDraw!.id, { expectedVersion: task.version });
  const newPerson = service.createParticipant({ name: 'Neu' });
  task = service.addMember(task.id, { participantId: newPerson.id, expectedVersion: task.version });
  const stats = service.stats();
  expect(stats.entries.find((entry) => entry.participantId === person.id)).toMatchObject({
    selections: 54,
    undoneSelections: 1,
    count: 63,
    lastSelectedAt: previousDate,
  });
  expect(stats.entries.find((entry) => entry.participantId === newPerson.id)).toMatchObject({
    selections: 0,
    undoneSelections: 0,
    count: 63,
    lastSelectedAt: null,
  });
});

test('Stats bewahren entfernte Personen und Archive, gruppieren nach IDs und folgen Umbenennungen', () => {
  const person = service.createParticipant({ name: 'Anna' });
  let task = service.createTask({ name: 'Daily', participantIds: [person.id] });
  task = service.draw(task.id, { expectedVersion: task.version, requestId: 'original' }).task;
  service.renameParticipant(person.id, { name: 'Alex' });
  task = service.getTask(task.id);
  task = service.updateTask(task.id, { expectedVersion: task.version, archived: true });
  service.removeParticipant(person.id);
  const replacement = service.createParticipant({ name: 'Alex' });
  const anotherTask = service.createTask({ name: 'Daily', participantIds: [replacement.id] });
  const stats = service.stats();
  expect(stats.participants.find((p) => p.id === person.id)).toEqual({
    id: person.id,
    name: 'Alex',
    removed: true,
  });
  expect(stats.participants.find((p) => p.id === replacement.id)?.removed).toBe(false);
  expect(stats.tasks.find((t) => t.id === task.id)?.archived).toBe(true);
  expect(stats.entries.find((e) => e.taskId === task.id)).toMatchObject({
    participantId: person.id,
    selections: 1,
    count: 1,
    active: false,
  });
  expect(stats.entries.find((e) => e.taskId === anotherTask.id)).toMatchObject({
    participantId: replacement.id,
    selections: 0,
    count: 0,
  });
  expect(service.getTask(task.id).history[0]!.name).toBe('Anna');
});
