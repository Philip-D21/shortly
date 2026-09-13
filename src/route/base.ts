import { Router, Request, Response } from 'express';
import { redirectToLongUrl } from '../controller/urlController';

const router = Router();

// Landing page
router.get('/', (_req: Request, res: Response) => {
  res.render('landing');
});

// Short URL redirect — must be LAST to avoid catching other routes
router.get('/:shortId', redirectToLongUrl);

export default router;
