import { Pool, PoolConfig } from 'pg';
import { Logger } from '@tax-app/shared';

const logger = new Logger('tax-engine-database');

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool;

  private constructor() {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.pool = new Pool(config);

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err.message });
    });

    // Test connection on startup
    this.testConnection();
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public getPool(): Pool {
    return this.pool;
  }

  private async testConnection(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to database', { error: error.message });
      throw error;
    }
  }

  public async initializeSchema(): Promise<void> {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      await this.pool.query(schema);
      logger.info('Database schema initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database schema', { error: error.message });
      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection closed');
  }
}

export default DatabaseConnection;