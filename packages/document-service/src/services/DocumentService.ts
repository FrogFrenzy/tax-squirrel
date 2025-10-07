import { DocumentModel } from '../models/Document';
import { StorageService, UploadResult } from './StorageService';
import { AuditService } from './AuditService';
import { 
  Document,
  DocumentUploadRequest,
  DocumentSearchFilters,
  DocumentCategory,
  DocumentMetadata,
  ProcessingStatus,
  UploadSource,
  AuditAction,
  Logger,
  ApiResponse,
  ErrorCodes
} from '@tax-app/shared';

const logger = new Logger('document-service');

export class DocumentService {
  private documentModel: DocumentModel;
  private storageService: StorageService;
  private auditService: AuditService;

  constructor(
    documentModel: DocumentModel,
    storageService: StorageService,
    auditService: AuditService
  ) {
    this.documentModel = documentModel;
    this.storageService = storageService;
    this.auditService = auditService;
  }

  async uploadDocument(
    userId: string,
    uploadRequest: DocumentUploadRequest,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ApiResponse<Document>> {
    try {
      logger.info('Starting document upload', {
        userId,
        fileName: uploadRequest.fileName,
        category: uploadRequest.category
      });

      // Convert File to Buffer if needed
      let buffer: Buffer;
      if (uploadRequest.file instanceof Buffer) {
        buffer = uploadRequest.file;
      } else {
        // Handle File object (in browser environment)
        buffer = Buffer.from(await uploadRequest.file.arrayBuffer());
      }

      // Validate file
      const validation = this.storageService.validateFile(buffer, uploadRequest.fileName);
      if (!validation.isValid) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'File validation failed',
            details: validation.errors.map(error => ({
              field: 'file',
              constraint: error
            }))
          }
        };
      }

      // Upload file to storage
      const uploadResult = await this.storageService.uploadFile(
        buffer,
        uploadRequest.fileName,
        userId,
        this.getMimeType(uploadRequest.fileName)
      );

      if (!uploadResult.success || !uploadResult.data) {
        return {
          success: false,
          error: uploadResult.error || {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'File upload failed'
          }
        };
      }

      // Generate thumbnail for images and PDFs
      let thumbnailUrl: string | undefined;
      const fileExtension = uploadRequest.fileName.toLowerCase();
      if (this.shouldGenerateThumbnail(fileExtension)) {
        const thumbnailResult = await this.storageService.generateThumbnail(
          buffer,
          uploadRequest.fileName,
          userId
        );
        if (thumbnailResult.success && thumbnailResult.data) {
          thumbnailUrl = thumbnailResult.data.url;
        }
      }

      // Create document metadata
      const metadata: DocumentMetadata = {
        mimeType: this.getMimeType(uploadRequest.fileName),
        checksum: uploadResult.data.checksum,
        uploadSource: uploadRequest.metadata?.uploadSource || UploadSource.WEB_UPLOAD,
        processingStatus: ProcessingStatus.PENDING,
        ...uploadRequest.metadata
      };

      // Create document record
      const documentData: Omit<Document, 'id'> = {
        userId,
        fileName: this.generateUniqueFileName(uploadRequest.fileName),
        originalFileName: uploadRequest.fileName,
        fileType: this.getFileType(uploadRequest.fileName),
        fileSize: uploadResult.data.size,
        category: uploadRequest.category,
        taxYear: uploadRequest.taxYear,
        uploadDate: new Date(),
        lastModified: new Date(),
        isVerified: false,
        isProcessed: false,
        storageUrl: uploadResult.data.url,
        thumbnailUrl,
        metadata
      };

      const document = await this.documentModel.createDocument(documentData);

      // Create audit trail
      await this.auditService.logAction({
        userId,
        documentId: document.id,
        action: AuditAction.DOCUMENT_UPLOADED,
        description: `Document uploaded: ${uploadRequest.fileName}`,
        metadata: {
          category: uploadRequest.category,
          fileSize: uploadResult.data.size,
          uploadSource: metadata.uploadSource
        },
        ipAddress,
        userAgent
      });

      logger.info('Document uploaded successfully', {
        userId,
        documentId: document.id,
        fileName: uploadRequest.fileName
      });

      return {
        success: true,
        data: document,
        message: 'Document uploaded successfully'
      };

    } catch (error) {
      logger.error('Document upload failed', {
        error: error.message,
        userId,
        fileName: uploadRequest.fileName
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Document upload failed due to internal error'
        }
      };
    }
  }

  async getDocument(
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

      // Log document access
      await this.auditService.logAction({
        userId,
        documentId,
        action: AuditAction.DOCUMENT_VIEWED,
        description: `Document viewed: ${document.originalFileName}`,
        metadata: {
          category: document.category
        },
        ipAddress,
        userAgent
      });

      return {
        success: true,
        data: document
      };

    } catch (error) {
      logger.error('Get document failed', {
        error: error.message,
        documentId,
        userId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to retrieve document'
        }
      };
    }
  }

  async getDocuments(
    userId: string,
    filters?: DocumentSearchFilters,
    limit: number = 50,
    offset: number = 0
  ): Promise<ApiResponse<{ documents: Document[]; total: number }>> {
    try {
      const result = await this.documentModel.getDocumentsByUser(
        userId,
        filters,
        limit,
        offset
      );

      return {
        success: true,
        data: result
      };

    } catch (error) {
      logger.error('Get documents failed', {
        error: error.message,
        userId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to retrieve documents'
        }
      };
    }
  }

  async deleteDocument(
    documentId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ApiResponse<void>> {
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

      // Delete from storage
      const storageKey = this.extractStorageKey(document.storageUrl);
      if (storageKey) {
        await this.storageService.deleteFile(storageKey);
      }

      // Delete thumbnail if exists
      if (document.thumbnailUrl) {
        const thumbnailKey = this.extractStorageKey(document.thumbnailUrl);
        if (thumbnailKey) {
          await this.storageService.deleteFile(thumbnailKey);
        }
      }

      // Delete document record
      const deleted = await this.documentModel.deleteDocument(documentId);

      if (!deleted) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to delete document'
          }
        };
      }

      // Create audit trail
      await this.auditService.logAction({
        userId,
        documentId,
        action: AuditAction.DOCUMENT_DELETED,
        description: `Document deleted: ${document.originalFileName}`,
        metadata: {
          category: document.category,
          fileSize: document.fileSize
        },
        ipAddress,
        userAgent
      });

      logger.info('Document deleted successfully', {
        userId,
        documentId,
        fileName: document.originalFileName
      });

      return {
        success: true,
        message: 'Document deleted successfully'
      };

    } catch (error) {
      logger.error('Delete document failed', {
        error: error.message,
        documentId,
        userId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to delete document'
        }
      };
    }
  }

  async verifyDocument(
    documentId: string,
    userId: string,
    isVerified: boolean,
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

      const updatedDocument = await this.documentModel.verifyDocument(documentId, isVerified);

      if (!updatedDocument) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to update document verification'
          }
        };
      }

      // Create audit trail
      await this.auditService.logAction({
        userId,
        documentId,
        action: AuditAction.DOCUMENT_VERIFIED,
        description: `Document ${isVerified ? 'verified' : 'unverified'}: ${document.originalFileName}`,
        metadata: {
          isVerified,
          category: document.category
        },
        ipAddress,
        userAgent
      });

      return {
        success: true,
        data: updatedDocument,
        message: `Document ${isVerified ? 'verified' : 'unverified'} successfully`
      };

    } catch (error) {
      logger.error('Verify document failed', {
        error: error.message,
        documentId,
        userId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to verify document'
        }
      };
    }
  }

  async getDocumentDownloadUrl(
    documentId: string,
    userId: string,
    expiresIn: number = 3600,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ApiResponse<string>> {
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

      const storageKey = this.extractStorageKey(document.storageUrl);
      if (!storageKey) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Invalid storage URL'
          }
        };
      }

      const urlResult = await this.storageService.getSignedUrl(storageKey, expiresIn);

      if (!urlResult.success || !urlResult.data) {
        return {
          success: false,
          error: urlResult.error || {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to generate download URL'
          }
        };
      }

      // Log document download
      await this.auditService.logAction({
        userId,
        documentId,
        action: AuditAction.DOCUMENT_DOWNLOADED,
        description: `Document download URL generated: ${document.originalFileName}`,
        metadata: {
          category: document.category,
          expiresIn
        },
        ipAddress,
        userAgent
      });

      return {
        success: true,
        data: urlResult.data
      };

    } catch (error) {
      logger.error('Get document download URL failed', {
        error: error.message,
        documentId,
        userId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to generate download URL'
        }
      };
    }
  }

  async getDocumentStats(userId: string): Promise<ApiResponse<any>> {
    try {
      const stats = await this.documentModel.getDocumentStats(userId);

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      logger.error('Get document stats failed', {
        error: error.message,
        userId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to retrieve document statistics'
        }
      };
    }
  }

  private generateUniqueFileName(originalFileName: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const extension = originalFileName.substring(originalFileName.lastIndexOf('.'));
    const baseName = originalFileName.substring(0, originalFileName.lastIndexOf('.'));
    
    return `${baseName}-${timestamp}-${randomString}${extension}`;
  }

  private getMimeType(fileName: string): string {
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.bmp': 'image/bmp'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  private getFileType(fileName: string): string {
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return extension.substring(1); // Remove the dot
  }

  private shouldGenerateThumbnail(fileName: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.tif', '.bmp', '.pdf'];
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return imageExtensions.includes(extension);
  }

  private extractStorageKey(url: string): string | null {
    try {
      // For S3 URLs, extract the key from the URL
      if (url.includes('amazonaws.com')) {
        const urlParts = url.split('/');
        return urlParts.slice(3).join('/'); // Remove protocol, domain, and bucket
      }
      
      // For local URLs, extract the path
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading slash
    } catch {
      return null;
    }
  }
}