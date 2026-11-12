export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
}

export function formatDay(value: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatDate(value: string, timeZone: string, short = false): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    ...(short ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function readPreference(key: string): boolean {
  try {
    return localStorage.getItem(`reihum-${key}`) === 'true';
  } catch {
    return false;
  }
}

export function savePreference(key: string, value: boolean): void {
  try {
    localStorage.setItem(`reihum-${key}`, String(value));
  } catch {
    /* Browser preferences are optional. */
  }
}
