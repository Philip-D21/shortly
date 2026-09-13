"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireEventAccess = exports.hasEventPermission = exports.getEventAccess = void 0;
const event_1 = __importDefault(require("../models/event"));
const eventStaff_1 = __importDefault(require("../models/eventStaff"));
const user_1 = __importDefault(require("../models/user"));
const getEventAccess = async (eventId, userId) => {
    const event = await event_1.default.findById(eventId);
    if (!event)
        return null;
    if (String(event.organizerId) === String(userId))
        return { event, role: 'owner' };
    const user = await user_1.default.findById(userId).select('email');
    if (!user)
        return null;
    const staff = await eventStaff_1.default.findOne({ eventId, email: user.email.toLowerCase(), status: 'active' });
    return staff ? { event, role: staff.role } : null;
};
exports.getEventAccess = getEventAccess;
const hasEventPermission = (role, permission) => {
    if (role === 'owner')
        return true;
    if (role === 'manager')
        return ['manage', 'guests', 'checkin', 'messages'].includes(permission);
    return permission === 'checkin';
};
exports.hasEventPermission = hasEventPermission;
const requireEventAccess = async (eventId, userId, permission) => {
    const access = await (0, exports.getEventAccess)(eventId, userId);
    return access && (0, exports.hasEventPermission)(access.role, permission) ? access : null;
};
exports.requireEventAccess = requireEventAccess;
