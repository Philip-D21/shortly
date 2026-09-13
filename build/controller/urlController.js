"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteShortUrl = exports.getAllUrls = exports.getQRCode = exports.redirectToLongUrl = exports.handleUrlAnalytics = exports.createShortenUrl = void 0;
const crypto_1 = __importDefault(require("crypto"));
const qrcode_1 = __importDefault(require("qrcode"));
const shortid_1 = __importDefault(require("shortid"));
const valid_url_1 = __importDefault(require("valid-url"));
const url_1 = __importDefault(require("../models/url"));
const clicks_1 = __importDefault(require("../models/clicks"));
const user_1 = __importDefault(require("../models/user"));
const plans_1 = require("../config/plans");
/**
 * Generates a QR code as a base64 data URL for the given short URL.
 * Returns the data URL string, or null on failure.
 */
const generateQRCodeDataUrl = async (shortUrl) => {
    try {
        const dataUrl = await qrcode_1.default.toDataURL(shortUrl, {
            errorCorrectionLevel: 'H',
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
        });
        return dataUrl;
    }
    catch (error) {
        console.error('QR code generation failed:', error);
        return null;
    }
};
/**
 * POST /api/url/shorten
 *
 * Shortens a long URL and generates a QR code.
 * Supports guest mode — userId is null when unauthenticated.
 */
const createShortenUrl = async (req, res) => {
    try {
        const { longUrl, customUrl } = req.body;
        if (!longUrl || !valid_url_1.default.isUri(longUrl)) {
            res.status(400).json({ message: 'Please provide a valid URL' });
            return;
        }
        if (customUrl && !/^[A-Za-z0-9_-]{3,50}$/.test(customUrl)) {
            res.status(400).json({
                message: 'Custom aliases must be 3-50 characters using letters, numbers, hyphens, or underscores',
            });
            return;
        }
        const userId = req.user?.id || null;
        if (customUrl && !userId) {
            res.status(401).json({ message: 'Create a free account to use a custom alias' });
            return;
        }
        // Check if custom URL alias is already taken
        if (customUrl) {
            const existingCustom = await url_1.default.findOne({ customUrl });
            if (existingCustom) {
                res.status(409).json({ message: 'Custom alias is already taken' });
                return;
            }
        }
        // Check if this long URL was already shortened by the same user (or guest)
        const existingUrl = await url_1.default.findOne({ longUrl, userId });
        if (existingUrl) {
            // Regenerate QR if missing
            if (!existingUrl.qrCodeDataUrl) {
                existingUrl.qrCodeDataUrl = await generateQRCodeDataUrl(existingUrl.shortUrl);
                await existingUrl.save();
            }
            res.status(200).json({
                status: 'ok',
                data: existingUrl,
            });
            return;
        }
        if (userId) {
            const user = await user_1.default.findById(userId).select('plan');
            if (!user) {
                res.status(401).json({ message: 'User account no longer exists' });
                return;
            }
            const plan = (user.plan || 'free');
            const limits = (0, plans_1.getPlans)()[plan] || (0, plans_1.getPlans)().free;
            const monthStart = new Date();
            monthStart.setUTCDate(1);
            monthStart.setUTCHours(0, 0, 0, 0);
            const [monthlyLinks, monthlyAliases] = await Promise.all([
                url_1.default.countDocuments({ userId, createdAt: { $gte: monthStart } }),
                customUrl
                    ? url_1.default.countDocuments({
                        userId,
                        customUrl: { $ne: null },
                        createdAt: { $gte: monthStart },
                    })
                    : Promise.resolve(0),
            ]);
            if (monthlyLinks >= limits.monthlyLinks) {
                res.status(403).json({
                    message: `Your ${limits.name} plan includes ${limits.monthlyLinks} links per month`,
                    code: 'PLAN_LIMIT_REACHED',
                });
                return;
            }
            if (customUrl && monthlyAliases >= limits.monthlyCustomAliases) {
                res.status(403).json({
                    message: `Your ${limits.name} plan includes ${limits.monthlyCustomAliases} custom aliases per month`,
                    code: 'CUSTOM_ALIAS_LIMIT_REACHED',
                });
                return;
            }
        }
        // Generate short ID (custom alias or random)
        const shortId = customUrl || shortid_1.default.generate();
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4400}`;
        const shortUrl = `${baseUrl}/${shortId}`;
        // Generate QR code as base64 data URL
        const qrCodeDataUrl = await generateQRCodeDataUrl(shortUrl);
        const url = await url_1.default.create({
            longUrl,
            shortUrl,
            shortId,
            userId,
            customUrl: customUrl || null,
            qrCodeDataUrl,
        });
        res.status(201).json({
            status: 'ok',
            data: url,
        });
    }
    catch (error) {
        console.error('Error creating short URL:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
exports.createShortenUrl = createShortenUrl;
/**
 * GET /api/url/analytics/:shortId
 *
 * Returns analytics for a shortened URL including click count.
 * Requires authentication.
 */
const handleUrlAnalytics = async (req, res) => {
    try {
        const userId = req.user?.id;
        const url = await url_1.default.findOne({ shortId: req.params.shortId, userId });
        if (!url) {
            res.status(404).json({ message: 'URL not found' });
            return;
        }
        const clicks = await clicks_1.default.find({ urlId: url._id }).sort({ createdAt: -1 });
        res.status(200).json({
            shortUrl: url.shortUrl,
            longUrl: url.longUrl,
            shortId: url.shortId,
            totalClicks: url.clicks,
            clickHistory: clicks,
            createdAt: url.createdAt,
        });
    }
    catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
exports.handleUrlAnalytics = handleUrlAnalytics;
/**
 * GET /:shortId
 *
 * Redirects a short URL to the original long URL.
 * Tracks the click with IP address and timestamp.
 */
const redirectToLongUrl = async (req, res) => {
    try {
        const { shortId } = req.params;
        const url = await url_1.default.findOne({ shortId });
        if (!url) {
            res.status(404).json({ message: 'Short URL not found' });
            return;
        }
        // Redirect availability is more important than analytics. Record the click after
        // sending the response so a database write failure never blocks the destination.
        res.redirect(url.longUrl);
        const visitorAddress = req.ip || req.socket.remoteAddress || '';
        const analyticsSecret = process.env.ANALYTICS_SALT || process.env.JWT_SECRET;
        const visitorHash = analyticsSecret && visitorAddress
            ? crypto_1.default.createHmac('sha256', analyticsSecret).update(visitorAddress).digest('hex')
            : undefined;
        void Promise.all([
            url_1.default.updateOne({ _id: url._id }, { $inc: { clicks: 1 } }),
            clicks_1.default.create({
                urlId: url._id,
                visitorHash,
                referrer: req.get('referer') || undefined,
                userAgent: req.get('user-agent') || undefined,
            }),
        ]).catch((trackingError) => {
            console.error('Click tracking failed:', trackingError);
        });
    }
    catch (error) {
        console.error('Error redirecting:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
exports.redirectToLongUrl = redirectToLongUrl;
/**
 * GET /api/url/qr/:shortId
 *
 * Returns the QR code data URL for a shortened URL.
 */
const getQRCode = async (req, res) => {
    try {
        const { shortId } = req.params;
        const url = await url_1.default.findOne({ shortId });
        if (!url) {
            res.status(404).json({ message: 'URL not found' });
            return;
        }
        // Generate QR if missing
        if (!url.qrCodeDataUrl) {
            url.qrCodeDataUrl = await generateQRCodeDataUrl(url.shortUrl);
            await url.save();
        }
        res.status(200).json({
            shortId: url.shortId,
            qrCodeDataUrl: url.qrCodeDataUrl,
        });
    }
    catch (error) {
        console.error('Error fetching QR code:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
exports.getQRCode = getQRCode;
/**
 * GET /api/url/all
 *
 * Returns all shortened URLs. Admin/debug endpoint.
 */
const getAllUrls = async (req, res) => {
    try {
        const userId = req.user?.id;
        const urls = await url_1.default.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({ urls });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
exports.getAllUrls = getAllUrls;
/**
 * DELETE /api/url/:shortId
 * Deletes an authenticated user's link and its click history.
 */
const deleteShortUrl = async (req, res) => {
    try {
        const userId = req.user?.id;
        const url = await url_1.default.findOneAndDelete({ shortId: req.params.shortId, userId });
        if (!url) {
            res.status(404).json({ message: 'URL not found' });
            return;
        }
        await clicks_1.default.deleteMany({ urlId: url._id });
        res.sendStatus(204);
    }
    catch (error) {
        console.error('Error deleting URL:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
exports.deleteShortUrl = deleteShortUrl;
