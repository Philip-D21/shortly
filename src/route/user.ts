import { Router, Request, Response } from 'express';
import { register, login } from '../controller/auth';
import { getUserById, getAllUsers, getLinkHistory, getDashboardStats, updateProfile } from '../controller/userController';
import { authenticate } from '../middleware/authentication';

const router = Router();

// Render auth pages
router.get('/signup', (_req: Request, res: Response) => {
  res.render('signup');
});

router.get('/login', (_req: Request, res: Response) => {
  res.render('login');
});

// Render dashboard view
router.get('/dashboard', (_req: Request, res: Response) => {
  res.render('dashboard');
});

// Auth endpoints
router.post('/signup', register);
router.post('/login', login);

// Dashboard stats endpoint (JSON)
router.get('/dashboard-stats', authenticate, getDashboardStats);
router.put('/profile', authenticate, updateProfile);

// Render link history page
router.get('/history', authenticate, (_req: Request, res: Response) => {
  res.render('history');
});

// Get link history for a user
router.get('/link-history/:userId', authenticate, getLinkHistory);

// Get a user by ID
router.get('/user/:userId', authenticate, getUserById);

// Get all users
router.get('/users', authenticate, getAllUsers);

export default router;
