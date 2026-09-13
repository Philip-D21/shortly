import QRCode from 'qrcode';

export interface TicketEmailInput {
  attendeeName: string;
  attendeeEmail: string;
  eventTitle: string;
  startsAt: Date;
  location?: string;
  ticketCode: string;
  ticketUrl: string;
}

const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));

export interface TicketEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface EventNoticeEmailInput {
  attendeeName: string;
  attendeeEmail: string;
  eventTitle: string;
  startsAt: Date;
  location?: string;
  ticketUrl?: string;
  heading: string;
  message?: string;
}

export const createTicketEmailTemplate = (input: TicketEmailInput): TicketEmailTemplate => {
  const attendeeName = escapeHtml(input.attendeeName);
  const eventTitle = escapeHtml(input.eventTitle);
  const date = input.startsAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  const location = input.location || 'Location to be announced';
  const safeLocation = escapeHtml(location);
  const safeTicketCode = escapeHtml(input.ticketCode);
  const safeTicketUrl = escapeHtml(input.ticketUrl);

  return {
    subject: `You're registered: ${input.eventTitle}`,
    html: `<!doctype html>
<html lang="en"><body style="margin:0;background:#f5f7fb;color:#031f39;font-family:Arial,Helvetica,sans-serif;">
  <div style="padding:32px 16px;"><div style="max-width:600px;margin:0 auto;overflow:hidden;background:#ffffff;border:1px solid #e8edf5;border-radius:20px;">
    <div style="padding:26px 32px;background:#031f39;color:#ffffff;">
      <div style="font-size:20px;font-weight:800;letter-spacing:-.03em;"><span style="display:inline-block;width:26px;height:26px;margin-right:8px;border-radius:8px;background:#0058dd;color:#ffffff;text-align:center;line-height:26px;">s</span>shortly</div>
      <p style="margin:28px 0 0;color:#9fc3ff;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">You're on the list</p>
      <h1 style="margin:10px 0 0;color:#ffffff;font-size:32px;line-height:1.1;letter-spacing:-.04em;">Your ticket is confirmed.</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0;font-size:16px;line-height:1.6;">Hi ${attendeeName},</p>
      <p style="margin:14px 0 0;color:#52647a;font-size:15px;line-height:1.7;">Your registration for <strong style="color:#031f39;">${eventTitle}</strong> is confirmed. Keep this email handy for check-in.</p>
      <div style="margin:26px 0;padding:20px;background:#eaf1ff;border-radius:14px;"><p style="margin:0 0 12px;color:#0058dd;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Event details</p><p style="margin:7px 0;font-size:14px;line-height:1.5;"><strong>When</strong><br>${escapeHtml(date)}</p><p style="margin:14px 0 0;font-size:14px;line-height:1.5;"><strong>Where</strong><br>${safeLocation}</p></div>
      <div style="padding:22px;text-align:center;border:1px solid #e8edf5;border-radius:14px;"><p style="margin:0;color:#52647a;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Your ticket code</p><p style="margin:10px 0 0;color:#031f39;font-family:monospace;font-size:25px;font-weight:800;letter-spacing:.08em;">${safeTicketCode}</p><img src="cid:event-ticket-qr" width="180" height="180" alt="QR ticket for ${eventTitle}" style="display:block;width:180px;height:180px;margin:20px auto 0;" /><p style="margin:12px 0 0;color:#718096;font-size:12px;line-height:1.5;">Show this QR code or your ticket code at check-in.</p></div>
      <p style="margin:26px 0;text-align:center;"><a href="${safeTicketUrl}" style="display:inline-block;padding:13px 22px;border-radius:9px;background:#0058dd;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Open my ticket</a></p>
      <p style="margin:0;color:#718096;font-size:12px;line-height:1.6;">If the button does not work, copy this link into your browser:<br><span style="color:#0058dd;word-break:break-all;">${safeTicketUrl}</span></p>
    </div><div style="padding:20px 32px;background:#f5f7fb;color:#718096;font-size:12px;line-height:1.6;text-align:center;">Powered by <strong style="color:#031f39;">shortly</strong> · Keep your ticket code private.</div>
  </div></div>
</body></html>`,
    text: `You're registered for ${input.eventTitle}\n\nHi ${input.attendeeName},\n\nYour registration is confirmed.\n\nWhen: ${date}\nWhere: ${location}\nTicket code: ${input.ticketCode}\n\nOpen your ticket: ${input.ticketUrl}\n\nShow the QR ticket or ticket code at check-in. Keep this code private.\n\n- shortly`,
  };
};

export const sendEventNoticeEmail = async (input: EventNoticeEmailInput): Promise<string | undefined> => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return undefined;
  const from = process.env.RESEND_FROM_EMAIL || 'Shortly Events <onboarding@resend.dev>';
  const date = input.startsAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  const safeName = escapeHtml(input.attendeeName);
  const safeTitle = escapeHtml(input.eventTitle);
  const safeLocation = escapeHtml(input.location || 'Location to be announced');
  const safeMessage = escapeHtml(input.message || 'We wanted to share an update about your event registration.');
  const safeTicketUrl = input.ticketUrl ? escapeHtml(input.ticketUrl) : '';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.attendeeEmail],
      subject: `${input.heading}: ${input.eventTitle}`,
      text: `${input.heading}\n\nHi ${input.attendeeName},\n\n${input.message || 'We wanted to share an update about your event registration.'}\n\nEvent: ${input.eventTitle}\nWhen: ${date}\nWhere: ${input.location || 'Location to be announced'}${input.ticketUrl ? `\nOpen your ticket: ${input.ticketUrl}` : ''}`,
      html: `<html><body style="margin:0;background:#f5f7fb;color:#031f39;font-family:Arial,Helvetica,sans-serif"><div style="padding:32px 16px"><main style="max-width:600px;margin:auto;background:#fff;border:1px solid #e8edf5;border-radius:20px;overflow:hidden"><header style="padding:26px 32px;background:#031f39;color:#fff"><strong style="font-size:20px"><span style="display:inline-block;width:26px;height:26px;margin-right:8px;border-radius:8px;background:#0058dd;text-align:center;line-height:26px">s</span>shortly</strong><p style="margin:28px 0 0;color:#9fc3ff;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(input.heading)}</p></header><section style="padding:32px"><p>Hi ${safeName},</p><p style="color:#52647a;line-height:1.7">${safeMessage}</p><div style="padding:20px;background:#eaf1ff;border-radius:14px"><strong>${safeTitle}</strong><p style="margin:10px 0 0;font-size:14px">${escapeHtml(date)}<br>${safeLocation}</p></div>${safeTicketUrl ? `<p style="text-align:center;margin:26px 0"><a href="${safeTicketUrl}" style="padding:13px 22px;border-radius:9px;background:#0058dd;color:#fff;font-weight:700;text-decoration:none">Open my ticket</a></p>` : ''}</section><footer style="padding:20px 32px;background:#f5f7fb;color:#718096;font-size:12px;text-align:center">Powered by <strong style="color:#031f39">shortly</strong></footer></main></div></body></html>`,
    }),
  });
  const payload = await response.json() as { id?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || 'Unable to send event notification');
  return payload.id;
};

export const sendTicketEmail = async (input: TicketEmailInput): Promise<string | undefined> => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`Ticket email not sent: RESEND_API_KEY is missing (ticket ${input.ticketCode}).`);
    return undefined;
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Shortly Events <onboarding@resend.dev>';
  const qrPng = (await QRCode.toBuffer(input.ticketUrl, { width: 420, margin: 2, errorCorrectionLevel: 'H' })).toString('base64');
  const template = createTicketEmailTemplate(input);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `event-ticket-${input.ticketCode}` },
    body: JSON.stringify({
      from,
      to: [input.attendeeEmail],
      subject: template.subject,
      text: template.text,
      html: template.html,
      attachments: [{ content: qrPng, filename: `${input.ticketCode}.png`, content_type: 'image/png', content_id: 'event-ticket-qr' }],
    }),
  });
  const payload = await response.json() as { id?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || 'Unable to send the registration email');
  return payload.id;
};
