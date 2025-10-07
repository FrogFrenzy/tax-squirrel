import { Response } from 'express';
import { MFAService } from '../services/MFAService';
import { AuthenticatedRequest } from '../middleware/auth';
import { Logger } from '@tax-app/shared';

const logger = new Logger('mfa-controller');

export class MFAController {
  private mfaService: MFAService;

  constructor(mfaService: MFAService) {
    this.mfaService = mfaService;
  }

  // POST /mfa/setup
  setupTOTP = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const result = await this.mfaService.setupTOTP(userId);
      
      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('TOTP setup endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // POST /mfa/verify-setup
  verifyAndEnableTOTP = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { secret, token } = req.body;

      if (!secret || !token) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Secret and verification token are required'
          }
        });
        return;
      }

      const result = await this.mfaService.verifyAndEnableTOTP(userId, secret, token);
      
      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('TOTP verification endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // POST /mfa/disable
  disableMFA = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { currentPassword } = req.body;

      if (!currentPassword) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Current password is required to disable MFA'
          }
        });
        return;
      }

      const result = await this.mfaService.disableMFA(userId, currentPassword);
      
      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('MFA disable endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // POST /mfa/backup-codes/regenerate
  regenerateBackupCodes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const result = await this.mfaService.regenerateBackupCodes(userId);
      
      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('Backup codes regeneration endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // GET /mfa/status
  getMFAStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const result = await this.mfaService.getMFAStatus(userId);
      
      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('Get MFA status endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };
}