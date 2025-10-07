export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: ErrorDetail[];
  suggestions?: string[];
  documentationUrl?: string;
}

export interface ErrorDetail {
  field?: string;
  constraint: string;
  currentValue?: any;
  expectedFormat?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export enum ErrorCodes {
  // Authentication errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  MFA_REQUIRED = 'MFA_REQUIRED',
  INVALID_MFA_CODE = 'INVALID_MFA_CODE',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DUPLICATE_EMAIL = 'DUPLICATE_EMAIL',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  
  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}