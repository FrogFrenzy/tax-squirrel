import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import DatabaseConnection from './database/connection';
import { TaxReturnModel } from './models/TaxReturn';
import { TaxLawService } from './services/TaxLawService';
import { TaxCalculationService } from './services/TaxCalculationService';
import { DeductionOptimizationService } from './services/DeductionOptimizationService';
import { TaxController } from './controllers/TaxController';
import { AuthMiddleware } from './middleware/auth';
import { createTaxRoutes } from './routes/tax';
import { Logger } from '@tax-app/shared';

// Load environment variables
dotenv.config();

const logger = new Logger('tax-engine');
const app = express();
const PORT = process.env.PORT || 3002;

async function startServer(): Promise<void> {
  try {
    // Initialize database connection
    const dbConnection = DatabaseConnection.getInstance();
    await dbConnection.initializeSchema();
    
    // Initialize services
    const taxReturnModel = new TaxReturnModel(dbConnection.getPool());
    const taxLawService = new TaxLawService(dbConnection.getPool());
    const taxCalculationService = new TaxCalculationService(taxLawService);
    const deductionOptimizationService = new DeductionOptimizationService(taxCalculationService, taxLawService);
    const taxController = new TaxController(taxCalculationService, deductionOptimizationService, taxReturnModel);
    const authMiddleware = new AuthMiddleware();

    // Initialize default tax law configurations
    await taxLawService.initializeDefaultConfigurations();

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

    // Routes
    const taxRoutes = createTaxRoutes(taxController);
    
    // Apply authentication to protected routes
    app.use('/tax/returns', authMiddleware.authenticate);
    app.use('/tax', taxRoutes);

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
      logger.info(`Tax engine service started on port ${PORT}`);
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
    logger.error('Failed to start tax engine service', { error: error.message });
    process.exit(1);
  }
}

// Start the server
startServer();