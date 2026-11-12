import type { StatsDateRange } from './contracts';

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isStatsDateRange(
  value: { start?: unknown; end?: unknown } | undefined,
): value is StatsDateRange {
  return (
    !!value && isCalendarDate(value.start) && isCalendarDate(value.end) && value.start <= value.end
  );
}
