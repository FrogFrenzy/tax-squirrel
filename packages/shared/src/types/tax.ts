import { FilingStatus } from './user';

export interface TaxReturn {
  id: string;
  userId: string;
  taxYear: number;
  filingStatus: FilingStatus;
  income: IncomeData;
  deductions: DeductionData;
  credits: CreditData;
  calculations: TaxCalculation;
  forms: TaxForm[];
  status: ReturnStatus;
  createdAt: Date;
  lastModified: Date;
  submittedAt?: Date;
  acceptedAt?: Date;
}

export interface IncomeData {
  wages: WageIncome[];
  selfEmployment: SelfEmploymentIncome[];
  investment: InvestmentIncome[];
  retirement: RetirementIncome[];
  other: OtherIncome[];
  totalIncome: number;
  adjustedGrossIncome: number;
}

export interface WageIncome {
  id: string;
  employerName: string;
  employerEIN: string;
  wages: number;
  federalTaxWithheld: number;
  socialSecurityWages: number;
  socialSecurityTaxWithheld: number;
  medicareWages: number;
  medicareTaxWithheld: number;
  stateWages?: number;
  stateTaxWithheld?: number;
  w2DocumentId?: string;
}

export interface SelfEmploymentIncome {
  id: string;
  businessName: string;
  businessType: BusinessType;
  grossReceipts: number;
  businessExpenses: number;
  netProfit: number;
  scheduleC?: ScheduleC;
}

export interface InvestmentIncome {
  id: string;
  type: InvestmentType;
  description: string;
  amount: number;
  taxableAmount: number;
  form1099DocumentId?: string;
}

export interface RetirementIncome {
  id: string;
  type: RetirementType;
  payerName: string;
  grossDistribution: number;
  taxableAmount: number;
  federalTaxWithheld: number;
  form1099RDocumentId?: string;
}

export interface OtherIncome {
  id: string;
  type: OtherIncomeType;
  description: string;
  amount: number;
  taxable: boolean;
}

export interface DeductionData {
  standardDeduction: number;
  itemizedDeductions: ItemizedDeduction[];
  totalItemizedDeductions: number;
  deductionMethod: DeductionMethod;
  businessDeductions: BusinessDeduction[];
  adjustments: IncomeAdjustment[];
}

export interface ItemizedDeduction {
  id: string;
  category: ItemizedDeductionCategory;
  description: string;
  amount: number;
  limitation?: number;
  supportingDocuments: string[];
}

export interface BusinessDeduction {
  id: string;
  category: BusinessDeductionCategory;
  description: string;
  amount: number;
  businessId: string;
}

export interface IncomeAdjustment {
  id: string;
  type: AdjustmentType;
  description: string;
  amount: number;
}

export interface CreditData {
  childTaxCredit: number;
  earnedIncomeCredit: number;
  educationCredits: number;
  retirementSavingsCredit: number;
  otherCredits: OtherCredit[];
  totalCredits: number;
}

export interface OtherCredit {
  id: string;
  type: CreditType;
  description: string;
  amount: number;
}

export interface TaxCalculation {
  grossIncome: number;
  adjustedGrossIncome: number;
  taxableIncome: number;
  federalTaxBeforeCredits: number;
  totalCredits: number;
  federalTaxAfterCredits: number;
  selfEmploymentTax: number;
  totalTaxLiability: number;
  totalWithholding: number;
  estimatedPayments: number;
  refundAmount: number;
  amountOwed: number;
  effectiveTaxRate: number;
  marginalTaxRate: number;
}

export interface TaxForm {
  id: string;
  formType: FormType;
  formData: Record<string, any>;
  isComplete: boolean;
  validationErrors: ValidationError[];
  generatedPdf?: string;
}

export interface ScheduleC {
  businessIncome: number;
  businessExpenses: BusinessExpenseCategory[];
  netProfit: number;
  selfEmploymentTax: number;
}

export interface BusinessExpenseCategory {
  category: BusinessExpenseType;
  amount: number;
  description?: string;
}

export interface TaxBracket {
  min: number;
  max: number;
  rate: number;
}

export interface TaxLawConfiguration {
  taxYear: number;
  standardDeductions: Record<FilingStatus, number>;
  taxBrackets: Record<FilingStatus, TaxBracket[]>;
  socialSecurityWageBase: number;
  socialSecurityRate: number;
  medicareRate: number;
  additionalMedicareRate: number;
  additionalMedicareThreshold: Record<FilingStatus, number>;
  personalExemption: number;
  childTaxCreditAmount: number;
  childTaxCreditPhaseoutThreshold: Record<FilingStatus, number>;
}

// Enums
export enum ReturnStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in_review',
  READY_TO_FILE = 'ready_to_file',
  FILED = 'filed',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  AMENDED = 'amended'
}

export enum BusinessType {
  SOLE_PROPRIETORSHIP = 'sole_proprietorship',
  PARTNERSHIP = 'partnership',
  S_CORP = 's_corp',
  C_CORP = 'c_corp',
  LLC = 'llc'
}

export enum InvestmentType {
  DIVIDENDS = 'dividends',
  INTEREST = 'interest',
  CAPITAL_GAINS = 'capital_gains',
  CAPITAL_LOSSES = 'capital_losses'
}

export enum RetirementType {
  TRADITIONAL_IRA = 'traditional_ira',
  ROTH_IRA = 'roth_ira',
  PENSION = 'pension',
  ANNUITY = 'annuity',
  FOUR_OH_ONE_K = '401k'
}

export enum OtherIncomeType {
  UNEMPLOYMENT = 'unemployment',
  GAMBLING = 'gambling',
  JURY_DUTY = 'jury_duty',
  PRIZES = 'prizes',
  RENTAL = 'rental',
  ROYALTIES = 'royalties'
}

export enum DeductionMethod {
  STANDARD = 'standard',
  ITEMIZED = 'itemized'
}

export enum ItemizedDeductionCategory {
  MEDICAL_DENTAL = 'medical_dental',
  STATE_LOCAL_TAXES = 'state_local_taxes',
  MORTGAGE_INTEREST = 'mortgage_interest',
  CHARITABLE_CONTRIBUTIONS = 'charitable_contributions',
  MISCELLANEOUS = 'miscellaneous'
}

export enum BusinessDeductionCategory {
  OFFICE_EXPENSES = 'office_expenses',
  TRAVEL = 'travel',
  MEALS = 'meals',
  VEHICLE = 'vehicle',
  EQUIPMENT = 'equipment',
  PROFESSIONAL_SERVICES = 'professional_services',
  INSURANCE = 'insurance',
  UTILITIES = 'utilities',
  RENT = 'rent',
  SUPPLIES = 'supplies'
}

export enum AdjustmentType {
  IRA_CONTRIBUTION = 'ira_contribution',
  STUDENT_LOAN_INTEREST = 'student_loan_interest',
  TUITION_FEES = 'tuition_fees',
  MOVING_EXPENSES = 'moving_expenses',
  HEALTH_SAVINGS_ACCOUNT = 'health_savings_account',
  SELF_EMPLOYMENT_TAX = 'self_employment_tax'
}

export enum CreditType {
  CHILD_TAX_CREDIT = 'child_tax_credit',
  EARNED_INCOME_CREDIT = 'earned_income_credit',
  AMERICAN_OPPORTUNITY_CREDIT = 'american_opportunity_credit',
  LIFETIME_LEARNING_CREDIT = 'lifetime_learning_credit',
  RETIREMENT_SAVINGS_CREDIT = 'retirement_savings_credit',
  CHILD_CARE_CREDIT = 'child_care_credit'
}

export enum FormType {
  FORM_1040 = '1040',
  SCHEDULE_A = 'schedule_a',
  SCHEDULE_B = 'schedule_b',
  SCHEDULE_C = 'schedule_c',
  SCHEDULE_D = 'schedule_d',
  SCHEDULE_E = 'schedule_e',
  SCHEDULE_SE = 'schedule_se',
  FORM_8863 = '8863',
  FORM_2441 = '2441'
}

export enum BusinessExpenseType {
  ADVERTISING = 'advertising',
  CAR_TRUCK = 'car_truck',
  COMMISSIONS_FEES = 'commissions_fees',
  CONTRACT_LABOR = 'contract_labor',
  DEPLETION = 'depletion',
  DEPRECIATION = 'depreciation',
  EMPLOYEE_BENEFITS = 'employee_benefits',
  INSURANCE = 'insurance',
  INTEREST = 'interest',
  LEGAL_PROFESSIONAL = 'legal_professional',
  OFFICE_EXPENSE = 'office_expense',
  PENSION_PROFIT_SHARING = 'pension_profit_sharing',
  RENT_LEASE = 'rent_lease',
  REPAIRS_MAINTENANCE = 'repairs_maintenance',
  SUPPLIES = 'supplies',
  TAXES_LICENSES = 'taxes_licenses',
  TRAVEL = 'travel',
  MEALS = 'meals',
  UTILITIES = 'utilities',
  WAGES = 'wages',
  OTHER = 'other'
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
}

export interface DeductionRecommendation {
  category: ItemizedDeductionCategory | BusinessDeductionCategory;
  description: string;
  estimatedAmount: number;
  confidence: number;
  requiredDocuments: string[];
  potentialSavings: number;
}