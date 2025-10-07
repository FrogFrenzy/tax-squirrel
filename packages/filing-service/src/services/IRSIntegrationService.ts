import axios, { AxiosResponse } from 'axios';
import xml2js from 'xml2js';
import { 
  TaxReturn,
  FilingSubmission,
  FilingResult,
  FilingStatus,
  FilingError,
  FilingWarning,
  ErrorSeverity,
  ErrorCategory,
  IRSAcknowledgment,
  AcknowledgmentStatus,
  TaxFormXML,
  Logger,
  ApiResponse,
  ErrorCodes
} from '@tax-app/shared';

const logger = new Logger('irs-integration-service');

export interface IRSConfig {
  baseUrl: string;
  softwareId: string;
  softwareVersion: string;
  apiKey: string;
  timeout: number;
  retryAttempts: number;
}

export class IRSIntegrationService {
  private config: IRSConfig;
  private xmlBuilder: xml2js.Builder;
  private xmlParser: xml2js.Parser;

  constructor(config: IRSConfig) {
    this.config = config;
    this.xmlBuilder = new xml2js.Builder({
      rootName: 'Return',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '  ' }
    });
    this.xmlParser = new xml2js.Parser({ explicitArray: false });
  }

  async submitTaxReturn(
    taxReturn: TaxReturn,
    filingSubmission: FilingSubmission
  ): Promise<ApiResponse<FilingResult>> {
    try {
      logger.info('Starting IRS tax return submission', {
        taxReturnId: taxReturn.id,
        filingId: filingSubmission.id,
        taxYear: taxReturn.taxYear
      });

      // Generate XML for tax return
      const xmlResult = await this.generateTaxReturnXML(taxReturn);
      if (!xmlResult.success || !xmlResult.data) {
        return {
          success: false,
          error: xmlResult.error || {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to generate tax return XML'
          }
        };
      }

      // Validate XML against IRS schema
      const validationResult = await this.validateXML(xmlResult.data);
      if (!validationResult.success) {
        return {
          success: false,
          error: validationResult.error || {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'XML validation failed'
          }
        };
      }

      // Submit to IRS
      const submissionResult = await this.transmitToIRS(
        xmlResult.data,
        filingSubmission.metadata.transmissionId
      );

      if (!submissionResult.success || !submissionResult.data) {
        return {
          success: false,
          error: submissionResult.error || {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'IRS transmission failed'
          }
        };
      }

      logger.info('IRS tax return submission completed', {
        taxReturnId: taxReturn.id,
        filingId: filingSubmission.id,
        confirmationNumber: submissionResult.data.confirmationNumber
      });

      return submissionResult;

    } catch (error) {
      logger.error('IRS tax return submission failed', {
        error: error.message,
        taxReturnId: taxReturn.id,
        filingId: filingSubmission.id
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'IRS submission failed due to internal error'
        }
      };
    }
  }

  private async generateTaxReturnXML(taxReturn: TaxReturn): Promise<ApiResponse<TaxFormXML>> {
    try {
      // Build the tax return XML structure
      const returnData = {
        $: {
          'xmlns': 'http://www.irs.gov/efile',
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          'xsi:schemaLocation': `http://www.irs.gov/efile efile1040x_${taxReturn.taxYear}v1.0.xsd`,
          'returnVersion': `${taxReturn.taxYear}v1.0`
        },
        ReturnHeader: this.buildReturnHeader(taxReturn),
        ReturnData: this.buildReturnData(taxReturn)
      };

      const xmlContent = this.xmlBuilder.buildObject(returnData);
      const checksum = this.calculateChecksum(xmlContent);

      const taxFormXML: TaxFormXML = {
        formType: 'Form1040',
        taxYear: taxReturn.taxYear,
        xmlContent,
        schemaVersion: `${taxReturn.taxYear}v1.0`,
        checksum,
        createdAt: new Date()
      };

      return {
        success: true,
        data: taxFormXML,
        message: 'Tax return XML generated successfully'
      };

    } catch (error) {
      logger.error('Failed to generate tax return XML', {
        error: error.message,
        taxReturnId: taxReturn.id
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to generate tax return XML'
        }
      };
    }
  }

  private buildReturnHeader(taxReturn: TaxReturn): any {
    return {
      ReturnTs: new Date().toISOString(),
      TaxYr: taxReturn.taxYear,
      TaxPeriodBeginDt: `${taxReturn.taxYear}-01-01`,
      TaxPeriodEndDt: `${taxReturn.taxYear}-12-31`,
      SoftwareId: this.config.softwareId,
      SoftwareVersionNum: this.config.softwareVersion,
      OriginatorGrp: {
        EFIN: '123456', // Electronic Filing Identification Number
        OriginatorTypeCd: 'OnlineFiler'
      },
      SelfSelectPINGrp: {
        PrimaryBirthDt: '1980-01-01', // This would come from user profile
        PrimaryPriorYearAGIAmt: 0, // Previous year AGI for verification
        PrimaryPriorYearPIN: '12345' // Previous year PIN
      },
      PrimaryNameControlTxt: this.generateNameControl(taxReturn.income.wages[0]?.employerName || ''),
      FilingStatusCd: this.mapFilingStatus(taxReturn.filingStatus)
    };
  }

  private buildReturnData(taxReturn: TaxReturn): any {
    const form1040 = {
      $: { documentId: 'Form1040' },
      FilingStatusCd: this.mapFilingStatus(taxReturn.filingStatus),
      
      // Income section
      WagesAmt: taxReturn.income.wages.reduce((sum, w) => sum + w.wages, 0),
      TaxableInterestAmt: taxReturn.income.investment
        .filter(i => i.type === 'interest')
        .reduce((sum, i) => sum + i.taxableAmount, 0),
      OrdinaryDividendsAmt: taxReturn.income.investment
        .filter(i => i.type === 'dividends')
        .reduce((sum, i) => sum + i.taxableAmount, 0),
      
      // AGI and taxable income
      AdjustedGrossIncomeAmt: taxReturn.calculations.adjustedGrossIncome,
      TaxableIncomeAmt: taxReturn.calculations.taxableIncome,
      
      // Tax calculation
      TaxAmt: taxReturn.calculations.federalTaxBeforeCredits,
      TotalCreditsAmt: taxReturn.calculations.totalCredits,
      TotalTaxAmt: taxReturn.calculations.federalTaxAfterCredits,
      
      // Withholding and payments
      FederalIncomeTaxWithheldAmt: taxReturn.income.wages.reduce((sum, w) => sum + w.federalTaxWithheld, 0),
      
      // Refund or amount owed
      RefundAmt: taxReturn.calculations.refundAmount > 0 ? taxReturn.calculations.refundAmount : undefined,
      AmountOwedAmt: taxReturn.calculations.amountOwed > 0 ? taxReturn.calculations.amountOwed : undefined
    };

    const returnData: any = {
      IRS1040: form1040
    };

    // Add schedules if needed
    if (taxReturn.deductions.deductionMethod === 'itemized') {
      returnData.IRS1040ScheduleA = this.buildScheduleA(taxReturn);
    }

    // Add W-2 forms
    if (taxReturn.income.wages.length > 0) {
      returnData.IRSW2 = taxReturn.income.wages.map(wage => this.buildW2(wage));
    }

    // Add 1099 forms
    const form1099s = this.build1099Forms(taxReturn);
    if (form1099s.length > 0) {
      returnData.IRS1099INT = form1099s.filter(f => f.formType === '1099-INT');
      returnData.IRS1099DIV = form1099s.filter(f => f.formType === '1099-DIV');
    }

    return returnData;
  }

  private buildScheduleA(taxReturn: TaxReturn): any {
    const itemizedDeductions = taxReturn.deductions.itemizedDeductions;
    
    return {
      $: { documentId: 'ScheduleA' },
      MedicalDentalExpensesAmt: itemizedDeductions
        .filter(d => d.category === 'medical_dental')
        .reduce((sum, d) => sum + d.amount, 0),
      StateLocalTaxAmt: itemizedDeductions
        .filter(d => d.category === 'state_local_taxes')
        .reduce((sum, d) => sum + d.amount, 0),
      MortgageInterestAmt: itemizedDeductions
        .filter(d => d.category === 'mortgage_interest')
        .reduce((sum, d) => sum + d.amount, 0),
      CharitableContributionAmt: itemizedDeductions
        .filter(d => d.category === 'charitable_contributions')
        .reduce((sum, d) => sum + d.amount, 0),
      TotalItemizedDeductionsAmt: taxReturn.deductions.totalItemizedDeductions
    };
  }

  private buildW2(wage: any): any {
    return {
      $: { documentId: `W2-${wage.id}` },
      EmployerEIN: wage.employerEIN,
      EmployerNameControlTxt: this.generateNameControl(wage.employerName),
      WagesAmt: wage.wages,
      FederalIncomeTaxWithheldAmt: wage.federalTaxWithheld,
      SocialSecurityWagesAmt: wage.socialSecurityWages,
      SocialSecurityTaxWithheldAmt: wage.socialSecurityTaxWithheld,
      MedicareWagesAndTipsAmt: wage.medicareWages,
      MedicareTaxWithheldAmt: wage.medicareTaxWithheld
    };
  }

  private build1099Forms(taxReturn: TaxReturn): any[] {
    const forms: any[] = [];

    // Build 1099-INT forms
    taxReturn.income.investment
      .filter(i => i.type === 'interest')
      .forEach(interest => {
        forms.push({
          formType: '1099-INT',
          $: { documentId: `1099INT-${interest.id}` },
          PayerEIN: '12-3456789', // This would come from the investment data
          InterestIncomeAmt: interest.taxableAmount,
          FederalIncomeTaxWithheldAmt: 0 // This would come from the investment data
        });
      });

    // Build 1099-DIV forms
    taxReturn.income.investment
      .filter(i => i.type === 'dividends')
      .forEach(dividend => {
        forms.push({
          formType: '1099-DIV',
          $: { documentId: `1099DIV-${dividend.id}` },
          PayerEIN: '12-3456789', // This would come from the investment data
          OrdinaryDividendsAmt: dividend.taxableAmount,
          QualifiedDividendsAmt: dividend.taxableAmount, // Assuming all are qualified for simplicity
          FederalIncomeTaxWithheldAmt: 0
        });
      });

    return forms;
  }

  private async validateXML(taxFormXML: TaxFormXML): Promise<ApiResponse<void>> {
    try {
      // In a real implementation, this would validate against the IRS XSD schema
      // For now, we'll do basic XML parsing validation
      await this.xmlParser.parseStringPromise(taxFormXML.xmlContent);

      // Basic business rule validations
      const errors: FilingError[] = [];

      // Check for required elements
      if (!taxFormXML.xmlContent.includes('TaxYr')) {
        errors.push({
          code: 'MISSING_TAX_YEAR',
          severity: ErrorSeverity.FATAL,
          category: ErrorCategory.MISSING_DATA,
          description: 'Tax year is required',
          xpath: '/Return/ReturnHeader/TaxYr'
        });
      }

      if (!taxFormXML.xmlContent.includes('FilingStatusCd')) {
        errors.push({
          code: 'MISSING_FILING_STATUS',
          severity: ErrorSeverity.FATAL,
          category: ErrorCategory.MISSING_DATA,
          description: 'Filing status is required',
          xpath: '/Return/ReturnData/IRS1040/FilingStatusCd'
        });
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'XML validation failed',
            details: errors.map(error => ({
              field: error.xpath || 'unknown',
              constraint: error.description
            }))
          }
        };
      }

      return {
        success: true,
        message: 'XML validation passed'
      };

    } catch (error) {
      logger.error('XML validation failed', { error: error.message });
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid XML format'
        }
      };
    }
  }

  private async transmitToIRS(
    taxFormXML: TaxFormXML,
    transmissionId: string
  ): Promise<ApiResponse<FilingResult>> {
    try {
      const endpoint = `${this.config.baseUrl}/efile/submit`;
      
      const requestPayload = {
        transmissionId,
        softwareId: this.config.softwareId,
        softwareVersion: this.config.softwareVersion,
        xmlData: taxFormXML.xmlContent,
        checksum: taxFormXML.checksum
      };

      const response: AxiosResponse = await axios.post(endpoint, requestPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Transmission-Id': transmissionId
        },
        timeout: this.config.timeout
      });

      if (response.status === 200 || response.status === 202) {
        const filingResult: FilingResult = {
          submissionId: response.data.submissionId,
          status: FilingStatus.TRANSMITTED,
          confirmationNumber: response.data.confirmationNumber,
          acknowledgmentId: response.data.acknowledgmentId,
          errors: response.data.errors || [],
          warnings: response.data.warnings || [],
          estimatedProcessingTime: response.data.estimatedProcessingTime || 24
        };

        return {
          success: true,
          data: filingResult,
          message: 'Tax return transmitted to IRS successfully'
        };
      } else {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: `IRS transmission failed with status ${response.status}`
          }
        };
      }

    } catch (error) {
      logger.error('IRS transmission failed', {
        error: error.message,
        transmissionId
      });

      if (error.response) {
        // IRS returned an error response
        const irsErrors = this.parseIRSErrors(error.response.data);
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'IRS rejected the submission',
            details: irsErrors.map(err => ({
              field: err.fieldName || 'unknown',
              constraint: err.description
            }))
          }
        };
      }

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to transmit to IRS'
        }
      };
    }
  }

  async checkFilingStatus(submissionId: string): Promise<ApiResponse<FilingResult>> {
    try {
      const endpoint = `${this.config.baseUrl}/efile/status/${submissionId}`;
      
      const response: AxiosResponse = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        timeout: this.config.timeout
      });

      if (response.status === 200) {
        const filingResult: FilingResult = {
          submissionId: response.data.submissionId,
          status: response.data.status as FilingStatus,
          confirmationNumber: response.data.confirmationNumber,
          acknowledgmentId: response.data.acknowledgmentId,
          errors: response.data.errors || [],
          warnings: response.data.warnings || [],
          refundAmount: response.data.refundAmount,
          amountOwed: response.data.amountOwed,
          dueDate: response.data.dueDate ? new Date(response.data.dueDate) : undefined
        };

        return {
          success: true,
          data: filingResult,
          message: 'Filing status retrieved successfully'
        };
      }

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to retrieve filing status'
        }
      };

    } catch (error) {
      logger.error('Failed to check filing status', {
        error: error.message,
        submissionId
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to check filing status'
        }
      };
    }
  }

  private parseIRSErrors(errorData: any): FilingError[] {
    const errors: FilingError[] = [];

    if (errorData.errors && Array.isArray(errorData.errors)) {
      for (const error of errorData.errors) {
        errors.push({
          code: error.code || 'UNKNOWN_ERROR',
          severity: this.mapErrorSeverity(error.severity),
          category: this.mapErrorCategory(error.category),
          description: error.description || error.message,
          xpath: error.xpath,
          fieldName: error.fieldName,
          ruleNumber: error.ruleNumber,
          suggestedFix: error.suggestedFix
        });
      }
    }

    return errors;
  }

  private mapFilingStatus(filingStatus: string): string {
    const statusMap: Record<string, string> = {
      'single': '1',
      'marriedFilingJointly': '2',
      'marriedFilingSeparately': '3',
      'headOfHousehold': '4',
      'qualifyingWidow': '5'
    };

    return statusMap[filingStatus] || '1';
  }

  private mapErrorSeverity(severity: string): ErrorSeverity {
    const severityMap: Record<string, ErrorSeverity> = {
      'fatal': ErrorSeverity.FATAL,
      'error': ErrorSeverity.ERROR,
      'warning': ErrorSeverity.WARNING,
      'info': ErrorSeverity.INFO
    };

    return severityMap[severity?.toLowerCase()] || ErrorSeverity.ERROR;
  }

  private mapErrorCategory(category: string): ErrorCategory {
    const categoryMap: Record<string, ErrorCategory> = {
      'schema': ErrorCategory.SCHEMA_VALIDATION,
      'business': ErrorCategory.BUSINESS_RULE,
      'calculation': ErrorCategory.CALCULATION,
      'missing': ErrorCategory.MISSING_DATA,
      'invalid': ErrorCategory.INVALID_DATA,
      'system': ErrorCategory.SYSTEM_ERROR
    };

    return categoryMap[category?.toLowerCase()] || ErrorCategory.SYSTEM_ERROR;
  }

  private generateNameControl(name: string): string {
    // Generate a 4-character name control from the name
    // This is a simplified version - IRS has specific rules
    return name.replace(/[^A-Z]/g, '').substring(0, 4).padEnd(4, 'X');
  }

  private calculateChecksum(xmlContent: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(xmlContent).digest('hex');
  }
}