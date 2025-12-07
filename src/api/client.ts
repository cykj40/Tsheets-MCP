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
   * Initialize client by loading realm ID, auto-authorize if needed
   */
  async initialize(): Promise<void> {
    this.realmId = await this.tokenManager.getRealmId();
    
    // If no realm ID, trigger authorization flow
    if (!this.realmId) {
      console.error('No tokens found. Starting authorization flow...');
      const tokens = await this.oauth.authorize();
      await this.tokenManager.saveTokens(tokens);
      this.realmId = tokens.realmId;
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
   * Get valid access token with automatic refresh or re-authorization
   */
  private async getValidAccessToken(): Promise<string> {
    let accessToken = await this.tokenManager.getValidAccessToken();

    // If token is invalid/expired, try to refresh
    if (!accessToken) {
      const refreshToken = await this.tokenManager.getRefreshToken();
      const realmId = await this.tokenManager.getRealmId();

      if (refreshToken && realmId) {
        try {
          // Try to refresh the token
          const newTokens = await this.oauth.refreshAccessToken(refreshToken, realmId);
          await this.tokenManager.saveTokens(newTokens);
          accessToken = newTokens.accessToken;
        } catch (error) {
          console.error('Token refresh failed, starting re-authorization...');
          // Refresh failed, need to re-authorize
          const tokens = await this.oauth.authorize();
          await this.tokenManager.saveTokens(tokens);
          this.realmId = tokens.realmId;
          accessToken = tokens.accessToken;
        }
      } else {
        // No refresh token, need to authorize
        console.error('No tokens found, starting authorization...');
        const tokens = await this.oauth.authorize();
        await this.tokenManager.saveTokens(tokens);
        this.realmId = tokens.realmId;
        accessToken = tokens.accessToken;
      }
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
