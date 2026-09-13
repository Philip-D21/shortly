import NotificationJob, { NotificationJobStatus, NotificationJobType } from '../models/notificationJob';
import { sendEventNoticeEmail, sendTicketEmail } from './resend';

export interface NotificationPayload {
  attendeeName?: string;
  attendeeEmail?: string;
  eventTitle: string;
  startsAt: string;
  location?: string;
  ticketCode?: string;
  ticketUrl?: string;
  message?: string;
}

export const enqueueNotification = async (input: {
  eventId?: string;
  attendeeId?: string;
  recipientEmail: string;
  type: NotificationJobType;
  idempotencyKey: string;
  payload: NotificationPayload;
  nextAttemptAt?: Date;
}) => NotificationJob.findOneAndUpdate(
  { idempotencyKey: input.idempotencyKey },
  {
    $setOnInsert: {
      ...input,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: input.nextAttemptAt || new Date(),
    },
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

export const cancelObsoleteEventJobs = async (eventId: string): Promise<void> => {
  await NotificationJob.updateMany(
    { eventId, type: { $in: ['reminder', 'event_update'] }, status: { $in: ['queued', 'failed'] } },
    { $set: { status: 'cancelled', lastError: 'Obsolete because the event changed or was cancelled.' } }
  );
};

const sendJob = async (job: any): Promise<string | undefined> => {
  const payload = job.payload as NotificationPayload;
  if (job.type === 'ticket' || job.type === 'ticket_resend') {
    if (!payload.attendeeName || !payload.ticketCode || !payload.ticketUrl) throw new Error('Ticket notification payload is incomplete');
    return sendTicketEmail({
      attendeeName: payload.attendeeName,
      attendeeEmail: job.recipientEmail,
      eventTitle: payload.eventTitle,
      startsAt: new Date(payload.startsAt),
      location: payload.location,
      ticketCode: payload.ticketCode,
      ticketUrl: payload.ticketUrl,
    });
  }
  return sendEventNoticeEmail({
    attendeeName: payload.attendeeName || 'there',
    attendeeEmail: job.recipientEmail,
    eventTitle: payload.eventTitle,
    startsAt: new Date(payload.startsAt),
    location: payload.location,
    ticketUrl: payload.ticketUrl,
    heading: job.type === 'event_cancelled' ? 'Event cancelled' : job.type === 'reminder' ? 'Event reminder' : 'Event update',
    message: payload.message,
  });
};

export const processDueNotificationJobs = async (limit = 20): Promise<number> => {
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const job = await NotificationJob.findOneAndUpdate(
      { status: { $in: ['queued', 'failed'] }, nextAttemptAt: { $lte: new Date() }, attempts: { $lt: 5 } },
      { $set: { status: 'processing' }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, new: true }
    );
    if (!job) break;
    processed += 1;
    try {
      const providerMessageId = await sendJob(job);
      if (!providerMessageId) {
        await NotificationJob.updateOne({ _id: job._id }, { $set: { status: 'queued', nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000), lastError: 'Email provider is not configured.' } });
        continue;
      }
      await NotificationJob.updateOne({ _id: job._id }, { $set: { status: 'accepted', providerMessageId, acceptedAt: new Date(), lastError: undefined } });
    } catch (error: any) {
      const attempts = Number(job.attempts || 1);
      await NotificationJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: attempts >= 5 ? 'failed' : 'queued',
            nextAttemptAt: new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** attempts * 60 * 1000)),
            lastError: String(error.message || error).slice(0, 500),
          },
        }
      );
    }
  }
  return processed;
};

export const notificationStatusForResponse = (status: NotificationJobStatus): NotificationJobStatus => status;

export const startNotificationWorker = (): NodeJS.Timeout | undefined => {
  if (process.env.NOTIFICATION_WORKER_ENABLED !== 'true') return undefined;
  const intervalMs = Math.max(5_000, Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS || 30_000));
  const worker = setInterval(() => {
    void processDueNotificationJobs().catch((error) => console.error('Notification worker failed:', error));
  }, intervalMs);
  worker.unref();
  void processDueNotificationJobs().catch((error) => console.error('Notification worker failed:', error));
  return worker;
};
