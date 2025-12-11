import { promises as fs } from 'fs';
import { TSheetsStoredToken } from './tsheets-oauth.js';
import { z } from 'zod';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer

// TSheets Token Schema
const TSheetsStoredTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  userId: z.string(),
  companyId: z.string(),
  clientUrl: z.string(),
});

export class TokenManager {
  private tokenFilePath: string;

  constructor(tokenFilePath: string) {
    this.tokenFilePath = tokenFilePath;
  }

  /**
   * Load tokens from file
   * Returns null if file doesn't exist or tokens are expired
   */
  async loadTokens(): Promise<TSheetsStoredToken | null> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      const parsed = JSON.parse(data);

      const tokens = TSheetsStoredTokenSchema.parse(parsed);
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
  async saveTokens(tokens: TSheetsStoredToken): Promise<void> {
    const validated = TSheetsStoredTokenSchema.parse(tokens);
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
      const tokens = TSheetsStoredTokenSchema.parse(parsed);
      return tokens.refreshToken;
    } catch (error) {
      return null;
    }
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
