import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { openDatabase, migrate } from '../src/db';
import { createService, DomainError, type ChooserService } from '../src/service';
import type { TaskDetail } from '../src/shared/contracts';

let db: Database;
let service: ChooserService;
beforeEach(() => {
  db = openDatabase(':memory:');
  service = createService(db, { pickIndex: () => 0 });
});
afterEach(() => db.close());

function taskWith(...names: string[]): TaskDetail {
  let task = service.createTask({ name: 'Daily', description: 'Moderation' });
  for (const name of names) {
    const participant = service.createParticipant({ name });
    task = service.addMember(task.id, {
      participantId: participant.id,
      expectedVersion: task.version,
    });
  }
  return task;
}

function expectCode(operation: () => unknown, code: string, status?: 400 | 404 | 409): void {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DomainError);
  expect((caught as DomainError).code).toBe(code);
  if (status) expect((caught as DomainError).status).toBe(status);
}

describe('Aufgabe mit Teilnehmerauswahl anlegen', () => {
  test('Nur ausgewählte Personen starten aktiv bei 0, bestehende Aufgaben bleiben unverändert', () => {
    let existing = taskWith('Anna', 'Ben', 'Clara');
    existing = service.correctCount(existing.id, existing.members[0]!.id, {
      count: 7,
      reason: 'Vorleistungen',
      expectedVersion: existing.version,
    });
    const ids = existing.members.slice(0, 2).map((member) => member.participantId);
    const task = service.createTask({ name: 'Neue Runde', participantIds: ids });
    expect(
      task.members.map(({ participantId, active, count }) => ({ participantId, active, count })),
    ).toEqual(ids.map((participantId) => ({ participantId, active: true, count: 0 })));
    expect(task.candidates).toHaveLength(2);
    expect(task.currentDraw).toBeNull();
    expect(task.history).toEqual([]);
    expect(task.events.filter((event) => event.type === 'member_added')).toHaveLength(2);
    expect(service.getTask(existing.id)).toEqual(existing);
  });

  test('Ungültige, doppelte oder entfernte Personen erzeugen keine Teilaufgabe', () => {
    const person = service.createParticipant({ name: 'Anna' });
    const removed = service.createParticipant({ name: 'Ben' });
    service.removeParticipant(removed.id);
    for (const participantIds of [[0], [1.5], [person.id, person.id]]) {
      expectCode(
        () => service.createTask({ name: 'Ungültig', participantIds }),
        'INVALID_INPUT',
        400,
      );
    }
    for (const participantId of [removed.id, 99999]) {
      expectCode(
        () => service.createTask({ name: 'Ungültig', participantIds: [person.id, participantId] }),
        'PARTICIPANT_NOT_FOUND',
        404,
      );
    }
    expect(service.state().tasks).toEqual([]);
    expect(db.query('SELECT count(*) AS total FROM task_memberships').get()).toEqual({ total: 0 });
  });

  test('Ein Fehler im Zuordnungsprotokoll rollt Aufgabe und sämtliche Teilnehmer zurück', () => {
    const person = service.createParticipant({ name: 'Anna' });
    db.exec(`CREATE TRIGGER fail_initial_membership BEFORE INSERT ON audit_events
      WHEN NEW.type = 'member_added' BEGIN SELECT RAISE(ABORT, 'audit failed'); END;`);
    expect(() => service.createTask({ name: 'Daily', participantIds: [person.id] })).toThrow(
      'audit failed',
    );
    expect(service.state().tasks).toEqual([]);
    expect(db.query('SELECT count(*) AS total FROM task_memberships').get()).toEqual({ total: 0 });
    expect(db.query('SELECT count(*) AS total FROM audit_events').get()).toEqual({ total: 0 });
  });
});

describe('Minimum und aktive Teilnehmer', () => {
  test('Gleichstand nutzt ausschließlich die Minimumgruppe und erhöht genau einen Stand', () => {
    let task = taskWith('Anna', 'Ben', 'Clara');
    task = service.correctCount(task.id, task.members[2]!.id, {
      count: 4,
      reason: 'Vorleistungen übernommen',
      expectedVersion: task.version,
    });
    let candidateCount = 0;
    service = createService(db, {
      pickIndex: (length) => {
        candidateCount = length;
        return 1;
      },
    });
    const result = service.draw(task.id, { requestId: 'first', expectedVersion: task.version });
    expect(candidateCount).toBe(2);
    expect(result.draw.name).toBe('Ben');
    expect(result.draw.method).toBe('random');
    expect(result.draw.candidates.map((member) => member.name)).toEqual(['Anna', 'Ben']);
    expect(result.task.members.map((member) => [member.name, member.count])).toEqual([
      ['Anna', 0],
      ['Ben', 1],
      ['Clara', 4],
    ]);
    expect(result.task.currentDraw?.id).toBe(result.draw.id);
    expect(result.task.version).toBe(task.version + 1);
    expect(result.task.canUndo).toBe(true);
  });

  test('Eindeutiges Minimum wird ohne Zufallsaufruf direkt gewählt', () => {
    let task = taskWith('Anna', 'Ben');
    const ben = task.members.find((member) => member.name === 'Ben')!;
    task = service.correctCount(task.id, ben.id, {
      count: 5,
      reason: 'Import',
      expectedVersion: task.version,
    });
    service = createService(db, {
      pickIndex: () => {
        throw new Error('Nicht aufrufen');
      },
    });
    const result = service.draw(task.id, { requestId: 'direct', expectedVersion: task.version });
    expect(result.draw.name).toBe('Anna');
    expect(result.draw.method).toBe('direct');
    expect(result.draw.countAfter).toBe(1);
  });

  test('Inaktives Minimum ist ausgeschlossen, Reaktivierung bewahrt den Stand', () => {
    let task = taskWith('Anna', 'Ben');
    const anna = task.members.find((member) => member.name === 'Anna')!;
    const ben = task.members.find((member) => member.name === 'Ben')!;
    task = service.correctCount(task.id, ben.id, {
      count: 8,
      reason: 'Import',
      expectedVersion: task.version,
    });
    task = service.setMemberActive(task.id, anna.id, {
      active: false,
      expectedVersion: task.version,
    });
    const result = service.draw(task.id, { requestId: 'inactive', expectedVersion: task.version });
    expect(result.draw.name).toBe('Ben');
    task = service.setMemberActive(task.id, anna.id, {
      active: true,
      expectedVersion: result.task.version,
    });
    expect(task.members.find((member) => member.id === anna.id)?.count).toBe(0);
    expect(task.candidates.map((member) => member.name)).toEqual(['Anna']);
  });

  test('Ohne aktive Teilnehmer wird nichts verändert', () => {
    let task = taskWith('Anna');
    task = service.setMemberActive(task.id, task.members[0]!.id, {
      active: false,
      expectedVersion: task.version,
    });
    expectCode(
      () => service.draw(task.id, { requestId: 'empty', expectedVersion: task.version }),
      'NO_ACTIVE_MEMBERS',
      409,
    );
    expect(service.getTask(task.id)).toEqual(task);
  });

  test('Einzige aktive Person darf wiederholt ausgewählt werden', () => {
    const task = taskWith('Anna');
    const first = service.draw(task.id, { requestId: 'one', expectedVersion: task.version });
    const second = service.draw(task.id, { requestId: 'two', expectedVersion: first.task.version });
    expect(second.draw.name).toBe('Anna');
    expect(second.draw.countAfter).toBe(2);
  });

  test('Bei unveränderter Gruppe wird die anfängliche Gleichverteilung erhalten', () => {
    let task = taskWith('Anna', 'Ben', 'Clara', 'David');
    for (let round = 0; round < 5; round++) {
      for (let index = 0; index < 4; index++)
        task = service.draw(task.id, {
          requestId: `round-${round}-${index}`,
          expectedVersion: task.version,
        }).task;
      expect(task.members.map((member) => member.count)).toEqual([
        round + 1,
        round + 1,
        round + 1,
        round + 1,
      ]);
    }
  });
});

describe('Aufgabenzuordnung und Korrekturen', () => {
  test('Neue Person startet beim aktiven Minimum und erzeugt keine fiktive Auswahl', () => {
    let task = taskWith('Anna', 'Ben', 'Clara');
    for (const [index, member] of task.members.entries())
      task = service.correctCount(task.id, member.id, {
        count: [8, 10, 1][index]!,
        reason: 'Import',
        expectedVersion: task.version,
      });
    const clara = task.members.find((member) => member.name === 'Clara')!;
    task = service.setMemberActive(task.id, clara.id, {
      active: false,
      expectedVersion: task.version,
    });
    const newcomer = service.createParticipant({ name: 'David' });
    task = service.addMember(task.id, {
      participantId: newcomer.id,
      expectedVersion: task.version,
    });
    expect(task.members.find((member) => member.name === 'David')?.count).toBe(8);
    expect(task.history).toHaveLength(0);
    expect(task.events[0]?.description).toContain('Auswahlstand 8');
  });

  test('Ohne aktive Personen startet eine neue Zuordnung bei 0', () => {
    let task = taskWith('Anna');
    task = service.correctCount(task.id, task.members[0]!.id, {
      count: 7,
      reason: 'Import',
      expectedVersion: task.version,
    });
    task = service.setMemberActive(task.id, task.members[0]!.id, {
      active: false,
      expectedVersion: task.version,
    });
    const person = service.createParticipant({ name: 'Ben' });
    task = service.addMember(task.id, { participantId: person.id, expectedVersion: task.version });
    expect(task.members.find((member) => member.name === 'Ben')?.count).toBe(0);
  });

  test('Doppelte Zuordnung wird abgelehnt', () => {
    const task = taskWith('Anna');
    expectCode(
      () =>
        service.addMember(task.id, {
          participantId: task.members[0]!.participantId,
          expectedVersion: task.version,
        }),
      'ALREADY_MEMBER',
    );
  });

  test('Auswahlstände und Aktivstatus sind unabhängig zwischen Aufgaben', () => {
    const first = taskWith('Anna');
    let second = service.createTask({ name: 'Support' });
    second = service.addMember(second.id, {
      participantId: first.members[0]!.participantId,
      expectedVersion: second.version,
    });
    service.draw(first.id, { requestId: 'task-one', expectedVersion: first.version });
    expect(service.getTask(second.id)).toEqual(second);
    const latestFirst = service.getTask(first.id);
    service.setMemberActive(first.id, latestFirst.members[0]!.id, {
      active: false,
      expectedVersion: latestFirst.version,
    });
    expect(service.getTask(second.id).members[0]?.active).toBe(true);
  });

  test('Begründung ist Pflicht; negative, gebrochene und zu große Werte sind ungültig', () => {
    const task = taskWith('Anna');
    for (const count of [-1, 1.2, Number.NaN, 1_000_000_001])
      expectCode(
        () =>
          service.correctCount(task.id, task.members[0]!.id, {
            count,
            reason: 'Import',
            expectedVersion: task.version,
          }),
        'INVALID_INPUT',
      );
    expectCode(
      () =>
        service.correctCount(task.id, task.members[0]!.id, {
          count: 2,
          reason: '  ',
          expectedVersion: task.version,
        }),
      'INVALID_INPUT',
    );
    expect(service.getTask(task.id).version).toBe(task.version);
  });

  test('Korrektur speichert vorher/nachher und Begründung und schreibt Draws nicht um', () => {
    const task = taskWith('Anna');
    const result = service.draw(task.id, {
      requestId: 'before-correction',
      expectedVersion: task.version,
    });
    const changed = service.correctCount(task.id, task.members[0]!.id, {
      count: 12,
      reason: 'Frühere Dienste berücksichtigt',
      expectedVersion: result.task.version,
    });
    expect(changed.members[0]?.count).toBe(12);
    expect(changed.history[0]?.countAfter).toBe(1);
    expect(changed.events[0]?.description).toContain('1 → 12');
    expect(changed.events[0]?.description).toContain('Frühere Dienste berücksichtigt');
    expect(changed.canUndo).toBe(false);
    const details = db
      .query<{ details_json: string }, []>(
        "SELECT details_json FROM audit_events WHERE type = 'count_corrected'",
      )
      .get()!;
    expect(JSON.parse(details.details_json)).toMatchObject({
      before: 1,
      after: 12,
      reason: 'Frühere Dienste berücksichtigt',
    });
  });
});

describe('Idempotenz, Revisionen und atomare Änderungen', () => {
  test('Wiederholte Request-ID liefert dieselbe Auswahl trotz alter Revision', () => {
    const task = taskWith('Anna', 'Ben');
    const input = { requestId: 'retry', expectedVersion: task.version };
    const first = service.draw(task.id, input);
    const retry = service.draw(task.id, input);
    expect(retry.draw).toEqual(first.draw);
    expect(retry.task).toEqual(first.task);
    expect(retry.replayed).toBe(true);
    expect(retry.task.history).toHaveLength(1);
    expectCode(
      () => service.draw(task.id, { ...input, expectedVersion: first.task.version }),
      'REQUEST_ID_CONFLICT',
    );
  });

  test('Zweiter Klick mit derselben Ausgangsrevision erzeugt keine zweite Auswahl', () => {
    const task = taskWith('Anna', 'Ben');
    service.draw(task.id, { requestId: 'parallel-a', expectedVersion: task.version });
    expectCode(
      () => service.draw(task.id, { requestId: 'parallel-b', expectedVersion: task.version }),
      'VERSION_CONFLICT',
      409,
    );
    expect(service.getTask(task.id).history).toHaveLength(1);
  });

  test('Fehler beim Schreiben der Historie rollt auch den Auswahlstand zurück', () => {
    const task = taskWith('Anna');
    db.exec(
      "CREATE TRIGGER reject_draw BEFORE INSERT ON draws BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    );
    expect(() =>
      service.draw(task.id, { requestId: 'failure', expectedVersion: task.version }),
    ).toThrow('test failure');
    expect(service.getTask(task.id)).toEqual(task);
  });

  test('Archivierte Aufgaben können nicht auswählen oder geändert werden, Wiederöffnung funktioniert', () => {
    let task = taskWith('Anna');
    task = service.updateTask(task.id, { archived: true, expectedVersion: task.version });
    expectCode(
      () => service.draw(task.id, { requestId: 'archived', expectedVersion: task.version }),
      'TASK_ARCHIVED',
    );
    expectCode(
      () =>
        service.correctCount(task.id, task.members[0]!.id, {
          count: 3,
          reason: 'Import',
          expectedVersion: task.version,
        }),
      'TASK_ARCHIVED',
    );
    task = service.updateTask(task.id, { archived: false, expectedVersion: task.version });
    expect(
      service.draw(task.id, { requestId: 'reopened', expectedVersion: task.version }).draw
        .countAfter,
    ).toBe(1);
  });

  test('Migration erneut auszuführen erhält vorhandene Daten', () => {
    const task = taskWith('Anna');
    migrate(db);
    expect(service.getTask(task.id)).toEqual(task);
  });
});

describe('Historie und eingeschränkte Rücknahme', () => {
  test('Rücknahme stellt vorherige aktuelle Auswahl wieder her und erhält den stornierten Vorgang', () => {
    const task = taskWith('Anna', 'Ben');
    const first = service.draw(task.id, { requestId: 'one', expectedVersion: task.version });
    const second = service.draw(task.id, { requestId: 'two', expectedVersion: first.task.version });
    const undone = service.undo(task.id, second.draw.id, { expectedVersion: second.task.version });
    expect(undone.currentDraw?.id).toBe(first.draw.id);
    expect(undone.history[0]?.undoneAt).not.toBeNull();
    expect(undone.members.find((member) => member.id === second.draw.membershipId)?.count).toBe(
      second.draw.countBefore,
    );
    expect(undone.canUndo).toBe(false);
    const retry = service.draw(task.id, { requestId: 'two', expectedVersion: first.task.version });
    expect(retry.replayed).toBe(true);
    expect(retry.draw.undoneAt).not.toBeNull();
    expect(retry.task.history).toHaveLength(2);
  });

  test('Rücknahme der ersten Auswahl leert den aktuellen Gewinner', () => {
    const task = taskWith('Anna');
    const result = service.draw(task.id, { requestId: 'first', expectedVersion: task.version });
    const undone = service.undo(task.id, result.draw.id, { expectedVersion: result.task.version });
    expect(undone.currentDraw).toBeNull();
    expect(undone.members[0]?.count).toBe(0);
  });

  test('Statusänderung verhindert Rücknahme und entfernt den aktuellen Gewinner nicht', () => {
    const task = taskWith('Anna');
    const result = service.draw(task.id, { requestId: 'winner', expectedVersion: task.version });
    const changed = service.setMemberActive(task.id, result.draw.membershipId, {
      active: false,
      expectedVersion: result.task.version,
    });
    expect(changed.currentDraw?.id).toBe(result.draw.id);
    expect(changed.canUndo).toBe(false);
    expectCode(
      () => service.undo(task.id, result.draw.id, { expectedVersion: changed.version }),
      'UNDO_UNAVAILABLE',
    );
  });

  test('Umbenennung erhöht alle betroffenen Revisionen und bewahrt historische Namen', () => {
    const task = taskWith('Anna');
    const result = service.draw(task.id, {
      requestId: 'before-rename',
      expectedVersion: task.version,
    });
    let second = service.createTask({ name: 'Support' });
    second = service.addMember(second.id, {
      participantId: task.members[0]!.participantId,
      expectedVersion: second.version,
    });
    service.renameParticipant(task.members[0]!.participantId, { name: 'Anne' });
    const renamed = service.getTask(task.id);
    expect(renamed.members[0]?.name).toBe('Anne');
    expect(renamed.currentDraw?.name).toBe('Anne');
    expect(service.state().tasks.find((item) => item.id === task.id)?.currentDraw?.name).toBe(
      'Anne',
    );
    expect(renamed.history[0]?.name).toBe('Anna');
    expect(renamed.history[0]?.candidates[0]?.name).toBe('Anna');
    expect(renamed.version).toBe(result.task.version + 1);
    expect(service.getTask(second.id).version).toBe(second.version + 1);
    expect(renamed.canUndo).toBe(false);
  });

  test('Auswahl einer anderen Aufgabe kann nicht zurückgenommen werden', () => {
    const first = taskWith('Anna');
    const second = taskWith('Ben');
    const result = service.draw(first.id, {
      requestId: 'other-task',
      expectedVersion: first.version,
    });
    expectCode(
      () => service.undo(second.id, result.draw.id, { expectedVersion: second.version }),
      'DRAW_NOT_FOUND',
    );
  });
});

describe('Personen aus dem Team entfernen', () => {
  test('Entfernen wirkt auf alle Aufgaben einschließlich Archiv und bewahrt die Historie', () => {
    let daily = taskWith('Anna', 'Ben');
    const anna = daily.members.find((member) => member.name === 'Anna')!;
    const first = service.draw(daily.id, {
      requestId: 'before-removal',
      expectedVersion: daily.version,
    });
    daily = first.task;
    let support = service.createTask({ name: 'Support' });
    support = service.addMember(support.id, {
      participantId: anna.participantId,
      expectedVersion: support.version,
    });
    support = service.updateTask(support.id, { archived: true, expectedVersion: support.version });
    const unrelated = service.createTask({ name: 'Andere Aufgabe' });

    const removal = service.removeParticipant(anna.participantId);
    expect(removal).toMatchObject({ id: anna.participantId, name: 'Anna' });
    expect(removal.removedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(service.state().participants.map((person) => person.name)).toEqual(['Ben']);

    const current = service.getTask(daily.id);
    expect(current.members.map((member) => member.name)).toEqual(['Ben']);
    expect(current.activeCount).toBe(1);
    expect(current.memberCount).toBe(1);
    expect(current.members[0]?.count).toBe(0);
    expect(current.currentDraw).toBeNull();
    expect(current.version).toBe(daily.version + 1);
    expect(current.canUndo).toBe(false);
    expect(current.history).toEqual(daily.history);
    expect(current.history[0]?.candidates.map((candidate) => candidate.name)).toEqual([
      'Anna',
      'Ben',
    ]);
    expect(current.events[0]?.type).toBe('participant_removed');

    const archived = service.getTask(support.id);
    expect(archived.archived).toBe(true);
    expect(archived.members).toHaveLength(0);
    expect(archived.activeCount).toBe(0);
    expect(archived.memberCount).toBe(0);
    expect(archived.version).toBe(support.version + 1);
    expect(archived.events[0]?.type).toBe('participant_removed');
    expect(service.getTask(unrelated.id)).toEqual(unrelated);

    expect(
      db
        .query<{ active: number }, [number]>(
          'SELECT active FROM task_memberships WHERE participant_id = ?',
        )
        .all(anna.participantId)
        .every((member) => member.active === 0),
    ).toBe(true);
    expect(
      db
        .query<{ deleted_at: string }, [number]>('SELECT deleted_at FROM participants WHERE id = ?')
        .get(anna.participantId)?.deleted_at,
    ).toBe(removal.removedAt);
    expectCode(
      () =>
        service.draw(daily.id, {
          requestId: 'stale-after-removal',
          expectedVersion: daily.version,
        }),
      'VERSION_CONFLICT',
    );
  });

  test('Neue Minima und neue Personen mit gleichem Namen ignorieren entfernte Zuordnungen', () => {
    let task = taskWith('Anna', 'Ben', 'Clara');
    const anna = task.members.find((member) => member.name === 'Anna')!;
    for (const [name, count] of [
      ['Ben', 8],
      ['Clara', 10],
    ] as const) {
      const member = task.members.find((member) => member.name === name)!;
      task = service.correctCount(task.id, member.id, {
        count,
        reason: 'Import',
        expectedVersion: task.version,
      });
    }

    service.removeParticipant(anna.participantId);
    task = service.getTask(task.id);
    expect(task.candidates.map((member) => member.name)).toEqual(['Ben']);
    const draw = service.draw(task.id, {
      requestId: 'after-removal',
      expectedVersion: task.version,
    });
    expect(draw.draw.name).toBe('Ben');
    expect(draw.draw.countBefore).toBe(8);
    expect(draw.task.members.find((member) => member.name === 'Clara')?.count).toBe(10);

    const newAnna = service.createParticipant({ name: 'Anna' });
    expect(newAnna.id).toBeGreaterThan(anna.participantId);
    task = service.addMember(task.id, {
      participantId: newAnna.id,
      expectedVersion: draw.task.version,
    });
    expect(task.members.find((member) => member.participantId === newAnna.id)?.count).toBe(9);
    expect(task.members.some((member) => member.id === anna.id)).toBe(false);
  });

  test('Entfernen einer anderen Person erhält Gewinner und Zähler, sperrt aber die alte Rücknahme', () => {
    const task = taskWith('Anna', 'Ben');
    const result = service.draw(task.id, {
      requestId: 'keep-current',
      expectedVersion: task.version,
    });
    const ben = task.members.find((member) => member.name === 'Ben')!;
    service.removeParticipant(ben.participantId);
    const current = service.getTask(task.id);
    expect(current.currentDraw?.id).toBe(result.draw.id);
    expect(current.members[0]?.count).toBe(1);
    expect(current.canUndo).toBe(false);
    expectCode(
      () => service.undo(task.id, result.draw.id, { expectedVersion: current.version }),
      'UNDO_UNAVAILABLE',
    );
  });

  test('Entfernte Personen können nicht umbenannt, reaktiviert, korrigiert oder wieder zugeordnet werden', () => {
    const task = taskWith('Anna');
    const member = task.members[0]!;
    service.removeParticipant(member.participantId);
    const current = service.getTask(task.id);
    expectCode(
      () => service.renameParticipant(member.participantId, { name: 'Anne' }),
      'PARTICIPANT_NOT_FOUND',
      404,
    );
    expectCode(
      () =>
        service.addMember(task.id, {
          participantId: member.participantId,
          expectedVersion: current.version,
        }),
      'PARTICIPANT_NOT_FOUND',
      404,
    );
    expectCode(
      () =>
        service.setMemberActive(task.id, member.id, {
          active: true,
          expectedVersion: current.version,
        }),
      'MEMBER_NOT_FOUND',
      404,
    );
    expectCode(
      () =>
        service.correctCount(task.id, member.id, {
          count: 2,
          reason: 'Korrektur',
          expectedVersion: current.version,
        }),
      'MEMBER_NOT_FOUND',
      404,
    );
    expectCode(() => service.removeParticipant(member.participantId), 'PARTICIPANT_NOT_FOUND', 404);
    expectCode(
      () =>
        service.draw(task.id, {
          requestId: 'no-remaining-members',
          expectedVersion: current.version,
        }),
      'NO_ACTIVE_MEMBERS',
    );

    const next = service.createParticipant({ name: 'Anna' });
    const added = service.addMember(task.id, {
      participantId: next.id,
      expectedVersion: current.version,
    });
    expect(next.id).toBeGreaterThan(member.participantId);
    expect(added.members[0]?.count).toBe(0);
  });

  test('Auch eine noch nicht zugeordnete Person kann entfernt werden', () => {
    const task = service.createTask({ name: 'Daily' });
    const participant = service.createParticipant({ name: 'Anna' });
    service.removeParticipant(participant.id);
    expect(service.state().participants).toHaveLength(0);
    expect(service.getTask(task.id)).toEqual(task);
  });

  test('Fehler im Änderungsprotokoll rollt die gesamte Entfernung zurück', () => {
    const task = taskWith('Anna', 'Ben');
    const result = service.draw(task.id, {
      requestId: 'before-failure',
      expectedVersion: task.version,
    });
    const before = service.state();
    db.exec(`
      CREATE TRIGGER reject_removal BEFORE INSERT ON audit_events
      WHEN NEW.type = 'participant_removed'
      BEGIN SELECT RAISE(ABORT, 'removal failure'); END;
    `);
    expect(() => service.removeParticipant(task.members[0]!.participantId)).toThrow(
      'removal failure',
    );
    expect(service.state()).toEqual(before);
    expect(service.getTask(task.id)).toEqual(result.task);
  });

  test('Migrationen 2 und 3 ergänzen eine befüllte Version-1-Datenbank verlustfrei', () => {
    const task = taskWith('Anna', 'Ben');
    const result = service.draw(task.id, {
      requestId: 'legacy-draw',
      expectedVersion: task.version,
    });
    const before = service.state();
    // Recreate the actual v1 table shape while keeping existing rows and foreign keys.
    db.exec(`
      DROP INDEX participants_by_visibility;
      ALTER TABLE participants DROP COLUMN deleted_at;
      ALTER TABLE participants DROP COLUMN absences_json;
      ALTER TABLE participants DROP COLUMN availability_version;
      ALTER TABLE tasks DROP COLUMN schedule_json;
      ALTER TABLE tasks DROP COLUMN next_due_date;
      ALTER TABLE draws DROP COLUMN manual;
      ALTER TABLE draws DROP COLUMN previous_due_date;
      DELETE FROM schema_migrations WHERE version >= 2;
    `);

    migrate(db);
    expect(service.state()).toEqual(before);
    expect(service.getTask(task.id)).toEqual(result.task);
    expect(
      db
        .query<{ version: number }, []>('SELECT MAX(version) AS version FROM schema_migrations')
        .get()?.version,
    ).toBe(3);
    expect(db.query('PRAGMA foreign_key_check').all()).toHaveLength(0);
    expect(
      db
        .query<{ deleted_at: string | null }, []>('SELECT deleted_at FROM participants')
        .all()
        .every((person) => person.deleted_at === null),
    ).toBe(true);
    service.removeParticipant(task.members[0]!.participantId);
    expect(service.getTask(task.id).history).toEqual(result.task.history);
    expect(service.getTask(task.id).members).toHaveLength(1);
    migrate(db);
    expect(service.getTask(task.id).members).toHaveLength(1);
  });
});
