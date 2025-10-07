import { 
  DeductionRecommendation,
  ItemizedDeductionCategory,
  BusinessDeductionCategory,
  IncomeData,
  DeductionData,
  TaxReturn,
  FilingStatus,
  Logger,
  ApiResponse,
  ErrorCodes
} from '@tax-app/shared';
import { TaxCalculationService } from './TaxCalculationService';
import { TaxLawService } from './TaxLawService';

const logger = new Logger('deduction-optimization-service');

export class DeductionOptimizationService {
  private taxCalculationService: TaxCalculationService;
  private taxLawService: TaxLawService;

  constructor(taxCalculationService: TaxCalculationService, taxLawService: TaxLawService) {
    this.taxCalculationService = taxCalculationService;
    this.taxLawService = taxLawService;
  }

  async optimizeDeductions(taxReturn: TaxReturn): Promise<ApiResponse<{
    recommendations: DeductionRecommendation[];
    standardVsItemized: {
      useItemized: boolean;
      standardAmount: number;
      itemizedAmount: number;
      savings: number;
    };
    potentialSavings: number;
  }>> {
    try {
      logger.info('Starting deduction optimization', { taxReturnId: taxReturn.id });

      // Get all deduction recommendations
      const recommendations = await this.generateDeductionRecommendations(taxReturn);
      
      // Calculate standard vs itemized comparison
      const standardVsItemized = await this.taxCalculationService.calculateItemizedVsStandard(
        taxReturn.taxYear,
        taxReturn.filingStatus,
        taxReturn.deductions.totalItemizedDeductions
      );

      // Calculate total potential savings
      const potentialSavings = recommendations.reduce((sum, rec) => sum + rec.potentialSavings, 0);

      logger.info('Deduction optimization completed', { 
        taxReturnId: taxReturn.id,
        recommendationsCount: recommendations.length,
        potentialSavings
      });

      return {
        success: true,
        data: {
          recommendations,
          standardVsItemized: {
            useItemized: standardVsItemized.useItemized,
            standardAmount: await this.taxCalculationService.calculateStandardDeduction(
              taxReturn.taxYear, 
              taxReturn.filingStatus
            ),
            itemizedAmount: taxReturn.deductions.totalItemizedDeductions,
            savings: standardVsItemized.savings
          },
          potentialSavings
        },
        message: 'Deduction optimization completed successfully'
      };

    } catch (error) {
      logger.error('Deduction optimization failed', { 
        error: error.message, 
        taxReturnId: taxReturn.id 
      });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Deduction optimization failed due to internal error'
        }
      };
    }
  }

  private async generateDeductionRecommendations(taxReturn: TaxReturn): Promise<DeductionRecommendation[]> {
    const recommendations: DeductionRecommendation[] = [];

    // Medical and dental deductions
    recommendations.push(...await this.analyzeMedicalDeductions(taxReturn));

    // State and local tax deductions
    recommendations.push(...await this.analyzeStateLocalTaxDeductions(taxReturn));

    // Mortgage interest deductions
    recommendations.push(...await this.analyzeMortgageInterestDeductions(taxReturn));

    // Charitable contribution deductions
    recommendations.push(...await this.analyzeCharitableDeductions(taxReturn));

    // Business deductions for self-employed
    recommendations.push(...await this.analyzeBusinessDeductions(taxReturn));

    // Education-related deductions
    recommendations.push(...await this.analyzeEducationDeductions(taxReturn));

    // Retirement contribution deductions
    recommendations.push(...await this.analyzeRetirementDeductions(taxReturn));

    // Sort by potential savings (highest first)
    return recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }

  private async analyzeMedicalDeductions(taxReturn: TaxReturn): Promise<DeductionRecommendation[]> {
    const recommendations: DeductionRecommendation[] = [];
    const adjustedGrossIncome = taxReturn.calculations.adjustedGrossIncome;
    const medicalThreshold = adjustedGrossIncome * 0.075; // 7.5% AGI threshold

    // Check current medical deductions
    const currentMedicalDeductions = taxReturn.deductions.itemizedDeductions
      .filter(d => d.category === ItemizedDeductionCategory.MEDICAL_DENTAL)
      .reduce((sum, d) => sum + d.amount, 0);

    if (currentMedicalDeductions < medicalThreshold) {
      const neededAmount = medicalThreshold - currentMedicalDeductions + 1;
      
      recommendations.push({
        category: ItemizedDeductionCategory.MEDICAL_DENTAL,
        description: `You need $${neededAmount.toFixed(2)} more in medical expenses to exceed the 7.5% AGI threshold ($${medicalThreshold.toFixed(2)})`,
        estimatedAmount: neededAmount,
        confidence: 0.8,
        requiredDocuments: ['Medical bills', 'Insurance statements', 'Prescription receipts'],
        potentialSavings: this.calculateTaxSavings(neededAmount, taxReturn.calculations.marginalTaxRate)
      });
    }

    // Suggest common overlooked medical deductions
    if (adjustedGrossIncome > 50000) {
      recommendations.push({
        category: ItemizedDeductionCategory.MEDICAL_DENTAL,
        description: 'Consider deducting health insurance premiums if self-employed or not covered by employer',
        estimatedAmount: 6000,
        confidence: 0.6,
        requiredDocuments: ['Health insurance premium statements'],
        potentialSavings: this.calculateTaxSavings(6000, taxReturn.calculations.marginalTaxRate)
      });
    }

    return recommendations;
  }

  private async analyzeStateLocalTaxDeductions(taxReturn: TaxReturn): Promise<DeductionRecommendation[]> {
    const recommendations: DeductionRecommendation[] = [];
    const saltCap = 10000; // SALT deduction cap

    const currentSALT = taxReturn.deductions.itemizedDeductions
      .filter(d => d.category === ItemizedDeductionCategory.STATE_LOCAL_TAXES)
      .reduce((sum, d) => sum + d.amount, 0);

    if (currentSALT < saltCap) {
      const remainingCapacity = saltCap - currentSALT;
      
      recommendations.push({
        category: ItemizedDeductionCategory.STATE_LOCAL_TAXES,
        description: `You can deduct up to $${remainingCapacity.toFixed(2)} more in state and local taxes (property taxes, state income taxes)`,
        estimatedAmount: Math.min(remainingCapacity, 3000),
        confidence: 0.7,
        requiredDocuments: ['Property tax statements', 'State tax returns', 'Vehicle registration fees'],
        potentialSavings: this.calculateTaxSavings(Math.min(remainingCapacity, 3000), taxReturn.calculations.marginalTaxRate)
      });
    }

    return recommendations;
  }

  private async analyzeMortgageInterestDeductions(taxReturn: TaxReturn): Promise<DeductionRecommendation[]> {
    const recommendations: DeductionRecommendation[] = [];

    // Check if they have mortgage interest deductions
    const hasMortgageInterest = taxReturn.deductions.itemizedDeductions
      .some(d => d.category === ItemizedDeductionCategory.MORTGAGE_INTEREST);

    if (!hasMortgageInterest && taxReturn.calculations.adjustedGrossIncome > 40000) {
      recommendations.push({
        category: ItemizedDeductionCategory.MORTGAGE_INTEREST,
        description: 'If you have a mortgage, you may be able to deduct mortgage interest payments',
        estimatedAmount: 8000,
        confidence: 0.5,
        requiredDocuments: ['Form 1098 from mortgage lender', 'Mortgage statements'],
        potentialSavings: this.calculateTaxSavings(8000, taxReturn.calculations.marginalTaxRate)
      });
    }

    return recommendations;
  }

  private async analyzeCharitableDeductions(taxReturn: TaxReturn): Promise<DeductionRecommendation[]> {
    const recommendations: DeductionRecommendation[] = [];
    const adjustedGrossIncome = taxReturn.calculations.adjustedGrossIncome;

    const currentCharitable = taxReturn.deductions.itemizedDeductions
      .filter(d => d.category === ItemizedDeductionCategory.CHARITABLE_CONTRIBUTIONS)
      .reduce((sum, d) => sum + d.amount, 0);

    // Suggest charitable giving if they have capacity
    const suggestedCharitableAmount = Math.min(adjustedGrossIncome * 0.02, 2000); // 2% of AGI or $2000, whichever is less
    
    if (currentCharitable < suggestedCharitableAmount) {
      const additionalAmount = suggestedCharitableAmount - currentCharitable;
      
      recommendations.push({
        category: ItemizedDeductionCategory.CHARITABLE_CONTRIBUTIONS,
        description: `Consider charitable contributions. You could potentially deduct up to $${additionalAmount.toFixed(2)} more`,
        estimatedAmount: additionalAmount,
        confidence: 0.4,
        requiredDocuments: ['Donation receipts', 'Acknowledgment letters from charities'],
        potentialSavings: this.calculateTaxSavings(additionalAmount, taxReturn.calculations.marginalTaxRate)
      });
    }

    return recommendations;
  }

  private async analyzeBusinessDeductions(taxReturn: TaxReturn): Promise<DeductionRecommendation[]> {
    const recommendations: DeductionRecommendation[] = [];

    // Check if they have self-employment income
    const hasSelfEmployment = taxReturn.income.selfEmployment.length > 0;

    if (hasSelfEmployment) {
      const businessRecommendations = [
        {
          category: BusinessDeductionCategory.OFFICE_EXPENSES,
          description: 'Home office expenses if you use part of your home exclusively for business',
          estimatedAmount: 1200,
          confidence: 0.6,
          requiredDocuments: ['Home office measurements', 'Utility bills', 'Rent/mortgage statements'],
          potentialSavings: this.calculateTaxSavings(1200, taxReturn.calculations.marginalTaxRate)
        },
        {
          category: BusinessDeductionCategory.VEHICLE,
          description: 'Business use of vehicle - mileage or actual expenses',
          estimatedAmount: 2000,
          confidence: 0.7,
          requiredDocuments: ['Mileage log', 'Vehicle expense receipts'],
          potentialSavings: this.calculateTaxSavings(2000, taxReturn.calculations.marginalTaxRate)
        },
        {
          category: BusinessDeductionCategory.PROFESSIONAL_SERVICES,
          description: 'Professional development, training, and business-related education',
          estimatedAmount: 800,
          confidence: 0.5,
          requiredDocuments: ['Training receipts', 'Professional membership fees'],
          potentialSavings: this.calculateTaxSavings(800, taxReturn.calculations.marginalTaxRate)
        }
      ];

      recommendations.push(...businessRecommendations);
    }

    return recommendations;
  }

  private async analyzeEducationDeductions(taxReturn: TaxReturn): Promise<DeductionRecommendation[]> {
    const recommendations: DeductionRecommendation[] = [];
    const adjustedGrossIncome = taxReturn.calculations.adjustedGrossIncome;

    // Student loan interest deduction (up to $2,500)
    if (adjustedGrossIncome < 85000) { // Phase-out begins at $70,000 for single filers
      recommendations.push({
        category: ItemizedDeductionCategory.MISCELLANEOUS,
        description: 'Student loan interest payments (up to $2,500 per year)',
        estimatedAmount: 1500,
        confidence: 0.4,
        requiredDocuments: ['Form 1098-E from loan servicer'],
        potentialSavings: this.calculateTaxSavings(1500, taxReturn.calculations.marginalTaxRate)
      });
    }

    // Tuition and fees deduction
    if (adjustedGrossIncome < 80000) {
      recommendations.push({
        category: ItemizedDeductionCategory.MISCELLANEOUS,
        description: 'Tuition and fees for higher education',
        estimatedAmount: 4000,
        confidence: 0.3,
        requiredDocuments: ['Form 1098-T from educational institution', 'Tuition receipts'],
        potentialSavings: this.calculateTaxSavings(4000, taxReturn.calculations.marginalTaxRate)
      });
    }

    return recommendations;
  }

  private async analyzeRetirementDeductions(taxReturn: TaxReturn): Promise<DeductionRecommendation[]> {
    const recommendations: DeductionRecommendation[] = [];
    const adjustedGrossIncome = taxReturn.calculations.adjustedGrossIncome;

    // Traditional IRA contribution
    const iraContributionLimit = 6500; // 2024 limit for under 50
    
    recommendations.push({
      category: ItemizedDeductionCategory.MISCELLANEOUS,
      description: `Traditional IRA contribution (up to $${iraContributionLimit} for 2024)`,
      estimatedAmount: iraContributionLimit,
      confidence: 0.8,
      requiredDocuments: ['IRA contribution statements'],
      potentialSavings: this.calculateTaxSavings(iraContributionLimit, taxReturn.calculations.marginalTaxRate)
    });

    // HSA contribution if eligible
    if (adjustedGrossIncome < 100000) {
      recommendations.push({
        category: ItemizedDeductionCategory.MISCELLANEOUS,
        description: 'Health Savings Account (HSA) contribution if you have a high-deductible health plan',
        estimatedAmount: 4150, // 2024 individual limit
        confidence: 0.5,
        requiredDocuments: ['HSA contribution statements', 'High-deductible health plan documentation'],
        potentialSavings: this.calculateTaxSavings(4150, taxReturn.calculations.marginalTaxRate)
      });
    }

    return recommendations;
  }

  private calculateTaxSavings(deductionAmount: number, marginalTaxRate: number): number {
    return deductionAmount * marginalTaxRate;
  }

  async analyzeDeductionStrategy(
    taxReturn: TaxReturn,
    proposedDeductions: { category: string; amount: number }[]
  ): Promise<{
    currentTax: number;
    newTax: number;
    savings: number;
    recommendation: 'itemize' | 'standard';
  }> {
    // Calculate current tax
    const currentCalculation = await this.taxCalculationService.calculateTax(taxReturn);
    const currentTax = currentCalculation.data?.totalTaxLiability || 0;

    // Create a modified tax return with proposed deductions
    const modifiedTaxReturn = { ...taxReturn };
    modifiedTaxReturn.deductions = { ...taxReturn.deductions };
    
    // Add proposed deductions
    const additionalItemizedAmount = proposedDeductions.reduce((sum, d) => sum + d.amount, 0);
    modifiedTaxReturn.deductions.totalItemizedDeductions += additionalItemizedAmount;

    // Recalculate tax
    const newCalculation = await this.taxCalculationService.calculateTax(modifiedTaxReturn);
    const newTax = newCalculation.data?.totalTaxLiability || 0;

    const savings = currentTax - newTax;
    
    // Determine recommendation
    const standardDeduction = await this.taxCalculationService.calculateStandardDeduction(
      taxReturn.taxYear,
      taxReturn.filingStatus
    );
    
    const recommendation = modifiedTaxReturn.deductions.totalItemizedDeductions > standardDeduction 
      ? 'itemize' 
      : 'standard';

    return {
      currentTax,
      newTax,
      savings,
      recommendation
    };
  }
}