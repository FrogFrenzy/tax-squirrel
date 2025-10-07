import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { 
  Document, 
  DocumentCategory, 
  DocumentMetadata,
  ExtractedData,
  DocumentSearchFilters,
  ProcessingStatus,
  Logger 
} from '@tax-app/shared';

const logger = new Logger('document-model');

export class DocumentModel {
  private db: Db;
  private collection: Collection<any>;

  constructor(db: Db) {
    this.db = db;
    this.collection = db.collection('documents');
    this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    try {
      await this.collection.createIndex({ userId: 1 });
      await this.collection.createIndex({ category: 1 });
      await this.collection.createIndex({ taxYear: 1 });
      await this.collection.createIndex({ uploadDate: -1 });
      await this.collection.createIndex({ 'metadata.processingStatus': 1 });
      await this.collection.createIndex({ isVerified: 1 });
      await this.collection.createIndex({ 'extractedData.formType': 1 });
      
      // Compound indexes
      await this.collection.createIndex({ userId: 1, category: 1 });
      await this.collection.createIndex({ userId: 1, taxYear: 1 });
      await this.collection.createIndex({ userId: 1, uploadDate: -1 });
      
      logger.info('Document indexes created successfully');
    } catch (error) {
      logger.error('Failed to create document indexes', { error: error.message });
    }
  }

  async createDocument(documentData: Omit<Document, 'id'>): Promise<Document> {
    try {
      const doc = {
        ...documentData,
        _id: new ObjectId(),
        uploadDate: new Date(),
        lastModified: new Date()
      };

      const result = await this.collection.insertOne(doc);
      
      const createdDocument = await this.getDocumentById(result.insertedId.toString());
      if (!createdDocument) {
        throw new Error('Failed to retrieve created document');
      }

      logger.info('Document created successfully', { 
        documentId: createdDocument.id,
        userId: documentData.userId,
        category: documentData.category
      });

      return createdDocument;
    } catch (error) {
      logger.error('Failed to create document', { 
        error: error.message,
        userId: documentData.userId
      });
      throw error;
    }
  }

  async getDocumentById(id: string): Promise<Document | null> {
    try {
      const doc = await this.collection.findOne({ _id: new ObjectId(id) });
      return doc ? this.mapToDocument(doc) : null;
    } catch (error) {
      logger.error('Failed to get document by ID', { error: error.message, documentId: id });
      return null;
    }
  }

  async getDocumentsByUser(
    userId: string, 
    filters?: DocumentSearchFilters,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ documents: Document[]; total: number }> {
    try {
      const query: any = { userId };

      // Apply filters
      if (filters) {
        if (filters.category) {
          query.category = filters.category;
        }
        if (filters.taxYear) {
          query.taxYear = filters.taxYear;
        }
        if (filters.isVerified !== undefined) {
          query.isVerified = filters.isVerified;
        }
        if (filters.isProcessed !== undefined) {
          query.isProcessed = filters.isProcessed;
        }
        if (filters.dateFrom || filters.dateTo) {
          query.uploadDate = {};
          if (filters.dateFrom) {
            query.uploadDate.$gte = filters.dateFrom;
          }
          if (filters.dateTo) {
            query.uploadDate.$lte = filters.dateTo;
          }
        }
        if (filters.formType) {
          query['extractedData.formType'] = filters.formType;
        }
      }

      const [documents, total] = await Promise.all([
        this.collection
          .find(query)
          .sort({ uploadDate: -1 })
          .skip(offset)
          .limit(limit)
          .toArray(),
        this.collection.countDocuments(query)
      ]);

      return {
        documents: documents.map(doc => this.mapToDocument(doc)),
        total
      };
    } catch (error) {
      logger.error('Failed to get documents by user', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document | null> {
    try {
      const updateData = {
        ...updates,
        lastModified: new Date()
      };

      // Remove id from updates if present
      delete updateData.id;

      await this.collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      return this.getDocumentById(id);
    } catch (error) {
      logger.error('Failed to update document', { 
        error: error.message, 
        documentId: id 
      });
      throw error;
    }
  }

  async updateExtractedData(id: string, extractedData: ExtractedData): Promise<Document | null> {
    try {
      await this.collection.updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            extractedData,
            isProcessed: true,
            'metadata.processingStatus': ProcessingStatus.COMPLETED,
            lastModified: new Date()
          }
        }
      );

      return this.getDocumentById(id);
    } catch (error) {
      logger.error('Failed to update extracted data', { 
        error: error.message, 
        documentId: id 
      });
      throw error;
    }
  }

  async updateProcessingStatus(id: string, status: ProcessingStatus): Promise<void> {
    try {
      await this.collection.updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            'metadata.processingStatus': status,
            lastModified: new Date()
          }
        }
      );

      logger.info('Document processing status updated', { 
        documentId: id, 
        status 
      });
    } catch (error) {
      logger.error('Failed to update processing status', { 
        error: error.message, 
        documentId: id,
        status
      });
      throw error;
    }
  }

  async verifyDocument(id: string, isVerified: boolean): Promise<Document | null> {
    try {
      await this.collection.updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            isVerified,
            lastModified: new Date()
          }
        }
      );

      logger.info('Document verification updated', { 
        documentId: id, 
        isVerified 
      });

      return this.getDocumentById(id);
    } catch (error) {
      logger.error('Failed to verify document', { 
        error: error.message, 
        documentId: id 
      });
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
      
      if (result.deletedCount === 1) {
        logger.info('Document deleted successfully', { documentId: id });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to delete document', { 
        error: error.message, 
        documentId: id 
      });
      return false;
    }
  }

  async getDocumentsByCategory(
    userId: string, 
    category: DocumentCategory
  ): Promise<Document[]> {
    try {
      const documents = await this.collection
        .find({ userId, category })
        .sort({ uploadDate: -1 })
        .toArray();

      return documents.map(doc => this.mapToDocument(doc));
    } catch (error) {
      logger.error('Failed to get documents by category', { 
        error: error.message, 
        userId,
        category
      });
      throw error;
    }
  }

  async getDocumentsByTaxYear(userId: string, taxYear: number): Promise<Document[]> {
    try {
      const documents = await this.collection
        .find({ userId, taxYear })
        .sort({ category: 1, uploadDate: -1 })
        .toArray();

      return documents.map(doc => this.mapToDocument(doc));
    } catch (error) {
      logger.error('Failed to get documents by tax year', { 
        error: error.message, 
        userId,
        taxYear
      });
      throw error;
    }
  }

  async getUnprocessedDocuments(limit: number = 10): Promise<Document[]> {
    try {
      const documents = await this.collection
        .find({ 
          'metadata.processingStatus': { 
            $in: [ProcessingStatus.PENDING, ProcessingStatus.PROCESSING] 
          }
        })
        .sort({ uploadDate: 1 })
        .limit(limit)
        .toArray();

      return documents.map(doc => this.mapToDocument(doc));
    } catch (error) {
      logger.error('Failed to get unprocessed documents', { error: error.message });
      throw error;
    }
  }

  async getDocumentStats(userId: string): Promise<{
    totalDocuments: number;
    documentsByCategory: Record<DocumentCategory, number>;
    documentsByYear: Record<number, number>;
    processingStats: Record<ProcessingStatus, number>;
  }> {
    try {
      const pipeline = [
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalDocuments: { $sum: 1 },
            categories: { $push: '$category' },
            years: { $push: '$taxYear' },
            statuses: { $push: '$metadata.processingStatus' }
          }
        }
      ];

      const result = await this.collection.aggregate(pipeline).toArray();
      
      if (result.length === 0) {
        return {
          totalDocuments: 0,
          documentsByCategory: {} as Record<DocumentCategory, number>,
          documentsByYear: {},
          processingStats: {} as Record<ProcessingStatus, number>
        };
      }

      const data = result[0];
      
      // Count by category
      const documentsByCategory = data.categories.reduce((acc: any, category: DocumentCategory) => {
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});

      // Count by year
      const documentsByYear = data.years
        .filter((year: number) => year != null)
        .reduce((acc: any, year: number) => {
          acc[year] = (acc[year] || 0) + 1;
          return acc;
        }, {});

      // Count by processing status
      const processingStats = data.statuses.reduce((acc: any, status: ProcessingStatus) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      return {
        totalDocuments: data.totalDocuments,
        documentsByCategory,
        documentsByYear,
        processingStats
      };
    } catch (error) {
      logger.error('Failed to get document stats', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }

  private mapToDocument(doc: any): Document {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      fileName: doc.fileName,
      originalFileName: doc.originalFileName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      category: doc.category,
      taxYear: doc.taxYear,
      extractedData: doc.extractedData,
      uploadDate: doc.uploadDate,
      lastModified: doc.lastModified,
      isVerified: doc.isVerified || false,
      isProcessed: doc.isProcessed || false,
      storageUrl: doc.storageUrl,
      thumbnailUrl: doc.thumbnailUrl,
      metadata: doc.metadata
    };
  }
}