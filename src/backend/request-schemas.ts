import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { isCalendarDate, isStatsDateRange } from '../shared/stats-range';

const name = z.string().trim().min(1).max(100);
const description = z.string().trim().max(2000);
const expectedVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const version = z.object({ expectedVersion });
const schedule = z
  .object({
    frequency: z.enum(['weekly', 'monthly']),
    startDate: z.string().refine(isCalendarDate),
  })
  .nullable();

/** Transport validation is separate from domain invariants. */
function json<T extends z.ZodType>(schema: T) {
  return zValidator('json', schema, (result, context) => {
    if (!result.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_INPUT',
            message:
              'Bitte prüfe die Eingaben. Namen und Begründungen dürfen nicht leer sein; Zahlen müssen im zulässigen Bereich liegen.',
          },
        },
        400,
      );
    }
  });
}

export const createTaskRequest = json(
  z.object({
    name,
    description: description.optional(),
    schedule: schedule.optional(),
    participantIds: z
      .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
  }),
);

export const updateTaskRequest = json(
  version.extend({
    name: name.optional(),
    description: description.optional(),
    archived: z.boolean().optional(),
    schedule: schedule.optional(),
  }),
);

export const participantRequest = json(z.object({ name }));
export const participantRemovalRequest = json(z.object({}));
export const absencesRequest = json(
  version.extend({
    absences: z
      .array(
        z
          .object({
            start: z.string().refine(isCalendarDate),
            end: z.string().refine(isCalendarDate),
          })
          .refine(isStatsDateRange),
      )
      .max(100),
  }),
);
export const duplicateTaskRequest = json(version.extend({ name }));

export const addMemberRequest = json(
  version.extend({
    participantId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
);

export const memberStatusRequest = json(version.extend({ active: z.boolean() }));

export const correctionRequest = json(
  version.extend({
    count: z.number().int().min(0).max(1_000_000_000),
    reason: z.string().trim().min(1).max(500),
  }),
);

export const drawRequest = json(
  version.extend({
    requestId: z.string().trim().min(1).max(128),
    membershipId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  }),
);

export const undoRequest = json(version);

export const statsRequest = zValidator(
  'query',
  z
    .object({
      period: z.enum(['all', 'week', 'month', 'custom']).default('all'),
      start: z.string().refine(isCalendarDate).optional(),
      end: z.string().refine(isCalendarDate).optional(),
    })
    .refine((query) => query.period !== 'custom' || isStatsDateRange(query)),
  (result, context) => {
    if (!result.success)
      return context.json(
        {
          error: {
            code: 'INVALID_INPUT',
            message:
              'Bitte wähle einen gültigen Zeitraum. Für Benutzerdefiniert sind ein gültiges Start- und Enddatum in der richtigen Reihenfolge erforderlich.',
          },
        },
        400,
      );
  },
);
