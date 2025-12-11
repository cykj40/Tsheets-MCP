/**
 * TSheets OAuth 2.0 Implementation
 * 
 * Docs: https://tsheetsteam.github.io/api_docs/?javascript--node#oauth2-0
 */

import fetch from 'node-fetch';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { z } from 'zod';

const TSHEETS_AUTH_URL = 'https://rest.tsheets.com/api/v1/authorize';
const TSHEETS_TOKEN_URL = 'https://rest.tsheets.com/api/v1/grant';

// TSheets Token Response Schema
const TSheetsTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  scope: z.string(),
  refresh_token: z.string(),
  user_id: z.string(),
  company_id: z.string(),
  client_url: z.string(),
});

type TSheetsTokenResponse = z.infer<typeof TSheetsTokenResponseSchema>;

export interface TSheetsStoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  companyId: string;
  clientUrl: string;
}

export interface TSheetsOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  port?: number;
}

export class TSheetsOAuth {
  private config: TSheetsOAuthConfig;
  private server: Server | null = null;
  private authPromise: Promise<{ code: string; state: string }> | null = null;

  constructor(config: TSheetsOAuthConfig) {
    this.config = {
      ...config,
      port: config.port || 3000,
    };
  }

  /**
   * Generate authorization URL with state parameter
   */
  generateAuthUrl(state: string = this.generateState()): { url: string; state: string } {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state,
    });

    return {
      url: `${TSHEETS_AUTH_URL}?${params.toString()}`,
      state,
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<TSheetsStoredToken> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
    });

    console.error('[TSheetsOAuth] Exchanging code for tokens...');

    const response = await fetch(TSHEETS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TSheets token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const tokenResponse = TSheetsTokenResponseSchema.parse(data);

    return this.convertToStoredToken(tokenResponse);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TSheetsStoredToken> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
    });

    console.error('[TSheetsOAuth] Refreshing access token...');

    const response = await fetch(TSHEETS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TSheets token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const tokenResponse = TSheetsTokenResponseSchema.parse(data);

    return this.convertToStoredToken(tokenResponse);
  }

  /**
   * Convert TSheets TokenResponse to StoredToken
   */
  private convertToStoredToken(tokenResponse: TSheetsTokenResponse): TSheetsStoredToken {
    const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt,
      userId: tokenResponse.user_id,
      companyId: tokenResponse.company_id,
      clientUrl: tokenResponse.client_url,
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
  async startAuthServer(expectedState: string): Promise<{ code: string; state: string }> {
    if (this.authPromise) return this.authPromise;

    this.authPromise = new Promise((resolve, reject) => {
      const app = express();
      app.use(cors());

      // OAuth callback endpoint
      app.get('/oauth/callback', (req: Request, res: Response) => {
        const { code, state, error, error_description } = req.query;

        if (error) {
          res.send(`
            <!DOCTYPE html>
            <html>
              <head><title>OAuth Error</title></head>
              <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
                <h1 style="color: #d32f2f;">❌ Authorization Failed</h1>
                <p><strong>Error:</strong> ${error}</p>
                <p>${error_description || ''}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          reject(new Error(`OAuth error: ${error} - ${error_description}`));
          this.stopServer();
          return;
        }

        if (!code || !state) {
          res.send(`
            <!DOCTYPE html>
            <html>
              <head><title>Invalid Request</title></head>
              <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
                <h1 style="color: #ff9800;">⚠️ Missing Parameters</h1>
                <p>Missing authorization code or state.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          reject(new Error('Missing OAuth parameters'));
          this.stopServer();
          return;
        }

        // Verify state matches
        if (state !== expectedState) {
          res.send(`
            <!DOCTYPE html>
            <html>
              <head><title>Security Error</title></head>
              <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
                <h1 style="color: #d32f2f;">❌ State Mismatch</h1>
                <p>CSRF protection: State parameter does not match.</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          reject(new Error('State parameter mismatch - possible CSRF attack'));
          this.stopServer();
          return;
        }

        res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Authorization Successful</title></head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
              <h1 style="color: #4caf50;">✅ TSheets Authorization Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);

        resolve({ code: code as string, state: state as string });
        setTimeout(() => this.stopServer(), 1000);
      });

      // Health check endpoint
      app.get('/', (_req: Request, res: Response) => {
        res.send('TSheets OAuth server is running. Waiting for authorization callback...');
      });

      // Start server
      this.server = app.listen(this.config.port, () => {
        console.error(`\n🔐 TSheets OAuth server started on http://localhost:${this.config.port}`);
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
  async authorize(): Promise<TSheetsStoredToken> {
    const { url: authUrl, state } = this.generateAuthUrl();

    console.error('\n' + '='.repeat(60));
    console.error('TSHEETS AUTHORIZATION REQUIRED');
    console.error('='.repeat(60));
    console.error('\nOpen this URL in your browser:\n');
    console.error(authUrl);
    console.error('\n');

    // Start server and wait for callback
    const { code } = await this.startAuthServer(state);

    console.error('Exchanging authorization code for tokens...');

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code);

    console.error('✅ Authorization successful! Tokens saved.\n');

    return tokens;
  }
}
