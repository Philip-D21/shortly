import test from 'node:test';
import assert from 'node:assert/strict';
import { createTicketEmailTemplate } from '../services/resend';

test('ticket email template uses Shortly branding and escapes attendee content', () => {
  const template = createTicketEmailTemplate({
    attendeeName: '<Alex>',
    attendeeEmail: 'alex@example.com',
    eventTitle: 'Launch & Learn',
    startsAt: new Date('2026-09-10T18:00:00.000Z'),
    location: 'Lagos <Hall 1>',
    ticketCode: 'EVT-ABC123',
    ticketUrl: 'https://shortly.example/tickets/token',
  });

  assert.match(template.subject, /Launch & Learn/);
  assert.match(template.html, /#031f39/);
  assert.match(template.html, /#0058dd/);
  assert.match(template.html, /cid:event-ticket-qr/);
  assert.match(template.html, /&lt;Alex&gt;/);
  assert.match(template.html, /Lagos &lt;Hall 1&gt;/);
  assert.match(template.text, /EVT-ABC123/);
});
