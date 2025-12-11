#!/usr/bin/env node

import * as readline from 'readline';
import dotenv from 'dotenv';
import { IntuitOAuth } from '../src/auth/oauth.js';
import { TokenManager } from '../src/auth/token-manager.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'INTUIT_CLIENT_ID',
  'INTUIT_CLIENT_SECRET',
  'INTUIT_REDIRECT_URI',
  'TOKEN_FILE_PATH',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    console.error('Please create a .env file based on .env.example');
    process.exit(1);
  }
}

// Initialize OAuth and TokenManager
const oauth = new IntuitOAuth({
  clientId: process.env.INTUIT_CLIENT_ID!,
  clientSecret: process.env.INTUIT_CLIENT_SECRET!,
  redirectUri: process.env.INTUIT_REDIRECT_URI!,
});

const tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH!);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n===========================================');
  console.log('QuickBooks Online OAuth Authentication');
  console.log('===========================================\n');

  const useManual = process.argv.includes('--manual');

  if (useManual) {
    // Manual mode: user copies URL
    const state = Math.random().toString(36).substring(2, 15);
    const authUrl = oauth.generateAuthUrl(state);

    console.log('Step 1: Authorize the application');
    console.log('-------------------------------------------');
    console.log('Please open the following URL in your browser:\n');
    console.log(authUrl);
    console.log('');

    console.log('Step 2: Complete authorization');
    console.log('-------------------------------------------');
    console.log('After authorizing, you will be redirected to a URL like:');
    console.log('http://localhost:3000/oauth/callback?code=...&realmId=...\n');

    const redirectUrl = await question('Paste the entire redirect URL here: ');
    rl.close();

    // Parse manually
    await handleManualAuth(redirectUrl, state);
  } else {
    // Automatic mode: start server
    console.log('🚀 Starting OAuth server on http://localhost:3000');
    console.log('The browser will open automatically...\n');

    try {
      const tokens = await oauth.authorize();
      await tokenManager.saveTokens(tokens);

      console.log('\n✅ Success! Authentication complete.');
      console.log('-------------------------------------------');
      console.log(`Realm ID: ${tokens.realmId}`);
      console.log(`Token expires: ${new Date(tokens.expiresAt).toLocaleString()}`);
      console.log(`Tokens saved to: ${process.env.TOKEN_FILE_PATH}`);
      console.log('\nYou can now test with: npm run test:qbo -- --sandbox --dump');
      console.log('===========================================\n');
    } catch (error) {
      console.error('\n❌ Auto mode failed. Trying manual mode...\n');

      const state = Math.random().toString(36).substring(2, 15);
      const authUrl = oauth.generateAuthUrl(state);

      console.log('Please open this URL in your browser:\n');
      console.log(authUrl);
      console.log('\nAfter authorizing, paste the redirect URL here:');

      const redirectUrl = await question('> ');
      rl.close();
      await handleManualAuth(redirectUrl, state);
    }
  }
}

async function handleManualAuth(redirectUrl: string, state: string) {
  console.log('\nStep 3: Exchanging code for tokens...');
  console.log('-------------------------------------------');

  try {
    const url = new URL(redirectUrl.trim());
    const code = url.searchParams.get('code');
    const realmId = url.searchParams.get('realmId');
    const returnedState = url.searchParams.get('state');

    if (!code) {
      throw new Error('Authorization code not found in URL');
    }

    if (!realmId) {
      throw new Error('Realm ID not found in URL');
    }

    if (returnedState !== state) {
      console.warn('⚠️  Warning: State parameter mismatch. Proceeding anyway...');
    }

    // Exchange code for tokens
    const tokens = await oauth.exchangeCodeForTokens(code, realmId);

    // Save tokens
    await tokenManager.saveTokens(tokens);

    console.log('\n✅ Success! Authentication complete.');
    console.log('-------------------------------------------');
    console.log(`Realm ID: ${realmId}`);
    console.log(`Token expires: ${new Date(tokens.expiresAt).toLocaleString()}`);
    console.log(`Tokens saved to: ${process.env.TOKEN_FILE_PATH}`);
    console.log('\nYou can now test with: npm run test:qbo -- --sandbox --dump');
    console.log('===========================================\n');
  } catch (error) {
    console.error('\n❌ Error during authentication:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\n💡 Tips:');
    console.error('  - Make sure you paste the URL within 60 seconds');
    console.error('  - Copy the ENTIRE URL from your browser address bar');
    console.error('  - Include http:// or https:// at the beginning\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
