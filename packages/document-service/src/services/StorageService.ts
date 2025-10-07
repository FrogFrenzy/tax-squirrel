import AWS from 'aws-sdk';
import crypto from 'crypto';
import path from 'path';
import { 
  Logger,
  ApiResponse,
  ErrorCodes
} from '@tax-app/shared';

const logger = new Logger('storage-service');

export interface StorageConfig {
  provider: 'aws' | 'local';
  aws?: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
  };
  local?: {
    uploadPath: string;
    baseUrl: string;
  };
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  checksum: string;
}

export class StorageService {
  private config: StorageConfig;
  private s3?: AWS.S3;

  constructor(config: StorageConfig) {
    this.config = config;
    
    if (config.provider === 'aws' && config.aws) {
      AWS.config.update({
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
        region: config.aws.region
      });
      
      this.s3 = new AWS.S3();
    }
  }

  async uploadFile(
    buffer: Buffer,
    fileName: string,
    userId: string,
    contentType: string
  ): Promise<ApiResponse<UploadResult>> {
    try {
      // Generate unique file key
      const fileExtension = path.extname(fileName);
      const timestamp = Date.now();
      const randomString = crypto.randomBytes(8).toString('hex');
      const key = `users/${userId}/documents/${timestamp}-${randomString}${fileExtension}`;

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

      let uploadResult: UploadResult;

      if (this.config.provider === 'aws') {
        uploadResult = await this.uploadToS3(buffer, key, contentType, checksum);
      } else {
        uploadResult = await this.uploadToLocal(buffer, key, contentType, checksum);
      }

      logger.info('File uploaded successfully', {
        userId,
        fileName,
        key: uploadResult.key,
        size: uploadResult.size
      });

      return {
        success: true,
        data: uploadResult,
        message: 'File uploaded successfully'
      };

    } catch (error) {
      logger.error('File upload failed', {
        error: error.message,
        userId,
        fileName
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'File upload failed'
        }
      };
    }
  }

  private async uploadToS3(
    buffer: Buffer,
    key: string,
    contentType: string,
    checksum: string
  ): Promise<UploadResult> {
    if (!this.s3 || !this.config.aws) {
      throw new Error('S3 not configured');
    }

    const params: AWS.S3.PutObjectRequest = {
      Bucket: this.config.aws.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        checksum,
        uploadedAt: new Date().toISOString()
      },
      ServerSideEncryption: 'AES256'
    };

    const result = await this.s3.upload(params).promise();

    return {
      url: result.Location,
      key,
      size: buffer.length,
      checksum
    };
  }

  private async uploadToLocal(
    buffer: Buffer,
    key: string,
    contentType: string,
    checksum: string
  ): Promise<UploadResult> {
    if (!this.config.local) {
      throw new Error('Local storage not configured');
    }

    const fs = require('fs').promises;
    const filePath = path.join(this.config.local.uploadPath, key);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, buffer);

    const url = `${this.config.local.baseUrl}/${key}`;

    return {
      url,
      key,
      size: buffer.length,
      checksum
    };
  }

  async deleteFile(key: string): Promise<ApiResponse<void>> {
    try {
      if (this.config.provider === 'aws') {
        await this.deleteFromS3(key);
      } else {
        await this.deleteFromLocal(key);
      }

      logger.info('File deleted successfully', { key });

      return {
        success: true,
        message: 'File deleted successfully'
      };

    } catch (error) {
      logger.error('File deletion failed', {
        error: error.message,
        key
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'File deletion failed'
        }
      };
    }
  }

  private async deleteFromS3(key: string): Promise<void> {
    if (!this.s3 || !this.config.aws) {
      throw new Error('S3 not configured');
    }

    const params: AWS.S3.DeleteObjectRequest = {
      Bucket: this.config.aws.bucket,
      Key: key
    };

    await this.s3.deleteObject(params).promise();
  }

  private async deleteFromLocal(key: string): Promise<void> {
    if (!this.config.local) {
      throw new Error('Local storage not configured');
    }

    const fs = require('fs').promises;
    const filePath = path.join(this.config.local.uploadPath, key);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist, which is okay for deletion
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<ApiResponse<string>> {
    try {
      let url: string;

      if (this.config.provider === 'aws') {
        url = await this.getS3SignedUrl(key, expiresIn);
      } else {
        url = await this.getLocalUrl(key);
      }

      return {
        success: true,
        data: url,
        message: 'Signed URL generated successfully'
      };

    } catch (error) {
      logger.error('Failed to generate signed URL', {
        error: error.message,
        key
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to generate signed URL'
        }
      };
    }
  }

  private async getS3SignedUrl(key: string, expiresIn: number): Promise<string> {
    if (!this.s3 || !this.config.aws) {
      throw new Error('S3 not configured');
    }

    const params = {
      Bucket: this.config.aws.bucket,
      Key: key,
      Expires: expiresIn
    };

    return this.s3.getSignedUrl('getObject', params);
  }

  private async getLocalUrl(key: string): Promise<string> {
    if (!this.config.local) {
      throw new Error('Local storage not configured');
    }

    return `${this.config.local.baseUrl}/${key}`;
  }

  async generateThumbnail(
    buffer: Buffer,
    fileName: string,
    userId: string
  ): Promise<ApiResponse<UploadResult>> {
    try {
      // For now, we'll just return the original file
      // In a real implementation, you would use a library like Sharp
      // to generate thumbnails for images and PDFs
      
      const thumbnailKey = `users/${userId}/thumbnails/${Date.now()}-thumb-${fileName}`;
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

      let uploadResult: UploadResult;

      if (this.config.provider === 'aws') {
        uploadResult = await this.uploadToS3(buffer, thumbnailKey, 'image/jpeg', checksum);
      } else {
        uploadResult = await this.uploadToLocal(buffer, thumbnailKey, 'image/jpeg', checksum);
      }

      return {
        success: true,
        data: uploadResult,
        message: 'Thumbnail generated successfully'
      };

    } catch (error) {
      logger.error('Thumbnail generation failed', {
        error: error.message,
        userId,
        fileName
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Thumbnail generation failed'
        }
      };
    }
  }

  validateFile(buffer: Buffer, fileName: string, maxSize: number = 10 * 1024 * 1024): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check file size
    if (buffer.length > maxSize) {
      errors.push(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
    }

    // Check file extension
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp'];
    const fileExtension = path.extname(fileName).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      errors.push(`File type ${fileExtension} is not allowed`);
    }

    // Basic file header validation
    const fileSignatures = {
      pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
      jpg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47],
      gif: [0x47, 0x49, 0x46],
      tiff: [0x49, 0x49, 0x2A, 0x00] // Little endian TIFF
    };

    let validSignature = false;
    for (const [type, signature] of Object.entries(fileSignatures)) {
      if (buffer.length >= signature.length) {
        const match = signature.every((byte, index) => buffer[index] === byte);
        if (match) {
          validSignature = true;
          break;
        }
      }
    }

    if (!validSignature) {
      errors.push('Invalid file format or corrupted file');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}