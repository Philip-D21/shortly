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
const eventSchema = new mongoose_1.Schema({
    organizerId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 4000 },
    slug: { type: String, required: true, unique: true, index: true },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    location: { type: String, trim: true, maxlength: 300 },
    capacity: { type: Number, min: 1 },
    registrationDeadline: Date,
    timezone: { type: String, default: 'Africa/Lagos', trim: true, maxlength: 80 },
    status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'published', index: true },
    registrationOpen: { type: Boolean, default: true, index: true },
    registeredCount: { type: Number, default: 0, min: 0 },
    cancelledAt: Date,
    cancelledBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
const Event = mongoose_1.default.model('Event', eventSchema);
exports.default = Event;
