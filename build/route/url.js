"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authentication_1 = require("../middleware/authentication");
const urlController_1 = require("../controller/urlController");
const router = (0, express_1.Router)();
// Render the URL shortener page
router.get('/shorten', (_req, res) => {
    res.render('main');
});
// Shorten a URL — guest mode (optionalAuth) or authenticated
router.post('/shorten', authentication_1.optionalAuth, urlController_1.createShortenUrl);
// Get QR code for a shortened URL
router.get('/qr/:shortId', urlController_1.getQRCode);
// Get analytics for a shortened URL (requires auth)
router.get('/analytics/:shortId', authentication_1.authenticate, urlController_1.handleUrlAnalytics);
// Get all URLs (debug/admin)
router.get('/all', authentication_1.authenticate, urlController_1.getAllUrls);
// Delete an owned shortened URL
router.delete('/:shortId', authentication_1.authenticate, urlController_1.deleteShortUrl);
exports.default = router;
