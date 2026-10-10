import { Router, type Request, type Response } from 'express';
import { LoginInputSchema, type LoginInput } from '@gwj/shared-types';
import { authService } from '../services/authService';
import { validate } from '../middleware/validate';

export function createAuthRouter(jwtSecret: string): Router {
  const router = Router();

  router.post('/login', validate(LoginInputSchema), async (req: Request, res: Response) => {
    const { username, password } = req.body as LoginInput;
    const result = await authService.login(username, password, jwtSecret);
    res.json(result);
  });

  return router;
}
