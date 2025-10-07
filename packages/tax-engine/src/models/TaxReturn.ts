import { Pool } from 'pg';
import { 
  TaxReturn, 
  IncomeData, 
  DeductionData, 
  CreditData, 
  TaxCalculation,
  ReturnStatus,
  FilingStatus,
  Logger
} from '@tax-app/shared';

const logger = new Logger('tax-return-model');

export class TaxReturnModel {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async createTaxReturn(userId: string, taxYear: number, filingStatus: FilingStatus): Promise<TaxReturn> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Create tax return
      const returnResult = await client.query(`
        INSERT INTO tax_returns (
          user_id, tax_year, filing_status, status, created_at, last_modified
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id, user_id, tax_year, filing_status, status, created_at, last_modified
      `, [userId, taxYear, filingStatus, ReturnStatus.DRAFT]);

      const taxReturnId = returnResult.rows[0].id;

      // Initialize empty income data
      await client.query(`
        INSERT INTO tax_return_income (tax_return_id, total_income, adjusted_gross_income)
        VALUES ($1, $2, $3)
      `, [taxReturnId, 0, 0]);

      // Initialize empty deduction data
      await client.query(`
        INSERT INTO tax_return_deductions (
          tax_return_id, standard_deduction, total_itemized_deductions, deduction_method
        ) VALUES ($1, $2, $3, $4)
      `, [taxReturnId, 0, 0, 'standard']);

      // Initialize empty credit data
      await client.query(`
        INSERT INTO tax_return_credits (tax_return_id, total_credits)
        VALUES ($1, $2)
      `, [taxReturnId, 0]);

      // Initialize empty calculation data
      await client.query(`
        INSERT INTO tax_calculations (
          tax_return_id, gross_income, adjusted_gross_income, taxable_income,
          federal_tax_before_credits, total_credits, federal_tax_after_credits,
          self_employment_tax, total_tax_liability, total_withholding,
          estimated_payments, refund_amount, amount_owed, effective_tax_rate, marginal_tax_rate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [taxReturnId, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

      await client.query('COMMIT');

      return this.getTaxReturnById(taxReturnId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create tax return', { error: error.message, userId, taxYear });
      throw error;
    } finally {
      client.release();
    }
  }

  async getTaxReturnById(id: string): Promise<TaxReturn | null> {
    const result = await this.db.query(`
      SELECT 
        tr.id, tr.user_id, tr.tax_year, tr.filing_status, tr.status,
        tr.created_at, tr.last_modified, tr.submitted_at, tr.accepted_at,
        tri.total_income, tri.adjusted_gross_income,
        trd.standard_deduction, trd.total_itemized_deductions, trd.deduction_method,
        trc.total_credits,
        tc.gross_income, tc.taxable_income, tc.federal_tax_before_credits,
        tc.federal_tax_after_credits, tc.self_employment_tax, tc.total_tax_liability,
        tc.total_withholding, tc.estimated_payments, tc.refund_amount, tc.amount_owed,
        tc.effective_tax_rate, tc.marginal_tax_rate
      FROM tax_returns tr
      LEFT JOIN tax_return_income tri ON tr.id = tri.tax_return_id
      LEFT JOIN tax_return_deductions trd ON tr.id = trd.tax_return_id
      LEFT JOIN tax_return_credits trc ON tr.id = trc.tax_return_id
      LEFT JOIN tax_calculations tc ON tr.id = tc.tax_return_id
      WHERE tr.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    
    // Get detailed income data
    const income = await this.getIncomeData(id);
    const deductions = await this.getDeductionData(id);
    const credits = await this.getCreditData(id);
    const forms = await this.getTaxForms(id);

    return {
      id: row.id,
      userId: row.user_id,
      taxYear: row.tax_year,
      filingStatus: row.filing_status as FilingStatus,
      income,
      deductions,
      credits,
      calculations: {
        grossIncome: parseFloat(row.gross_income) || 0,
        adjustedGrossIncome: parseFloat(row.adjusted_gross_income) || 0,
        taxableIncome: parseFloat(row.taxable_income) || 0,
        federalTaxBeforeCredits: parseFloat(row.federal_tax_before_credits) || 0,
        totalCredits: parseFloat(row.total_credits) || 0,
        federalTaxAfterCredits: parseFloat(row.federal_tax_after_credits) || 0,
        selfEmploymentTax: parseFloat(row.self_employment_tax) || 0,
        totalTaxLiability: parseFloat(row.total_tax_liability) || 0,
        totalWithholding: parseFloat(row.total_withholding) || 0,
        estimatedPayments: parseFloat(row.estimated_payments) || 0,
        refundAmount: parseFloat(row.refund_amount) || 0,
        amountOwed: parseFloat(row.amount_owed) || 0,
        effectiveTaxRate: parseFloat(row.effective_tax_rate) || 0,
        marginalTaxRate: parseFloat(row.marginal_tax_rate) || 0
      },
      forms,
      status: row.status as ReturnStatus,
      createdAt: row.created_at,
      lastModified: row.last_modified,
      submittedAt: row.submitted_at,
      acceptedAt: row.accepted_at
    };
  }

  async getTaxReturnsByUser(userId: string): Promise<TaxReturn[]> {
    const result = await this.db.query(`
      SELECT id FROM tax_returns 
      WHERE user_id = $1 
      ORDER BY tax_year DESC, last_modified DESC
    `, [userId]);

    const taxReturns: TaxReturn[] = [];
    for (const row of result.rows) {
      const taxReturn = await this.getTaxReturnById(row.id);
      if (taxReturn) {
        taxReturns.push(taxReturn);
      }
    }

    return taxReturns;
  }

  async updateTaxReturnStatus(id: string, status: ReturnStatus): Promise<void> {
    await this.db.query(`
      UPDATE tax_returns 
      SET status = $1, last_modified = NOW()
      WHERE id = $2
    `, [status, id]);
  }

  async updateTaxCalculations(id: string, calculations: TaxCalculation): Promise<void> {
    await this.db.query(`
      UPDATE tax_calculations SET
        gross_income = $1,
        adjusted_gross_income = $2,
        taxable_income = $3,
        federal_tax_before_credits = $4,
        total_credits = $5,
        federal_tax_after_credits = $6,
        self_employment_tax = $7,
        total_tax_liability = $8,
        total_withholding = $9,
        estimated_payments = $10,
        refund_amount = $11,
        amount_owed = $12,
        effective_tax_rate = $13,
        marginal_tax_rate = $14
      WHERE tax_return_id = $15
    `, [
      calculations.grossIncome,
      calculations.adjustedGrossIncome,
      calculations.taxableIncome,
      calculations.federalTaxBeforeCredits,
      calculations.totalCredits,
      calculations.federalTaxAfterCredits,
      calculations.selfEmploymentTax,
      calculations.totalTaxLiability,
      calculations.totalWithholding,
      calculations.estimatedPayments,
      calculations.refundAmount,
      calculations.amountOwed,
      calculations.effectiveTaxRate,
      calculations.marginalTaxRate,
      id
    ]);

    // Update last modified timestamp
    await this.db.query(`
      UPDATE tax_returns SET last_modified = NOW() WHERE id = $1
    `, [id]);
  }

  async addWageIncome(taxReturnId: string, wageData: any): Promise<string> {
    const result = await this.db.query(`
      INSERT INTO wage_income (
        tax_return_id, employer_name, employer_ein, wages, federal_tax_withheld,
        social_security_wages, social_security_tax_withheld, medicare_wages,
        medicare_tax_withheld, state_wages, state_tax_withheld, w2_document_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      taxReturnId, wageData.employerName, wageData.employerEIN, wageData.wages,
      wageData.federalTaxWithheld, wageData.socialSecurityWages, wageData.socialSecurityTaxWithheld,
      wageData.medicareWages, wageData.medicareTaxWithheld, wageData.stateWages,
      wageData.stateTaxWithheld, wageData.w2DocumentId
    ]);

    return result.rows[0].id;
  }

  async addItemizedDeduction(taxReturnId: string, deductionData: any): Promise<string> {
    const result = await this.db.query(`
      INSERT INTO itemized_deductions (
        tax_return_id, category, description, amount, limitation, supporting_documents
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      taxReturnId, deductionData.category, deductionData.description,
      deductionData.amount, deductionData.limitation,
      JSON.stringify(deductionData.supportingDocuments || [])
    ]);

    return result.rows[0].id;
  }

  private async getIncomeData(taxReturnId: string): Promise<IncomeData> {
    // Get wage income
    const wageResult = await this.db.query(`
      SELECT * FROM wage_income WHERE tax_return_id = $1
    `, [taxReturnId]);

    // Get other income types (simplified for now)
    const incomeResult = await this.db.query(`
      SELECT total_income, adjusted_gross_income FROM tax_return_income 
      WHERE tax_return_id = $1
    `, [taxReturnId]);

    return {
      wages: wageResult.rows.map(row => ({
        id: row.id,
        employerName: row.employer_name,
        employerEIN: row.employer_ein,
        wages: parseFloat(row.wages),
        federalTaxWithheld: parseFloat(row.federal_tax_withheld),
        socialSecurityWages: parseFloat(row.social_security_wages),
        socialSecurityTaxWithheld: parseFloat(row.social_security_tax_withheld),
        medicareWages: parseFloat(row.medicare_wages),
        medicareTaxWithheld: parseFloat(row.medicare_tax_withheld),
        stateWages: row.state_wages ? parseFloat(row.state_wages) : undefined,
        stateTaxWithheld: row.state_tax_withheld ? parseFloat(row.state_tax_withheld) : undefined,
        w2DocumentId: row.w2_document_id
      })),
      selfEmployment: [], // TODO: Implement
      investment: [], // TODO: Implement
      retirement: [], // TODO: Implement
      other: [], // TODO: Implement
      totalIncome: incomeResult.rows[0]?.total_income ? parseFloat(incomeResult.rows[0].total_income) : 0,
      adjustedGrossIncome: incomeResult.rows[0]?.adjusted_gross_income ? parseFloat(incomeResult.rows[0].adjusted_gross_income) : 0
    };
  }

  private async getDeductionData(taxReturnId: string): Promise<DeductionData> {
    // Get itemized deductions
    const itemizedResult = await this.db.query(`
      SELECT * FROM itemized_deductions WHERE tax_return_id = $1
    `, [taxReturnId]);

    const deductionResult = await this.db.query(`
      SELECT standard_deduction, total_itemized_deductions, deduction_method
      FROM tax_return_deductions WHERE tax_return_id = $1
    `, [taxReturnId]);

    const row = deductionResult.rows[0];

    return {
      standardDeduction: row ? parseFloat(row.standard_deduction) : 0,
      itemizedDeductions: itemizedResult.rows.map(item => ({
        id: item.id,
        category: item.category,
        description: item.description,
        amount: parseFloat(item.amount),
        limitation: item.limitation ? parseFloat(item.limitation) : undefined,
        supportingDocuments: JSON.parse(item.supporting_documents || '[]')
      })),
      totalItemizedDeductions: row ? parseFloat(row.total_itemized_deductions) : 0,
      deductionMethod: row?.deduction_method || 'standard',
      businessDeductions: [], // TODO: Implement
      adjustments: [] // TODO: Implement
    };
  }

  private async getCreditData(taxReturnId: string): Promise<CreditData> {
    const result = await this.db.query(`
      SELECT * FROM tax_return_credits WHERE tax_return_id = $1
    `, [taxReturnId]);

    const row = result.rows[0];

    return {
      childTaxCredit: row?.child_tax_credit ? parseFloat(row.child_tax_credit) : 0,
      earnedIncomeCredit: row?.earned_income_credit ? parseFloat(row.earned_income_credit) : 0,
      educationCredits: row?.education_credits ? parseFloat(row.education_credits) : 0,
      retirementSavingsCredit: row?.retirement_savings_credit ? parseFloat(row.retirement_savings_credit) : 0,
      otherCredits: [], // TODO: Implement
      totalCredits: row?.total_credits ? parseFloat(row.total_credits) : 0
    };
  }

  private async getTaxForms(taxReturnId: string): Promise<any[]> {
    // TODO: Implement tax forms retrieval
    return [];
  }
}