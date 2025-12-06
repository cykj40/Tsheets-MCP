import fetch from 'node-fetch';
import { TokenManager } from '../auth/token-manager.js';
import { IntuitOAuth, OAuthConfig } from '../auth/oauth.js';
import { QBOErrorSchema } from '../types/qbo.js';

const QBO_API_BASE_URL = 'https://quickbooks.api.intuit.com/v3/company';
const QBO_MINOR_VERSION = '73';

export class QBOClient {
  private tokenManager: TokenManager;
  private oauth: IntuitOAuth;
  private realmId: string | null = null;

  constructor(tokenManager: TokenManager, oauthConfig: OAuthConfig) {
    this.tokenManager = tokenManager;
    this.oauth = new IntuitOAuth(oauthConfig);
  }

  /**
   * Initialize client by loading realm ID
   */
  async initialize(): Promise<void> {
    this.realmId = await this.tokenManager.getRealmId();
    if (!this.realmId) {
      throw new Error('No realm ID found. Please authenticate first using: npm run auth');
    }
  }

  /**
   * Execute a QBO query with automatic token refresh
   */
  async query<T>(queryString: string): Promise<T> {
    if (!this.realmId) {
      await this.initialize();
    }

    const url = `${QBO_API_BASE_URL}/${this.realmId}/query`;
    const params = new URLSearchParams({
      query: queryString,
      minorversion: QBO_MINOR_VERSION,
    });

    const fullUrl = `${url}?${params.toString()}`;

    // Get access token (may trigger refresh)
    const accessToken = await this.getValidAccessToken();

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Try to parse as QBO error
      try {
        const errorJson = JSON.parse(errorText);
        const qboError = QBOErrorSchema.parse(errorJson);
        const errorMessage = qboError.Fault.Error.map(e => e.Message).join(', ');
        throw new Error(`QBO API Error: ${errorMessage}`);
      } catch {
        throw new Error(`QBO API request failed: ${response.status} - ${errorText}`);
      }
    }

    const data = await response.json();
    return data as T;
  }

  /**
   * Get valid access token with automatic refresh
   */
  private async getValidAccessToken(): Promise<string> {
    let accessToken = await this.tokenManager.getValidAccessToken();

    // If token is invalid/expired, try to refresh
    if (!accessToken) {
      const refreshToken = await this.tokenManager.getRefreshToken();
      const realmId = await this.tokenManager.getRealmId();

      if (!refreshToken || !realmId) {
        throw new Error('No valid tokens found. Please authenticate first using: npm run auth');
      }

      // Refresh the token
      const newTokens = await this.oauth.refreshAccessToken(refreshToken, realmId);
      await this.tokenManager.saveTokens(newTokens);

      accessToken = newTokens.accessToken;
    }

    return accessToken;
  }

  /**
   * Get the current realm ID
   */
  getRealmId(): string {
    if (!this.realmId) {
      throw new Error('Client not initialized');
    }
    return this.realmId;
  }
}
