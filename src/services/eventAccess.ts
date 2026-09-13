import Event from '../models/event';
import EventStaff, { EventStaffRole } from '../models/eventStaff';
import User from '../models/user';

export type EventAccessRole = 'owner' | EventStaffRole;

export interface EventAccess {
  event: any;
  role: EventAccessRole;
}

export const getEventAccess = async (eventId: string, userId: string): Promise<EventAccess | null> => {
  const event = await Event.findById(eventId);
  if (!event) return null;
  if (String(event.organizerId) === String(userId)) return { event, role: 'owner' };
  const user = await User.findById(userId).select('email');
  if (!user) return null;
  const staff = await EventStaff.findOne({ eventId, email: user.email.toLowerCase(), status: 'active' });
  return staff ? { event, role: staff.role } : null;
};

export const hasEventPermission = (
  role: EventAccessRole,
  permission: 'manage' | 'guests' | 'checkin' | 'messages' | 'staff' | 'export'
): boolean => {
  if (role === 'owner') return true;
  if (role === 'manager') return ['manage', 'guests', 'checkin', 'messages'].includes(permission);
  return permission === 'checkin';
};

export const requireEventAccess = async (
  eventId: string,
  userId: string,
  permission: 'manage' | 'guests' | 'checkin' | 'messages' | 'staff' | 'export'
): Promise<EventAccess | null> => {
  const access = await getEventAccess(eventId, userId);
  return access && hasEventPermission(access.role, permission) ? access : null;
};
