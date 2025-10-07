import { Pool } from 'pg';
import { 
  TaxLawConfiguration, 
  FilingStatus, 
  TaxBracket,
  Logger 
} from '@tax-app/shared';

const logger = new Logger('tax-law-service');

export class TaxLawService {
  private db: Pool;
  private configCache: Map<number, TaxLawConfiguration> = new Map();

  constructor(db: Pool) {
    this.db = db;
  }

  async getTaxLawConfiguration(taxYear: number): Promise<TaxLawConfiguration | null> {
    // Check cache first
    if (this.configCache.has(taxYear)) {
      return this.configCache.get(taxYear)!;
    }

    try {
      const result = await this.db.query(`
        SELECT * FROM tax_law_configurations WHERE tax_year = $1
      `, [taxYear]);

      if (result.rows.length === 0) {
        logger.warn('Tax law configuration not found', { taxYear });
        return null;
      }

      const row = result.rows[0];
      const config: TaxLawConfiguration = {
        taxYear: row.tax_year,
        standardDeductions: row.standard_deductions,
        taxBrackets: row.tax_brackets,
        socialSecurityWageBase: parseFloat(row.social_security_wage_base),
        socialSecurityRate: parseFloat(row.social_security_rate),
        medicareRate: parseFloat(row.medicare_rate),
        additionalMedicareRate: parseFloat(row.additional_medicare_rate),
        additionalMedicareThreshold: row.additional_medicare_threshold,
        personalExemption: parseFloat(row.personal_exemption),
        childTaxCreditAmount: parseFloat(row.child_tax_credit_amount),
        childTaxCreditPhaseoutThreshold: row.child_tax_credit_phaseout_threshold
      };

      // Cache the configuration
      this.configCache.set(taxYear, config);
      
      return config;
    } catch (error) {
      logger.error('Failed to get tax law configuration', { error: error.message, taxYear });
      return null;
    }
  }

  async updateTaxLawConfiguration(config: TaxLawConfiguration): Promise<boolean> {
    try {
      await this.db.query(`
        INSERT INTO tax_law_configurations (
          tax_year, standard_deductions, tax_brackets, social_security_wage_base,
          social_security_rate, medicare_rate, additional_medicare_rate,
          additional_medicare_threshold, personal_exemption, child_tax_credit_amount,
          child_tax_credit_phaseout_threshold
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tax_year) DO UPDATE SET
          standard_deductions = EXCLUDED.standard_deductions,
          tax_brackets = EXCLUDED.tax_brackets,
          social_security_wage_base = EXCLUDED.social_security_wage_base,
          social_security_rate = EXCLUDED.social_security_rate,
          medicare_rate = EXCLUDED.medicare_rate,
          additional_medicare_rate = EXCLUDED.additional_medicare_rate,
          additional_medicare_threshold = EXCLUDED.additional_medicare_threshold,
          personal_exemption = EXCLUDED.personal_exemption,
          child_tax_credit_amount = EXCLUDED.child_tax_credit_amount,
          child_tax_credit_phaseout_threshold = EXCLUDED.child_tax_credit_phaseout_threshold,
          updated_at = NOW()
      `, [
        config.taxYear,
        JSON.stringify(config.standardDeductions),
        JSON.stringify(config.taxBrackets),
        config.socialSecurityWageBase,
        config.socialSecurityRate,
        config.medicareRate,
        config.additionalMedicareRate,
        JSON.stringify(config.additionalMedicareThreshold),
        config.personalExemption,
        config.childTaxCreditAmount,
        JSON.stringify(config.childTaxCreditPhaseoutThreshold)
      ]);

      // Update cache
      this.configCache.set(config.taxYear, config);
      
      logger.info('Tax law configuration updated', { taxYear: config.taxYear });
      return true;
    } catch (error) {
      logger.error('Failed to update tax law configuration', { 
        error: error.message, 
        taxYear: config.taxYear 
      });
      return false;
    }
  }

  getStandardDeduction(taxYear: number, filingStatus: FilingStatus): number {
    const config = this.configCache.get(taxYear);
    return config?.standardDeductions[filingStatus] || 0;
  }

  getTaxBrackets(taxYear: number, filingStatus: FilingStatus): TaxBracket[] {
    const config = this.configCache.get(taxYear);
    return config?.taxBrackets[filingStatus] || [];
  }

  getSocialSecurityWageBase(taxYear: number): number {
    const config = this.configCache.get(taxYear);
    return config?.socialSecurityWageBase || 0;
  }

  getSocialSecurityRate(taxYear: number): number {
    const config = this.configCache.get(taxYear);
    return config?.socialSecurityRate || 0;
  }

  getMedicareRate(taxYear: number): number {
    const config = this.configCache.get(taxYear);
    return config?.medicareRate || 0;
  }

  getChildTaxCreditAmount(taxYear: number): number {
    const config = this.configCache.get(taxYear);
    return config?.childTaxCreditAmount || 0;
  }

  clearCache(): void {
    this.configCache.clear();
    logger.info('Tax law configuration cache cleared');
  }

  // Initialize default configurations for supported years
  async initializeDefaultConfigurations(): Promise<void> {
    const configurations = [
      this.getTaxYear2024Configuration(),
      this.getTaxYear2023Configuration()
    ];

    for (const config of configurations) {
      await this.updateTaxLawConfiguration(config);
    }
  }

  private getTaxYear2024Configuration(): TaxLawConfiguration {
    return {
      taxYear: 2024,
      standardDeductions: {
        [FilingStatus.SINGLE]: 14600,
        [FilingStatus.MARRIED_FILING_JOINTLY]: 29200,
        [FilingStatus.MARRIED_FILING_SEPARATELY]: 14600,
        [FilingStatus.HEAD_OF_HOUSEHOLD]: 21900,
        [FilingStatus.QUALIFYING_WIDOW]: 29200
      },
      taxBrackets: {
        [FilingStatus.SINGLE]: [
          { min: 0, max: 11000, rate: 0.10 },
          { min: 11000, max: 44725, rate: 0.12 },
          { min: 44725, max: 95375, rate: 0.22 },
          { min: 95375, max: 197050, rate: 0.24 },
          { min: 197050, max: 250525, rate: 0.32 },
          { min: 250525, max: 626350, rate: 0.35 },
          { min: 626350, max: 999999999, rate: 0.37 }
        ],
        [FilingStatus.MARRIED_FILING_JOINTLY]: [
          { min: 0, max: 22000, rate: 0.10 },
          { min: 22000, max: 89450, rate: 0.12 },
          { min: 89450, max: 190750, rate: 0.22 },
          { min: 190750, max: 364200, rate: 0.24 },
          { min: 364200, max: 462500, rate: 0.32 },
          { min: 462500, max: 693750, rate: 0.35 },
          { min: 693750, max: 999999999, rate: 0.37 }
        ],
        [FilingStatus.MARRIED_FILING_SEPARATELY]: [
          { min: 0, max: 11000, rate: 0.10 },
          { min: 11000, max: 44725, rate: 0.12 },
          { min: 44725, max: 95375, rate: 0.22 },
          { min: 95375, max: 182050, rate: 0.24 },
          { min: 182050, max: 231250, rate: 0.32 },
          { min: 231250, max: 346875, rate: 0.35 },
          { min: 346875, max: 999999999, rate: 0.37 }
        ],
        [FilingStatus.HEAD_OF_HOUSEHOLD]: [
          { min: 0, max: 15700, rate: 0.10 },
          { min: 15700, max: 59850, rate: 0.12 },
          { min: 59850, max: 95350, rate: 0.22 },
          { min: 95350, max: 182050, rate: 0.24 },
          { min: 182050, max: 231250, rate: 0.32 },
          { min: 231250, max: 609350, rate: 0.35 },
          { min: 609350, max: 999999999, rate: 0.37 }
        ],
        [FilingStatus.QUALIFYING_WIDOW]: [
          { min: 0, max: 22000, rate: 0.10 },
          { min: 22000, max: 89450, rate: 0.12 },
          { min: 89450, max: 190750, rate: 0.22 },
          { min: 190750, max: 364200, rate: 0.24 },
          { min: 364200, max: 462500, rate: 0.32 },
          { min: 462500, max: 693750, rate: 0.35 },
          { min: 693750, max: 999999999, rate: 0.37 }
        ]
      },
      socialSecurityWageBase: 168600,
      socialSecurityRate: 0.062,
      medicareRate: 0.0145,
      additionalMedicareRate: 0.009,
      additionalMedicareThreshold: {
        [FilingStatus.SINGLE]: 200000,
        [FilingStatus.MARRIED_FILING_JOINTLY]: 250000,
        [FilingStatus.MARRIED_FILING_SEPARATELY]: 125000,
        [FilingStatus.HEAD_OF_HOUSEHOLD]: 200000,
        [FilingStatus.QUALIFYING_WIDOW]: 250000
      },
      personalExemption: 0, // Suspended for 2018-2025
      childTaxCreditAmount: 2000,
      childTaxCreditPhaseoutThreshold: {
        [FilingStatus.SINGLE]: 200000,
        [FilingStatus.MARRIED_FILING_JOINTLY]: 400000,
        [FilingStatus.MARRIED_FILING_SEPARATELY]: 200000,
        [FilingStatus.HEAD_OF_HOUSEHOLD]: 200000,
        [FilingStatus.QUALIFYING_WIDOW]: 400000
      }
    };
  }

  private getTaxYear2023Configuration(): TaxLawConfiguration {
    return {
      taxYear: 2023,
      standardDeductions: {
        [FilingStatus.SINGLE]: 13850,
        [FilingStatus.MARRIED_FILING_JOINTLY]: 27700,
        [FilingStatus.MARRIED_FILING_SEPARATELY]: 13850,
        [FilingStatus.HEAD_OF_HOUSEHOLD]: 20800,
        [FilingStatus.QUALIFYING_WIDOW]: 27700
      },
      taxBrackets: {
        [FilingStatus.SINGLE]: [
          { min: 0, max: 11000, rate: 0.10 },
          { min: 11000, max: 44725, rate: 0.12 },
          { min: 44725, max: 95375, rate: 0.22 },
          { min: 95375, max: 182050, rate: 0.24 },
          { min: 182050, max: 231250, rate: 0.32 },
          { min: 231250, max: 578125, rate: 0.35 },
          { min: 578125, max: 999999999, rate: 0.37 }
        ],
        [FilingStatus.MARRIED_FILING_JOINTLY]: [
          { min: 0, max: 22000, rate: 0.10 },
          { min: 22000, max: 89450, rate: 0.12 },
          { min: 89450, max: 190750, rate: 0.22 },
          { min: 190750, max: 364200, rate: 0.24 },
          { min: 364200, max: 462500, rate: 0.32 },
          { min: 462500, max: 693750, rate: 0.35 },
          { min: 693750, max: 999999999, rate: 0.37 }
        ],
        [FilingStatus.MARRIED_FILING_SEPARATELY]: [
          { min: 0, max: 11000, rate: 0.10 },
          { min: 11000, max: 44725, rate: 0.12 },
          { min: 44725, max: 95375, rate: 0.22 },
          { min: 95375, max: 182100, rate: 0.24 },
          { min: 182100, max: 231250, rate: 0.32 },
          { min: 231250, max: 346875, rate: 0.35 },
          { min: 346875, max: 999999999, rate: 0.37 }
        ],
        [FilingStatus.HEAD_OF_HOUSEHOLD]: [
          { min: 0, max: 15700, rate: 0.10 },
          { min: 15700, max: 59850, rate: 0.12 },
          { min: 59850, max: 95350, rate: 0.22 },
          { min: 95350, max: 182050, rate: 0.24 },
          { min: 182050, max: 231250, rate: 0.32 },
          { min: 231250, max: 578100, rate: 0.35 },
          { min: 578100, max: 999999999, rate: 0.37 }
        ],
        [FilingStatus.QUALIFYING_WIDOW]: [
          { min: 0, max: 22000, rate: 0.10 },
          { min: 22000, max: 89450, rate: 0.12 },
          { min: 89450, max: 190750, rate: 0.22 },
          { min: 190750, max: 364200, rate: 0.24 },
          { min: 364200, max: 462500, rate: 0.32 },
          { min: 462500, max: 693750, rate: 0.35 },
          { min: 693750, max: 999999999, rate: 0.37 }
        ]
      },
      socialSecurityWageBase: 160200,
      socialSecurityRate: 0.062,
      medicareRate: 0.0145,
      additionalMedicareRate: 0.009,
      additionalMedicareThreshold: {
        [FilingStatus.SINGLE]: 200000,
        [FilingStatus.MARRIED_FILING_JOINTLY]: 250000,
        [FilingStatus.MARRIED_FILING_SEPARATELY]: 125000,
        [FilingStatus.HEAD_OF_HOUSEHOLD]: 200000,
        [FilingStatus.QUALIFYING_WIDOW]: 250000
      },
      personalExemption: 0,
      childTaxCreditAmount: 2000,
      childTaxCreditPhaseoutThreshold: {
        [FilingStatus.SINGLE]: 200000,
        [FilingStatus.MARRIED_FILING_JOINTLY]: 400000,
        [FilingStatus.MARRIED_FILING_SEPARATELY]: 200000,
        [FilingStatus.HEAD_OF_HOUSEHOLD]: 200000,
        [FilingStatus.QUALIFYING_WIDOW]: 400000
      }
    };
  }
}