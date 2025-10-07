import Joi from 'joi';
import { ValidationResult, ValidationError } from '../types/common';
import { 
  FilingStatus, 
  BusinessType, 
  InvestmentType, 
  RetirementType,
  OtherIncomeType,
  DeductionMethod,
  ItemizedDeductionCategory,
  BusinessDeductionCategory,
  AdjustmentType,
  CreditType,
  FormType,
  BusinessExpenseType
} from '../types/tax';

// Tax Return Schema
export const taxReturnSchema = Joi.object({
  taxYear: Joi.number().integer().min(2020).max(new Date().getFullYear()).required(),
  filingStatus: Joi.string().valid(...Object.values(FilingStatus)).required(),
  income: Joi.object({
    wages: Joi.array().items(wageIncomeSchema).default([]),
    selfEmployment: Joi.array().items(selfEmploymentIncomeSchema).default([]),
    investment: Joi.array().items(investmentIncomeSchema).default([]),
    retirement: Joi.array().items(retirementIncomeSchema).default([]),
    other: Joi.array().items(otherIncomeSchema).default([])
  }).required(),
  deductions: Joi.object({
    deductionMethod: Joi.string().valid(...Object.values(DeductionMethod)).required(),
    itemizedDeductions: Joi.array().items(itemizedDeductionSchema).default([]),
    businessDeductions: Joi.array().items(businessDeductionSchema).default([]),
    adjustments: Joi.array().items(incomeAdjustmentSchema).default([])
  }).required()
});

// Income Schemas
export const wageIncomeSchema = Joi.object({
  employerName: Joi.string().min(1).max(100).required(),
  employerEIN: Joi.string().pattern(/^\d{2}-\d{7}$/).required(),
  wages: Joi.number().min(0).precision(2).required(),
  federalTaxWithheld: Joi.number().min(0).precision(2).required(),
  socialSecurityWages: Joi.number().min(0).precision(2).required(),
  socialSecurityTaxWithheld: Joi.number().min(0).precision(2).required(),
  medicareWages: Joi.number().min(0).precision(2).required(),
  medicareTaxWithheld: Joi.number().min(0).precision(2).required(),
  stateWages: Joi.number().min(0).precision(2).optional(),
  stateTaxWithheld: Joi.number().min(0).precision(2).optional(),
  w2DocumentId: Joi.string().uuid().optional()
});

export const selfEmploymentIncomeSchema = Joi.object({
  businessName: Joi.string().min(1).max(100).required(),
  businessType: Joi.string().valid(...Object.values(BusinessType)).required(),
  grossReceipts: Joi.number().min(0).precision(2).required(),
  businessExpenses: Joi.number().min(0).precision(2).required(),
  netProfit: Joi.number().precision(2).required()
});

export const investmentIncomeSchema = Joi.object({
  type: Joi.string().valid(...Object.values(InvestmentType)).required(),
  description: Joi.string().min(1).max(200).required(),
  amount: Joi.number().precision(2).required(),
  taxableAmount: Joi.number().min(0).precision(2).required(),
  form1099DocumentId: Joi.string().uuid().optional()
});

export const retirementIncomeSchema = Joi.object({
  type: Joi.string().valid(...Object.values(RetirementType)).required(),
  payerName: Joi.string().min(1).max(100).required(),
  grossDistribution: Joi.number().min(0).precision(2).required(),
  taxableAmount: Joi.number().min(0).precision(2).required(),
  federalTaxWithheld: Joi.number().min(0).precision(2).required(),
  form1099RDocumentId: Joi.string().uuid().optional()
});

export const otherIncomeSchema = Joi.object({
  type: Joi.string().valid(...Object.values(OtherIncomeType)).required(),
  description: Joi.string().min(1).max(200).required(),
  amount: Joi.number().precision(2).required(),
  taxable: Joi.boolean().required()
});

// Deduction Schemas
export const itemizedDeductionSchema = Joi.object({
  category: Joi.string().valid(...Object.values(ItemizedDeductionCategory)).required(),
  description: Joi.string().min(1).max(200).required(),
  amount: Joi.number().min(0).precision(2).required(),
  limitation: Joi.number().min(0).precision(2).optional(),
  supportingDocuments: Joi.array().items(Joi.string().uuid()).default([])
});

export const businessDeductionSchema = Joi.object({
  category: Joi.string().valid(...Object.values(BusinessDeductionCategory)).required(),
  description: Joi.string().min(1).max(200).required(),
  amount: Joi.number().min(0).precision(2).required(),
  businessId: Joi.string().uuid().required()
});

export const incomeAdjustmentSchema = Joi.object({
  type: Joi.string().valid(...Object.values(AdjustmentType)).required(),
  description: Joi.string().min(1).max(200).required(),
  amount: Joi.number().min(0).precision(2).required()
});

// Tax-specific validation functions
export const validateTaxYear = (year: number): ValidationResult => {
  const currentYear = new Date().getFullYear();
  const errors: ValidationError[] = [];

  if (year < 2020) {
    errors.push({
      field: 'taxYear',
      message: 'Tax year must be 2020 or later',
      code: 'TAX_YEAR_TOO_OLD'
    });
  }

  if (year > currentYear) {
    errors.push({
      field: 'taxYear',
      message: `Tax year cannot be in the future (current year: ${currentYear})`,
      code: 'TAX_YEAR_FUTURE'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateEIN = (ein: string): boolean => {
  // EIN format: XX-XXXXXXX
  const einRegex = /^\d{2}-\d{7}$/;
  return einRegex.test(ein);
};

export const validateSSN = (ssn: string): boolean => {
  // Remove any non-digit characters
  const cleanSSN = ssn.replace(/\D/g, '');
  
  // Check if it's exactly 9 digits
  if (cleanSSN.length !== 9) {
    return false;
  }
  
  // Check for invalid patterns
  const invalidPatterns = [
    '000000000', '111111111', '222222222', '333333333', '444444444',
    '555555555', '666666666', '777777777', '888888888', '999999999'
  ];
  
  return !invalidPatterns.includes(cleanSSN);
};

export const validateTaxAmount = (amount: number, fieldName: string): ValidationResult => {
  const errors: ValidationError[] = [];

  if (amount < 0) {
    errors.push({
      field: fieldName,
      message: 'Tax amounts cannot be negative',
      code: 'NEGATIVE_AMOUNT'
    });
  }

  if (amount > 999999999.99) {
    errors.push({
      field: fieldName,
      message: 'Amount exceeds maximum allowed value',
      code: 'AMOUNT_TOO_LARGE'
    });
  }

  // Check for reasonable decimal precision (max 2 decimal places)
  const decimalPlaces = (amount.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    errors.push({
      field: fieldName,
      message: 'Amount cannot have more than 2 decimal places',
      code: 'INVALID_PRECISION'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateBusinessExpenses = (grossReceipts: number, expenses: number): ValidationResult => {
  const errors: ValidationError[] = [];

  if (expenses > grossReceipts * 2) {
    errors.push({
      field: 'businessExpenses',
      message: 'Business expenses seem unusually high compared to gross receipts',
      code: 'EXPENSES_HIGH_WARNING'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateWithholding = (income: number, withholding: number): ValidationResult => {
  const errors: ValidationError[] = [];

  if (withholding > income) {
    errors.push({
      field: 'withholding',
      message: 'Tax withholding cannot exceed total income',
      code: 'WITHHOLDING_EXCEEDS_INCOME'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateItemizedDeductions = (
  deductions: { category: ItemizedDeductionCategory; amount: number }[],
  adjustedGrossIncome: number
): ValidationResult => {
  const errors: ValidationError[] = [];

  // Medical deduction threshold (7.5% of AGI for 2020+)
  const medicalDeductions = deductions
    .filter(d => d.category === ItemizedDeductionCategory.MEDICAL_DENTAL)
    .reduce((sum, d) => sum + d.amount, 0);

  const medicalThreshold = adjustedGrossIncome * 0.075;
  if (medicalDeductions > 0 && medicalDeductions <= medicalThreshold) {
    errors.push({
      field: 'medicalDeductions',
      message: `Medical deductions must exceed ${medicalThreshold.toFixed(2)} (7.5% of AGI) to be deductible`,
      code: 'MEDICAL_DEDUCTION_THRESHOLD'
    });
  }

  // SALT deduction cap ($10,000 for 2020+)
  const saltDeductions = deductions
    .filter(d => d.category === ItemizedDeductionCategory.STATE_LOCAL_TAXES)
    .reduce((sum, d) => sum + d.amount, 0);

  if (saltDeductions > 10000) {
    errors.push({
      field: 'stateLocalTaxes',
      message: 'State and local tax deduction is capped at $10,000',
      code: 'SALT_DEDUCTION_CAP'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};