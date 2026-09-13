import { Request, Response } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import shortid from 'shortid';
import validUrl from 'valid-url';
import Url from '../models/url';
import Click from '../models/clicks';
import User from '../models/user';
import { getPlans, PlanTier } from '../config/plans';

/**
 * Generates a QR code as a base64 data URL for the given short URL.
 * Returns the data URL string, or null on failure.
 */
const generateQRCodeDataUrl = async (shortUrl: string): Promise<string | null> => {
  try {
    const dataUrl = await QRCode.toDataURL(shortUrl, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    return dataUrl;
  } catch (error) {
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
export const createShortenUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { longUrl, customUrl } = req.body;

    if (!longUrl || !validUrl.isUri(longUrl)) {
      res.status(400).json({ message: 'Please provide a valid URL' });
      return;
    }

    if (customUrl && !/^[A-Za-z0-9_-]{3,50}$/.test(customUrl)) {
      res.status(400).json({
        message: 'Custom aliases must be 3-50 characters using letters, numbers, hyphens, or underscores',
      });
      return;
    }

    const userId = (req as any).user?.id || null;
    if (customUrl && !userId) {
      res.status(401).json({ message: 'Create a free account to use a custom alias' });
      return;
    }

    // Check if custom URL alias is already taken
    if (customUrl) {
      const existingCustom = await Url.findOne({ customUrl });
      if (existingCustom) {
        res.status(409).json({ message: 'Custom alias is already taken' });
        return;
      }
    }

    // Check if this long URL was already shortened by the same user (or guest)
    const existingUrl = await Url.findOne({ longUrl, userId });

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
      const user = await User.findById(userId).select('plan');
      if (!user) {
        res.status(401).json({ message: 'User account no longer exists' });
        return;
      }

      const plan = (user.plan || 'free') as PlanTier;
      const limits = getPlans()[plan] || getPlans().free;
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const [monthlyLinks, monthlyAliases] = await Promise.all([
        Url.countDocuments({ userId, createdAt: { $gte: monthStart } }),
        customUrl
          ? Url.countDocuments({
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
    const shortId = customUrl || shortid.generate();
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4400}`;
    const shortUrl = `${baseUrl}/${shortId}`;

    // Generate QR code as base64 data URL
    const qrCodeDataUrl = await generateQRCodeDataUrl(shortUrl);

    const url = await Url.create({
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
  } catch (error: any) {
    console.error('Error creating short URL:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};

/**
 * GET /api/url/analytics/:shortId
 *
 * Returns analytics for a shortened URL including click count.
 * Requires authentication.
 */
export const handleUrlAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const url = await Url.findOne({ shortId: req.params.shortId, userId });
    if (!url) {
      res.status(404).json({ message: 'URL not found' });
      return;
    }

    const clicks = await Click.find({ urlId: url._id }).sort({ createdAt: -1 });

    res.status(200).json({
      shortUrl: url.shortUrl,
      longUrl: url.longUrl,
      shortId: url.shortId,
      totalClicks: url.clicks,
      clickHistory: clicks,
      createdAt: url.createdAt,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};

/**
 * GET /:shortId
 *
 * Redirects a short URL to the original long URL.
 * Tracks the click with IP address and timestamp.
 */
export const redirectToLongUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shortId } = req.params;
    const url = await Url.findOne({ shortId });

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
      ? crypto.createHmac('sha256', analyticsSecret).update(visitorAddress).digest('hex')
      : undefined;

    void Promise.all([
      Url.updateOne({ _id: url._id }, { $inc: { clicks: 1 } }),
      Click.create({
        urlId: url._id,
        visitorHash,
        referrer: req.get('referer') || undefined,
        userAgent: req.get('user-agent') || undefined,
      }),
    ]).catch((trackingError) => {
      console.error('Click tracking failed:', trackingError);
    });
  } catch (error: any) {
    console.error('Error redirecting:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * GET /api/url/qr/:shortId
 *
 * Returns the QR code data URL for a shortened URL.
 */
export const getQRCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shortId } = req.params;
    const url = await Url.findOne({ shortId });

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
  } catch (error: any) {
    console.error('Error fetching QR code:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};

/**
 * GET /api/url/all
 *
 * Returns all shortened URLs. Admin/debug endpoint.
 */
export const getAllUrls = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const urls = await Url.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json({ urls });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};

/**
 * DELETE /api/url/:shortId
 * Deletes an authenticated user's link and its click history.
 */
export const deleteShortUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const url = await Url.findOneAndDelete({ shortId: req.params.shortId, userId });
    if (!url) {
      res.status(404).json({ message: 'URL not found' });
      return;
    }

    await Click.deleteMany({ urlId: url._id });
    res.sendStatus(204);
  } catch (error: any) {
    console.error('Error deleting URL:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};
