"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const qrcode_1 = __importDefault(require("qrcode"));
const clicks_1 = __importDefault(require("../models/clicks"));
const url_1 = __importDefault(require("../models/url"));
const user_1 = __importDefault(require("../models/user"));
dotenv_1.default.config();
const QA_USER = {
    username: 'qa_demo',
    email: 'qa-demo@shortly.local',
    password: 'QA-Password-2026!',
};
const clickTotalsByDay = [4, 8, 12, 7, 18, 13, 21];
const linkFixtures = [
    { shortId: 'qa-launch', longUrl: 'https://example.com/product-launch', clicks: 31 },
    { shortId: 'qa-newsletter', longUrl: 'https://example.com/newsletter/september', clicks: 22 },
    { shortId: 'qa-social', longUrl: 'https://example.com/social/campaign', clicks: 19 },
    { shortId: 'qa-docs', longUrl: 'https://example.com/docs/getting-started', clicks: 11 },
];
const startOfDayUtc = (daysAgo) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    date.setUTCHours(12, 0, 0, 0);
    return date;
};
const main = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/urlshortener';
    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 4400}`).replace(/\/$/, '');
    await mongoose_1.default.connect(mongoUri);
    try {
        const password = await bcrypt_1.default.hash(QA_USER.password, 10);
        const user = await user_1.default.findOneAndUpdate({ email: QA_USER.email }, {
            $set: {
                username: QA_USER.username,
                password,
                plan: 'pro',
                subscriptionStatus: 'active',
            },
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        // Only refresh the known QA links. Re-running the seed never changes a user's other links.
        const existingLinks = await url_1.default.find({ userId: user._id, shortId: { $in: linkFixtures.map(({ shortId }) => shortId) } });
        if (existingLinks.length) {
            await clicks_1.default.deleteMany({ urlId: { $in: existingLinks.map(({ _id }) => _id) } });
            await url_1.default.deleteMany({ _id: { $in: existingLinks.map(({ _id }) => _id) } });
        }
        const links = await Promise.all(linkFixtures.map(async (fixture, index) => {
            const shortUrl = `${baseUrl}/${fixture.shortId}`;
            return {
                ...fixture,
                shortUrl,
                customUrl: fixture.shortId,
                userId: user._id,
                qrCodeDataUrl: await qrcode_1.default.toDataURL(shortUrl, { errorCorrectionLevel: 'H', width: 300, margin: 2 }),
                createdAt: startOfDayUtc(10 + index),
                updatedAt: new Date(),
            };
        }));
        const seededLinks = await url_1.default.insertMany(links);
        const clickEvents = clickTotalsByDay.flatMap((count, dayIndex) => {
            const date = startOfDayUtc(6 - dayIndex);
            return Array.from({ length: count }, (_, clickIndex) => ({
                urlId: seededLinks[(clickIndex + dayIndex) % seededLinks.length]._id,
                createdAt: new Date(date.getTime() + clickIndex * 15 * 60 * 1000),
                visitorHash: `qa-visitor-${dayIndex}-${clickIndex}`,
                referrer: clickIndex % 2 === 0 ? 'https://www.google.com/' : 'https://www.linkedin.com/',
                userAgent: 'Shortly QA seed browser',
            }));
        });
        await clicks_1.default.insertMany(clickEvents);
        const clickCounts = new Map();
        clickEvents.forEach(({ urlId }) => {
            const id = urlId.toString();
            clickCounts.set(id, (clickCounts.get(id) || 0) + 1);
        });
        await Promise.all(seededLinks.map((link) => url_1.default.updateOne({ _id: link._id }, { $set: { clicks: clickCounts.get(link._id.toString()) || 0 } })));
        console.log(`QA seed complete for ${QA_USER.email}`);
        console.log(`Password: ${QA_USER.password}`);
        console.log(`Created ${seededLinks.length} links and ${clickEvents.length} click events across the last 7 days.`);
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
main().catch((error) => {
    console.error('QA seed failed:', error);
    process.exitCode = 1;
});
