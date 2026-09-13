import { Request, Response } from 'express';
import validator from 'validator';
import User from '../models/user';
import Url from '../models/url';
import Click from '../models/clicks';

/**
 * GET /api/auth/dashboard-stats
 *
 * Returns user profile, overall counts (total, active, inactive, total clicks),
 * and click timeline data for graph visualizations.
 */
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const urls = await Url.find({ userId }).sort({ createdAt: -1 });

    const totalUrls = urls.length;
    const activeUrls = urls.filter((u) => u.clicks > 0).length;
    const inactiveUrls = urls.filter((u) => u.clicks === 0).length;
    const totalClicks = urls.reduce((sum, u) => sum + (u.clicks || 0), 0);

    // Collect all click events for user's URLs to generate trend chart data
    const urlIds = urls.map((u) => u._id);
    const recentClicks = await Click.find({ urlId: { $in: urlIds } }).sort({ createdAt: -1 }).limit(500);

    // Group clicks by date (last 7 days)
    const clicksByDateMap: { [key: string]: number } = {};
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      clicksByDateMap[dateStr] = 0;
    }

    recentClicks.forEach((click) => {
      if (click.createdAt) {
        const dateStr = new Date(click.createdAt).toISOString().split('T')[0];
        if (clicksByDateMap[dateStr] !== undefined) {
          clicksByDateMap[dateStr] += 1;
        }
      }
    });

    const graphData = {
      labels: Object.keys(clicksByDateMap),
      data: Object.values(clicksByDateMap),
    };

    res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus,
        createdAt: user.createdAt,
      },
      stats: {
        totalUrls,
        activeUrls,
        inactiveUrls,
        totalClicks,
      },
      graphData,
      recentUrls: urls.slice(0, 10),
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};

/**
 * GET /api/auth/link-history/:userId
 *
 * Returns all shortened URLs created by a specific user.
 */
export const getLinkHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (req.params.userId !== userId) {
      res.status(403).json({ message: 'You can only access your own link history' });
      return;
    }
    const linkHistory = await Url.find({ userId }).sort({ createdAt: -1 });

    if (linkHistory.length > 0) {
      res.status(200).json({
        status: 'Link history retrieved',
        data: linkHistory,
      });
    } else {
      res.status(200).json({
        status: 'No links found',
        data: [],
      });
    }
  } catch (error: any) {
    console.error('Error fetching link history:', error);
    res.status(500).json({
      message: error.message || 'Internal Server Error',
    });
  }
};

/**
 * GET /api/auth/user/:userId
 *
 * Returns a single user by ID (without password).
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    if (userId !== (req as any).user?.id) {
      res.status(403).json({ message: 'You can only access your own profile' });
      return;
    }
    const user = await User.findById(userId).select('-password');

    if (user) {
      res.status(200).json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * GET /api/auth/users
 *
 * Returns all users (without passwords).
 */
export const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
  res.status(403).json({ message: 'An admin role is required for this endpoint' });
};

/** Update the authenticated user's profile and notification preference. */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, emailNotifications } = req.body;
    if (!username || !email || !validator.isEmail(email)) {
      res.status(400).json({ message: 'Provide a name and valid email address' });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();
    const currentUserId = (req as any).user.id;
    const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: currentUserId } });
    if (existing) { res.status(409).json({ message: 'That email address is already in use' }); return; }
    const user = await User.findByIdAndUpdate(currentUserId, { username: username.trim(), email: normalizedEmail, emailNotifications: Boolean(emailNotifications) }, { new: true }).select('-password');
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    res.json({ user });
  } catch (error: any) { res.status(500).json({ message: error.message || 'Unable to update profile' }); }
};
