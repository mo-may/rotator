import type { StatsPeriod, StatsDateRange } from './shared/contracts';

/** Rolling intervals, with an inclusive start and end. Clamp short previous months. */
export function statsPeriodStart(
  period: Exclude<StatsPeriod, 'custom'>,
  to: string,
): string | null {
  if (period === 'all') return null;
  const from = new Date(to);
  if (period === 'week') from.setUTCDate(from.getUTCDate() - 7);
  else {
    const day = from.getUTCDate();
    from.setUTCDate(1);
    from.setUTCMonth(from.getUTCMonth() - 1);
    const lastDay = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0),
    ).getUTCDate();
    from.setUTCDate(Math.min(day, lastDay));
  }
  return from.toISOString();
}

/** Calendar-date boundaries in the application zone, including 23/25-hour DST days. */
export function customStatsWindow(
  range: StatsDateRange,
  timeZone: string,
): { from: string; to: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    era: 'short',
  });
  const key = (year: number, month: number, day: number) => year * 10000 + month * 100 + day;
  const localDate = (instant: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
    return key(year, Number(parts.month), Number(parts.day));
  };
  const boundary = (nominal: Date) => {
    const target = key(nominal.getUTCFullYear(), nominal.getUTCMonth() + 1, nominal.getUTCDate());
    let low = nominal.getTime() - 36 * 60 * 60 * 1000;
    let high = nominal.getTime() + 36 * 60 * 60 * 1000;
    // Find the beginning of the local day without assuming a fixed UTC offset.
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (localDate(middle) < target) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const start = new Date(`${range.start}T00:00:00.000Z`);
  const afterEnd = new Date(`${range.end}T00:00:00.000Z`);
  afterEnd.setUTCDate(afterEnd.getUTCDate() + 1);
  return {
    from: new Date(boundary(start)).toISOString(),
    to: new Date(boundary(afterEnd) - 1).toISOString(),
  };
}
