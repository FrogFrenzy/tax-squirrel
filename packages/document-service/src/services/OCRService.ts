import Tesseract from 'tesseract.js';
import PDFParse from 'pdf-parse';
import { 
  ExtractedData,
  TaxFormType,
  DocumentCategory,
  Logger,
  ApiResponse,
  ErrorCodes
} from '@tax-app/shared';

const logger = new Logger('ocr-service');

export interface OCRResult {
  text: string;
  confidence: number;
  words: OCRWord[];
  blocks: OCRBlock[];
}

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface OCRBlock {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  words: OCRWord[];
}

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class OCRService {
  private tesseractWorker: Tesseract.Worker | null = null;

  constructor() {
    this.initializeTesseract();
  }

  private async initializeTesseract(): Promise<void> {
    try {
      this.tesseractWorker = await Tesseract.createWorker();
      await this.tesseractWorker.loadLanguage('eng');
      await this.tesseractWorker.initialize('eng');
      
      // Configure Tesseract for better accuracy with tax documents
      await this.tesseractWorker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,()-$: ',
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      });

      logger.info('Tesseract OCR initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Tesseract OCR', { error: error.message });
    }
  }

  async extractTextFromImage(buffer: Buffer): Promise<ApiResponse<OCRResult>> {
    try {
      if (!this.tesseractWorker) {
        await this.initializeTesseract();
      }

      if (!this.tesseractWorker) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'OCR service not available'
          }
        };
      }

      const { data } = await this.tesseractWorker.recognize(buffer);

      const result: OCRResult = {
        text: data.text,
        confidence: data.confidence,
        words: data.words.map(word => ({
          text: word.text,
          confidence: word.confidence,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1
          }
        })),
        blocks: data.blocks.map(block => ({
          text: block.text,
          confidence: block.confidence,
          bbox: {
            x0: block.bbox.x0,
            y0: block.bbox.y0,
            x1: block.bbox.x1,
            y1: block.bbox.y1
          },
          words: block.words?.map(word => ({
            text: word.text,
            confidence: word.confidence,
            bbox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1
            }
          })) || []
        }))
      };

      logger.info('OCR text extraction completed', {
        textLength: result.text.length,
        confidence: result.confidence,
        wordCount: result.words.length
      });

      return {
        success: true,
        data: result,
        message: 'Text extracted successfully'
      };

    } catch (error) {
      logger.error('OCR text extraction failed', { error: error.message });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'OCR text extraction failed'
        }
      };
    }
  }

  async extractTextFromPDF(buffer: Buffer): Promise<ApiResponse<OCRResult>> {
    try {
      const pdfData = await PDFParse(buffer);

      const result: OCRResult = {
        text: pdfData.text,
        confidence: 1.0, // PDF text extraction is typically 100% accurate
        words: [], // PDF parsing doesn't provide word-level data
        blocks: []
      };

      logger.info('PDF text extraction completed', {
        textLength: result.text.length,
        pageCount: pdfData.numpages
      });

      return {
        success: true,
        data: result,
        message: 'PDF text extracted successfully'
      };

    } catch (error) {
      logger.error('PDF text extraction failed', { error: error.message });
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'PDF text extraction failed'
        }
      };
    }
  }

  async extractDataFromDocument(
    buffer: Buffer,
    fileName: string,
    category: DocumentCategory
  ): Promise<ApiResponse<ExtractedData>> {
    try {
      logger.info('Starting document data extraction', {
        fileName,
        category,
        fileSize: buffer.length
      });

      // Determine extraction method based on file type
      let ocrResult: ApiResponse<OCRResult>;
      const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));

      if (fileExtension === '.pdf') {
        ocrResult = await this.extractTextFromPDF(buffer);
      } else {
        ocrResult = await this.extractTextFromImage(buffer);
      }

      if (!ocrResult.success || !ocrResult.data) {
        return {
          success: false,
          error: ocrResult.error || {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Text extraction failed'
          }
        };
      }

      // Extract structured data based on document category
      const extractedFields = await this.extractStructuredData(
        ocrResult.data.text,
        category,
        ocrResult.data
      );

      const extractedData: ExtractedData = {
        formType: this.determineFormType(category, ocrResult.data.text),
        fields: extractedFields,
        confidence: ocrResult.data.confidence,
        extractedAt: new Date(),
        reviewRequired: ocrResult.data.confidence < 0.8 || this.requiresManualReview(extractedFields)
      };

      logger.info('Document data extraction completed', {
        fileName,
        category,
        formType: extractedData.formType,
        confidence: extractedData.confidence,
        reviewRequired: extractedData.reviewRequired,
        fieldCount: Object.keys(extractedFields).length
      });

      return {
        success: true,
        data: extractedData,
        message: 'Document data extracted successfully'
      };

    } catch (error) {
      logger.error('Document data extraction failed', {
        error: error.message,
        fileName,
        category
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Document data extraction failed'
        }
      };
    }
  }

  private async extractStructuredData(
    text: string,
    category: DocumentCategory,
    ocrResult: OCRResult
  ): Promise<Record<string, any>> {
    const fields: Record<string, any> = {};

    switch (category) {
      case DocumentCategory.W2:
        return this.extractW2Data(text, ocrResult);
      
      case DocumentCategory.FORM_1099_INT:
        return this.extract1099IntData(text, ocrResult);
      
      case DocumentCategory.FORM_1099_DIV:
        return this.extract1099DivData(text, ocrResult);
      
      case DocumentCategory.FORM_1099_B:
        return this.extract1099BData(text, ocrResult);
      
      case DocumentCategory.FORM_1099_R:
        return this.extract1099RData(text, ocrResult);
      
      case DocumentCategory.FORM_1098:
        return this.extract1098Data(text, ocrResult);
      
      case DocumentCategory.PROPERTY_TAX:
        return this.extractPropertyTaxData(text, ocrResult);
      
      case DocumentCategory.MEDICAL_EXPENSES:
        return this.extractMedicalExpenseData(text, ocrResult);
      
      case DocumentCategory.CHARITABLE_DONATIONS:
        return this.extractCharitableData(text, ocrResult);
      
      default:
        return this.extractGenericData(text, ocrResult);
    }
  }

  private extractW2Data(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    // Extract employer information
    fields.employerName = this.extractFieldByPattern(text, /employer[:\s]+([^\n\r]+)/i);
    fields.employerEIN = this.extractFieldByPattern(text, /(\d{2}-\d{7})/);
    
    // Extract employee information
    fields.employeeName = this.extractFieldByPattern(text, /employee[:\s]+([^\n\r]+)/i);
    fields.employeeSSN = this.extractFieldByPattern(text, /(\d{3}-\d{2}-\d{4})/);
    
    // Extract wage and tax information
    fields.wages = this.extractMoneyAmount(text, /wages[,\s]*tips[,\s]*other[,\s]*compensation[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.federalTaxWithheld = this.extractMoneyAmount(text, /federal[,\s]*income[,\s]*tax[,\s]*withheld[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.socialSecurityWages = this.extractMoneyAmount(text, /social[,\s]*security[,\s]*wages[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.socialSecurityTaxWithheld = this.extractMoneyAmount(text, /social[,\s]*security[,\s]*tax[,\s]*withheld[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.medicareWages = this.extractMoneyAmount(text, /medicare[,\s]*wages[,\s]*and[,\s]*tips[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.medicareTaxWithheld = this.extractMoneyAmount(text, /medicare[,\s]*tax[,\s]*withheld[:\s]*\$?([\d,]+\.?\d*)/i);

    return fields;
  }

  private extract1099IntData(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    fields.payerName = this.extractFieldByPattern(text, /payer[:\s]+([^\n\r]+)/i);
    fields.payerTIN = this.extractFieldByPattern(text, /(\d{2}-\d{7})/);
    fields.recipientName = this.extractFieldByPattern(text, /recipient[:\s]+([^\n\r]+)/i);
    fields.recipientSSN = this.extractFieldByPattern(text, /(\d{3}-\d{2}-\d{4})/);
    fields.interestIncome = this.extractMoneyAmount(text, /interest[,\s]*income[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.federalTaxWithheld = this.extractMoneyAmount(text, /federal[,\s]*income[,\s]*tax[,\s]*withheld[:\s]*\$?([\d,]+\.?\d*)/i);

    return fields;
  }

  private extract1099DivData(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    fields.payerName = this.extractFieldByPattern(text, /payer[:\s]+([^\n\r]+)/i);
    fields.payerTIN = this.extractFieldByPattern(text, /(\d{2}-\d{7})/);
    fields.recipientName = this.extractFieldByPattern(text, /recipient[:\s]+([^\n\r]+)/i);
    fields.recipientSSN = this.extractFieldByPattern(text, /(\d{3}-\d{2}-\d{4})/);
    fields.ordinaryDividends = this.extractMoneyAmount(text, /ordinary[,\s]*dividends[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.qualifiedDividends = this.extractMoneyAmount(text, /qualified[,\s]*dividends[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.federalTaxWithheld = this.extractMoneyAmount(text, /federal[,\s]*income[,\s]*tax[,\s]*withheld[:\s]*\$?([\d,]+\.?\d*)/i);

    return fields;
  }

  private extract1099BData(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    fields.payerName = this.extractFieldByPattern(text, /payer[:\s]+([^\n\r]+)/i);
    fields.payerTIN = this.extractFieldByPattern(text, /(\d{2}-\d{7})/);
    fields.recipientName = this.extractFieldByPattern(text, /recipient[:\s]+([^\n\r]+)/i);
    fields.recipientSSN = this.extractFieldByPattern(text, /(\d{3}-\d{2}-\d{4})/);
    fields.proceedsFromSales = this.extractMoneyAmount(text, /proceeds[,\s]*from[,\s]*broker[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.costBasis = this.extractMoneyAmount(text, /cost[,\s]*or[,\s]*other[,\s]*basis[:\s]*\$?([\d,]+\.?\d*)/i);

    return fields;
  }

  private extract1099RData(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    fields.payerName = this.extractFieldByPattern(text, /payer[:\s]+([^\n\r]+)/i);
    fields.payerTIN = this.extractFieldByPattern(text, /(\d{2}-\d{7})/);
    fields.recipientName = this.extractFieldByPattern(text, /recipient[:\s]+([^\n\r]+)/i);
    fields.recipientSSN = this.extractFieldByPattern(text, /(\d{3}-\d{2}-\d{4})/);
    fields.grossDistribution = this.extractMoneyAmount(text, /gross[,\s]*distribution[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.taxableAmount = this.extractMoneyAmount(text, /taxable[,\s]*amount[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.federalTaxWithheld = this.extractMoneyAmount(text, /federal[,\s]*income[,\s]*tax[,\s]*withheld[:\s]*\$?([\d,]+\.?\d*)/i);

    return fields;
  }

  private extract1098Data(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    fields.lenderName = this.extractFieldByPattern(text, /lender[:\s]+([^\n\r]+)/i);
    fields.lenderTIN = this.extractFieldByPattern(text, /(\d{2}-\d{7})/);
    fields.borrowerName = this.extractFieldByPattern(text, /borrower[:\s]+([^\n\r]+)/i);
    fields.borrowerSSN = this.extractFieldByPattern(text, /(\d{3}-\d{2}-\d{4})/);
    fields.mortgageInterest = this.extractMoneyAmount(text, /mortgage[,\s]*interest[,\s]*received[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.points = this.extractMoneyAmount(text, /points[,\s]*paid[:\s]*\$?([\d,]+\.?\d*)/i);

    return fields;
  }

  private extractPropertyTaxData(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    fields.propertyAddress = this.extractFieldByPattern(text, /property[,\s]*address[:\s]+([^\n\r]+)/i);
    fields.taxYear = this.extractFieldByPattern(text, /tax[,\s]*year[:\s]*(\d{4})/i);
    fields.assessedValue = this.extractMoneyAmount(text, /assessed[,\s]*value[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.taxAmount = this.extractMoneyAmount(text, /tax[,\s]*amount[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.paidDate = this.extractFieldByPattern(text, /paid[,\s]*date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);

    return fields;
  }

  private extractMedicalExpenseData(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    fields.providerName = this.extractFieldByPattern(text, /provider[:\s]+([^\n\r]+)/i);
    fields.patientName = this.extractFieldByPattern(text, /patient[:\s]+([^\n\r]+)/i);
    fields.serviceDate = this.extractFieldByPattern(text, /service[,\s]*date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    fields.totalAmount = this.extractMoneyAmount(text, /total[,\s]*amount[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.paidAmount = this.extractMoneyAmount(text, /paid[,\s]*amount[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.serviceDescription = this.extractFieldByPattern(text, /service[,\s]*description[:\s]+([^\n\r]+)/i);

    return fields;
  }

  private extractCharitableData(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    fields.organizationName = this.extractFieldByPattern(text, /organization[:\s]+([^\n\r]+)/i);
    fields.donationDate = this.extractFieldByPattern(text, /donation[,\s]*date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    fields.donationAmount = this.extractMoneyAmount(text, /donation[,\s]*amount[:\s]*\$?([\d,]+\.?\d*)/i);
    fields.donationType = this.extractFieldByPattern(text, /donation[,\s]*type[:\s]+([^\n\r]+)/i);
    fields.receiptNumber = this.extractFieldByPattern(text, /receipt[,\s]*number[:\s]+([^\n\r]+)/i);

    return fields;
  }

  private extractGenericData(text: string, ocrResult: OCRResult): Record<string, any> {
    const fields: Record<string, any> = {};

    // Extract common patterns
    const amounts = text.match(/\$[\d,]+\.?\d*/g);
    if (amounts) {
      fields.amounts = amounts.map(amount => parseFloat(amount.replace(/[$,]/g, '')));
    }

    const dates = text.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
    if (dates) {
      fields.dates = dates;
    }

    const ssns = text.match(/\d{3}-\d{2}-\d{4}/g);
    if (ssns) {
      fields.ssns = ssns;
    }

    const eins = text.match(/\d{2}-\d{7}/g);
    if (eins) {
      fields.eins = eins;
    }

    fields.fullText = text;

    return fields;
  }

  private extractFieldByPattern(text: string, pattern: RegExp): string | null {
    const match = text.match(pattern);
    return match ? match[1]?.trim() || match[0]?.trim() : null;
  }

  private extractMoneyAmount(text: string, pattern: RegExp): number | null {
    const match = text.match(pattern);
    if (match && match[1]) {
      const cleanAmount = match[1].replace(/[,$]/g, '');
      const amount = parseFloat(cleanAmount);
      return isNaN(amount) ? null : amount;
    }
    return null;
  }

  private determineFormType(category: DocumentCategory, text: string): TaxFormType | undefined {
    const formTypeMap: Record<DocumentCategory, TaxFormType> = {
      [DocumentCategory.W2]: TaxFormType.W2,
      [DocumentCategory.FORM_1099_INT]: TaxFormType.FORM_1099_INT,
      [DocumentCategory.FORM_1099_DIV]: TaxFormType.FORM_1099_DIV,
      [DocumentCategory.FORM_1099_B]: TaxFormType.FORM_1099_B,
      [DocumentCategory.FORM_1099_R]: TaxFormType.FORM_1099_R,
      [DocumentCategory.FORM_1099_MISC]: TaxFormType.FORM_1099_MISC,
      [DocumentCategory.FORM_1099_NEC]: TaxFormType.FORM_1099_NEC,
      [DocumentCategory.FORM_1098]: TaxFormType.FORM_1098,
      [DocumentCategory.FORM_1098_T]: TaxFormType.FORM_1098_T,
      [DocumentCategory.SCHEDULE_K1]: TaxFormType.SCHEDULE_K1
    };

    return formTypeMap[category];
  }

  private requiresManualReview(fields: Record<string, any>): boolean {
    // Check if critical fields are missing or have low confidence
    const criticalFields = ['employerName', 'wages', 'payerName', 'interestIncome', 'organizationName'];
    const missingCriticalFields = criticalFields.filter(field => !fields[field]);
    
    return missingCriticalFields.length > 0 || Object.keys(fields).length < 3;
  }

  async cleanup(): Promise<void> {
    try {
      if (this.tesseractWorker) {
        await this.tesseractWorker.terminate();
        this.tesseractWorker = null;
        logger.info('Tesseract OCR worker terminated');
      }
    } catch (error) {
      logger.error('Failed to cleanup OCR service', { error: error.message });
    }
  }
}