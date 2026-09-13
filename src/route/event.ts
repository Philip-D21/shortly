import { Router } from 'express';
import { createEvent, getPublicEvent, getTicket, listMyEvents, registerForEvent } from '../controller/eventController';
import {
  acceptStaffInvitation,
  cancelEvent,
  cancelGuestRegistration,
  checkInGuest,
  duplicateEvent,
  exportGuests,
  getEventManagement,
  getGuest,
  inviteStaff,
  listGuests,
  listMessageJobs,
  listStaff,
  previewMessage,
  publishEvent,
  resendGuestTicket,
  reverseCheckIn,
  revokeStaff,
  sendMessage,
  scheduleReminder,
  setRegistrationOpen,
  updateEvent,
} from '../controller/eventManagementController';
import { authenticate } from '../middleware/authentication';

const router = Router();
router.get('/mine', authenticate, listMyEvents);
router.post('/', authenticate, createEvent);
router.post('/staff/accept', authenticate, acceptStaffInvitation);
router.get('/tickets/:token', getTicket);
router.get('/:slug', getPublicEvent);
router.post('/:slug/register', registerForEvent);
router.get('/:eventId/manage', authenticate, getEventManagement);
router.patch('/:eventId/manage', authenticate, updateEvent);
router.post('/:eventId/publish', authenticate, publishEvent);
router.post('/:eventId/registration', authenticate, setRegistrationOpen);
router.post('/:eventId/cancel', authenticate, cancelEvent);
router.post('/:eventId/duplicate', authenticate, duplicateEvent);
router.get('/:eventId/guests', authenticate, listGuests);
router.get('/:eventId/guests/export', authenticate, exportGuests);
router.get('/:eventId/guests/:attendeeId', authenticate, getGuest);
router.post('/:eventId/guests/:attendeeId/cancel', authenticate, cancelGuestRegistration);
router.post('/:eventId/guests/:attendeeId/resend', authenticate, resendGuestTicket);
router.post('/:eventId/check-in', authenticate, checkInGuest);
router.post('/:eventId/guests/:attendeeId/check-in/reverse', authenticate, reverseCheckIn);
router.get('/:eventId/staff', authenticate, listStaff);
router.post('/:eventId/staff', authenticate, inviteStaff);
router.post('/:eventId/staff/:staffId/revoke', authenticate, revokeStaff);
router.post('/:eventId/messages/preview', authenticate, previewMessage);
router.post('/:eventId/messages/send', authenticate, sendMessage);
router.post('/:eventId/messages/reminder', authenticate, scheduleReminder);
router.get('/:eventId/messages/jobs', authenticate, listMessageJobs);
export default router;
