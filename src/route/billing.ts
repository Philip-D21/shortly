import { Router } from 'express';
import { authenticate } from '../middleware/authentication';
import {
  cancelSubscription,
  getCurrentSubscription,
  initializeSubscription,
  listPlans,
  verifySubscription,
} from '../controller/billingController';

const router = Router();

router.get('/plans', listPlans);
router.post('/initialize', authenticate, initializeSubscription);
router.get('/verify/:reference', authenticate, verifySubscription);
router.get('/subscription', authenticate, getCurrentSubscription);
router.post('/cancel', authenticate, cancelSubscription);

export default router;
