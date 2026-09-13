# Organizer event management

## Lifecycle and access

Events support `draft`, `published`, and `cancelled` states. Existing events without the new fields are treated as published/open during the startup backfill. Registration also closes automatically at the registration deadline or when the start time has passed.

The organizer is the owner. Event staff are scoped to one event and can be `manager` or `checkin_staff`; invitations expire after 48 hours and can be revoked. Backend routes enforce the role for every operation:

- Owner: full event, guest, message, export, check-in, and staff administration.
- Manager: event details, guests, messages, and check-in.
- Check-in staff: check-in only; no exports, messaging, event editing, or staff administration.

## Registration and attendance

`Event.registeredCount` is reserved with a single atomic MongoDB `findOneAndUpdate` conditional increment. The attendee unique index and compensation decrement handle duplicate concurrent submissions. Cancellation transitions the attendee once and decrements the counter once. Attendance is stored separately in `checkedInAt`/`checkedInBy`, so checking in never consumes or releases capacity.

The local Docker MongoDB is a standalone MongoDB 7 deployment, not a replica set. The capacity strategy intentionally uses single-document atomic operations and does not require multi-document transactions. If future flows must atomically update multiple documents, the QA and deployment MongoDB instances must be configured as replica sets before enabling those flows.

## API surface

Protected management routes are mounted under `/api/events/:eventId`:

- `GET/PATCH /manage`, `POST /publish`, `/registration`, `/cancel`, `/duplicate`
- `GET /guests`, `/guests/export`, `/guests/:attendeeId`
- `POST /guests/:attendeeId/cancel`, `/guests/:attendeeId/resend`
- `POST /check-in`, `/guests/:attendeeId/check-in/reverse`
- `GET/POST /staff`, `POST /staff/:staffId/revoke`, `POST /staff/accept`
- `POST /messages/preview`, `/messages/send`, `/messages/reminder`, `GET /messages/jobs`

CSV cells beginning with spreadsheet formula characters are prefixed with an apostrophe before export.

## Notifications

Notifications are persisted in `NotificationJob` with idempotency keys, attempts, retry timestamps, and `queued`, `processing`, `accepted`, `failed`, or `cancelled` states. Provider acceptance is not treated as inbox delivery. Event cancellation and rescheduling cancel obsolete reminder/update jobs. Set `NOTIFICATION_WORKER_ENABLED=true` to run the opt-in retry/reminder worker; it is disabled by default in local development and QA so no real notifications are sent accidentally.

## Verification

Backend build/tests:

```bash
npm test
```

Frontend build:

```bash
cd ../my-url-shortener
npm run build
```

For isolated QA, use a dedicated `MONGO_URI` database and separate backend/frontend ports. Seed deterministic organizers, staff roles, event states, capacity-one events, cancelled guests, and checked-in guests before running API and browser journeys. Real Resend, camera hardware, and production notifications are outside automated verification; use a provider mock/local mail sink and QR fixture decoding for those tests.
