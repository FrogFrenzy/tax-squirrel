import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from 'redis';
import { UserModel } from '../models/User';
import { MFAService } from './MFAService';
import { 
  User, 
  UserRegistration, 
  LoginCredentials, 
  AuthToken, 
  ApiResponse, 
  ErrorCodes,
  Logger,
  EncryptionService,
  validatePassword,
  userRegistrationSchema,
  loginSchema
} from '@tax-app/shared';

const logger = new Logger('auth-service');

export class AuthService {
  private userModel: UserModel;
  private mfaService: MFAService;
  private redisClient: any;
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private encryption: EncryptionService;

  constructor(userModel: UserModel) {
    this.userModel = userModel;
    this.mfaService = new MFAService(userModel);
    this.jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'your-jwt-refresh-secret';
    this.encryption = EncryptionService.getInstance();
    
    // Initialize Redis client
    this.initializeRedis();
  }

  public getMFAService(): MFAService {
    return this.mfaService;
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      await this.redisClient.connect();
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      throw error;
    }
  }

  async registerUser(userData: UserRegistration): Promise<ApiResponse<AuthToken>> {
    try {
      // Validate input
      const { error } = userRegistrationSchema.validate(userData);
      if (error) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid registration data',
            details: error.details.map(detail => ({
              field: detail.path.join('.'),
              constraint: detail.message,
              currentValue: detail.context?.value
            }))
          }
        };
      }

      // Check if user already exists
      const existingUser = await this.userModel.getUserByEmail(userData.email);
      if (existingUser) {
        return {
          success: false,
          error: {
            code: ErrorCodes.DUPLICATE_EMAIL,
            message: 'User with this email already exists'
          }
        };
      }

      // Validate password strength
      const passwordValidation = validatePassword(userData.password);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: {
            code: ErrorCodes.WEAK_PASSWORD,
            message: 'Password does not meet security requirements',
            details: passwordValidation.errors.map(err => ({
              field: err.field,
              constraint: err.message
            }))
          }
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // Create user
      const user = await this.userModel.createUser({
        email: userData.email,
        passwordHash,
        profile: userData.profile
      });

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Log successful registration
      logger.info('User registered successfully', { userId: user.id, email: user.email });

      return {
        success: true,
        data: tokens,
        message: 'User registered successfully'
      };

    } catch (error) {
      logger.error('Registration failed', { error: error.message, email: userData.email });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Registration failed due to internal error'
        }
      };
    }
  }

  async loginUser(credentials: LoginCredentials): Promise<ApiResponse<AuthToken>> {
    try {
      // Validate input
      const { error } = loginSchema.validate(credentials);
      if (error) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid login credentials format'
          }
        };
      }

      // Get user by email
      const user = await this.userModel.getUserByEmail(credentials.email);
      if (!user) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: 'Invalid email or password'
          }
        };
      }

      // Check if account is locked
      if (user.securitySettings.lockedUntil && user.securitySettings.lockedUntil > new Date()) {
        const lockTimeRemaining = Math.ceil((user.securitySettings.lockedUntil.getTime() - Date.now()) / 60000);
        return {
          success: false,
          error: {
            code: ErrorCodes.ACCOUNT_LOCKED,
            message: `Account is locked. Try again in ${lockTimeRemaining} minutes.`
          }
        };
      }

      // Verify password
      const passwordHash = await this.userModel.getUserPasswordHash(user.id);
      const isValidPassword = await bcrypt.compare(credentials.password, passwordHash);

      if (!isValidPassword) {
        // Increment login attempts
        await this.handleFailedLogin(user.id, user.securitySettings.loginAttempts);
        
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: 'Invalid email or password'
          }
        };
      }

      // Check MFA if enabled
      if (user.securitySettings.mfaEnabled) {
        if (!credentials.mfaCode) {
          return {
            success: false,
            error: {
              code: ErrorCodes.MFA_REQUIRED,
              message: 'Multi-factor authentication code required'
            }
          };
        }

        const isMFAValid = await this.mfaService.verifyTOTP(user, credentials.mfaCode);
        if (!isMFAValid) {
          return {
            success: false,
            error: {
              code: ErrorCodes.INVALID_MFA_CODE,
              message: 'Invalid multi-factor authentication code'
            }
          };
        }
      }

      // Reset login attempts on successful login
      await this.userModel.updateLoginAttempts(user.id, 0);
      await this.userModel.updateLastLogin(user.id);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Log successful login
      logger.info('User logged in successfully', { userId: user.id, email: user.email });

      return {
        success: true,
        data: tokens,
        message: 'Login successful'
      };

    } catch (error) {
      logger.error('Login failed', { error: error.message, email: credentials.email });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Login failed due to internal error'
        }
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<ApiResponse<AuthToken>> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;
      
      // Check if token is blacklisted
      const isBlacklisted = await this.redisClient.get(`blacklist:${refreshToken}`);
      if (isBlacklisted) {
        return {
          success: false,
          error: {
            code: ErrorCodes.TOKEN_EXPIRED,
            message: 'Refresh token has been revoked'
          }
        };
      }

      // Get user
      const user = await this.userModel.getUserById(decoded.userId);
      if (!user) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: 'User not found'
          }
        };
      }

      // Blacklist old refresh token
      await this.redisClient.setEx(`blacklist:${refreshToken}`, 86400, 'revoked');

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      return {
        success: true,
        data: tokens,
        message: 'Token refreshed successfully'
      };

    } catch (error) {
      logger.error('Token refresh failed', { error: error.message });
      return {
        success: false,
        error: {
          code: ErrorCodes.TOKEN_EXPIRED,
          message: 'Invalid or expired refresh token'
        }
      };
    }
  }

  async logoutUser(refreshToken: string): Promise<ApiResponse<void>> {
    try {
      // Blacklist the refresh token
      await this.redisClient.setEx(`blacklist:${refreshToken}`, 86400, 'revoked');

      return {
        success: true,
        message: 'Logged out successfully'
      };

    } catch (error) {
      logger.error('Logout failed', { error: error.message });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Logout failed'
        }
      };
    }
  }

  async verifyToken(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const user = await this.userModel.getUserById(decoded.userId);
      return user;
    } catch (error) {
      return null;
    }
  }

  private async generateTokens(user: User): Promise<AuthToken> {
    const payload = {
      userId: user.id,
      email: user.email,
      emailVerified: user.emailVerified
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, { 
      expiresIn: '15m',
      issuer: 'tax-app-auth',
      audience: 'tax-app-users'
    });

    const refreshToken = jwt.sign(payload, this.jwtRefreshSecret, { 
      expiresIn: '7d',
      issuer: 'tax-app-auth',
      audience: 'tax-app-users'
    });

    // Store session in Redis
    const sessionKey = `session:${user.id}:${Date.now()}`;
    await this.redisClient.setEx(sessionKey, 900, JSON.stringify({
      userId: user.id,
      accessToken,
      refreshToken,
      createdAt: new Date().toISOString()
    }));

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: user.isActive,
        emailVerified: user.emailVerified
      }
    };
  }

  private async handleFailedLogin(userId: string, currentAttempts: number): Promise<void> {
    const newAttempts = currentAttempts + 1;
    let lockUntil: Date | undefined;

    // Lock account after 5 failed attempts
    if (newAttempts >= 5) {
      lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }

    await this.userModel.updateLoginAttempts(userId, newAttempts, lockUntil);
    
    logger.warn('Failed login attempt', { 
      userId, 
      attempts: newAttempts, 
      locked: !!lockUntil 
    });
  }


}