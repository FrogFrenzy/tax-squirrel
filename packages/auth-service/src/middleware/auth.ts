import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/AuthService';
import { Logger, ErrorCodes } from '@tax-app/shared';

const logger = new Logger('auth-middleware');

export interface AuthenticatedRequest extends Request {
  user?: any;
  userId?: string;
}

export class AuthMiddleware {
  private authService: AuthService;
  private jwtSecret: string;

  constructor(authService: AuthService) {
    this.authService = authService;
    this.jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret';
  }

  // Middleware to verify JWT token
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCodes.TOKEN_EXPIRED,
            message: 'Access token required'
          }
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Verify token
      const user = await this.authService.verifyToken(token);
      
      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCodes.TOKEN_EXPIRED,
            message: 'Invalid or expired access token'
          }
        });
        return;
      }

      // Add user to request object
      req.user = user;
      req.userId = user.id;
      
      next();
    } catch (error) {
      logger.error('Authentication failed', { error: error.message });
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCodes.TOKEN_EXPIRED,
          message: 'Authentication failed'
        }
      });
    }
  };

  // Middleware to check if user's email is verified
  requireEmailVerification = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user?.emailVerified) {
      res.status(403).json({
        success: false,
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email verification required to access this resource'
        }
      });
      return;
    }
    
    next();
  };

  // Middleware to check if user has MFA enabled (for sensitive operations)
  requireMFA = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user?.securitySettings?.mfaEnabled) {
      res.status(403).json({
        success: false,
        error: {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication must be enabled for this operation'
        }
      });
      return;
    }
    
    next();
  };

  // Rate limiting middleware
  rateLimit = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
      const clientId = req.ip || 'unknown';
      const now = Date.now();
      
      // Clean up expired entries
      for (const [key, value] of requests.entries()) {
        if (now > value.resetTime) {
          requests.delete(key);
        }
      }

      const clientRequests = requests.get(clientId);
      
      if (!clientRequests) {
        requests.set(clientId, { count: 1, resetTime: now + windowMs });
        next();
        return;
      }

      if (clientRequests.count >= maxRequests) {
        res.status(429).json({
          success: false,
          error: {
            code: ErrorCodes.RATE_LIMIT_EXCEEDED,
            message: 'Too many requests. Please try again later.',
            suggestions: ['Wait before making more requests', 'Contact support if this persists']
          }
        });
        return;
      }

      clientRequests.count++;
      next();
    };
  };

  // Security headers middleware
  securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    
    next();
  };

  // Request logging middleware
  requestLogger = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    });
    
    next();
  };
}