import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDateTimeInTimezone } from '../utils/dateTime';

test('parses a wall-clock time using the event timezone', () => {
  assert.equal(parseDateTimeInTimezone('2026-09-10T18:00', 'Africa/Lagos')?.toISOString(), '2026-09-10T17:00:00.000Z');
  assert.equal(parseDateTimeInTimezone('2026-09-10T18:00', 'UTC')?.toISOString(), '2026-09-10T18:00:00.000Z');
});
