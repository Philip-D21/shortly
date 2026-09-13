"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const notificationJobSchema = new mongoose_1.Schema({
    eventId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Event', index: true },
    attendeeId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'EventAttendee', index: true },
    recipientEmail: { type: String, required: true, lowercase: true, trim: true },
    type: { type: String, enum: ['ticket', 'ticket_resend', 'event_update', 'event_cancelled', 'reminder', 'staff_invitation'], required: true },
    status: { type: String, enum: ['queued', 'processing', 'accepted', 'failed', 'cancelled'], default: 'queued', index: true },
    idempotencyKey: { type: String, required: true, unique: true },
    payload: { type: mongoose_1.Schema.Types.Mixed, required: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    providerMessageId: String,
    lastError: String,
    acceptedAt: Date,
}, { timestamps: true });
const NotificationJob = mongoose_1.default.model('NotificationJob', notificationJobSchema);
exports.default = NotificationJob;
