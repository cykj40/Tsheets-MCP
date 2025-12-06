import { promises as fs } from 'fs';
import { StoredToken, StoredTokenSchema } from '../types/qbo.js';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer

export class TokenManager {
  private tokenFilePath: string;

  constructor(tokenFilePath: string) {
    this.tokenFilePath = tokenFilePath;
  }

  /**
   * Load tokens from file
   * Returns null if file doesn't exist or tokens are expired
   */
  async loadTokens(): Promise<StoredToken | null> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      const tokens = StoredTokenSchema.parse(parsed);

      // Check if token is expired (with buffer)
      const now = Date.now();
      if (tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS <= now) {
        return null; // Token expired
      }

      return tokens;
    } catch (error) {
      // File doesn't exist or invalid format
      return null;
    }
  }

  /**
   * Save tokens to file
   */
  async saveTokens(tokens: StoredToken): Promise<void> {
    const validated = StoredTokenSchema.parse(tokens);
    await fs.writeFile(
      this.tokenFilePath,
      JSON.stringify(validated, null, 2),
      'utf-8'
    );
  }

  /**
   * Get valid access token
   * Returns null if tokens are missing or expired
   */
  async getValidAccessToken(): Promise<string | null> {
    const tokens = await this.loadTokens();
    if (!tokens) {
      return null;
    }
    return tokens.accessToken;
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      const tokens = StoredTokenSchema.parse(parsed);
      return tokens.refreshToken;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get realm ID
   */
  async getRealmId(): Promise<string | null> {
    const tokens = await this.loadTokens();
    if (!tokens) {
      return null;
    }
    return tokens.realmId;
  }

  /**
   * Check if tokens exist and are valid
   */
  async hasValidTokens(): Promise<boolean> {
    const tokens = await this.loadTokens();
    return tokens !== null;
  }

  /**
   * Delete token file
   */
  async clearTokens(): Promise<void> {
    try {
      await fs.unlink(this.tokenFilePath);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }
}
