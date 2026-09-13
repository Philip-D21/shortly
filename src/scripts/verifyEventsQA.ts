import assert from 'node:assert/strict';

const baseUrl = (process.env.QA_API_URL || 'http://127.0.0.1:5011').replace(/\/$/, '');
const password = 'QA-Events-Password-2026!';

const request = async (path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
  return { status: response.status, body };
};

const login = async (email: string): Promise<string> => {
  const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(result.status, 200, `login failed for ${email}`);
  return result.body.token;
};

const auth = (token: string): HeadersInit => ({ authorization: `Bearer ${token}` });

const main = async (): Promise<void> => {
  const owner = await login('qa-event-owner@shortly.local');
  const manager = await login('qa-event-manager@shortly.local');
  const staff = await login('qa-event-staff@shortly.local');

  const events = await request('/api/events/mine', { headers: auth(owner) });
  assert.equal(events.status, 200);
  const capacityEvent = events.body.events.find((event: any) => event.slug === 'qa-event-capacity-one');
  assert.ok(capacityEvent, 'capacity fixture is missing');

  const ownerManage = await request(`/api/events/${capacityEvent._id}/manage`, { headers: auth(owner) });
  assert.equal(ownerManage.status, 200);
  assert.equal(ownerManage.body.counts.checkedIn, 1);
  const managerManage = await request(`/api/events/${capacityEvent._id}/manage`, { headers: auth(manager) });
  assert.equal(managerManage.status, 200);
  const staffManage = await request(`/api/events/${capacityEvent._id}/manage`, { headers: auth(staff) });
  assert.equal(staffManage.status, 403);
  const staffExport = await request(`/api/events/${capacityEvent._id}/guests/export`, { headers: auth(staff) });
  assert.equal(staffExport.status, 403);

  const alreadyCheckedIn = await request(`/api/events/${capacityEvent._id}/check-in`, { method: 'POST', headers: auth(staff), body: JSON.stringify({ ticketCode: 'EVT-QACHECK1' }) });
  assert.equal(alreadyCheckedIn.status, 409);
  assert.equal(alreadyCheckedIn.body.result, 'already_checked_in');
  const cancelledRegistration = await request('/api/events/qa-event-cancelled/register', { method: 'POST', body: JSON.stringify({ name: 'Blocked Guest', email: 'blocked-qa@example.com' }) });
  assert.equal(cancelledRegistration.status, 403);

  const created = await request('/api/events', { method: 'POST', headers: auth(owner), body: JSON.stringify({ title: `QA Concurrent ${Date.now()}`, description: 'Concurrency verification event', startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), timezone: 'Africa/Lagos', capacity: 1, location: 'QA Hall' }) });
  assert.equal(created.status, 201);
  const slug = created.body.event.slug;
  const registrations = await Promise.all([
    request(`/api/events/${slug}/register`, { method: 'POST', body: JSON.stringify({ name: 'Concurrent Guest', email: 'concurrent-qa@example.com' }) }),
    request(`/api/events/${slug}/register`, { method: 'POST', body: JSON.stringify({ name: 'Concurrent Guest', email: 'concurrent-qa@example.com' }) }),
  ]);
  assert.equal(registrations.filter((result) => result.status === 201).length, 1);
  assert.equal(registrations.filter((result) => result.status === 409).length, 1);
  const successful = registrations.find((result) => result.status === 201)!;
  const ticket = await request(new URL(successful.body.ticketUrl).pathname);
  assert.equal(ticket.status, 200);
  assert.match(ticket.body.qrCodeDataUrl, /^data:image\/png;base64,/);
  const checkedIn = await request(`/api/events/${created.body.event._id}/check-in`, { method: 'POST', headers: auth(staff), body: JSON.stringify({ ticketCode: successful.body.attendee.ticketCode }) });
  assert.equal(checkedIn.status, 200);
  assert.equal(checkedIn.body.result, 'checked_in');
  const duplicateCheckIn = await request(`/api/events/${created.body.event._id}/check-in`, { method: 'POST', headers: auth(staff), body: JSON.stringify({ ticketCode: successful.body.attendee.ticketCode }) });
  assert.equal(duplicateCheckIn.status, 409);

  console.log('Event QA API verification passed: permissions, cancellation, concurrency, ticket QR, and check-in.');
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
