const dateTimeParts = (value: string, timeZone: string): Record<string, number> | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0'] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second) };
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  const formatted = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(probe);
  const asRecord = Object.fromEntries(formatted.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const offsetMs = Date.UTC(asRecord.year, asRecord.month - 1, asRecord.day, asRecord.hour, asRecord.minute, asRecord.second) - probe.getTime();
  return { ...parts, timestamp: probe.getTime() - offsetMs };
};

export const parseDateTimeInTimezone = (value: unknown, timeZone = 'UTC'): Date | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  try {
    const parts = dateTimeParts(value, timeZone);
    if (!parts) return undefined;
    const parsed = new Date(parts.timestamp);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  } catch {
    return undefined;
  }
};
