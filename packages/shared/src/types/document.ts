export interface Document {
  id: string;
  userId: string;
  fileName: string;
  originalFileName: string;
  fileType: string;
  fileSize: number;
  category: DocumentCategory;
  taxYear?: number;
  extractedData?: ExtractedData;
  uploadDate: Date;
  lastModified: Date;
  isVerified: boolean;
  isProcessed: boolean;
  storageUrl: string;
  thumbnailUrl?: string;
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  mimeType: string;
  encoding?: string;
  pages?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  checksum: string;
  uploadSource: UploadSource;
  processingStatus: ProcessingStatus;
  ocrConfidence?: number;
}

export interface ExtractedData {
  formType?: TaxFormType;
  fields: Record<string, any>;
  confidence: number;
  extractedAt: Date;
  reviewRequired: boolean;
  corrections?: Record<string, any>;
}

export interface DocumentUploadRequest {
  file: File | Buffer;
  fileName: string;
  category: DocumentCategory;
  taxYear?: number;
  metadata?: Partial<DocumentMetadata>;
}

export interface DocumentSearchFilters {
  category?: DocumentCategory;
  taxYear?: number;
  isVerified?: boolean;
  isProcessed?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  formType?: TaxFormType;
}

export interface DocumentOrganization {
  folders: DocumentFolder[];
  tags: DocumentTag[];
  categories: DocumentCategoryInfo[];
}

export interface DocumentFolder {
  id: string;
  name: string;
  parentId?: string;
  documentCount: number;
  createdAt: Date;
}

export interface DocumentTag {
  id: string;
  name: string;
  color: string;
  documentCount: number;
}

export interface DocumentCategoryInfo {
  category: DocumentCategory;
  displayName: string;
  description: string;
  requiredFields: string[];
  documentCount: number;
}

export interface AuditTrail {
  id: string;
  userId: string;
  documentId?: string;
  action: AuditAction;
  description: string;
  metadata: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface DocumentValidationResult {
  isValid: boolean;
  errors: DocumentValidationError[];
  warnings: DocumentValidationWarning[];
}

export interface DocumentValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface DocumentValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// Enums
export enum DocumentCategory {
  W2 = 'w2',
  FORM_1099_INT = '1099_int',
  FORM_1099_DIV = '1099_div',
  FORM_1099_B = '1099_b',
  FORM_1099_R = '1099_r',
  FORM_1099_MISC = '1099_misc',
  FORM_1099_NEC = '1099_nec',
  FORM_1098 = '1098',
  FORM_1098_T = '1098_t',
  SCHEDULE_K1 = 'schedule_k1',
  PROPERTY_TAX = 'property_tax',
  MEDICAL_EXPENSES = 'medical_expenses',
  CHARITABLE_DONATIONS = 'charitable_donations',
  BUSINESS_EXPENSES = 'business_expenses',
  EDUCATION_EXPENSES = 'education_expenses',
  CHILDCARE_EXPENSES = 'childcare_expenses',
  PRIOR_YEAR_RETURN = 'prior_year_return',
  BANK_STATEMENTS = 'bank_statements',
  INVESTMENT_STATEMENTS = 'investment_statements',
  INSURANCE_DOCUMENTS = 'insurance_documents',
  OTHER = 'other'
}

export enum TaxFormType {
  W2 = 'w2',
  FORM_1099_INT = '1099_int',
  FORM_1099_DIV = '1099_div',
  FORM_1099_B = '1099_b',
  FORM_1099_R = '1099_r',
  FORM_1099_MISC = '1099_misc',
  FORM_1099_NEC = '1099_nec',
  FORM_1098 = '1098',
  FORM_1098_T = '1098_t',
  SCHEDULE_K1 = 'schedule_k1'
}

export enum UploadSource {
  WEB_UPLOAD = 'web_upload',
  MOBILE_CAMERA = 'mobile_camera',
  MOBILE_GALLERY = 'mobile_gallery',
  EMAIL_IMPORT = 'email_import',
  BANK_IMPORT = 'bank_import',
  EMPLOYER_IMPORT = 'employer_import'
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  MANUAL_REVIEW = 'manual_review'
}

export enum AuditAction {
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_VIEWED = 'document_viewed',
  DOCUMENT_DOWNLOADED = 'document_downloaded',
  DOCUMENT_DELETED = 'document_deleted',
  DOCUMENT_VERIFIED = 'document_verified',
  DOCUMENT_PROCESSED = 'document_processed',
  DATA_EXTRACTED = 'data_extracted',
  DATA_CORRECTED = 'data_corrected',
  FOLDER_CREATED = 'folder_created',
  FOLDER_DELETED = 'folder_deleted',
  TAG_ADDED = 'tag_added',
  TAG_REMOVED = 'tag_removed'
}