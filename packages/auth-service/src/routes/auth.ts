import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { AuthMiddleware } from '../middleware/auth';

export function createAuthRoutes(authController: AuthController, authMiddleware: AuthMiddleware): Router {
  const router = Router();

  // Public routes
  router.post('/register', authController.register);
  router.post('/login', authController.login);
  router.post('/refresh', authController.refreshToken);
  router.post('/logout', authController.logout);
  router.get('/health', authController.healthCheck);

  // Protected routes
  router.get('/me', authMiddleware.authenticate, authController.getCurrentUser);

  return router;
}