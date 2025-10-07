import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { UserModel } from '../models/User';
import { 
  User, 
  MFASetup, 
  MFAMethod, 
  ApiResponse, 
  ErrorCodes,
  Logger,
  EncryptionService
} from '@tax-app/shared';

const logger = new Logger('mfa-service');

export class MFAService {
  private userModel: UserModel;
  private encryption: EncryptionService;

  constructor(userModel: UserModel) {
    this.userModel = userModel;
    this.encryption = EncryptionService.getInstance();
  }

  async setupTOTP(userId: string): Promise<ApiResponse<MFASetup>> {
    try {
      const user = await this.userModel.getUserById(userId);
      if (!user) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: 'User not found'
          }
        };
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `TaxApp (${user.email})`,
        issuer: 'TaxApp',
        length: 32
      });

      // Generate QR code
      const qrCodeUrl = speakeasy.otpauthURL({
        secret: secret.ascii,
        label: user.email,
        issuer: 'TaxApp',
        encoding: 'ascii'
      });

      const qrCode = await QRCode.toDataURL(qrCodeUrl);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      return {
        success: true,
        data: {
          secret: secret.base32,
          qrCode,
          backupCodes
        },
        message: 'TOTP setup initiated. Please verify with a code to complete setup.'
      };

    } catch (error) {
      logger.error('TOTP setup failed', { error: error.message, userId });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to setup TOTP'
        }
      };
    }
  }

  async verifyAndEnableTOTP(userId: string, secret: string, token: string): Promise<ApiResponse<void>> {
    try {
      // Verify the token
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 2 // Allow 2 time steps (60 seconds) of drift
      });

      if (!verified) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_MFA_CODE,
            message: 'Invalid verification code'
          }
        };
      }

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Enable MFA for user
      await this.userModel.setupMFA(userId, MFAMethod.TOTP, secret, backupCodes);

      logger.info('TOTP enabled successfully', { userId });

      return {
        success: true,
        message: 'Multi-factor authentication enabled successfully'
      };

    } catch (error) {
      logger.error('TOTP verification failed', { error: error.message, userId });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to enable TOTP'
        }
      };
    }
  }

  async verifyTOTP(user: User, token: string): Promise<boolean> {
    try {
      if (!user.securitySettings.mfaEnabled || !user.securitySettings.mfaSecret) {
        return false;
      }

      // First, try to verify as TOTP code
      const verified = speakeasy.totp.verify({
        secret: user.securitySettings.mfaSecret,
        encoding: 'base32',
        token,
        window: 2
      });

      if (verified) {
        return true;
      }

      // If TOTP fails, check backup codes
      return this.verifyBackupCode(user, token);

    } catch (error) {
      logger.error('TOTP verification error', { error: error.message, userId: user.id });
      return false;
    }
  }

  async verifyBackupCode(user: User, code: string): Promise<boolean> {
    try {
      if (!user.securitySettings.backupCodes || user.securitySettings.backupCodes.length === 0) {
        return false;
      }

      const codeIndex = user.securitySettings.backupCodes.indexOf(code);
      if (codeIndex === -1) {
        return false;
      }

      // Remove used backup code
      const updatedBackupCodes = [...user.securitySettings.backupCodes];
      updatedBackupCodes.splice(codeIndex, 1);

      // Update user's backup codes
      await this.userModel.setupMFA(
        user.id, 
        user.securitySettings.mfaMethod!, 
        user.securitySettings.mfaSecret!, 
        updatedBackupCodes
      );

      logger.info('Backup code used', { userId: user.id, remainingCodes: updatedBackupCodes.length });

      return true;

    } catch (error) {
      logger.error('Backup code verification error', { error: error.message, userId: user.id });
      return false;
    }
  }

  async disableMFA(userId: string, currentPassword: string): Promise<ApiResponse<void>> {
    try {
      const user = await this.userModel.getUserById(userId);
      if (!user) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: 'User not found'
          }
        };
      }

      // Verify current password before disabling MFA
      const bcrypt = require('bcryptjs');
      const passwordHash = await this.userModel.getUserPasswordHash(userId);
      const isValidPassword = await bcrypt.compare(currentPassword, passwordHash);

      if (!isValidPassword) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: 'Invalid password'
          }
        };
      }

      // Disable MFA
      await this.userModel.setupMFA(userId, MFAMethod.TOTP, '', []);

      logger.info('MFA disabled', { userId });

      return {
        success: true,
        message: 'Multi-factor authentication disabled successfully'
      };

    } catch (error) {
      logger.error('MFA disable failed', { error: error.message, userId });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to disable MFA'
        }
      };
    }
  }

  async regenerateBackupCodes(userId: string): Promise<ApiResponse<string[]>> {
    try {
      const user = await this.userModel.getUserById(userId);
      if (!user || !user.securitySettings.mfaEnabled) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: 'MFA not enabled for this user'
          }
        };
      }

      // Generate new backup codes
      const backupCodes = this.generateBackupCodes();

      // Update user's backup codes
      await this.userModel.setupMFA(
        userId,
        user.securitySettings.mfaMethod!,
        user.securitySettings.mfaSecret!,
        backupCodes
      );

      logger.info('Backup codes regenerated', { userId });

      return {
        success: true,
        data: backupCodes,
        message: 'New backup codes generated successfully'
      };

    } catch (error) {
      logger.error('Backup code regeneration failed', { error: error.message, userId });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to regenerate backup codes'
        }
      };
    }
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < 10; i++) {
      // Generate 8-character alphanumeric codes
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    
    return codes;
  }

  async getMFAStatus(userId: string): Promise<ApiResponse<{
    enabled: boolean;
    method?: MFAMethod;
    backupCodesRemaining?: number;
  }>> {
    try {
      const user = await this.userModel.getUserById(userId);
      if (!user) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: 'User not found'
          }
        };
      }

      return {
        success: true,
        data: {
          enabled: user.securitySettings.mfaEnabled,
          method: user.securitySettings.mfaMethod,
          backupCodesRemaining: user.securitySettings.backupCodes?.length || 0
        }
      };

    } catch (error) {
      logger.error('Get MFA status failed', { error: error.message, userId });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to get MFA status'
        }
      };
    }
  }
}