import { Router } from 'express';
import { MFAController } from '../controllers/MFAController';
import { AuthMiddleware } from '../middleware/auth';

export function createMFARoutes(mfaController: MFAController, authMiddleware: AuthMiddleware): Router {
  const router = Router();

  // All MFA routes require authentication
  router.use(authMiddleware.authenticate);

  // MFA management routes
  router.post('/setup', mfaController.setupTOTP);
  router.post('/verify-setup', mfaController.verifyAndEnableTOTP);
  router.post('/disable', mfaController.disableMFA);
  router.post('/backup-codes/regenerate', mfaController.regenerateBackupCodes);
  router.get('/status', mfaController.getMFAStatus);

  return router;
}