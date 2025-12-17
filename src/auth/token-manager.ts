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
    if (!tokenFilePath) {
      throw new Error('Token file path is required');
    }
    this.tokenFilePath = tokenFilePath;
    console.error(`[TokenManager] Initialized with token file: ${tokenFilePath}`);
  }

  /**
   * Load tokens from file
   * Returns null if file doesn't exist or tokens are expired
   */
  async loadTokens(): Promise<TSheetsStoredToken | null> {
    console.error(`[TokenManager] Attempting to load tokens from: ${this.tokenFilePath}`);

    try {
      // Check if file path is defined
      if (!this.tokenFilePath) {
        console.error('[TokenManager] Error: Token file path is undefined');
        return null;
      }

      // Read file
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');

      // Check if file is empty
      if (!data || data.trim() === '') {
        console.error('[TokenManager] Error: Token file is empty');
        return null;
      }

      // Parse JSON
      const parsed = JSON.parse(data);

      // Validate schema
      const tokens = TSheetsStoredTokenSchema.parse(parsed);

      // Check if token is expired (with buffer)
      const now = Date.now();
      if (tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS <= now) {
        console.error('[TokenManager] Token is expired');
        return null; // Token expired
      }

      console.error('[TokenManager] Tokens loaded successfully');
      return tokens;
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          console.error('[TokenManager] Error: Token file does not exist. Run authentication first.');
        } else if (error.name === 'SyntaxError') {
          console.error('[TokenManager] Error: Token file contains invalid JSON');
        } else if (error.name === 'ZodError') {
          console.error('[TokenManager] Error: Token file has invalid format');
        } else {
          console.error(`[TokenManager] Error loading tokens: ${error.message}`);
        }
      } else {
        console.error(`[TokenManager] Unknown error loading tokens: ${String(error)}`);
      }
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
      if (!this.tokenFilePath) {
        console.error('[TokenManager] Error: Token file path is undefined');
        return null;
      }

      const data = await fs.readFile(this.tokenFilePath, 'utf-8');

      if (!data || data.trim() === '') {
        console.error('[TokenManager] Error: Token file is empty');
        return null;
      }

      const parsed = JSON.parse(data);
      const tokens = TSheetsStoredTokenSchema.parse(parsed);
      return tokens.refreshToken;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`[TokenManager] Error getting refresh token: ${error.message}`);
      }
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
