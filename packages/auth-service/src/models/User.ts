import { Pool } from 'pg';
import { User, UserProfile, SecuritySettings, FilingStatus, MFAMethod } from '@tax-app/shared';
import { EncryptionService } from '@tax-app/shared';

export class UserModel {
  private db: Pool;
  private encryption: EncryptionService;

  constructor(db: Pool) {
    this.db = db;
    this.encryption = EncryptionService.getInstance();
  }

  async createUser(userData: {
    email: string;
    passwordHash: string;
    profile: UserProfile;
  }): Promise<User> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Encrypt sensitive data
      const encryptedSSN = userData.profile.ssn ? this.encryption.encrypt(userData.profile.ssn) : null;

      // Insert user
      const userResult = await client.query(`
        INSERT INTO users (email, password_hash, email_verified, is_active, created_at, last_login)
        VALUES ($1, $2, $3, $4, NOW(), NULL)
        RETURNING id, email, email_verified, is_active, created_at, last_login
      `, [userData.email, userData.passwordHash, false, true]);

      const userId = userResult.rows[0].id;

      // Insert user profile
      await client.query(`
        INSERT INTO user_profiles (
          user_id, first_name, last_name, ssn_encrypted, date_of_birth,
          street1, street2, city, state, zip_code, country, filing_status, phone_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        userId,
        userData.profile.firstName,
        userData.profile.lastName,
        encryptedSSN,
        userData.profile.dateOfBirth,
        userData.profile.address.street1,
        userData.profile.address.street2,
        userData.profile.address.city,
        userData.profile.address.state,
        userData.profile.address.zipCode,
        userData.profile.address.country,
        userData.profile.filingStatus,
        userData.profile.phoneNumber
      ]);

      // Insert security settings
      await client.query(`
        INSERT INTO user_security_settings (
          user_id, mfa_enabled, password_last_changed, login_attempts, session_timeout
        ) VALUES ($1, $2, NOW(), $3, $4)
      `, [userId, false, 0, 15]);

      await client.query('COMMIT');

      return this.getUserById(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const result = await this.db.query(`
      SELECT 
        u.id, u.email, u.email_verified, u.is_active, u.created_at, u.last_login,
        p.first_name, p.last_name, p.ssn_encrypted, p.date_of_birth,
        p.street1, p.street2, p.city, p.state, p.zip_code, p.country,
        p.filing_status, p.phone_number,
        s.mfa_enabled, s.mfa_method, s.mfa_secret_encrypted, s.backup_codes_encrypted,
        s.password_last_changed, s.login_attempts, s.locked_until, s.session_timeout
      FROM users u
      JOIN user_profiles p ON u.id = p.user_id
      JOIN user_security_settings s ON u.id = s.user_id
      WHERE u.id = $1 AND u.is_active = true
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(`
      SELECT 
        u.id, u.email, u.email_verified, u.is_active, u.created_at, u.last_login,
        p.first_name, p.last_name, p.ssn_encrypted, p.date_of_birth,
        p.street1, p.street2, p.city, p.state, p.zip_code, p.country,
        p.filing_status, p.phone_number,
        s.mfa_enabled, s.mfa_method, s.mfa_secret_encrypted, s.backup_codes_encrypted,
        s.password_last_changed, s.login_attempts, s.locked_until, s.session_timeout
      FROM users u
      JOIN user_profiles p ON u.id = p.user_id
      JOIN user_security_settings s ON u.id = s.user_id
      WHERE u.email = $1 AND u.is_active = true
    `, [email]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  async getUserPasswordHash(userId: string): Promise<string | null> {
    const result = await this.db.query(
      'SELECT password_hash FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    return result.rows.length > 0 ? result.rows[0].password_hash : null;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [userId]
    );
  }

  async updateLoginAttempts(userId: string, attempts: number, lockUntil?: Date): Promise<void> {
    await this.db.query(
      'UPDATE user_security_settings SET login_attempts = $1, locked_until = $2 WHERE user_id = $3',
      [attempts, lockUntil, userId]
    );
  }

  async setupMFA(userId: string, method: MFAMethod, secret: string, backupCodes: string[]): Promise<void> {
    const encryptedSecret = this.encryption.encrypt(secret);
    const encryptedBackupCodes = this.encryption.encrypt(JSON.stringify(backupCodes));

    await this.db.query(`
      UPDATE user_security_settings 
      SET mfa_enabled = true, mfa_method = $1, mfa_secret_encrypted = $2, backup_codes_encrypted = $3
      WHERE user_id = $4
    `, [method, encryptedSecret, encryptedBackupCodes, userId]);
  }

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<User> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (updates.firstName) {
        updateFields.push(`first_name = $${paramIndex++}`);
        updateValues.push(updates.firstName);
      }

      if (updates.lastName) {
        updateFields.push(`last_name = $${paramIndex++}`);
        updateValues.push(updates.lastName);
      }

      if (updates.phoneNumber) {
        updateFields.push(`phone_number = $${paramIndex++}`);
        updateValues.push(updates.phoneNumber);
      }

      if (updates.filingStatus) {
        updateFields.push(`filing_status = $${paramIndex++}`);
        updateValues.push(updates.filingStatus);
      }

      if (updates.address) {
        if (updates.address.street1) {
          updateFields.push(`street1 = $${paramIndex++}`);
          updateValues.push(updates.address.street1);
        }
        if (updates.address.street2 !== undefined) {
          updateFields.push(`street2 = $${paramIndex++}`);
          updateValues.push(updates.address.street2);
        }
        if (updates.address.city) {
          updateFields.push(`city = $${paramIndex++}`);
          updateValues.push(updates.address.city);
        }
        if (updates.address.state) {
          updateFields.push(`state = $${paramIndex++}`);
          updateValues.push(updates.address.state);
        }
        if (updates.address.zipCode) {
          updateFields.push(`zip_code = $${paramIndex++}`);
          updateValues.push(updates.address.zipCode);
        }
        if (updates.address.country) {
          updateFields.push(`country = $${paramIndex++}`);
          updateValues.push(updates.address.country);
        }
      }

      if (updateFields.length > 0) {
        updateValues.push(userId);
        await client.query(`
          UPDATE user_profiles 
          SET ${updateFields.join(', ')}
          WHERE user_id = $${paramIndex}
        `, updateValues);
      }

      await client.query('COMMIT');
      return this.getUserById(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapRowToUser(row: any): User {
    const decryptedSSN = row.ssn_encrypted ? this.encryption.decrypt(row.ssn_encrypted) : '';
    
    return {
      id: row.id,
      email: row.email,
      emailVerified: row.email_verified,
      isActive: row.is_active,
      createdAt: row.created_at,
      lastLogin: row.last_login,
      profile: {
        firstName: row.first_name,
        lastName: row.last_name,
        ssn: decryptedSSN,
        dateOfBirth: row.date_of_birth,
        address: {
          street1: row.street1,
          street2: row.street2,
          city: row.city,
          state: row.state,
          zipCode: row.zip_code,
          country: row.country
        },
        filingStatus: row.filing_status as FilingStatus,
        phoneNumber: row.phone_number
      },
      securitySettings: {
        mfaEnabled: row.mfa_enabled,
        mfaMethod: row.mfa_method as MFAMethod,
        mfaSecret: row.mfa_secret_encrypted ? this.encryption.decrypt(row.mfa_secret_encrypted) : undefined,
        backupCodes: row.backup_codes_encrypted ? JSON.parse(this.encryption.decrypt(row.backup_codes_encrypted)) : undefined,
        passwordLastChanged: row.password_last_changed,
        loginAttempts: row.login_attempts,
        lockedUntil: row.locked_until,
        sessionTimeout: row.session_timeout
      }
    };
  }
}