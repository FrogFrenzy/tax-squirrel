import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { AuthenticatedRequest } from '../middleware/auth';
import { UserRegistration, LoginCredentials, Logger } from '@tax-app/shared';

const logger = new Logger('auth-controller');

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  // POST /auth/register
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const userData: UserRegistration = req.body;
      const result = await this.authService.registerUser(userData);
      
      const statusCode = result.success ? 201 : 400;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('Registration endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // POST /auth/login
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const credentials: LoginCredentials = req.body;
      const result = await this.authService.loginUser(credentials);
      
      const statusCode = result.success ? 200 : 401;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('Login endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // POST /auth/refresh
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Refresh token is required'
          }
        });
        return;
      }

      const result = await this.authService.refreshToken(refreshToken);
      
      const statusCode = result.success ? 200 : 401;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('Token refresh endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // POST /auth/logout
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Refresh token is required'
          }
        });
        return;
      }

      const result = await this.authService.logoutUser(refreshToken);
      
      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
      
    } catch (error) {
      logger.error('Logout endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // GET /auth/me
  getCurrentUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // User is already attached to request by auth middleware
      res.json({
        success: true,
        data: {
          id: req.user.id,
          email: req.user.email,
          profile: req.user.profile,
          emailVerified: req.user.emailVerified,
          createdAt: req.user.createdAt,
          lastLogin: req.user.lastLogin
        }
      });
      
    } catch (error) {
      logger.error('Get current user endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };

  // GET /auth/health
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          service: 'auth-service',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      });
    } catch (error) {
      logger.error('Health check error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Service unhealthy'
        }
      });
    }
  };
}