import { MongoClient, Db } from 'mongodb';
import { Logger } from '@tax-app/shared';

const logger = new Logger('document-database');

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private client: MongoClient;
  private db: Db;

  private constructor() {
    const connectionString = process.env.MONGODB_URL || 'mongodb://localhost:27017/tax_documents';
    
    this.client = new MongoClient(connectionString, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    // Get database name from connection string or use default
    const dbName = this.extractDatabaseName(connectionString) || 'tax_documents';
    this.db = this.client.db(dbName);

    // Test connection on startup
    this.testConnection();
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public getDb(): Db {
    return this.db;
  }

  public getClient(): MongoClient {
    return this.client;
  }

  private async testConnection(): Promise<void> {
    try {
      await this.client.connect();
      await this.db.admin().ping();
      logger.info('MongoDB connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to MongoDB', { error: error.message });
      throw error;
    }
  }

  private extractDatabaseName(connectionString: string): string | null {
    try {
      const url = new URL(connectionString);
      return url.pathname.substring(1); // Remove leading slash
    } catch {
      return null;
    }
  }

  public async close(): Promise<void> {
    try {
      await this.client.close();
      logger.info('MongoDB connection closed');
    } catch (error) {
      logger.error('Error closing MongoDB connection', { error: error.message });
    }
  }

  public async initializeCollections(): Promise<void> {
    try {
      // Create collections if they don't exist
      const collections = await this.db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      if (!collectionNames.includes('documents')) {
        await this.db.createCollection('documents');
        logger.info('Documents collection created');
      }

      if (!collectionNames.includes('audit_trail')) {
        await this.db.createCollection('audit_trail');
        logger.info('Audit trail collection created');
      }

      if (!collectionNames.includes('document_folders')) {
        await this.db.createCollection('document_folders');
        logger.info('Document folders collection created');
      }

      if (!collectionNames.includes('document_tags')) {
        await this.db.createCollection('document_tags');
        logger.info('Document tags collection created');
      }

      logger.info('MongoDB collections initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MongoDB collections', { error: error.message });
      throw error;
    }
  }
}

export default DatabaseConnection;