#!/usr/bin/env tsx
/**
 * TSheets OAuth Authentication Script
 * 
 * This script will:
 * 1. Start a local OAuth server on port 3000
 * 2. Open your browser to TSheets authorization page
 * 3. Wait for you to authorize the app
 * 4. Save the tokens to .tokens.json
 * 
 * Usage:
 *   npm run auth
 */

import dotenv from 'dotenv';
import { TokenManager } from '../src/auth/token-manager.js';
import { TSheetsOAuth } from '../src/auth/tsheets-oauth.js';
import { exec } from 'child_process';

// Load environment variables
dotenv.config();

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('TSHEETS OAUTH AUTHENTICATION');
  console.log('='.repeat(60) + '\n');

  // Validate required env vars
  const requiredVars = ['TSHEETS_CLIENT_ID', 'TSHEETS_CLIENT_SECRET', 'TSHEETS_REDIRECT_URI', 'TOKEN_FILE_PATH'];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      console.error(`❌ Error: Missing required environment variable: ${varName}`);
      console.error('\nMake sure your .env file contains:');
      console.error('  TSHEETS_CLIENT_ID=your_client_id');
      console.error('  TSHEETS_CLIENT_SECRET=your_client_secret');
      console.error('  TSHEETS_REDIRECT_URI=http://localhost:3000/oauth/callback');
      console.error('  TOKEN_FILE_PATH=.tokens.json');
      process.exit(1);
    }
  }

  const tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH!);
  const oauth = new TSheetsOAuth({
    clientId: process.env.TSHEETS_CLIENT_ID!,
    clientSecret: process.env.TSHEETS_CLIENT_SECRET!,
    redirectUri: process.env.TSHEETS_REDIRECT_URI!,
  });

  try {
    // Generate auth URL
    const { url: authUrl, state } = oauth.generateAuthUrl();

    console.log('🔐 Starting OAuth flow...\n');
    console.log('Step 1: Opening browser to TSheets authorization page...');
    console.log('\nIf your browser does not open automatically, visit this URL:\n');
    console.log(authUrl);
    console.log('\n');

    // Try to open browser automatically
    const platform = process.platform;
    const openCommand =
      platform === 'darwin' ? 'open' :
        platform === 'win32' ? 'start' :
          'xdg-open';

    exec(`${openCommand} "${authUrl}"`, (error) => {
      if (error) {
        console.error('⚠️  Could not open browser automatically. Please open the URL manually.');
      }
    });

    // Start server and wait for callback
    console.log('Step 2: Waiting for you to authorize in TSheets...\n');
    const { code } = await oauth.startAuthServer(state);

    console.log('✅ Authorization code received!');
    console.log('\nStep 3: Exchanging code for access tokens...\n');

    // Exchange for tokens
    const tokens = await oauth.exchangeCodeForTokens(code);

    // Save tokens
    await tokenManager.saveTokens(tokens);

    console.log('='.repeat(60));
    console.log('✅ SUCCESS! TSheets authentication complete!');
    console.log('='.repeat(60));
    console.log('\nTokens saved to:', process.env.TOKEN_FILE_PATH);
    console.log('\nToken details:');
    console.log('  Company ID:', tokens.companyId);
    console.log('  User ID:', tokens.userId);
    console.log('  Client URL:', tokens.clientUrl);
    console.log('  Expires:', new Date(tokens.expiresAt).toLocaleString());
    console.log('\nYou can now:');
    console.log('  1. Test the API: npm run test:tsheets');
    console.log('  2. Start the MCP server: npm run build && npm start');
    console.log('  3. Use it in Claude Desktop\n');

  } catch (error) {
    console.error('\n❌ Authentication failed:', error);
    console.error('\nTroubleshooting tips:');
    console.error('  1. Make sure you have the TSheets API Add-On installed');
    console.error('  2. Verify your Client ID and Secret are correct');
    console.error('  3. Check that redirect URI matches: http://localhost:3000/oauth/callback');
    console.error('  4. Try the authentication again\n');
    process.exit(1);
  }
}

main();
