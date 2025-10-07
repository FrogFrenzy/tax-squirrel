import { Request, Response } from 'express';
import { TaxCalculationService } from '../services/TaxCalculationService';
import { DeductionOptimizationService } from '../services/DeductionOptimizationService';
import { TaxReturnModel } from '../models/TaxReturn';
import { 
  Logger,
  FilingStatus,
  taxReturnSchema,
  validateTaxYear
} from '@tax-app/shared';

const logger = new Logger('tax-controller');

interface AuthenticatedRequest extends Request {
  userId?: string;
}

export class TaxController {
  private taxCalculationService: TaxCalculationService;
  private deductionOptimizationService: DeductionOptimizationService;
  private taxReturnModel: TaxReturnModel;

  constructor(
    taxCalculationService: TaxCalculationService,
    deductionOptimizationService: DeductionOptimizationService,
    taxReturnModel: TaxReturnModel
  ) {
    this.taxCalculationService = taxCalculationService;
    this.deductionOptimizationService = deductionOptimizationService;
    this.taxReturnModel = taxReturnModel;
  }

  // POST /tax/returns
  createTaxReturn = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { taxYear, filingStatus } = req.body;

      // Validate input
      const yearValidation = validateTaxYear(taxYear);
      if (!yearValidation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid tax year',
            details: yearValidation.errors
          }
        });
        return;
      }

      if (!Object.values(FilingStatus).includes(filingStatus)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid filing status'
          }
        });
        return;
      }

      const taxReturn = await this.taxReturnModel.createTaxReturn(userId, taxYear, filingStatus);

      res.status(201).json({
        success: true,
        data: taxReturn,
        message: 'Tax return created successfully'
      });

    } catch (error) {
      logger.error('Create tax return failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create tax return'
        }
      });
    }
  };

  // GET /tax/returns
  getTaxReturns = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const taxReturns = await this.taxReturnModel.getTaxReturnsByUser(userId);

      res.json({
        success: true,
        data: taxReturns
      });

    } catch (error) {
      logger.error('Get tax returns failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve tax returns'
        }
      });
    }
  };

  // GET /tax/returns/:id
  getTaxReturn = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const taxReturn = await this.taxReturnModel.getTaxReturnById(id);

      if (!taxReturn) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Tax return not found'
          }
        });
        return;
      }

      // Verify ownership
      if (taxReturn.userId !== req.userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: taxReturn
      });

    } catch (error) {
      logger.error('Get tax return failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve tax return'
        }
      });
    }
  };

  // POST /tax/returns/:id/calculate
  calculateTax = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const taxReturn = await this.taxReturnModel.getTaxReturnById(id);

      if (!taxReturn) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Tax return not found'
          }
        });
        return;
      }

      // Verify ownership
      if (taxReturn.userId !== req.userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied'
          }
        });
        return;
      }

      const result = await this.taxCalculationService.calculateTax(taxReturn);

      if (result.success && result.data) {
        // Update the tax return with new calculations
        await this.taxReturnModel.updateTaxCalculations(id, result.data);
      }

      res.json(result);

    } catch (error) {
      logger.error('Tax calculation failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Tax calculation failed'
        }
      });
    }
  };

  // POST /tax/returns/:id/optimize-deductions
  optimizeDeductions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const taxReturn = await this.taxReturnModel.getTaxReturnById(id);

      if (!taxReturn) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Tax return not found'
          }
        });
        return;
      }

      // Verify ownership
      if (taxReturn.userId !== req.userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied'
          }
        });
        return;
      }

      const result = await this.deductionOptimizationService.optimizeDeductions(taxReturn);
      res.json(result);

    } catch (error) {
      logger.error('Deduction optimization failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Deduction optimization failed'
        }
      });
    }
  };

  // POST /tax/returns/:id/income/wages
  addWageIncome = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const wageData = req.body;

      // Validate wage data
      // TODO: Add proper validation schema

      const wageId = await this.taxReturnModel.addWageIncome(id, wageData);

      res.status(201).json({
        success: true,
        data: { id: wageId },
        message: 'Wage income added successfully'
      });

    } catch (error) {
      logger.error('Add wage income failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to add wage income'
        }
      });
    }
  };

  // POST /tax/returns/:id/deductions/itemized
  addItemizedDeduction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const deductionData = req.body;

      // Validate deduction data
      // TODO: Add proper validation schema

      const deductionId = await this.taxReturnModel.addItemizedDeduction(id, deductionData);

      res.status(201).json({
        success: true,
        data: { id: deductionId },
        message: 'Itemized deduction added successfully'
      });

    } catch (error) {
      logger.error('Add itemized deduction failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to add itemized deduction'
        }
      });
    }
  };

  // GET /tax/standard-deduction/:year/:filingStatus
  getStandardDeduction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { year, filingStatus } = req.params;
      const taxYear = parseInt(year);

      const yearValidation = validateTaxYear(taxYear);
      if (!yearValidation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid tax year',
            details: yearValidation.errors
          }
        });
        return;
      }

      if (!Object.values(FilingStatus).includes(filingStatus as FilingStatus)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid filing status'
          }
        });
        return;
      }

      const standardDeduction = await this.taxCalculationService.calculateStandardDeduction(
        taxYear,
        filingStatus as FilingStatus
      );

      res.json({
        success: true,
        data: {
          taxYear,
          filingStatus,
          standardDeduction
        }
      });

    } catch (error) {
      logger.error('Get standard deduction failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get standard deduction'
        }
      });
    }
  };

  // GET /tax/health
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          service: 'tax-engine',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      });
    } catch (error) {
      logger.error('Health check error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Service unhealthy'
        }
      });
    }
  };
}