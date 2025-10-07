import { Request, Response } from 'express';
import multer from 'multer';
import { DocumentService } from '../services/DocumentService';
import { DocumentProcessingService } from '../services/DocumentProcessingService';
import { AuditService } from '../services/AuditService';
import { 
  DocumentCategory,
  DocumentSearchFilters,
  Logger
} from '@tax-app/shared';

const logger = new Logger('document-controller');

interface AuthenticatedRequest extends Request {
  userId?: string;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/tiff'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and image files are allowed.'));
    }
  }
});

export class DocumentController {
  private documentService: DocumentService;
  private documentProcessingService: DocumentProcessingService;
  private auditService: AuditService;

  constructor(
    documentService: DocumentService,
    documentProcessingService: DocumentProcessingService,
    auditService: AuditService
  ) {
    this.documentService = documentService;
    this.documentProcessingService = documentProcessingService;
    this.auditService = auditService;
  }

  // POST /documents/upload
  uploadDocument = [
    upload.single('file'),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const userId = req.userId!;
        const file = req.file;
        const { category, taxYear } = req.body;

        if (!file) {
          res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'No file uploaded'
            }
          });
          return;
        }

        if (!category || !Object.values(DocumentCategory).includes(category)) {
          res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid or missing document category'
            }
          });
          return;
        }

        const uploadRequest = {
          file: file.buffer,
          fileName: file.originalname,
          category: category as DocumentCategory,
          taxYear: taxYear ? parseInt(taxYear) : undefined,
          metadata: {
            mimeType: file.mimetype,
            uploadSource: 'web_upload' as any
          }
        };

        const result = await this.documentService.uploadDocument(
          userId,
          uploadRequest,
          req.ip,
          req.get('User-Agent')
        );

        if (result.success && result.data) {
          // Queue document for processing
          await this.documentProcessingService.queueDocumentForProcessing(result.data.id);
        }

        const statusCode = result.success ? 201 : 400;
        res.status(statusCode).json(result);

      } catch (error) {
        logger.error('Document upload endpoint error', { error: error.message });
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Document upload failed'
          }
        });
      }
    }
  ];

  // GET /documents
  getDocuments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { 
        category, 
        taxYear, 
        isVerified, 
        isProcessed, 
        limit = '50', 
        offset = '0' 
      } = req.query;

      const filters: DocumentSearchFilters = {};
      
      if (category) filters.category = category as DocumentCategory;
      if (taxYear) filters.taxYear = parseInt(taxYear as string);
      if (isVerified !== undefined) filters.isVerified = isVerified === 'true';
      if (isProcessed !== undefined) filters.isProcessed = isProcessed === 'true';

      const result = await this.documentService.getDocuments(
        userId,
        filters,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json(result);

    } catch (error) {
      logger.error('Get documents endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve documents'
        }
      });
    }
  };

  // GET /documents/:id
  getDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id } = req.params;

      const result = await this.documentService.getDocument(
        id,
        userId,
        req.ip,
        req.get('User-Agent')
      );

      const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 403);
      res.status(statusCode).json(result);

    } catch (error) {
      logger.error('Get document endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve document'
        }
      });
    }
  };

  // DELETE /documents/:id
  deleteDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id } = req.params;

      const result = await this.documentService.deleteDocument(
        id,
        userId,
        req.ip,
        req.get('User-Agent')
      );

      const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 403);
      res.status(statusCode).json(result);

    } catch (error) {
      logger.error('Delete document endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete document'
        }
      });
    }
  };

  // POST /documents/:id/verify
  verifyDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const { isVerified } = req.body;

      if (typeof isVerified !== 'boolean') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'isVerified must be a boolean value'
          }
        });
        return;
      }

      const result = await this.documentService.verifyDocument(
        id,
        userId,
        isVerified,
        req.ip,
        req.get('User-Agent')
      );

      const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 403);
      res.status(statusCode).json(result);

    } catch (error) {
      logger.error('Verify document endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to verify document'
        }
      });
    }
  };

  // GET /documents/:id/download
  getDocumentDownloadUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const { expiresIn = '3600' } = req.query;

      const result = await this.documentService.getDocumentDownloadUrl(
        id,
        userId,
        parseInt(expiresIn as string),
        req.ip,
        req.get('User-Agent')
      );

      const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 403);
      res.status(statusCode).json(result);

    } catch (error) {
      logger.error('Get download URL endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate download URL'
        }
      });
    }
  };

  // POST /documents/:id/reprocess
  reprocessDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id } = req.params;

      const result = await this.documentProcessingService.reprocessDocument(
        id,
        userId,
        req.ip,
        req.get('User-Agent')
      );

      const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 403);
      res.status(statusCode).json(result);

    } catch (error) {
      logger.error('Reprocess document endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reprocess document'
        }
      });
    }
  };

  // POST /documents/:id/correct-data
  correctExtractedData = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const { corrections } = req.body;

      if (!corrections || typeof corrections !== 'object') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Corrections object is required'
          }
        });
        return;
      }

      const result = await this.documentProcessingService.correctExtractedData(
        id,
        userId,
        corrections,
        req.ip,
        req.get('User-Agent')
      );

      const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 403);
      res.status(statusCode).json(result);

    } catch (error) {
      logger.error('Correct extracted data endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to correct extracted data'
        }
      });
    }
  };

  // GET /documents/stats
  getDocumentStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      const result = await this.documentService.getDocumentStats(userId);
      res.json(result);

    } catch (error) {
      logger.error('Get document stats endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve document statistics'
        }
      });
    }
  };

  // GET /documents/audit-trail
  getAuditTrail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { documentId, limit = '100', offset = '0' } = req.query;

      const auditTrail = await this.auditService.getAuditTrail(
        userId,
        documentId as string,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json({
        success: true,
        data: auditTrail
      });

    } catch (error) {
      logger.error('Get audit trail endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve audit trail'
        }
      });
    }
  };

  // GET /documents/processing-status
  getProcessingStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = this.documentProcessingService.getProcessingQueueStatus();

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Get processing status endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve processing status'
        }
      });
    }
  };

  // GET /documents/health
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          service: 'document-service',
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