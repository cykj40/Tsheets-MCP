import { promises as fs } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';
import { TSheetsStoredToken } from './tsheets-oauth.js';
import { z } from 'zod';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer
const LOCK_RETRY_MS = 100;
const LOCK_MAX_WAIT_MS = 30_000;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function resolveTokenFilePath(tokenFilePath: string): string {
  return isAbsolute(tokenFilePath) ? tokenFilePath : resolve(PROJECT_ROOT, tokenFilePath);
}

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
    this.tokenFilePath = resolveTokenFilePath(tokenFilePath);
    console.error(`[TokenManager] Initialized with token file: ${this.tokenFilePath}`);
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
      const remainingMs = tokens.expiresAt - now;
      const isExpired = tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS <= now;
      console.error(
        `[TokenManager] expiresAt=${tokens.expiresAt} (${new Date(tokens.expiresAt).toISOString()}) ` +
        `now=${now} (${new Date(now).toISOString()}) ` +
        `remainingMs=${remainingMs} buffer=${TOKEN_EXPIRY_BUFFER_MS} expired=${isExpired}`,
      );
      if (isExpired) {
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

  getTokenFilePath(): string {
    return this.tokenFilePath;
  }

  /**
   * Serialize refresh so only one process rotates TSheets tokens at a time.
   * TSheets invalidates the previous refresh_token on each refresh.
   */
  async withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockPath = `${this.tokenFilePath}.lock`;
    const release = await this.acquireLock(lockPath);
    try {
      return await operation();
    } finally {
      await release();
    }
  }

  private async acquireLock(lockPath: string): Promise<() => Promise<void>> {
    const start = Date.now();

    while (Date.now() - start < LOCK_MAX_WAIT_MS) {
      try {
        await fs.writeFile(lockPath, `${process.pid}@${Date.now()}`, { flag: 'wx' });
        return async () => {
          try {
            await fs.unlink(lockPath);
          } catch {
            // Lock already removed or never created.
          }
        };
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
          await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_MS));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Timed out waiting for token refresh lock');
  }

  /**
   * Save tokens to file (atomic write to avoid partial/corrupt token files)
   */
  async saveTokens(tokens: TSheetsStoredToken): Promise<void> {
    const validated = TSheetsStoredTokenSchema.parse(tokens);
    if (validated.accessToken === validated.refreshToken) {
      console.error('[TokenManager] Warning: access and refresh tokens are identical');
    }

    await fs.mkdir(dirname(this.tokenFilePath), { recursive: true });

    const tempPath = `${this.tokenFilePath}.${process.pid}.tmp`;
    const content = JSON.stringify(validated, null, 2);
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, this.tokenFilePath);
    console.error(`[TokenManager] Tokens saved to ${this.tokenFilePath}`);
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
