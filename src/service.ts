import type { Database } from 'bun:sqlite';
import { randomInt, randomUUID } from 'node:crypto';
import { statsPeriodStart, customStatsWindow } from './stats-period';
import { isStatsDateRange } from './shared/stats-range';
import { calendarDate, isAbsent, nextDue, validAbsences, validSchedule } from './shared/scheduling';
import type { Absence, TaskSchedule } from './shared/contracts';
import type {
  AppState,
  AuditEvent,
  CandidateSnapshot,
  CreateTaskInput,
  Draw,
  DrawResponse,
  Member,
  Participant,
  ParticipantRemoval,
  TaskDetail,
  TaskSummary,
  Stats,
  StatsPeriod,
  StatsDateRange,
  StatsEntry,
  StatsParticipant,
  StatsTask,
} from './shared/contracts';

const MAX_COUNT = 1_000_000_000;
type TaskRow = {
  id: number;
  name: string;
  description: string;
  archived_at: string | null;
  current_draw_id: string | null;
  version: number;
  schedule_json: string | null;
  next_due_date: string | null;
};
type DrawRow = {
  id: string;
  task_id: number;
  participant_id: number;
  membership_id: number;
  winner_name: string;
  method: 'random' | 'direct';
  count_before: number;
  count_after: number;
  candidates_json: string;
  previous_draw_id: string | null;
  request_id: string;
  expected_version: number;
  result_version: number;
  created_at: string;
  undone_at: string | null;
  manual: number;
  previous_due_date: string | null;
};
type MemberRow = {
  id: number;
  participantId: number;
  name: string;
  active: number;
  count: number;
  absences_json: string;
};
type VersionInput = { expectedVersion: number };

export class DomainError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export interface ServiceOptions {
  /** Injectable only for deterministic domain tests; production uses node:crypto.randomInt. */
  pickIndex?: (length: number) => number;
  now?: () => string;
  timeZone?: string;
}

function text(value: unknown, label: string, max: number, optional = false): string {
  if (typeof value !== 'string') {
    throw new DomainError(400, 'INVALID_INPUT', `${label} muss ein Text sein.`);
  }
  const result = value.trim();
  if ((!optional && !result) || result.length > max) {
    throw new DomainError(
      400,
      'INVALID_INPUT',
      `${label}: ${optional ? 'Höchstens' : '1 bis'} ${max} Zeichen sind erlaubt.`,
    );
  }
  return result;
}

function integer(value: unknown, label: string, max = MAX_COUNT): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new DomainError(
      400,
      'INVALID_INPUT',
      `${label} muss eine ganze Zahl zwischen 0 und ${max} sein.`,
    );
  }
  return value as number;
}

function mapDraw(row: DrawRow): Draw {
  return {
    id: row.id,
    taskId: row.task_id,
    participantId: row.participant_id,
    membershipId: row.membership_id,
    name: row.winner_name,
    method: row.manual ? 'manual' : row.method,
    countBefore: row.count_before,
    countAfter: row.count_after,
    candidates: JSON.parse(row.candidates_json) as CandidateSnapshot[],
    createdAt: row.created_at,
    undoneAt: row.undone_at,
    resultVersion: row.result_version,
  };
}

export class ChooserService {
  private pickIndex: (length: number) => number;
  private now: () => string;
  private timeZone: string;

  constructor(
    private db: Database,
    options: ServiceOptions = {},
  ) {
    this.pickIndex = options.pickIndex ?? randomInt;
    this.now = options.now ?? (() => new Date().toISOString());
    this.timeZone = options.timeZone ?? (process.env.APP_TIMEZONE || 'Europe/Berlin');
  }

  private today(): string {
    return calendarDate(this.now(), this.timeZone);
  }

  private mapMember(row: MemberRow, today = this.today()): Member {
    const { absences_json, ...member } = row;
    return {
      ...member,
      active: !!row.active,
      absent: isAbsent(JSON.parse(absences_json), today),
    };
  }

  private members(taskId: number, today = this.today()): Member[] {
    return this.db
      .query<MemberRow, [number]>(
        `
      SELECT m.id, m.participant_id AS participantId, p.name, m.active, m.count, p.absences_json
      FROM task_memberships m JOIN participants p ON p.id = m.participant_id
      WHERE m.task_id = ? AND p.deleted_at IS NULL
      ORDER BY m.active DESC, m.count, p.name COLLATE NOCASE, m.id
    `,
      )
      .all(taskId)
      .map((row) => this.mapMember(row, today));
  }

  private taskRow(id: number): TaskRow {
    const row = this.db.query<TaskRow, [number]>('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!row) throw new DomainError(404, 'TASK_NOT_FOUND', 'Diese Aufgabe wurde nicht gefunden.');
    return row;
  }

  private member(taskId: number, membershipId: number): Member {
    const row = this.db
      .query<MemberRow, [number, number]>(
        `
          SELECT m.id, m.participant_id AS participantId, p.name, m.active, m.count, p.absences_json
          FROM task_memberships AS m
          JOIN participants AS p ON p.id = m.participant_id
          WHERE m.task_id = ? AND m.id = ? AND p.deleted_at IS NULL
        `,
      )
      .get(taskId, membershipId);
    if (!row) {
      throw new DomainError(
        404,
        'MEMBER_NOT_FOUND',
        'Diese Person gehört nicht zu dieser Aufgabe.',
      );
    }
    return this.mapMember(row);
  }

  private drawRow(id: string): DrawRow {
    const row = this.db.query<DrawRow, [string]>('SELECT * FROM draws WHERE id = ?').get(id);
    if (!row) throw new DomainError(404, 'DRAW_NOT_FOUND', 'Diese Auswahl wurde nicht gefunden.');
    return row;
  }

  private checkVersion(task: TaskRow, expectedVersion: unknown): void {
    integer(expectedVersion, 'Aufgabenversion', Number.MAX_SAFE_INTEGER);
    if (task.version !== expectedVersion) {
      throw new DomainError(
        409,
        'VERSION_CONFLICT',
        'Die Aufgabe wurde inzwischen geändert. Der aktuelle Stand wird neu geladen; bitte prüfe ihn und versuche es erneut.',
      );
    }
  }

  private editable(task: TaskRow): void {
    if (task.archived_at) {
      throw new DomainError(
        409,
        'TASK_ARCHIVED',
        'Diese Aufgabe ist archiviert. Öffne sie zuerst wieder.',
      );
    }
  }

  private bump(taskId: number, at: string): void {
    this.db
      .query('UPDATE tasks SET version = version + 1, updated_at = ? WHERE id = ?')
      .run(at, taskId);
  }

  private event(
    taskId: number,
    type: string,
    description: string,
    details: unknown,
    at: string,
  ): void {
    this.db
      .query(
        `
          INSERT INTO audit_events(task_id, type, description, details_json, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(taskId, type, description, JSON.stringify(details), at);
  }

  state(): AppState {
    return this.db.transaction(() => ({
      tasks: this.db
        .query<{ id: number }, []>(
          'SELECT id FROM tasks ORDER BY archived_at IS NOT NULL, name COLLATE NOCASE, id',
        )
        .all()
        .map(({ id }) => this.summary(this.taskRow(id))),
      participants: this.db
        .query<Participant & { absences_json: string; availability_version: number }, []>(
          `
            SELECT id, name, created_at AS createdAt, absences_json, availability_version
            FROM participants
            WHERE deleted_at IS NULL
            ORDER BY name COLLATE NOCASE, id
          `,
        )
        .all()
        .map(({ absences_json, availability_version, ...person }) => ({
          ...person,
          absences: JSON.parse(absences_json) as Absence[],
          absent: isAbsent(JSON.parse(absences_json), this.today()),
          availabilityVersion: availability_version,
        })),
    }))();
  }

  stats(period: StatsPeriod = 'all', range?: StatsDateRange, timeZone = 'Europe/Berlin'): Stats {
    let to = this.now();
    let from: string | null;
    if (period === 'custom') {
      if (!isStatsDateRange(range))
        throw new DomainError(
          400,
          'INVALID_INPUT',
          'Bitte gib ein gültiges Start- und Enddatum an. Das Enddatum darf nicht vor dem Startdatum liegen.',
        );
      ({ from, to } = customStatsWindow(range, timeZone));
      if (from > to)
        throw new DomainError(
          400,
          'INVALID_INPUT',
          'Der gewählte Zeitraum enthält in dieser Zeitzone keinen Kalendertag.',
        );
    } else from = statsPeriodStart(period, to);
    return this.db.transaction(() => ({
      period,
      from,
      to,
      ...(period === 'custom' ? { startDate: range!.start, endDate: range!.end } : {}),
      participants: this.db
        .query<Omit<StatsParticipant, 'removed'> & { removed: number }, []>(
          `
        SELECT id, name, deleted_at IS NOT NULL AS removed
        FROM participants ORDER BY name COLLATE NOCASE, id
      `,
        )
        .all()
        .map((person) => ({ ...person, removed: !!person.removed })),
      tasks: this.db
        .query<Omit<StatsTask, 'archived'> & { archived: number }, []>(
          `
        SELECT id, name, archived_at IS NOT NULL AS archived
        FROM tasks ORDER BY name COLLATE NOCASE, id
      `,
        )
        .all()
        .map((task) => ({ ...task, archived: !!task.archived })),
      entries: this.db
        .query<
          Omit<StatsEntry, 'active'> & { active: number },
          [string | null, string | null, string]
        >(
          `
        SELECT m.id, m.participant_id AS participantId, m.task_id AS taskId,
          m.active, m.count,
          COALESCE(d.selections, 0) AS selections,
          COALESCE(d.undoneSelections, 0) AS undoneSelections,
          d.lastSelectedAt
        FROM task_memberships AS m
        LEFT JOIN (
          SELECT membership_id,
            SUM(undone_at IS NULL) AS selections,
            SUM(undone_at IS NOT NULL) AS undoneSelections,
            MAX(CASE WHEN undone_at IS NULL THEN created_at END) AS lastSelectedAt
          FROM draws
          WHERE (? IS NULL OR (created_at >= ? AND created_at <= ?))
          GROUP BY membership_id
        ) AS d ON d.membership_id = m.id
        ORDER BY m.participant_id, m.task_id, m.id
      `,
        )
        .all(from, from, to)
        .map((entry) => ({ ...entry, active: !!entry.active })),
    }))();
  }

  private summary(row: TaskRow): TaskSummary {
    const members = this.members(row.id);
    const counts = {
      activeCount: members.filter((member) => member.active && !member.absent).length,
      memberCount: members.length,
    };
    let currentDraw = row.current_draw_id ? mapDraw(this.drawRow(row.current_draw_id)) : null;
    if (currentDraw) {
      // Current views follow renames; historical draw snapshots keep the original name.
      const participant = this.db
        .query<{ name: string }, [number]>(
          'SELECT name FROM participants WHERE id = ? AND deleted_at IS NULL',
        )
        .get(currentDraw.participantId);
      currentDraw = participant ? { ...currentDraw, name: participant.name } : null;
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      archived: row.archived_at !== null,
      version: row.version,
      ...counts,
      currentDraw,
      schedule: row.schedule_json ? (JSON.parse(row.schedule_json) as TaskSchedule) : null,
      dueDate: row.next_due_date,
      due: !row.archived_at && !!row.next_due_date && row.next_due_date <= this.today(),
    };
  }

  getTask(id: number): TaskDetail {
    return this.db.transaction(() => {
      const row = this.taskRow(id);
      const members = this.members(id);
      const active = members.filter((member) => member.active && !member.absent);
      const min = active[0]?.count ?? null;
      const summary = this.summary(row);
      return {
        ...summary,
        members,
        candidates: active.filter((member) => member.count === min),
        ...this.history(id),
        canUndo:
          !summary.archived &&
          !!summary.currentDraw &&
          !summary.currentDraw.undoneAt &&
          summary.currentDraw.resultVersion === row.version,
      };
    })();
  }

  history(taskId: number): { history: Draw[]; events: AuditEvent[] } {
    this.taskRow(taskId);
    return {
      history: this.db
        .query<DrawRow, [number]>(
          'SELECT * FROM draws WHERE task_id = ? ORDER BY rowid DESC LIMIT 50',
        )
        .all(taskId)
        .map(mapDraw),
      events: this.db
        .query<AuditEvent, [number]>(
          `
            SELECT id, type, created_at AS createdAt, description
            FROM audit_events
            WHERE task_id = ?
            ORDER BY id DESC
            LIMIT 50
          `,
        )
        .all(taskId),
    };
  }

  createTask(input: CreateTaskInput): TaskDetail {
    const name = text(input.name, 'Aufgabenname', 100);
    const description = text(input.description ?? '', 'Beschreibung', 2000, true);
    const schedule = input.schedule ?? null;
    if (schedule !== null && !validSchedule(schedule))
      throw new DomainError(
        400,
        'INVALID_INPUT',
        'Bitte wähle eine gültige Wiederholung und ein Startdatum.',
      );
    const participantIds = input.participantIds === undefined ? [] : input.participantIds;
    if (
      !Array.isArray(participantIds) ||
      participantIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
      new Set(participantIds).size !== participantIds.length
    ) {
      throw new DomainError(400, 'INVALID_INPUT', 'Bitte wähle jede Person höchstens einmal aus.');
    }
    return this.db
      .transaction(() => {
        const findParticipant = this.db.query<Participant, [number]>(
          `SELECT id, name, created_at AS createdAt FROM participants
           WHERE id = ? AND deleted_at IS NULL`,
        );
        const participants = participantIds.map((participantId) => {
          const person = findParticipant.get(participantId);
          if (!person) {
            throw new DomainError(
              404,
              'PARTICIPANT_NOT_FOUND',
              'Eine ausgewählte Person ist nicht mehr im Team. Bitte aktualisiere die Seite oder passe die Auswahl an.',
            );
          }
          return person;
        });
        const at = this.now();
        const result = this.db
          .query(
            'INSERT INTO tasks(name, description, created_at, updated_at, schedule_json, next_due_date) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            name,
            description,
            at,
            at,
            schedule ? JSON.stringify(schedule) : null,
            schedule?.startDate ?? null,
          );
        const id = Number(result.lastInsertRowid);
        this.event(
          id,
          'task_created',
          `Aufgabe „${name}“ wurde angelegt.`,
          { name, description, participantIds, schedule },
          at,
        );
        const addParticipant = this.db.query(
          `INSERT INTO task_memberships(task_id, participant_id, active, count, created_at)
           VALUES (?, ?, 1, 0, ?)`,
        );
        for (const participant of participants) {
          addParticipant.run(id, participant.id, at);
          this.event(
            id,
            'member_added',
            `${participant.name} wurde mit Auswahlstand 0 hinzugefügt (beim Anlegen der Aufgabe).`,
            { participantId: participant.id, initialCount: 0 },
            at,
          );
        }
        return this.getTask(id);
      })
      .immediate();
  }

  updateTask(
    id: number,
    input: VersionInput & {
      name?: string;
      description?: string;
      archived?: boolean;
      schedule?: TaskSchedule | null;
    },
  ): TaskDetail {
    return this.db
      .transaction(() => {
        const task = this.taskRow(id);
        this.checkVersion(task, input.expectedVersion);
        const name = input.name === undefined ? task.name : text(input.name, 'Aufgabenname', 100);
        const description =
          input.description === undefined
            ? task.description
            : text(input.description, 'Beschreibung', 2000, true);
        if (input.archived !== undefined && typeof input.archived !== 'boolean') {
          throw new DomainError(400, 'INVALID_INPUT', 'Archivstatus muss wahr oder falsch sein.');
        }
        const archived = input.archived ?? !!task.archived_at;
        const schedule =
          input.schedule === undefined
            ? task.schedule_json
              ? (JSON.parse(task.schedule_json) as TaskSchedule)
              : null
            : input.schedule;
        if (schedule !== null && !validSchedule(schedule))
          throw new DomainError(
            400,
            'INVALID_INPUT',
            'Bitte wähle eine gültige Wiederholung und ein Startdatum.',
          );
        const scheduleJson = schedule ? JSON.stringify(schedule) : null;
        const scheduleChanged = scheduleJson !== task.schedule_json;
        if (
          name === task.name &&
          description === task.description &&
          archived === !!task.archived_at &&
          !scheduleChanged
        ) {
          return this.getTask(id);
        }
        const at = this.now();
        this.db
          .query(
            `
              UPDATE tasks
              SET name = ?, description = ?, archived_at = ?, updated_at = ?, schedule_json = ?, next_due_date = ?, version = version + 1
              WHERE id = ?
            `,
          )
          .run(
            name,
            description,
            archived ? (task.archived_at ?? at) : null,
            at,
            scheduleJson,
            scheduleChanged ? (schedule?.startDate ?? null) : task.next_due_date,
            id,
          );
        this.event(
          id,
          'task_updated',
          archived !== !!task.archived_at
            ? archived
              ? 'Aufgabe wurde archiviert.'
              : 'Aufgabe wurde wieder geöffnet.'
            : 'Aufgabendaten wurden geändert.',
          {
            before: {
              name: task.name,
              description: task.description,
              archived: !!task.archived_at,
            },
            after: { name, description, archived, schedule },
          },
          at,
        );
        return this.getTask(id);
      })
      .immediate();
  }

  createParticipant(input: { name: string }): Participant {
    const name = text(input.name, 'Name', 100);
    const at = this.now();
    const result = this.db
      .query('INSERT INTO participants(name, created_at) VALUES (?, ?)')
      .run(name, at);
    return { id: Number(result.lastInsertRowid), name, createdAt: at };
  }

  setAbsences(id: number, input: VersionInput & { absences: Absence[] }): Participant {
    if (!validAbsences(input.absences))
      throw new DomainError(
        400,
        'INVALID_INPUT',
        'Bitte gib gültige Abwesenheiten mit Start- und Enddatum an (höchstens 100).',
      );
    integer(input.expectedVersion, 'Abwesenheitsversion', Number.MAX_SAFE_INTEGER);
    const absences = [...input.absences].sort((a, b) => a.start.localeCompare(b.start));
    if (absences.some((range, index) => index > 0 && range.start <= absences[index - 1]!.end))
      throw new DomainError(400, 'INVALID_INPUT', 'Abwesenheiten dürfen sich nicht überschneiden.');
    return this.db
      .transaction(() => {
        const person = this.db
          .query<
            {
              id: number;
              name: string;
              createdAt: string;
              availability_version: number;
              absences_json: string;
            },
            [number]
          >(
            'SELECT id, name, created_at AS createdAt, availability_version, absences_json FROM participants WHERE id = ? AND deleted_at IS NULL',
          )
          .get(id);
        if (!person)
          throw new DomainError(404, 'PARTICIPANT_NOT_FOUND', 'Diese Person wurde nicht gefunden.');
        if (person.availability_version !== input.expectedVersion)
          throw new DomainError(
            409,
            'VERSION_CONFLICT',
            'Die Abwesenheiten wurden inzwischen geändert. Bitte prüfe den aktuellen Stand.',
          );
        const changed = JSON.stringify(absences) !== person.absences_json;
        if (changed) {
          const at = this.now();
          this.db
            .query(
              'UPDATE participants SET absences_json = ?, availability_version = availability_version + 1 WHERE id = ?',
            )
            .run(JSON.stringify(absences), id);
          for (const task of this.db
            .query<{ task_id: number }, [number]>(
              'SELECT task_id FROM task_memberships WHERE participant_id = ?',
            )
            .all(id)) {
            this.bump(task.task_id, at);
            this.event(
              task.task_id,
              'absences_changed',
              `Abwesenheiten von ${person.name}: ${absences.length ? absences.map(({ start, end }) => `${start} bis ${end}`).join('; ') : 'keine Zeiträume'}. Auswahlstände bleiben erhalten.`,
              { participantId: id, before: JSON.parse(person.absences_json), after: absences },
              at,
            );
          }
        }
        return {
          id,
          name: person.name,
          createdAt: person.createdAt,
          absences,
          absent: isAbsent(absences, this.today()),
          availabilityVersion: person.availability_version + Number(changed),
        };
      })
      .immediate();
  }

  duplicateTask(id: number, input: VersionInput & { name: string }): TaskDetail {
    return this.db
      .transaction(() => {
        const source = this.taskRow(id);
        this.checkVersion(source, input.expectedVersion);
        const members = this.members(id);
        const copy = this.createTask({
          name: input.name,
          description: source.description,
          participantIds: members.map((member) => member.participantId),
          schedule: source.schedule_json ? JSON.parse(source.schedule_json) : null,
        });
        for (const member of members.filter((member) => !member.active))
          this.db
            .query(
              'UPDATE task_memberships SET active = 0 WHERE task_id = ? AND participant_id = ?',
            )
            .run(copy.id, member.participantId);
        this.event(
          copy.id,
          'task_duplicated',
          `Aus „${source.name}“ dupliziert. Alle Auswahlstände starten bei 0; bisherige Auswahlen werden nicht übernommen.`,
          { sourceTaskId: id },
          this.now(),
        );
        return this.getTask(copy.id);
      })
      .immediate();
  }

  renameParticipant(id: number, input: { name: string }): Participant {
    const name = text(input.name, 'Name', 100);
    return this.db
      .transaction(() => {
        const old = this.db
          .query<Participant, [number]>(
            `
              SELECT id, name, created_at AS createdAt
              FROM participants
              WHERE id = ? AND deleted_at IS NULL
            `,
          )
          .get(id);
        if (!old) {
          throw new DomainError(404, 'PARTICIPANT_NOT_FOUND', 'Diese Person wurde nicht gefunden.');
        }
        if (old.name === name) return old;
        const at = this.now();
        this.db.query('UPDATE participants SET name = ? WHERE id = ?').run(name, id);
        for (const row of this.db
          .query<{ task_id: number }, [number]>(
            'SELECT task_id FROM task_memberships WHERE participant_id = ?',
          )
          .all(id)) {
          this.bump(row.task_id, at);
          this.event(
            row.task_id,
            'participant_renamed',
            `„${old.name}“ heißt jetzt „${name}“.`,
            { participantId: id, oldName: old.name, newName: name },
            at,
          );
        }
        return { ...old, name };
      })
      .immediate();
  }

  /** Soft deletion preserves historical references; a second removal returns 404. */
  removeParticipant(id: number): ParticipantRemoval {
    return this.db
      .transaction(() => {
        const participant = this.db
          .query<Participant, [number]>(
            `
              SELECT id, name, created_at AS createdAt
              FROM participants
              WHERE id = ? AND deleted_at IS NULL
            `,
          )
          .get(id);
        if (!participant) {
          throw new DomainError(404, 'PARTICIPANT_NOT_FOUND', 'Diese Person wurde nicht gefunden.');
        }

        const memberships = this.db
          .query<{ id: number; task_id: number }, [number]>(
            'SELECT id, task_id FROM task_memberships WHERE participant_id = ?',
          )
          .all(id);
        const removedAt = this.now();
        this.db.query('UPDATE participants SET deleted_at = ? WHERE id = ?').run(removedAt, id);
        this.db.query('UPDATE task_memberships SET active = 0 WHERE participant_id = ?').run(id);

        for (const membership of memberships) {
          const task = this.taskRow(membership.task_id);
          const clearsCurrent =
            !!task.current_draw_id && this.drawRow(task.current_draw_id).participant_id === id;
          this.db
            .query(
              `
              UPDATE tasks
              SET current_draw_id = ?, version = version + 1, updated_at = ?, next_due_date = ?
              WHERE id = ?
            `,
            )
            .run(
              clearsCurrent ? null : task.current_draw_id,
              removedAt,
              task.next_due_date,
              task.id,
            );
          this.event(
            task.id,
            'participant_removed',
            `${participant.name} wurde aus dem Team und dieser Aufgabe entfernt.${clearsCurrent ? ' Die aktuelle Auswahl wurde geleert.' : ''}`,
            {
              participantId: id,
              membershipId: membership.id,
              removedAt,
              clearedCurrentDraw: clearsCurrent,
            },
            removedAt,
          );
        }

        return { id, name: participant.name, removedAt };
      })
      .immediate();
  }

  addMember(taskId: number, input: VersionInput & { participantId: number }): TaskDetail {
    if (!Number.isSafeInteger(input.participantId) || input.participantId < 1) {
      throw new DomainError(400, 'INVALID_INPUT', 'Bitte wähle eine gültige Person aus.');
    }
    return this.db
      .transaction(() => {
        const task = this.taskRow(taskId);
        this.checkVersion(task, input.expectedVersion);
        this.editable(task);
        const participant = this.db
          .query<Participant, [number]>(
            `
              SELECT id, name, created_at AS createdAt
              FROM participants
              WHERE id = ? AND deleted_at IS NULL
            `,
          )
          .get(input.participantId);
        if (!participant) {
          throw new DomainError(404, 'PARTICIPANT_NOT_FOUND', 'Diese Person wurde nicht gefunden.');
        }
        const existing = this.db
          .query<{ id: number }, [number, number]>(
            'SELECT id FROM task_memberships WHERE task_id = ? AND participant_id = ?',
          )
          .get(taskId, input.participantId);
        if (existing) {
          throw new DomainError(
            409,
            'ALREADY_MEMBER',
            'Diese Person ist der Aufgabe bereits zugeordnet.',
          );
        }
        const activeMembers = this.members(taskId).filter(
          (member) => member.active && !member.absent,
        );
        const count = activeMembers.length
          ? Math.min(...activeMembers.map((member) => member.count))
          : 0;
        const at = this.now();
        this.db
          .query(
            `
              INSERT INTO task_memberships(task_id, participant_id, active, count, created_at)
              VALUES (?, ?, 1, ?, ?)
            `,
          )
          .run(taskId, participant.id, count, at);
        this.bump(taskId, at);
        this.event(
          taskId,
          'member_added',
          `${participant.name} wurde mit Auswahlstand ${count} hinzugefügt (aktives Minimum, sonst 0).`,
          { participantId: participant.id, initialCount: count },
          at,
        );
        return this.getTask(taskId);
      })
      .immediate();
  }

  setMemberActive(
    taskId: number,
    membershipId: number,
    input: VersionInput & { active: boolean },
  ): TaskDetail {
    if (typeof input.active !== 'boolean') {
      throw new DomainError(400, 'INVALID_INPUT', 'Aktivstatus muss wahr oder falsch sein.');
    }
    return this.db
      .transaction(() => {
        const task = this.taskRow(taskId);
        this.checkVersion(task, input.expectedVersion);
        this.editable(task);
        const member = this.member(taskId, membershipId);
        if (member.active === input.active) return this.getTask(taskId);
        const at = this.now();
        this.db
          .query('UPDATE task_memberships SET active = ? WHERE id = ?')
          .run(input.active ? 1 : 0, membershipId);
        this.bump(taskId, at);
        this.event(
          taskId,
          'member_status_changed',
          `${member.name} wurde ${input.active ? 'aktiviert' : 'deaktiviert'}. Auswahlstand ${member.count} bleibt erhalten.`,
          { membershipId, active: input.active, count: member.count },
          at,
        );
        return this.getTask(taskId);
      })
      .immediate();
  }

  correctCount(
    taskId: number,
    membershipId: number,
    input: VersionInput & { count: number; reason: string },
  ): TaskDetail {
    const count = integer(input.count, 'Auswahlstand');
    const reason = text(input.reason, 'Begründung', 500);
    return this.db
      .transaction(() => {
        const task = this.taskRow(taskId);
        this.checkVersion(task, input.expectedVersion);
        this.editable(task);
        const member = this.member(taskId, membershipId);
        if (member.count === count) {
          throw new DomainError(
            400,
            'UNCHANGED_COUNT',
            'Der neue Auswahlstand muss sich vom bisherigen Wert unterscheiden.',
          );
        }
        const at = this.now();
        this.db
          .query('UPDATE task_memberships SET count = ? WHERE id = ?')
          .run(count, membershipId);
        this.bump(taskId, at);
        this.event(
          taskId,
          'count_corrected',
          `${member.name}: Auswahlstand ${member.count} → ${count}. Begründung: ${reason}`,
          { membershipId, before: member.count, after: count, reason },
          at,
        );
        return this.getTask(taskId);
      })
      .immediate();
  }

  draw(
    taskId: number,
    input: VersionInput & { requestId: string; membershipId?: number },
  ): DrawResponse {
    const requestId = text(input.requestId, 'Anfrage-ID', 128);
    integer(input.expectedVersion, 'Aufgabenversion', Number.MAX_SAFE_INTEGER);
    if (
      input.membershipId !== undefined &&
      (!Number.isSafeInteger(input.membershipId) || input.membershipId < 1)
    )
      throw new DomainError(400, 'INVALID_INPUT', 'Bitte wähle eine gültige Person.');
    return this.db
      .transaction(() => {
        const task = this.taskRow(taskId);
        const existing = this.db
          .query<DrawRow, [number, string]>(
            'SELECT * FROM draws WHERE task_id = ? AND request_id = ?',
          )
          .get(taskId, requestId);
        if (existing) {
          if (
            existing.expected_version !== input.expectedVersion ||
            !!existing.manual !== (input.membershipId !== undefined) ||
            (existing.manual && existing.membership_id !== input.membershipId)
          ) {
            throw new DomainError(
              409,
              'REQUEST_ID_CONFLICT',
              'Diese Anfrage-ID wurde bereits für einen anderen Aufgabenstand verwendet.',
            );
          }
          return { draw: mapDraw(existing), task: this.getTask(taskId), replayed: true };
        }
        this.checkVersion(task, input.expectedVersion);
        this.editable(task);
        const at = this.now();
        const today = calendarDate(at, this.timeZone);
        const available = this.members(taskId, today).filter(
          (member) => member.active && !member.absent,
        );
        const minimum = Math.min(...available.map((member) => member.count));
        const candidates =
          input.membershipId === undefined
            ? available.filter((member) => member.count === minimum).sort((a, b) => a.id - b.id)
            : available.filter((member) => member.id === input.membershipId);
        if (!candidates.length) {
          throw new DomainError(
            409,
            'NO_ACTIVE_MEMBERS',
            'Die gewünschte Auswahl ist derzeit nicht möglich. Es werden nur aktive, anwesende Teilnehmer berücksichtigt.',
          );
        }
        const index = candidates.length === 1 ? 0 : this.pickIndex(candidates.length);
        if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
          throw new Error('Die Zufallsquelle hat einen ungültigen Kandidatenindex geliefert.');
        }
        const winner = candidates[index]!;
        if (winner.count >= MAX_COUNT) {
          throw new DomainError(
            409,
            'COUNT_LIMIT',
            'Der maximale Auswahlstand ist erreicht. Bitte korrigiere den Stand mit Begründung.',
          );
        }
        const id = randomUUID();
        const snapshot: CandidateSnapshot[] = candidates.map((member) => ({
          membershipId: member.id,
          name: member.name,
          count: member.count,
        }));
        this.db.query('UPDATE task_memberships SET count = count + 1 WHERE id = ?').run(winner.id);
        this.db
          .query(
            `
              INSERT INTO draws (
                id, task_id, membership_id, participant_id, winner_name, method,
                count_before, count_after, candidates_json, previous_draw_id,
                request_id, expected_version, result_version, created_at, manual, previous_due_date
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            id,
            taskId,
            winner.id,
            winner.participantId,
            winner.name,
            candidates.length === 1 ? 'direct' : 'random',
            winner.count,
            winner.count + 1,
            JSON.stringify(snapshot),
            task.current_draw_id,
            requestId,
            input.expectedVersion,
            task.version + 1,
            at,
            input.membershipId === undefined ? 0 : 1,
            task.next_due_date,
          );
        this.db
          .query(
            `
              UPDATE tasks
              SET current_draw_id = ?, version = version + 1, updated_at = ?, next_due_date = ?
              WHERE id = ?
            `,
          )
          .run(
            id,
            at,
            task.schedule_json && task.next_due_date
              ? nextDue(JSON.parse(task.schedule_json), task.next_due_date, today)
              : null,
            taskId,
          );
        if (input.membershipId !== undefined)
          this.event(
            taskId,
            'manual_takeover',
            `${winner.name} hat die Aufgabe manuell übernommen (${winner.count} → ${winner.count + 1}).`,
            { drawId: id, membershipId: winner.id },
            at,
          );
        return { draw: mapDraw(this.drawRow(id)), task: this.getTask(taskId), replayed: false };
      })
      .immediate();
  }

  undo(taskId: number, drawId: string, input: VersionInput): TaskDetail {
    return this.db
      .transaction(() => {
        const task = this.taskRow(taskId);
        this.checkVersion(task, input.expectedVersion);
        this.editable(task);
        const draw = this.drawRow(drawId);
        if (draw.task_id !== taskId) {
          throw new DomainError(
            404,
            'DRAW_NOT_FOUND',
            'Diese Auswahl gehört nicht zu dieser Aufgabe.',
          );
        }
        if (
          task.current_draw_id !== drawId ||
          draw.undone_at ||
          task.version !== draw.result_version
        ) {
          throw new DomainError(
            409,
            'UNDO_UNAVAILABLE',
            'Diese Auswahl kann nicht mehr zurückgenommen werden, weil danach eine relevante Änderung erfolgt ist.',
          );
        }
        const member = this.member(taskId, draw.membership_id);
        if (member.count !== draw.count_after || member.count < 1) {
          throw new DomainError(
            409,
            'UNDO_UNAVAILABLE',
            'Der Auswahlstand wurde inzwischen geändert.',
          );
        }
        const at = this.now();
        this.db
          .query('UPDATE task_memberships SET count = ? WHERE id = ?')
          .run(draw.count_before, draw.membership_id);
        this.db.query('UPDATE draws SET undone_at = ? WHERE id = ?').run(at, drawId);
        this.db
          .query(
            `
              UPDATE tasks
              SET current_draw_id = ?, version = version + 1, updated_at = ?, next_due_date = ?
              WHERE id = ?
            `,
          )
          .run(draw.previous_draw_id, at, draw.previous_due_date, taskId);
        this.event(
          taskId,
          'draw_undone',
          `Auswahl von ${draw.winner_name} wurde zurückgenommen (${draw.count_after} → ${draw.count_before}).`,
          {
            drawId,
            membershipId: draw.membership_id,
            before: draw.count_after,
            after: draw.count_before,
          },
          at,
        );
        return this.getTask(taskId);
      })
      .immediate();
  }
}

export function createService(db: Database, options?: ServiceOptions): ChooserService {
  return new ChooserService(db, options);
}
