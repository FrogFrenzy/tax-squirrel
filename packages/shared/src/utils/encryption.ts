import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export class EncryptionService {
  private static instance: EncryptionService;
  private encryptionKey: Buffer;

  private constructor() {
    // In production, this should come from environment variables or key management service
    const keyString = process.env.ENCRYPTION_KEY || 'default-key-for-development-only-change-in-production';
    this.encryptionKey = crypto.scryptSync(keyString, 'salt', KEY_LENGTH);
  }

  public static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  public encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, this.encryptionKey);
    cipher.setAAD(Buffer.from('tax-app-auth'));

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine iv, tag, and encrypted data
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
  }

  public decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipher(ALGORITHM, this.encryptionKey);
    decipher.setAAD(Buffer.from('tax-app-auth'));
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  public hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const saltRounds = 12;
      crypto.pbkdf2(password, crypto.randomBytes(16), saltRounds, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve(derivedKey.toString('hex'));
      });
    });
  }

  public verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // In a real implementation, you'd store the salt separately
      // This is a simplified version for demonstration
      this.hashPassword(password).then(newHash => {
        resolve(crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(newHash)));
      }).catch(reject);
    });
  }

  public generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}