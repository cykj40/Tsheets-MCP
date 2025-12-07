import fetch from 'node-fetch';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { TokenResponse, TokenResponseSchema, StoredToken } from '../types/qbo.js';

const INTUIT_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  port?: number;
}

export class IntuitOAuth {
  private config: OAuthConfig;
  private server: Server | null = null;
  private authPromise: Promise<{ code: string; realmId: string }> | null = null;

  constructor(config: OAuthConfig) {
    this.config = {
      ...config,
      port: config.port || 3000,
    };
  }

  /**
   * Generate authorization URL with state parameter
   */
  generateAuthUrl(state: string = this.generateState()): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: this.config.redirectUri,
      state,
    });

    return `${INTUIT_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, realmId: string): Promise<StoredToken> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
    });

    const authHeader = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch(INTUIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const tokenResponse = TokenResponseSchema.parse(data);

    return this.convertToStoredToken(tokenResponse, realmId);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string, realmId: string): Promise<StoredToken> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const authHeader = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch(INTUIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const tokenResponse = TokenResponseSchema.parse(data);

    return this.convertToStoredToken(tokenResponse, realmId);
  }

  /**
   * Convert TokenResponse to StoredToken
   */
  private convertToStoredToken(tokenResponse: TokenResponse, realmId: string): StoredToken {
    const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt,
      realmId,
    };
  }

  /**
   * Generate random state parameter for OAuth
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Start Express server and wait for OAuth callback
   */
  async startAuthServer(): Promise<{ code: string; realmId: string }> {
    if (this.authPromise) return this.authPromise;

    this.authPromise = new Promise((resolve, reject) => {
      const app = express();
      app.use(cors());

      // OAuth callback endpoint
      app.get('/oauth/callback', (req: Request, res: Response) => {
        const { code, realmId, error } = req.query;

        if (error) {
          res.send(`
            <!DOCTYPE html>
            <html>
              <head><title>OAuth Error</title></head>
              <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
                <h1 style="color: #d32f2f;">❌ Authorization Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          reject(new Error(`OAuth error: ${error}`));
          this.stopServer();
          return;
        }

        if (!code || !realmId) {
          res.send(`
            <!DOCTYPE html>
            <html>
              <head><title>Invalid Request</title></head>
              <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
                <h1 style="color: #ff9800;">⚠️ Missing Parameters</h1>
                <p>Missing authorization code or realm ID.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          reject(new Error('Missing OAuth parameters'));
          this.stopServer();
          return;
        }

        res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Authorization Successful</title></head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
              <h1 style="color: #4caf50;">✅ Authorization Successful!</h1>
              <p>You can close this window and return to Claude.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);

        resolve({ code: code as string, realmId: realmId as string });
        setTimeout(() => this.stopServer(), 1000);
      });

      // Health check endpoint
      app.get('/', (_req: Request, res: Response) => {
        res.send('OAuth server is running. Waiting for authorization callback...');
      });

      // Start server
      this.server = app.listen(this.config.port, () => {
        console.error(`\n🔐 OAuth server started on http://localhost:${this.config.port}`);
        console.error(`Waiting for authorization callback...`);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.server) {
          reject(new Error('OAuth authorization timed out after 5 minutes'));
          this.stopServer();
        }
      }, 300000);
    });

    return this.authPromise;
  }

  /**
   * Stop the Express server
   */
  private stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.authPromise = null;
      console.error('OAuth server stopped\n');
    }
  }

  /**
   * Complete OAuth flow - generates URL, starts server, waits for callback
   */
  async authorize(): Promise<StoredToken> {
    const state = this.generateState();
    const authUrl = this.generateAuthUrl(state);

    console.error('\n' + '='.repeat(60));
    console.error('QUICKBOOKS AUTHORIZATION REQUIRED');
    console.error('='.repeat(60));
    console.error('\nOpen this URL in your browser:\n');
    console.error(authUrl);
    console.error('\n');

    // Start server and wait for callback
    const { code, realmId } = await this.startAuthServer();

    console.error('Exchanging authorization code for tokens...');

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code, realmId);

    console.error('✅ Authorization successful! Tokens saved.\n');

    return tokens;
  }
}
