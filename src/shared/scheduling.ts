import type { Absence, TaskSchedule } from './contracts';
import { isCalendarDate, isStatsDateRange } from './stats-range';

export function calendarDate(at: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}
export function validSchedule(value: unknown): value is TaskSchedule {
  if (!value || typeof value !== 'object') return false;
  const schedule = value as TaskSchedule;
  return ['weekly', 'monthly'].includes(schedule.frequency) && isCalendarDate(schedule.startDate);
}
export function validAbsences(value: unknown): value is Absence[] {
  return Array.isArray(value) && value.length <= 100 && value.every(isStatsDateRange);
}
export function isAbsent(absences: Absence[], today: string): boolean {
  return absences.some(({ start, end }) => start <= today && today <= end);
}
/** Advance to the first anchored occurrence after the completed due date and today.
 * Monthly anchors retain their original day, clamped only in shorter months. */
export function nextDue(schedule: TaskSchedule, due: string, today: string): string | null {
  const after = due > today ? due : today;
  const anchor = new Date(`${schedule.startDate}T00:00:00Z`);
  const date = new Date(`${after}T00:00:00Z`);
  let next: Date;
  if (schedule.frequency === 'weekly') {
    const weeks = Math.floor((date.getTime() - anchor.getTime()) / (7 * 86400000)) + 1;
    next = new Date(anchor.getTime() + Math.max(1, weeks) * 7 * 86400000);
  } else {
    const months =
      (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      date.getUTCMonth() -
      anchor.getUTCMonth();
    const occurrence = (offset: number) => {
      const result = new Date(anchor);
      result.setUTCDate(1);
      result.setUTCMonth(anchor.getUTCMonth() + offset + 1, 0);
      result.setUTCDate(Math.min(anchor.getUTCDate(), result.getUTCDate()));
      return result;
    };
    next = occurrence(Math.max(1, months));
    if (next <= date) next = occurrence(Math.max(1, months) + 1);
  }
  return next.getUTCFullYear() > 9999 ? null : next.toISOString().slice(0, 10);
}
