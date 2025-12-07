import fetch from 'node-fetch';
import { TokenManager } from '../auth/token-manager.js';
import { IntuitOAuth, OAuthConfig } from '../auth/oauth.js';
import { QBOErrorSchema } from '../types/qbo.js';

const QBO_API_BASE_URL = 'https://quickbooks.api.intuit.com/v3/company';
const QBO_SANDBOX_BASE_URL = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
const QBO_MINOR_VERSION = '75';

export class QBOClient {
  private tokenManager: TokenManager;
  private oauth: IntuitOAuth;
  private realmId: string | null = null;
  private useSandbox: boolean;

  constructor(tokenManager: TokenManager, oauthConfig: OAuthConfig, useSandbox: boolean = false) {
    this.tokenManager = tokenManager;
    this.oauth = new IntuitOAuth(oauthConfig);
    this.useSandbox = useSandbox;
  }

  /**
   * Get the appropriate base URL (sandbox or production)
   */
  private getBaseUrl(): string {
    return this.useSandbox ? QBO_SANDBOX_BASE_URL : QBO_API_BASE_URL;
  }

  /**
   * Initialize client by loading realm ID, auto-authorize if needed
   */
  async initialize(): Promise<void> {
    console.error('[QBOClient] Initializing client...');
    this.realmId = await this.tokenManager.getRealmId();

    // If no realm ID, trigger authorization flow
    if (!this.realmId) {
      console.error('[QBOClient] No tokens found. Starting authorization flow...');
      const tokens = await this.oauth.authorize();
      await this.tokenManager.saveTokens(tokens);
      this.realmId = tokens.realmId;
      console.error(`[QBOClient] Authorized with realm ID: ${this.realmId}`);
    } else {
      console.error(`[QBOClient] Loaded realm ID: ${this.realmId}`);
    }
  }

  /**
   * Execute a QBO query with automatic token refresh
   */
  async query<T>(queryString: string): Promise<T> {
    console.error('[QBOClient] Executing query:', queryString);

    if (!this.realmId) {
      await this.initialize();
    }

    const url = `${this.getBaseUrl()}/${this.realmId}/query`;
    const params = new URLSearchParams({
      query: queryString,
      minorversion: QBO_MINOR_VERSION,
    });

    const fullUrl = `${url}?${params.toString()}`;
    console.error('[QBOClient] Request URL:', fullUrl);

    // Get access token (may trigger refresh)
    const accessToken = await this.getValidAccessToken();
    console.error('[QBOClient] Using access token (first 20 chars):', accessToken.substring(0, 20) + '...');

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    console.error('[QBOClient] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[QBOClient] Error response:', errorText);

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
    console.error('[QBOClient] Response data keys:', Object.keys(data));
    return data as T;
  }

  /**
   * Execute a direct GET request to a QBO entity endpoint
   */
  async get<T>(endpoint: string): Promise<T> {
    console.error('[QBOClient] Executing GET request:', endpoint);

    if (!this.realmId) {
      await this.initialize();
    }

    const url = `${this.getBaseUrl()}/${this.realmId}/${endpoint}`;
    const params = new URLSearchParams({
      minorversion: QBO_MINOR_VERSION,
    });

    const fullUrl = `${url}?${params.toString()}`;
    console.error('[QBOClient] Request URL:', fullUrl);

    // Get access token (may trigger refresh)
    const accessToken = await this.getValidAccessToken();
    console.error('[QBOClient] Using access token (first 20 chars):', accessToken.substring(0, 20) + '...');

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    console.error('[QBOClient] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[QBOClient] Error response:', errorText);

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
    console.error('[QBOClient] Response data keys:', Object.keys(data));
    return data as T;
  }

  /**
   * Get valid access token with automatic refresh or re-authorization
   */
  private async getValidAccessToken(): Promise<string> {
    console.error('[QBOClient] Getting valid access token...');
    let accessToken = await this.tokenManager.getValidAccessToken();

    // If token is invalid/expired, try to refresh
    if (!accessToken) {
      console.error('[QBOClient] Access token expired or missing, attempting refresh...');
      const refreshToken = await this.tokenManager.getRefreshToken();
      const realmId = await this.tokenManager.getRealmId();

      if (refreshToken && realmId) {
        try {
          console.error('[QBOClient] Refreshing access token...');
          // Try to refresh the token
          const newTokens = await this.oauth.refreshAccessToken(refreshToken, realmId);
          await this.tokenManager.saveTokens(newTokens);
          accessToken = newTokens.accessToken;
          console.error('[QBOClient] Token refreshed successfully');
        } catch (error) {
          console.error('[QBOClient] Token refresh failed, starting re-authorization...');
          // Refresh failed, need to re-authorize
          const tokens = await this.oauth.authorize();
          await this.tokenManager.saveTokens(tokens);
          this.realmId = tokens.realmId;
          accessToken = tokens.accessToken;
        }
      } else {
        // No refresh token, need to authorize
        console.error('[QBOClient] No tokens found, starting authorization...');
        const tokens = await this.oauth.authorize();
        await this.tokenManager.saveTokens(tokens);
        this.realmId = tokens.realmId;
        accessToken = tokens.accessToken;
      }
    } else {
      console.error('[QBOClient] Using existing valid access token');
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
