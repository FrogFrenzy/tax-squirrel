import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import DatabaseConnection from './database/connection';
import { DocumentModel } from './models/Document';
import { DocumentService } from './services/DocumentService';
import { StorageService, StorageConfig } from './services/StorageService';
import { OCRService } from './services/OCRService';
import { DocumentProcessingService } from './services/DocumentProcessingService';
import { AuditService } from './services/AuditService';
import { DocumentController } from './controllers/DocumentController';
import { AuthMiddleware } from './middleware/auth';
import { createDocumentRoutes } from './routes/documents';
import { Logger } from '@tax-app/shared';

// Load environment variables
dotenv.config();

const logger = new Logger('document-service');
const app = express();
const PORT = process.env.PORT || 3003;

async function startServer(): Promise<void> {
  try {
    // Initialize database connection
    const dbConnection = DatabaseConnection.getInstance();
    await dbConnection.initializeCollections();
    
    // Initialize storage configuration
    const storageConfig: StorageConfig = {
      provider: (process.env.STORAGE_PROVIDER as 'aws' | 'local') || 'local',
      aws: process.env.STORAGE_PROVIDER === 'aws' ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        region: process.env.AWS_REGION || 'us-east-1',
        bucket: process.env.AWS_S3_BUCKET!
      } : undefined,
      local: process.env.STORAGE_PROVIDER !== 'aws' ? {
        uploadPath: process.env.LOCAL_UPLOAD_PATH || './uploads',
        baseUrl: process.env.LOCAL_BASE_URL || 'http://localhost:3003/files'
      } : undefined
    };

    // Initialize services
    const documentModel = new DocumentModel(dbConnection.getDb());
    const storageService = new StorageService(storageConfig);
    const ocrService = new OCRService();
    const auditService = new AuditService(dbConnection.getDb());
    const documentProcessingService = new DocumentProcessingService(
      documentModel,
      ocrService,
      storageService,
      auditService
    );
    const documentService = new DocumentService(
      documentModel,
      storageService,
      auditService
    );
    const documentController = new DocumentController(
      documentService,
      documentProcessingService,
      auditService
    );
    const authMiddleware = new AuthMiddleware();

    // Middleware
    app.use(helmet());
    app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Security and logging middleware
    app.use(authMiddleware.securityHeaders);
    app.use(authMiddleware.requestLogger);

    // Serve static files for local storage
    if (storageConfig.provider === 'local' && storageConfig.local) {
      app.use('/files', express.static(storageConfig.local.uploadPath));
    }

    // Routes
    const documentRoutes = createDocumentRoutes(documentController);
    
    // Apply authentication to protected routes
    app.use('/documents/upload', authMiddleware.authenticate);
    app.use('/documents/stats', authMiddleware.authenticate);
    app.use('/documents/audit-trail', authMiddleware.authenticate);
    app.use('/documents/:id', authMiddleware.authenticate);
    app.use('/documents', authMiddleware.authenticate);
    app.use('/documents', documentRoutes);

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
      logger.info(`Document service started on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await documentProcessingService.cleanup();
      await dbConnection.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await documentProcessingService.cleanup();
      await dbConnection.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start document service', { error: error.message });
    process.exit(1);
  }
}

// Start the server
startServer();