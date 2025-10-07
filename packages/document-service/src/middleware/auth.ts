import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Logger, ErrorCodes } from '@tax-app/shared';

const logger = new Logger('document-service-auth');

export interface AuthenticatedRequest extends Request {
  user?: any;
  userId?: string;
}

export class AuthMiddleware {
  private jwtSecret: string;

  constructor() {
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
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      if (!decoded.userId) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCodes.TOKEN_EXPIRED,
            message: 'Invalid access token'
          }
        });
        return;
      }

      // Add user info to request object
      req.userId = decoded.userId;
      req.user = decoded;
      
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

  // Security headers middleware
  securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
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