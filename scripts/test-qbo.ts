#!/usr/bin/env node

/**
 * Standalone test script to verify QuickBooks Online API connectivity
 *
 * Usage:
 *   npm run test:qbo                           # Test connection only
 *   npm run test:qbo -- --dates 2025-11-01 2025-11-30   # Test with date range
 *   npm run test:qbo -- --job "Maimonides"    # Test with job name
 */

import dotenv from 'dotenv';
import { TokenManager } from '../src/auth/token-manager.js';
import { QBOClient } from '../src/api/client.js';
import { QBOApi } from '../src/api/qbo.js';

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
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let startDate = '2025-11-01';
let endDate = '2025-11-30';
let jobName: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dates' && i + 2 < args.length) {
    startDate = args[i + 1];
    endDate = args[i + 2];
    i += 2;
  } else if (args[i] === '--job' && i + 1 < args.length) {
    jobName = args[i + 1];
    i += 1;
  }
}

async function main() {
  console.log('🔍 QuickBooks Online API Connectivity Test\n');
  console.log('='.repeat(60));

  try {
    // Initialize services
    console.log('\n📦 Initializing services...');
    const tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH!);
    const qboClient = new QBOClient(tokenManager, {
      clientId: process.env.INTUIT_CLIENT_ID!,
      clientSecret: process.env.INTUIT_CLIENT_SECRET!,
      redirectUri: process.env.INTUIT_REDIRECT_URI!,
    });
    const qboApi = new QBOApi(qboClient);

    // Check token validity
    console.log('\n🔑 Checking authentication tokens...');
    const hasValidTokens = await tokenManager.hasValidTokens();
    if (!hasValidTokens) {
      console.error('❌ No valid tokens found. Run: npm run auth');
      process.exit(1);
    }
    console.log('✅ Valid tokens found');

    // Initialize client
    console.log('\n🚀 Initializing QuickBooks client...');
    await qboClient.initialize();
    const realmId = qboClient.getRealmId();
    console.log(`✅ Connected to QuickBooks (Realm ID: ${realmId})`);

    // Test 1: Get all customers
    console.log('\n📋 Test 1: Fetching all customers...');
    const allCustomers = await qboApi.getAllCustomers();
    console.log(`✅ Found ${allCustomers.length} customers/jobs in QuickBooks`);

    if (allCustomers.length > 0) {
      console.log('\nSample customers (first 10):');
      allCustomers.slice(0, 10).forEach((customer, i) => {
        console.log(`  ${i + 1}. ${customer.DisplayName} (ID: ${customer.Id})`);
      });
    }

    // Test 2: Search for specific job if provided
    if (jobName) {
      console.log(`\n🔎 Test 2: Searching for job "${jobName}"...`);
      const customer = await qboApi.getCustomerByName(jobName);

      if (customer) {
        console.log(`✅ Found exact match: ${customer.DisplayName} (ID: ${customer.Id})`);
      } else {
        console.log('⚠️  No exact match found. Searching for partial matches...');
        const matches = await qboApi.searchCustomers(jobName);

        if (matches.length > 0) {
          console.log(`✅ Found ${matches.length} partial match(es):`);
          matches.forEach((c, i) => {
            console.log(`  ${i + 1}. ${c.DisplayName} (ID: ${c.Id})`);
          });
        } else {
          console.log('❌ No matches found');
        }
      }
    }

    // Test 3: Query time activities for date range
    console.log(`\n⏱️  Test 3: Querying time activities from ${startDate} to ${endDate}...`);
    let customerId: string | undefined;

    if (jobName) {
      const customer = await qboApi.getCustomerByName(jobName);
      if (customer) {
        customerId = customer.Id;
        console.log(`   Filtering by job: ${customer.DisplayName}`);
      } else {
        const matches = await qboApi.searchCustomers(jobName);
        if (matches.length === 1) {
          customerId = matches[0].Id;
          console.log(`   Filtering by job: ${matches[0].DisplayName}`);
        }
      }
    }

    const timeActivities = await qboApi.queryTimeActivities(
      startDate,
      endDate,
      customerId
    );

    if (timeActivities.length === 0) {
      console.log('⚠️  No time activities found for this period');
      console.log('\n💡 Troubleshooting tips:');
      console.log('   - Verify the date range has timesheet data in QuickBooks');
      console.log('   - Check that timesheets are entered as "Time Activities"');
      console.log('   - Try a broader date range');
      if (jobName) {
        console.log('   - Try without specifying a job to see all data');
      }
    } else {
      console.log(`✅ Found ${timeActivities.length} time activities`);

      // Show summary
      const totalHours = timeActivities.reduce((sum, activity) => {
        return sum + (activity.Hours || 0) + (activity.Minutes || 0) / 60;
      }, 0);

      console.log(`\nSummary:`);
      console.log(`  Total Activities: ${timeActivities.length}`);
      console.log(`  Total Hours: ${totalHours.toFixed(2)}`);

      // Group by employee
      const byEmployee = new Map<string, number>();
      timeActivities.forEach(activity => {
        const name = activity.EmployeeRef?.name || activity.VendorRef?.name || 'Unknown';
        const hours = (activity.Hours || 0) + (activity.Minutes || 0) / 60;
        byEmployee.set(name, (byEmployee.get(name) || 0) + hours);
      });

      console.log(`\nHours by Employee:`);
      Array.from(byEmployee.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, hours]) => {
          console.log(`  ${name}: ${hours.toFixed(2)} hours`);
        });

      // Show sample activities
      console.log(`\nSample activities (first 5):`);
      timeActivities.slice(0, 5).forEach((activity, i) => {
        const employeeName = activity.EmployeeRef?.name || activity.VendorRef?.name || 'Unknown';
        const customerName = activity.CustomerRef?.name || 'Unknown';
        const hours = (activity.Hours || 0) + (activity.Minutes || 0) / 60;
        console.log(`  ${i + 1}. ${activity.TxnDate} | ${employeeName} | ${customerName} | ${hours.toFixed(2)}h`);
        if (activity.Description) {
          console.log(`     "${activity.Description}"`);
        }
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
