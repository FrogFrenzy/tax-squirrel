export interface FilingSubmission {
  id: string;
  userId: string;
  taxReturnId: string;
  submissionType: SubmissionType;
  filingMethod: FilingMethod;
  status: FilingStatus;
  submittedAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
  processedAt?: Date;
  confirmationNumber?: string;
  acknowledgmentId?: string;
  errors: FilingError[];
  warnings: FilingWarning[];
  metadata: FilingMetadata;
}

export interface FilingMetadata {
  softwareId: string;
  softwareVersion: string;
  preparerInfo?: PreparerInfo;
  transmissionId: string;
  batchId?: string;
  originalSubmissionId?: string; // For amendments
  ipAddress?: string;
  userAgent?: string;
}

export interface PreparerInfo {
  ptin: string; // Preparer Tax Identification Number
  name: string;
  firmName?: string;
  firmEIN?: string;
  address: Address;
  phoneNumber: string;
  email: string;
}

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface FilingError {
  code: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  description: string;
  xpath?: string;
  fieldName?: string;
  ruleNumber?: string;
  suggestedFix?: string;
}

export interface FilingWarning {
  code: string;
  description: string;
  xpath?: string;
  fieldName?: string;
}

export interface FilingResult {
  submissionId: string;
  status: FilingStatus;
  confirmationNumber?: string;
  acknowledgmentId?: string;
  errors: FilingError[];
  warnings: FilingWarning[];
  estimatedProcessingTime?: number; // in hours
  refundAmount?: number;
  amountOwed?: number;
  dueDate?: Date;
}

export interface StateFilingInfo {
  state: string;
  filingRequired: boolean;
  estimatedTax?: number;
  estimatedRefund?: number;
  dueDate?: Date;
  extensions?: StateExtension[];
}

export interface StateExtension {
  type: ExtensionType;
  dueDate: Date;
  granted: boolean;
  confirmationNumber?: string;
}

export interface IRSAcknowledgment {
  acknowledgmentId: string;
  submissionId: string;
  timestamp: Date;
  status: AcknowledgmentStatus;
  errors: FilingError[];
  warnings: FilingWarning[];
  refundAmount?: number;
  amountOwed?: number;
  dueDate?: Date;
}

export interface FilingValidationResult {
  isValid: boolean;
  errors: FilingError[];
  warnings: FilingWarning[];
  readinessScore: number; // 0-100
  missingRequirements: string[];
}

export interface FilingStatusCheck {
  submissionId: string;
  status: FilingStatus;
  lastUpdated: Date;
  processingStage: ProcessingStage;
  estimatedCompletion?: Date;
  refundStatus?: RefundStatus;
}

export interface RefundStatus {
  amount: number;
  status: RefundProcessingStatus;
  expectedDate?: Date;
  method: RefundMethod;
  accountInfo?: BankAccountInfo;
}

export interface BankAccountInfo {
  routingNumber: string; // encrypted
  accountNumber: string; // encrypted
  accountType: AccountType;
  bankName?: string;
}

// Enums
export enum SubmissionType {
  ORIGINAL = 'original',
  AMENDED = 'amended',
  SUPERSEDING = 'superseding'
}

export enum FilingMethod {
  ELECTRONIC = 'electronic',
  PAPER = 'paper'
}

export enum FilingStatus {
  DRAFT = 'draft',
  VALIDATING = 'validating',
  READY_TO_SUBMIT = 'ready_to_submit',
  SUBMITTED = 'submitted',
  TRANSMITTED = 'transmitted',
  ACKNOWLEDGED = 'acknowledged',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  REFUND_ISSUED = 'refund_issued',
  PAYMENT_DUE = 'payment_due'
}

export enum ErrorSeverity {
  FATAL = 'fatal',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

export enum ErrorCategory {
  SCHEMA_VALIDATION = 'schema_validation',
  BUSINESS_RULE = 'business_rule',
  CALCULATION = 'calculation',
  MISSING_DATA = 'missing_data',
  INVALID_DATA = 'invalid_data',
  SYSTEM_ERROR = 'system_error'
}

export enum AcknowledgmentStatus {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  PARTIALLY_ACCEPTED = 'partially_accepted'
}

export enum ProcessingStage {
  RECEIVED = 'received',
  INITIAL_VALIDATION = 'initial_validation',
  DETAILED_REVIEW = 'detailed_review',
  CALCULATION_VERIFICATION = 'calculation_verification',
  FINAL_PROCESSING = 'final_processing',
  COMPLETED = 'completed'
}

export enum RefundProcessingStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SENT = 'sent',
  DEPOSITED = 'deposited',
  RETURNED = 'returned',
  OFFSET = 'offset' // Applied to other debts
}

export enum RefundMethod {
  DIRECT_DEPOSIT = 'direct_deposit',
  CHECK = 'check',
  SAVINGS_BOND = 'savings_bond'
}

export enum AccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings'
}

export enum ExtensionType {
  AUTOMATIC = 'automatic',
  REQUESTED = 'requested'
}

export interface TaxFormXML {
  formType: string;
  taxYear: number;
  xmlContent: string;
  schemaVersion: string;
  checksum: string;
  createdAt: Date;
}

export interface FilingBatch {
  id: string;
  batchNumber: string;
  submissionIds: string[];
  status: BatchStatus;
  createdAt: Date;
  submittedAt?: Date;
  processedAt?: Date;
  totalSubmissions: number;
  acceptedCount: number;
  rejectedCount: number;
}

export enum BatchStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}