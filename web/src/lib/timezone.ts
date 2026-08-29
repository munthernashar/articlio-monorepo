export const DEFAULT_USER_TIMEZONE = 'UTC';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseDateParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: partValue('year'),
    month: partValue('month'),
    day: partValue('day'),
    hour: partValue('hour'),
    minute: partValue('minute'),
    second: partValue('second'),
  };
}

function getTimeZoneOffsetMs(utcDate: Date, timeZone: string): number {
  const parts = parseDateParts(utcDate, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcDate.getTime();
}

function zonedDateTimeToUtc(params: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  const { timeZone, year, month, day, hour = 0, minute = 0, second = 0 } = params;
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guessMs = targetUtcMs;

  for (let i = 0; i < 2; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(guessMs), timeZone);
    guessMs = targetUtcMs - offsetMs;
  }

  return new Date(guessMs);
}

function addDays(parts: Pick<DateParts, 'year' | 'month' | 'day'>, days: number) {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

export function normalizeUserTimezone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_USER_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_USER_TIMEZONE;
  }
}

export function getDayKeyInTimezone(dateInput: string | Date, timeZone: string): string {
  const normalizedTimeZone = normalizeUserTimezone(timeZone);
  const parts = parseDateParts(new Date(dateInput), normalizedTimeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getCurrentDayBoundsUtcForTimezone(timeZone: string, nowInput = new Date()) {
  const normalizedTimeZone = normalizeUserTimezone(timeZone);
  const now = new Date(nowInput);
  const localToday = parseDateParts(now, normalizedTimeZone);
  const nextDay = addDays(localToday, 1);

  const dayStartUtc = zonedDateTimeToUtc({
    timeZone: normalizedTimeZone,
    year: localToday.year,
    month: localToday.month,
    day: localToday.day,
  });
  const nextDayStartUtc = zonedDateTimeToUtc({
    timeZone: normalizedTimeZone,
    year: nextDay.year,
    month: nextDay.month,
    day: nextDay.day,
  });

  return {
    dayStartUtc,
    nextDayStartUtc,
  };
}
