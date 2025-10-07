import { Router } from 'express';
import { TaxController } from '../controllers/TaxController';

export function createTaxRoutes(taxController: TaxController): Router {
  const router = Router();

  // Public routes
  router.get('/health', taxController.healthCheck);
  router.get('/standard-deduction/:year/:filingStatus', taxController.getStandardDeduction);

  // Protected routes (authentication middleware will be applied in main app)
  router.post('/returns', taxController.createTaxReturn);
  router.get('/returns', taxController.getTaxReturns);
  router.get('/returns/:id', taxController.getTaxReturn);
  router.post('/returns/:id/calculate', taxController.calculateTax);
  router.post('/returns/:id/optimize-deductions', taxController.optimizeDeductions);
  router.post('/returns/:id/income/wages', taxController.addWageIncome);
  router.post('/returns/:id/deductions/itemized', taxController.addItemizedDeduction);

  return router;
}