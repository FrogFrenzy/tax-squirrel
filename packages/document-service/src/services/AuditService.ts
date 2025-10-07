import { Db, Collection } from 'mongodb';
import { 
  AuditTrail,
  AuditAction,
  Logger
} from '@tax-app/shared';

const logger = new Logger('audit-service');

export interface AuditLogRequest {
  userId: string;
  documentId?: string;
  action: AuditAction;
  description: string;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  private db: Db;
  private collection: Collection<any>;

  constructor(db: Db) {
    this.db = db;
    this.collection = db.collection('audit_trail');
    this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    try {
      await this.collection.createIndex({ userId: 1 });
      await this.collection.createIndex({ documentId: 1 });
      await this.collection.createIndex({ action: 1 });
      await this.collection.createIndex({ timestamp: -1 });
      
      // Compound indexes
      await this.collection.createIndex({ userId: 1, timestamp: -1 });
      await this.collection.createIndex({ documentId: 1, timestamp: -1 });
      await this.collection.createIndex({ userId: 1, action: 1 });
      
      logger.info('Audit trail indexes created successfully');
    } catch (error) {
      logger.error('Failed to create audit trail indexes', { error: error.message });
    }
  }

  async logAction(request: AuditLogRequest): Promise<void> {
    try {
      const auditEntry = {
        userId: request.userId,
        documentId: request.documentId,
        action: request.action,
        description: request.description,
        metadata: request.metadata,
        timestamp: new Date(),
        ipAddress: request.ipAddress,
        userAgent: request.userAgent
      };

      await this.collection.insertOne(auditEntry);

      logger.debug('Audit action logged', {
        userId: request.userId,
        action: request.action,
        documentId: request.documentId
      });

    } catch (error) {
      logger.error('Failed to log audit action', {
        error: error.message,
        userId: request.userId,
        action: request.action
      });
      // Don't throw error to avoid breaking the main operation
    }
  }

  async getAuditTrail(
    userId: string,
    documentId?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditTrail[]> {
    try {
      const query: any = { userId };
      
      if (documentId) {
        query.documentId = documentId;
      }

      const results = await this.collection
        .find(query)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      return results.map(result => ({
        id: result._id.toString(),
        userId: result.userId,
        documentId: result.documentId,
        action: result.action,
        description: result.description,
        metadata: result.metadata,
        timestamp: result.timestamp,
        ipAddress: result.ipAddress,
        userAgent: result.userAgent
      }));

    } catch (error) {
      logger.error('Failed to get audit trail', {
        error: error.message,
        userId,
        documentId
      });
      return [];
    }
  }

  async getAuditStats(userId: string): Promise<{
    totalActions: number;
    actionsByType: Record<AuditAction, number>;
    recentActivity: AuditTrail[];
  }> {
    try {
      const pipeline = [
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalActions: { $sum: 1 },
            actions: { $push: '$action' }
          }
        }
      ];

      const result = await this.collection.aggregate(pipeline).toArray();
      
      let totalActions = 0;
      let actionsByType: Record<AuditAction, number> = {} as Record<AuditAction, number>;

      if (result.length > 0) {
        totalActions = result[0].totalActions;
        actionsByType = result[0].actions.reduce((acc: any, action: AuditAction) => {
          acc[action] = (acc[action] || 0) + 1;
          return acc;
        }, {});
      }

      // Get recent activity (last 10 actions)
      const recentActivity = await this.getAuditTrail(userId, undefined, 10, 0);

      return {
        totalActions,
        actionsByType,
        recentActivity
      };

    } catch (error) {
      logger.error('Failed to get audit stats', {
        error: error.message,
        userId
      });

      return {
        totalActions: 0,
        actionsByType: {} as Record<AuditAction, number>,
        recentActivity: []
      };
    }
  }

  async cleanupOldAuditLogs(daysToKeep: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.collection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      logger.info('Old audit logs cleaned up', {
        deletedCount: result.deletedCount,
        cutoffDate
      });

      return result.deletedCount || 0;

    } catch (error) {
      logger.error('Failed to cleanup old audit logs', {
        error: error.message,
        daysToKeep
      });
      return 0;
    }
  }
}