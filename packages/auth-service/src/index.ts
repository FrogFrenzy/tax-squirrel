import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import DatabaseConnection from './database/connection';
import { UserModel } from './models/User';
import { AuthService } from './services/AuthService';
import { AuthController } from './controllers/AuthController';
import { MFAController } from './controllers/MFAController';
import { AuthMiddleware } from './middleware/auth';
import { createAuthRoutes } from './routes/auth';
import { createMFARoutes } from './routes/mfa';
import { Logger } from '@tax-app/shared';

// Load environment variables
dotenv.config();

const logger = new Logger('auth-service');
const app = express();
const PORT = process.env.PORT || 3001;

async function startServer(): Promise<void> {
  try {
    // Initialize database connection
    const dbConnection = DatabaseConnection.getInstance();
    await dbConnection.initializeSchema();
    
    // Initialize services
    const userModel = new UserModel(dbConnection.getPool());
    const authService = new AuthService(userModel);
    const authController = new AuthController(authService);
    const mfaController = new MFAController(authService.getMFAService());
    const authMiddleware = new AuthMiddleware(authService);

    // Middleware
    app.use(helmet());
    app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Security and logging middleware
    app.use(authMiddleware.securityHeaders);
    app.use(authMiddleware.requestLogger);
    app.use(authMiddleware.rateLimit(100, 15 * 60 * 1000)); // 100 requests per 15 minutes

    // Routes
    app.use('/auth', createAuthRoutes(authController, authMiddleware));
    app.use('/mfa', createMFARoutes(mfaController, authMiddleware));

    // Global error handler
    app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', { 
        error: error.message, 
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    });

    // 404 handler
    app.use('*', (req: express.Request, res: express.Response) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found'
        }
      });
    });

    // Start server
    app.listen(PORT, () => {
      logger.info(`Auth service started on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await dbConnection.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await dbConnection.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start auth service', { error: error.message });
    process.exit(1);
  }
}

// Start the server
startServer();