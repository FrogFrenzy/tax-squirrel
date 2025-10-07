export interface User {
  id: string;
  email: string;
  profile: UserProfile;
  securitySettings: SecuritySettings;
  createdAt: Date;
  lastLogin: Date | null;
  isActive: boolean;
  emailVerified: boolean;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  ssn: string; // encrypted
  dateOfBirth: Date;
  address: Address;
  filingStatus: FilingStatus;
  phoneNumber?: string;
}

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface SecuritySettings {
  mfaEnabled: boolean;
  mfaMethod?: MFAMethod;
  mfaSecret?: string; // encrypted
  backupCodes?: string[]; // encrypted
  passwordLastChanged: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  sessionTimeout: number; // minutes
}

export enum FilingStatus {
  SINGLE = 'single',
  MARRIED_FILING_JOINTLY = 'marriedFilingJointly',
  MARRIED_FILING_SEPARATELY = 'marriedFilingSeparately',
  HEAD_OF_HOUSEHOLD = 'headOfHousehold',
  QUALIFYING_WIDOW = 'qualifyingWidow'
}

export enum MFAMethod {
  TOTP = 'totp',
  SMS = 'sms',
  EMAIL = 'email'
}

export interface UserRegistration {
  email: string;
  password: string;
  profile: Omit<UserProfile, 'ssn'> & { ssn?: string };
}

export interface LoginCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Omit<User, 'securitySettings'>;
}

export interface MFASetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  address?: Partial<Address>;
  filingStatus?: FilingStatus;
  phoneNumber?: string;
}