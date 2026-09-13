import { Router, Request, Response } from 'express';
import { optionalAuth, authenticate } from '../middleware/authentication';
import {
  createShortenUrl,
  handleUrlAnalytics,
  getQRCode,
  getAllUrls,
  deleteShortUrl,
} from '../controller/urlController';

const router = Router();

// Render the URL shortener page
router.get('/shorten', (_req: Request, res: Response) => {
  res.render('main');
});

// Shorten a URL — guest mode (optionalAuth) or authenticated
router.post('/shorten', optionalAuth, createShortenUrl);

// Get QR code for a shortened URL
router.get('/qr/:shortId', getQRCode);

// Get analytics for a shortened URL (requires auth)
router.get('/analytics/:shortId', authenticate, handleUrlAnalytics);

// Get all URLs (debug/admin)
router.get('/all', authenticate, getAllUrls);

// Delete an owned shortened URL
router.delete('/:shortId', authenticate, deleteShortUrl);

export default router;
