import Decimal from 'decimal.js';
import { 
  TaxReturn, 
  TaxCalculation, 
  TaxBracket, 
  TaxLawConfiguration,
  FilingStatus,
  IncomeData,
  DeductionData,
  CreditData,
  Logger,
  ApiResponse,
  ErrorCodes
} from '@tax-app/shared';
import { TaxLawService } from './TaxLawService';

const logger = new Logger('tax-calculation-service');

export class TaxCalculationService {
  private taxLawService: TaxLawService;

  constructor(taxLawService: TaxLawService) {
    this.taxLawService = taxLawService;
  }

  async calculateTax(taxReturn: TaxReturn): Promise<ApiResponse<TaxCalculation>> {
    try {
      logger.info('Starting tax calculation', { 
        taxReturnId: taxReturn.id, 
        taxYear: taxReturn.taxYear,
        filingStatus: taxReturn.filingStatus 
      });

      // Get tax law configuration for the year
      const taxLawConfig = await this.taxLawService.getTaxLawConfiguration(taxReturn.taxYear);
      if (!taxLawConfig) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: `Tax law configuration not found for year ${taxReturn.taxYear}`
          }
        };
      }

      // Calculate step by step
      const grossIncome = this.calculateGrossIncome(taxReturn.income);
      const adjustedGrossIncome = this.calculateAdjustedGrossIncome(grossIncome, taxReturn.deductions);
      const taxableIncome = this.calculateTaxableIncome(adjustedGrossIncome, taxReturn.deductions, taxLawConfig, taxReturn.filingStatus);
      const federalTaxBeforeCredits = this.calculateFederalTax(taxableIncome, taxLawConfig, taxReturn.filingStatus);
      const totalCredits = this.calculateTotalCredits(taxReturn.credits, adjustedGrossIncome, taxLawConfig, taxReturn.filingStatus);
      const federalTaxAfterCredits = Math.max(0, federalTaxBeforeCredits - totalCredits);
      const selfEmploymentTax = this.calculateSelfEmploymentTax(taxReturn.income, taxLawConfig);
      const totalTaxLiability = federalTaxAfterCredits + selfEmploymentTax;
      const totalWithholding = this.calculateTotalWithholding(taxReturn.income);
      const estimatedPayments = 0; // TODO: Implement estimated payments
      
      let refundAmount = 0;
      let amountOwed = 0;
      
      if (totalWithholding + estimatedPayments > totalTaxLiability) {
        refundAmount = totalWithholding + estimatedPayments - totalTaxLiability;
      } else {
        amountOwed = totalTaxLiability - totalWithholding - estimatedPayments;
      }

      const effectiveTaxRate = adjustedGrossIncome > 0 ? (totalTaxLiability / adjustedGrossIncome) : 0;
      const marginalTaxRate = this.calculateMarginalTaxRate(taxableIncome, taxLawConfig, taxReturn.filingStatus);

      const calculation: TaxCalculation = {
        grossIncome: this.roundToTwoDec(grossIncome),
        adjustedGrossIncome: this.roundToTwoDec(adjustedGrossIncome),
        taxableIncome: this.roundToTwoDec(taxableIncome),
        federalTaxBeforeCredits: this.roundToTwoDec(federalTaxBeforeCredits),
        totalCredits: this.roundToTwoDec(totalCredits),
        federalTaxAfterCredits: this.roundToTwoDec(federalTaxAfterCredits),
        selfEmploymentTax: this.roundToTwoDec(selfEmploymentTax),
        totalTaxLiability: this.roundToTwoDec(totalTaxLiability),
        totalWithholding: this.roundToTwoDec(totalWithholding),
        estimatedPayments: this.roundToTwoDec(estimatedPayments),
        refundAmount: this.roundToTwoDec(refundAmount),
        amountOwed: this.roundToTwoDec(amountOwed),
        effectiveTaxRate: this.roundToFourDec(effectiveTaxRate),
        marginalTaxRate: this.roundToFourDec(marginalTaxRate)
      };

      logger.info('Tax calculation completed', { 
        taxReturnId: taxReturn.id,
        totalTaxLiability: calculation.totalTaxLiability,
        refundAmount: calculation.refundAmount,
        amountOwed: calculation.amountOwed
      });

      return {
        success: true,
        data: calculation,
        message: 'Tax calculation completed successfully'
      };

    } catch (error) {
      logger.error('Tax calculation failed', { 
        error: error.message, 
        taxReturnId: taxReturn.id 
      });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Tax calculation failed due to internal error'
        }
      };
    }
  }

  private calculateGrossIncome(income: IncomeData): number {
    let total = 0;

    // Wage income
    total += income.wages.reduce((sum, wage) => sum + wage.wages, 0);

    // Self-employment income
    total += income.selfEmployment.reduce((sum, se) => sum + se.netProfit, 0);

    // Investment income
    total += income.investment.reduce((sum, inv) => sum + inv.taxableAmount, 0);

    // Retirement income
    total += income.retirement.reduce((sum, ret) => sum + ret.taxableAmount, 0);

    // Other taxable income
    total += income.other
      .filter(other => other.taxable)
      .reduce((sum, other) => sum + other.amount, 0);

    return total;
  }

  private calculateAdjustedGrossIncome(grossIncome: number, deductions: DeductionData): number {
    // Subtract above-the-line deductions (adjustments to income)
    const adjustments = deductions.adjustments.reduce((sum, adj) => sum + adj.amount, 0);
    return Math.max(0, grossIncome - adjustments);
  }

  private calculateTaxableIncome(
    adjustedGrossIncome: number, 
    deductions: DeductionData, 
    taxLawConfig: TaxLawConfiguration,
    filingStatus: FilingStatus
  ): number {
    const standardDeduction = taxLawConfig.standardDeductions[filingStatus];
    const itemizedDeductions = deductions.totalItemizedDeductions;
    
    // Use the higher of standard or itemized deductions
    const deductionAmount = Math.max(standardDeduction, itemizedDeductions);
    
    return Math.max(0, adjustedGrossIncome - deductionAmount);
  }

  private calculateFederalTax(
    taxableIncome: number, 
    taxLawConfig: TaxLawConfiguration,
    filingStatus: FilingStatus
  ): number {
    const brackets = taxLawConfig.taxBrackets[filingStatus];
    let tax = 0;
    let remainingIncome = taxableIncome;

    for (const bracket of brackets) {
      if (remainingIncome <= 0) break;

      const taxableAtThisBracket = Math.min(remainingIncome, bracket.max - bracket.min);
      tax += taxableAtThisBracket * bracket.rate;
      remainingIncome -= taxableAtThisBracket;

      if (remainingIncome <= 0) break;
    }

    return tax;
  }

  private calculateMarginalTaxRate(
    taxableIncome: number,
    taxLawConfig: TaxLawConfiguration,
    filingStatus: FilingStatus
  ): number {
    const brackets = taxLawConfig.taxBrackets[filingStatus];
    
    for (const bracket of brackets) {
      if (taxableIncome >= bracket.min && taxableIncome < bracket.max) {
        return bracket.rate;
      }
    }

    // If income exceeds all brackets, return the highest rate
    return brackets[brackets.length - 1].rate;
  }

  private calculateTotalCredits(
    credits: CreditData,
    adjustedGrossIncome: number,
    taxLawConfig: TaxLawConfiguration,
    filingStatus: FilingStatus
  ): number {
    let totalCredits = 0;

    // Child Tax Credit (with phase-out)
    const childTaxCredit = this.calculateChildTaxCredit(
      credits.childTaxCredit,
      adjustedGrossIncome,
      taxLawConfig,
      filingStatus
    );
    totalCredits += childTaxCredit;

    // Other credits (no phase-out calculation for now)
    totalCredits += credits.earnedIncomeCredit;
    totalCredits += credits.educationCredits;
    totalCredits += credits.retirementSavingsCredit;
    totalCredits += credits.otherCredits.reduce((sum, credit) => sum + credit.amount, 0);

    return totalCredits;
  }

  private calculateChildTaxCredit(
    baseCredit: number,
    adjustedGrossIncome: number,
    taxLawConfig: TaxLawConfiguration,
    filingStatus: FilingStatus
  ): number {
    if (baseCredit === 0) return 0;

    const phaseoutThreshold = taxLawConfig.childTaxCreditPhaseoutThreshold[filingStatus];
    
    if (adjustedGrossIncome <= phaseoutThreshold) {
      return baseCredit;
    }

    // Phase out $50 for every $1,000 over threshold
    const excessIncome = adjustedGrossIncome - phaseoutThreshold;
    const phaseoutAmount = Math.ceil(excessIncome / 1000) * 50;
    
    return Math.max(0, baseCredit - phaseoutAmount);
  }

  private calculateSelfEmploymentTax(income: IncomeData, taxLawConfig: TaxLawConfiguration): number {
    const selfEmploymentIncome = income.selfEmployment.reduce((sum, se) => sum + se.netProfit, 0);
    
    if (selfEmploymentIncome <= 400) {
      return 0; // No SE tax if net earnings are $400 or less
    }

    // Calculate SE tax on 92.35% of net earnings
    const seIncomeForTax = selfEmploymentIncome * 0.9235;
    
    // Social Security tax (up to wage base)
    const socialSecurityTax = Math.min(seIncomeForTax, taxLawConfig.socialSecurityWageBase) * taxLawConfig.socialSecurityRate * 2;
    
    // Medicare tax (no limit)
    const medicareTax = seIncomeForTax * taxLawConfig.medicareRate * 2;
    
    // Additional Medicare tax (if applicable)
    let additionalMedicareTax = 0;
    // Note: Additional Medicare tax calculation would need filing status-specific thresholds
    
    return socialSecurityTax + medicareTax + additionalMedicareTax;
  }

  private calculateTotalWithholding(income: IncomeData): number {
    let totalWithholding = 0;

    // Federal tax withheld from wages
    totalWithholding += income.wages.reduce((sum, wage) => sum + wage.federalTaxWithheld, 0);

    // Federal tax withheld from retirement distributions
    totalWithholding += income.retirement.reduce((sum, ret) => sum + ret.federalTaxWithheld, 0);

    return totalWithholding;
  }

  async calculateStandardDeduction(taxYear: number, filingStatus: FilingStatus): Promise<number> {
    const taxLawConfig = await this.taxLawService.getTaxLawConfiguration(taxYear);
    return taxLawConfig?.standardDeductions[filingStatus] || 0;
  }

  async calculateItemizedVsStandard(
    taxYear: number,
    filingStatus: FilingStatus,
    itemizedDeductions: number
  ): Promise<{ useItemized: boolean; deductionAmount: number; savings: number }> {
    const standardDeduction = await this.calculateStandardDeduction(taxYear, filingStatus);
    const useItemized = itemizedDeductions > standardDeduction;
    const deductionAmount = useItemized ? itemizedDeductions : standardDeduction;
    const savings = useItemized ? itemizedDeductions - standardDeduction : 0;

    return {
      useItemized,
      deductionAmount,
      savings
    };
  }

  private roundToTwoDec(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundToFourDec(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}