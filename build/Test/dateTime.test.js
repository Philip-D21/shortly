"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const dateTime_1 = require("../utils/dateTime");
(0, node_test_1.default)('parses a wall-clock time using the event timezone', () => {
    strict_1.default.equal((0, dateTime_1.parseDateTimeInTimezone)('2026-09-10T18:00', 'Africa/Lagos')?.toISOString(), '2026-09-10T17:00:00.000Z');
    strict_1.default.equal((0, dateTime_1.parseDateTimeInTimezone)('2026-09-10T18:00', 'UTC')?.toISOString(), '2026-09-10T18:00:00.000Z');
});
