# Attendee email setup

Shortly sends event registration confirmations through Resend. Each confirmation includes the Shortly-branded event details, ticket code, a link to the ticket page, and an inline QR ticket.

## Environment

Set these values in `urlShortener/.env`:

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Shortly Events <tickets@your-verified-domain.com>
FRONTEND_URL=http://127.0.0.1:3000
```

`RESEND_FROM_EMAIL` must use a domain verified in the Resend dashboard for delivery to normal attendee addresses. The default `onboarding@resend.dev` sender is for testing and can only send to the email address associated with the Resend account.

For safe delivery testing, Resend provides `delivered@resend.dev`. Replace it with a real attendee address only after verifying your sending domain.

## Registration flow

1. The public event form creates the attendee and ticket token.
2. The API generates a QR image for the ticket URL.
3. Resend receives the branded HTML and plain-text email plus the QR image as an inline `cid:event-ticket-qr` attachment.
4. The response includes `emailSent: true` and stores the returned Resend email ID on the attendee record.

If sending fails, registration remains successful and the API returns `emailSent: false`; the ticket code and ticket URL are still returned so the attendee is not lost.
