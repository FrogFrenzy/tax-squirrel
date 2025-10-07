import { Pool } from 'pg';
import { 
  FilingSubmission,
  FilingStatus,
  SubmissionType,
  FilingMethod,
  FilingError,
  FilingWarning,
  FilingMetadata,
  Logger
} from '@tax-app/shared';

const logger = new Logger('filing-model');

export class FilingModel {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async createFiling(filingData: Omit<FilingSubmission, 'id'>): Promise<FilingSubmission> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Insert filing submission
      const filingResult = await client.query(`
        INSERT INTO filing_submissions (
          user_id, tax_return_id, submission_type, filing_method, status,
          submitted_at, confirmation_number, acknowledgment_id, errors, warnings, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, user_id, tax_return_id, submission_type, filing_method, status,
                  submitted_at, accepted_at, rejected_at, processed_at, confirmation_number,
                  acknowledgment_id, errors, warnings, metadata, created_at
      `, [
        filingData.userId,
        filingData.taxReturnId,
        filingData.submissionType,
        filingData.filingMethod,
        filingData.status,
        filingData.submittedAt,
        filingData.confirmationNumber,
        filingData.acknowledgmentId,
        JSON.stringify(filingData.errors),
        JSON.stringify(filingData.warnings),
        JSON.stringify(filingData.metadata)
      ]);

      await client.query('COMMIT');

      return this.mapRowToFiling(filingResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create filing', { 
        error: error.message, 
        userId: filingData.userId,
        taxReturnId: filingData.taxReturnId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async getFilingById(id: string): Promise<FilingSubmission | null> {
    try {
      const result = await this.db.query(`
        SELECT id, user_id, tax_return_id, submission_type, filing_method, status,
               submitted_at, accepted_at, rejected_at, processed_at, confirmation_number,
               acknowledgment_id, errors, warnings, metadata, created_at, updated_at
        FROM filing_submissions
        WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToFiling(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get filing by ID', { error: error.message, filingId: id });
      return null;
    }
  }

  async getFilingsByUser(userId: string): Promise<FilingSubmission[]> {
    try {
      const result = await this.db.query(`
        SELECT id, user_id, tax_return_id, submission_type, filing_method, status,
               submitted_at, accepted_at, rejected_at, processed_at, confirmation_number,
               acknowledgment_id, errors, warnings, metadata, created_at, updated_at
        FROM filing_submissions
        WHERE user_id = $1
        ORDER BY submitted_at DESC
      `, [userId]);

      return result.rows.map(row => this.mapRowToFiling(row));
    } catch (error) {
      logger.error('Failed to get filings by user', { error: error.message, userId });
      throw error;
    }
  }

  async getFilingByTaxReturn(taxReturnId: string): Promise<FilingSubmission | null> {
    try {
      const result = await this.db.query(`
        SELECT id, user_id, tax_return_id, submission_type, filing_method, status,
               submitted_at, accepted_at, rejected_at, processed_at, confirmation_number,
               acknowledgment_id, errors, warnings, metadata, created_at, updated_at
        FROM filing_submissions
        WHERE tax_return_id = $1
        ORDER BY submitted_at DESC
        LIMIT 1
      `, [taxReturnId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToFiling(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get filing by tax return', { 
        error: error.message, 
        taxReturnId 
      });
      return null;
    }
  }

  async updateFilingStatus(
    id: string, 
    status: FilingStatus, 
    confirmationNumber?: string,
    acknowledgmentId?: string
  ): Promise<FilingSubmission | null> {
    try {
      const updateFields: string[] = ['status = $2', 'updated_at = NOW()'];
      const values: any[] = [id, status];
      let paramIndex = 3;

      if (confirmationNumber) {
        updateFields.push(`confirmation_number = $${paramIndex++}`);
        values.push(confirmationNumber);
      }

      if (acknowledgmentId) {
        updateFields.push(`acknowledgment_id = $${paramIndex++}`);
        values.push(acknowledgmentId);
      }

      // Set timestamp fields based on status
      if (status === FilingStatus.ACCEPTED) {
        updateFields.push(`accepted_at = NOW()`);
      } else if (status === FilingStatus.REJECTED) {
        updateFields.push(`rejected_at = NOW()`);
      } else if (status === FilingStatus.PROCESSED) {
        updateFields.push(`processed_at = NOW()`);
      }

      await this.db.query(`
        UPDATE filing_submissions 
        SET ${updateFields.join(', ')}
        WHERE id = $1
      `, values);

      return this.getFilingById(id);
    } catch (error) {
      logger.error('Failed to update filing status', { 
        error: error.message, 
        filingId: id,
        status
      });
      throw error;
    }
  }

  async updateFilingErrors(
    id: string, 
    errors: FilingError[], 
    warnings: FilingWarning[]
  ): Promise<FilingSubmission | null> {
    try {
      await this.db.query(`
        UPDATE filing_submissions 
        SET errors = $2, warnings = $3, updated_at = NOW()
        WHERE id = $1
      `, [id, JSON.stringify(errors), JSON.stringify(warnings)]);

      return this.getFilingById(id);
    } catch (error) {
      logger.error('Failed to update filing errors', { 
        error: error.message, 
        filingId: id
      });
      throw error;
    }
  }

  async getFilingsByStatus(status: FilingStatus, limit: number = 50): Promise<FilingSubmission[]> {
    try {
      const result = await this.db.query(`
        SELECT id, user_id, tax_return_id, submission_type, filing_method, status,
               submitted_at, accepted_at, rejected_at, processed_at, confirmation_number,
               acknowledgment_id, errors, warnings, metadata, created_at, updated_at
        FROM filing_submissions
        WHERE status = $1
        ORDER BY submitted_at ASC
        LIMIT $2
      `, [status, limit]);

      return result.rows.map(row => this.mapRowToFiling(row));
    } catch (error) {
      logger.error('Failed to get filings by status', { 
        error: error.message, 
        status 
      });
      throw error;
    }
  }

  async getFilingStats(userId?: string): Promise<{
    totalFilings: number;
    filingsByStatus: Record<FilingStatus, number>;
    filingsByMethod: Record<FilingMethod, number>;
    averageProcessingTime: number; // in hours
  }> {
    try {
      const whereClause = userId ? 'WHERE user_id = $1' : '';
      const params = userId ? [userId] : [];

      const result = await this.db.query(`
        SELECT 
          COUNT(*) as total_filings,
          status,
          filing_method,
          EXTRACT(EPOCH FROM (processed_at - submitted_at))/3600 as processing_hours
        FROM filing_submissions
        ${whereClause}
        GROUP BY status, filing_method
      `, params);

      const filingsByStatus: Record<FilingStatus, number> = {} as Record<FilingStatus, number>;
      const filingsByMethod: Record<FilingMethod, number> = {} as Record<FilingMethod, number>;
      let totalFilings = 0;
      let totalProcessingTime = 0;
      let processedCount = 0;

      for (const row of result.rows) {
        totalFilings += parseInt(row.total_filings);
        filingsByStatus[row.status as FilingStatus] = parseInt(row.total_filings);
        filingsByMethod[row.filing_method as FilingMethod] = 
          (filingsByMethod[row.filing_method as FilingMethod] || 0) + parseInt(row.total_filings);
        
        if (row.processing_hours) {
          totalProcessingTime += parseFloat(row.processing_hours);
          processedCount++;
        }
      }

      const averageProcessingTime = processedCount > 0 ? totalProcessingTime / processedCount : 0;

      return {
        totalFilings,
        filingsByStatus,
        filingsByMethod,
        averageProcessingTime
      };
    } catch (error) {
      logger.error('Failed to get filing stats', { error: error.message, userId });
      throw error;
    }
  }

  private mapRowToFiling(row: any): FilingSubmission {
    return {
      id: row.id,
      userId: row.user_id,
      taxReturnId: row.tax_return_id,
      submissionType: row.submission_type as SubmissionType,
      filingMethod: row.filing_method as FilingMethod,
      status: row.status as FilingStatus,
      submittedAt: row.submitted_at,
      acceptedAt: row.accepted_at,
      rejectedAt: row.rejected_at,
      processedAt: row.processed_at,
      confirmationNumber: row.confirmation_number,
      acknowledgmentId: row.acknowledgment_id,
      errors: JSON.parse(row.errors || '[]'),
      warnings: JSON.parse(row.warnings || '[]'),
      metadata: JSON.parse(row.metadata || '{}')
    };
  }
}