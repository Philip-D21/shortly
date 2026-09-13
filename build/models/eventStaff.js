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
const eventStaffSchema = new mongoose_1.Schema({
    eventId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ['manager', 'checkin_staff'], required: true },
    status: { type: String, enum: ['pending', 'active', 'revoked'], default: 'pending', index: true },
    invitationTokenHash: { type: String, sparse: true, unique: true },
    invitedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: Date,
    acceptedAt: Date,
    revokedAt: Date,
}, { timestamps: true });
eventStaffSchema.index({ eventId: 1, email: 1 }, { unique: true });
const EventStaff = mongoose_1.default.model('EventStaff', eventStaffSchema);
exports.default = EventStaff;
