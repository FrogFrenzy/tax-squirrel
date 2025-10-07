import { DocumentModel } from '../models/Document';
import { OCRService } from './OCRService';
import { StorageService } from './StorageService';
import { AuditService } from './AuditService';
import { 
  Document,
  ProcessingStatus,
  AuditAction,
  Logger,
  ApiResponse,
  ErrorCodes
} from '@tax-app/shared';

const logger = new Logger('document-processing-service');

export class DocumentProcessingService {
  private documentModel: DocumentModel;
  private ocrService: OCRService;
  private storageService: StorageService;
  private auditService: AuditService;
  private processingQueue: string[] = [];
  private isProcessing = false;

  constructor(
    documentModel: DocumentModel,
    ocrService: OCRService,
    storageService: StorageService,
    auditService: AuditService
  ) {
    this.documentModel = documentModel;
    this.ocrService = ocrService;
    this.storageService = storageService;
    this.auditService = auditService;

    // Start processing queue
    this.startProcessingQueue();
  }

  async queueDocumentForProcessing(documentId: string): Promise<ApiResponse<void>> {
    try {
      // Add to processing queue if not already queued
      if (!this.processingQueue.includes(documentId)) {
        this.processingQueue.push(documentId);
        
        // Update status to pending
        await this.documentModel.updateProcessingStatus(documentId, ProcessingStatus.PENDING);
        
        logger.info('Document queued for processing', { documentId });
      }

      return {
        success: true,
        message: 'Document queued for processing'
      };

    } catch (error) {
      logger.error('Failed to queue document for processing', {
        error: error.message,
        documentId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to queue document for processing'
        }
      };
    }
  }

  private async startProcessingQueue(): Promise<void> {
    // Process documents every 5 seconds
    setInterval(async () => {
      if (!this.isProcessing && this.processingQueue.length > 0) {
        await this.processNextDocument();
      }
    }, 5000);

    // Also check for unprocessed documents on startup
    setTimeout(async () => {
      await this.loadUnprocessedDocuments();
    }, 1000);
  }

  private async loadUnprocessedDocuments(): Promise<void> {
    try {
      const unprocessedDocs = await this.documentModel.getUnprocessedDocuments(50);
      
      for (const doc of unprocessedDocs) {
        if (!this.processingQueue.includes(doc.id)) {
          this.processingQueue.push(doc.id);
        }
      }

      logger.info('Loaded unprocessed documents', { 
        count: unprocessedDocs.length,
        queueSize: this.processingQueue.length
      });

    } catch (error) {
      logger.error('Failed to load unprocessed documents', { error: error.message });
    }
  }

  private async processNextDocument(): Promise<void> {
    if (this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const documentId = this.processingQueue.shift()!;

    try {
      await this.processDocument(documentId);
    } catch (error) {
      logger.error('Document processing failed', {
        error: error.message,
        documentId
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async processDocument(documentId: string): Promise<ApiResponse<Document>> {
    try {
      logger.info('Starting document processing', { documentId });

      // Get document
      const document = await this.documentModel.getDocumentById(documentId);
      if (!document) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Document not found'
          }
        };
      }

      // Update status to processing
      await this.documentModel.updateProcessingStatus(documentId, ProcessingStatus.PROCESSING);

      // Log processing start
      await this.auditService.logAction({
        userId: document.userId,
        documentId,
        action: AuditAction.DOCUMENT_PROCESSED,
        description: `Document processing started: ${document.originalFileName}`,
        metadata: {
          category: document.category,
          fileSize: document.fileSize,
          processingStatus: ProcessingStatus.PROCESSING
        }
      });

      // Download file from storage
      const fileBuffer = await this.downloadFileFromStorage(document.storageUrl);
      if (!fileBuffer) {
        await this.documentModel.updateProcessingStatus(documentId, ProcessingStatus.FAILED);
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to download file from storage'
          }
        };
      }

      // Extract data using OCR
      const extractionResult = await this.ocrService.extractDataFromDocument(
        fileBuffer,
        document.originalFileName,
        document.category
      );

      if (!extractionResult.success || !extractionResult.data) {
        await this.documentModel.updateProcessingStatus(documentId, ProcessingStatus.FAILED);
        
        await this.auditService.logAction({
          userId: document.userId,
          documentId,
          action: AuditAction.DATA_EXTRACTED,
          description: `Data extraction failed: ${document.originalFileName}`,
          metadata: {
            error: extractionResult.error?.message,
            processingStatus: ProcessingStatus.FAILED
          }
        });

        return {
          success: false,
          error: extractionResult.error || {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Data extraction failed'
          }
        };
      }

      // Update document with extracted data
      const updatedDocument = await this.documentModel.updateExtractedData(
        documentId,
        extractionResult.data
      );

      if (!updatedDocument) {
        await this.documentModel.updateProcessingStatus(documentId, ProcessingStatus.FAILED);
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to update document with extracted data'
          }
        };
      }

      // Determine final status
      const finalStatus = extractionResult.data.reviewRequired 
        ? ProcessingStatus.MANUAL_REVIEW 
        : ProcessingStatus.COMPLETED;

      await this.documentModel.updateProcessingStatus(documentId, finalStatus);

      // Log successful processing
      await this.auditService.logAction({
        userId: document.userId,
        documentId,
        action: AuditAction.DATA_EXTRACTED,
        description: `Data extraction completed: ${document.originalFileName}`,
        metadata: {
          formType: extractionData.formType,
          confidence: extractionResult.data.confidence,
          reviewRequired: extractionResult.data.reviewRequired,
          fieldCount: Object.keys(extractionResult.data.fields).length,
          processingStatus: finalStatus
        }
      });

      logger.info('Document processing completed', {
        documentId,
        fileName: document.originalFileName,
        confidence: extractionResult.data.confidence,
        reviewRequired: extractionResult.data.reviewRequired,
        finalStatus
      });

      return {
        success: true,
        data: updatedDocument,
        message: 'Document processed successfully'
      };

    } catch (error) {
      logger.error('Document processing failed', {
        error: error.message,
        documentId
      });

      // Update status to failed
      await this.documentModel.updateProcessingStatus(documentId, ProcessingStatus.FAILED);

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Document processing failed due to internal error'
        }
      };
    }
  }

  private async downloadFileFromStorage(storageUrl: string): Promise<Buffer | null> {
    try {
      // For now, we'll assume the file is accessible via HTTP
      // In a real implementation, you would use the storage service
      // to download the file using signed URLs or direct access
      
      const response = await fetch(storageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);

    } catch (error) {
      logger.error('Failed to download file from storage', {
        error: error.message,
        storageUrl
      });
      return null;
    }
  }

  async reprocessDocument(
    documentId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ApiResponse<Document>> {
    try {
      const document = await this.documentModel.getDocumentById(documentId);

      if (!document) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Document not found'
          }
        };
      }

      // Verify ownership
      if (document.userId !== userId) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Access denied'
          }
        };
      }

      // Reset processing status and queue for reprocessing
      await this.documentModel.updateProcessingStatus(documentId, ProcessingStatus.PENDING);
      
      const result = await this.queueDocumentForProcessing(documentId);

      if (result.success) {
        // Log reprocessing request
        await this.auditService.logAction({
          userId,
          documentId,
          action: AuditAction.DOCUMENT_PROCESSED,
          description: `Document reprocessing requested: ${document.originalFileName}`,
          metadata: {
            category: document.category,
            previousStatus: document.metadata.processingStatus
          },
          ipAddress,
          userAgent
        });
      }

      return result;

    } catch (error) {
      logger.error('Document reprocessing failed', {
        error: error.message,
        documentId,
        userId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Document reprocessing failed'
        }
      };
    }
  }

  async correctExtractedData(
    documentId: string,
    userId: string,
    corrections: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ApiResponse<Document>> {
    try {
      const document = await this.documentModel.getDocumentById(documentId);

      if (!document) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Document not found'
          }
        };
      }

      // Verify ownership
      if (document.userId !== userId) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Access denied'
          }
        };
      }

      if (!document.extractedData) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'No extracted data to correct'
          }
        };
      }

      // Apply corrections to extracted data
      const updatedExtractedData = {
        ...document.extractedData,
        corrections,
        reviewRequired: false // Mark as reviewed after manual correction
      };

      const updatedDocument = await this.documentModel.updateExtractedData(
        documentId,
        updatedExtractedData
      );

      if (!updatedDocument) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to update extracted data'
          }
        };
      }

      // Update processing status to completed
      await this.documentModel.updateProcessingStatus(documentId, ProcessingStatus.COMPLETED);

      // Log data correction
      await this.auditService.logAction({
        userId,
        documentId,
        action: AuditAction.DATA_CORRECTED,
        description: `Extracted data corrected: ${document.originalFileName}`,
        metadata: {
          corrections,
          correctionCount: Object.keys(corrections).length
        },
        ipAddress,
        userAgent
      });

      logger.info('Extracted data corrected', {
        documentId,
        userId,
        correctionCount: Object.keys(corrections).length
      });

      return {
        success: true,
        data: updatedDocument,
        message: 'Extracted data corrected successfully'
      };

    } catch (error) {
      logger.error('Data correction failed', {
        error: error.message,
        documentId,
        userId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Data correction failed'
        }
      };
    }
  }

  getProcessingQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    currentDocument?: string;
  } {
    return {
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing,
      currentDocument: this.isProcessing ? this.processingQueue[0] : undefined
    };
  }

  async cleanup(): Promise<void> {
    try {
      await this.ocrService.cleanup();
      logger.info('Document processing service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup document processing service', { error: error.message });
    }
  }
}