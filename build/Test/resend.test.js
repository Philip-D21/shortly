"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const resend_1 = require("../services/resend");
(0, node_test_1.default)('ticket email template uses Shortly branding and escapes attendee content', () => {
    const template = (0, resend_1.createTicketEmailTemplate)({
        attendeeName: '<Alex>',
        attendeeEmail: 'alex@example.com',
        eventTitle: 'Launch & Learn',
        startsAt: new Date('2026-09-10T18:00:00.000Z'),
        location: 'Lagos <Hall 1>',
        ticketCode: 'EVT-ABC123',
        ticketUrl: 'https://shortly.example/tickets/token',
    });
    strict_1.default.match(template.subject, /Launch & Learn/);
    strict_1.default.match(template.html, /#031f39/);
    strict_1.default.match(template.html, /#0058dd/);
    strict_1.default.match(template.html, /cid:event-ticket-qr/);
    strict_1.default.match(template.html, /&lt;Alex&gt;/);
    strict_1.default.match(template.html, /Lagos &lt;Hall 1&gt;/);
    strict_1.default.match(template.text, /EVT-ABC123/);
});
