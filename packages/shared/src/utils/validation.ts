import Joi from 'joi';
import { ValidationResult, ValidationError } from '../types/common';

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): ValidationResult => {
  const errors: ValidationError[] = [];
  
  if (password.length < 8) {
    errors.push({
      field: 'password',
      message: 'Password must be at least 8 characters long',
      code: 'PASSWORD_TOO_SHORT'
    });
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one lowercase letter',
      code: 'PASSWORD_MISSING_LOWERCASE'
    });
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one uppercase letter',
      code: 'PASSWORD_MISSING_UPPERCASE'
    });
  }
  
  if (!/(?=.*\d)/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one number',
      code: 'PASSWORD_MISSING_NUMBER'
    });
  }
  
  if (!/(?=.*[@$!%*?&])/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one special character',
      code: 'PASSWORD_MISSING_SPECIAL'
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
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
    '000000000',
    '111111111',
    '222222222',
    '333333333',
    '444444444',
    '555555555',
    '666666666',
    '777777777',
    '888888888',
    '999999999'
  ];
  
  return !invalidPatterns.includes(cleanSSN);
};

export const userRegistrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  profile: Joi.object({
    firstName: Joi.string().min(1).max(50).required(),
    lastName: Joi.string().min(1).max(50).required(),
    dateOfBirth: Joi.date().max('now').required(),
    address: Joi.object({
      street1: Joi.string().min(1).max(100).required(),
      street2: Joi.string().max(100).optional(),
      city: Joi.string().min(1).max(50).required(),
      state: Joi.string().length(2).required(),
      zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
      country: Joi.string().default('US')
    }).required(),
    filingStatus: Joi.string().valid('single', 'marriedFilingJointly', 'marriedFilingSeparately', 'headOfHousehold', 'qualifyingWidow').required(),
    phoneNumber: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
    ssn: Joi.string().optional()
  }).required()
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  mfaCode: Joi.string().length(6).pattern(/^\d{6}$/).optional()
});