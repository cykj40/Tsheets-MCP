#!/usr/bin/env tsx
/**
 * Test script for TSheets API connectivity
 * 
 * Usage:
 *   npm run test:tsheets              # Get recent timesheets
 *   npm run test:tsheets -- --users   # List all users/employees
 *   npm run test:tsheets -- --jobs    # List all jobcodes/projects
 *   npm run test:tsheets -- --dump    # Dump all data (users, jobs, recent timesheets)
 */

import dotenv from 'dotenv';
import { TokenManager } from '../src/auth/token-manager.js';
import { TSheetsClient } from '../src/api/tsheets-client.js';
import { TSheetsApi } from '../src/api/tsheets.js';

// Load environment variables
dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const showUsers = args.includes('--users');
  const showJobs = args.includes('--jobs');
  const dumpAll = args.includes('--dump');

  console.log('🧪 TSheets API Test\n');
  console.log('='.repeat(60));

  // Initialize client
  const tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH!);
  const tsheetsClient = new TSheetsClient(tokenManager, {
    clientId: process.env.TSHEETS_CLIENT_ID!,
    clientSecret: process.env.TSHEETS_CLIENT_SECRET!,
    redirectUri: process.env.TSHEETS_REDIRECT_URI!,
  });

  const tsheetsApi = new TSheetsApi(tsheetsClient);

  try {
    await tsheetsClient.initialize();
    console.log('✅ Authentication successful\n');

    if (dumpAll) {
      console.log('📦 FULL DATA DUMP');
      console.log('='.repeat(60));

      // Dump Users
      console.log('\n👥 USERS/EMPLOYEES:');
      console.log('-'.repeat(40));
      const users = await tsheetsApi.getAllUsers();
      console.log(JSON.stringify(users, null, 2));

      // Dump Jobcodes
      console.log('\n🏗️  JOBCODES/PROJECTS:');
      console.log('-'.repeat(40));
      const jobcodes = await tsheetsApi.getAllJobcodes();
      console.log(JSON.stringify(jobcodes, null, 2));

      // Dump Recent Timesheets (last 30 days)
      console.log('\n⏱️  RECENT TIMESHEETS (last 30 days):');
      console.log('-'.repeat(40));
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const timesheets = await tsheetsApi.getTimesheetsForDateRange(startDate, endDate);
      console.log(JSON.stringify(timesheets, null, 2));

      console.log('\n' + '='.repeat(60));
      console.log('✅ Data dump complete!');
      return;
    }

    if (showUsers) {
      console.log('\n👥 ALL USERS/EMPLOYEES:');
      console.log('-'.repeat(40));
      const users = await tsheetsApi.getAllUsers();

      users.forEach(user => {
        const status = user.active ? '✅' : '❌';
        console.log(`${status} ${user.first_name} ${user.last_name}`);
        console.log(`   ID: ${user.id}`);
        if (user.email) console.log(`   Email: ${user.email}`);
        if (user.employee_number) console.log(`   Employee #: ${user.employee_number}`);
        console.log();
      });

      console.log(`Total users: ${users.length}`);
      return;
    }

    if (showJobs) {
      console.log('\n🏗️  ALL JOBCODES/PROJECTS:');
      console.log('-'.repeat(40));
      const jobcodes = await tsheetsApi.getAllJobcodes();

      // Organize by hierarchy
      const topLevel = jobcodes.filter(jc => !jc.parent_id);
      const children = jobcodes.filter(jc => jc.parent_id);

      topLevel.forEach(job => {
        const status = job.active ? '✅' : '❌';
        console.log(`${status} ${job.name}`);
        console.log(`   ID: ${job.id}`);
        if (job.short_code) console.log(`   Code: ${job.short_code}`);
        console.log(`   Type: ${job.type}`);

        // Show children
        const kids = children.filter(c => c.parent_id === job.id);
        kids.forEach(kid => {
          const kidStatus = kid.active ? '✅' : '❌';
          console.log(`   ${kidStatus} └─ ${kid.name} (ID: ${kid.id})`);
        });

        console.log();
      });

      console.log(`Total jobcodes: ${jobcodes.length}`);
      return;
    }

    // Default: Show recent timesheets (last 7 days)
    console.log('\n⏱️  RECENT TIMESHEETS (last 7 days):');
    console.log('-'.repeat(40));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    console.log(`Date range: ${startDate} to ${endDate}\n`);

    const timesheets = await tsheetsApi.getTimesheetsForDateRange(startDate, endDate);

    const allJobcodes = await tsheetsApi.getAllJobcodes();
    const jobcodeMap = new Map(allJobcodes.map(jc => [jc.id, jc]));

    console.log(`\n📊 Debug: Loaded ${allJobcodes.length} jobcodes into map`);
    console.log(`📊 Debug: Timesheets count: ${timesheets.length}`);
    if (timesheets.length > 0) {
      console.log(`📊 Debug: First timesheet jobcode_id: ${timesheets[0].jobcode_id}`);
      console.log(`📊 Debug: First timesheet has .jobcode: ${!!timesheets[0].jobcode}`);
      if (timesheets[0].jobcode) {
        console.log(`📊 Debug: First timesheet jobcode name: ${timesheets[0].jobcode.name}`);
      }
    }

    const missingParentIds = new Set<number>();
    timesheets.forEach(ts => {
      if (ts.jobcode?.parent_id && !jobcodeMap.has(ts.jobcode.parent_id)) {
        missingParentIds.add(ts.jobcode.parent_id);
      }
    });

    if (missingParentIds.size > 0) {
      console.log(`📊 Debug: Found ${missingParentIds.size} missing parent jobcode(s), fetching by ID...`);
      const missingIds = Array.from(missingParentIds);

      const missingJobcodesResponse = await tsheetsClient.getJobcodes({
        ids: missingIds,
        active: 'both'
      });

      if (missingJobcodesResponse?.results?.jobcodes) {
        const fetchedJobcodes = Object.values(missingJobcodesResponse.results.jobcodes) as any[];
        console.log(`📊 Debug: Fetched ${fetchedJobcodes.length} parent jobcode(s)`);
        fetchedJobcodes.forEach(jc => jobcodeMap.set(jc.id, jc));
      }
    }

    const buildJobPath = (jobcode: any): string => {
      if (!jobcode) {
        return 'Unknown';
      }

      const parts: string[] = [];
      let current: typeof jobcode | undefined = jobcode;

      while (current) {
        const displayName = current.short_code
          ? `${current.name} ${current.short_code}`
          : current.name;
        parts.unshift(displayName);

        if (current.parent_id) {
          const parentId = current.parent_id;
          current = jobcodeMap.get(parentId);
          if (!current) {
            console.log(`⚠️  Warning: No parent jobcode found for ID: ${parentId}`);
            break;
          }
        } else {
          break;
        }
      }

      return parts.join(' › ');
    };

    if (timesheets.length === 0) {
      console.log('No timesheets found in this date range.');
      return;
    }

    // Group by employee
    const byEmployee = new Map<string, typeof timesheets>();
    timesheets.forEach(ts => {
      const name = ts.user ? `${ts.user.first_name} ${ts.user.last_name}` : 'Unknown';
      if (!byEmployee.has(name)) {
        byEmployee.set(name, []);
      }
      byEmployee.get(name)!.push(ts);
    });

    byEmployee.forEach((entries, employeeName) => {
      const entriesWithNotes = entries.filter(ts => ts.notes && ts.notes.trim().length > 0);

      if (entriesWithNotes.length === 0) {
        return;
      }

      console.log(`\n👤 ${employeeName}`);
      console.log('-'.repeat(40));

      entriesWithNotes.forEach(ts => {
        const hours = (ts.duration / 3600).toFixed(2);
        const timeIn = ts.start ? new Date(ts.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const timeOut = ts.end ? new Date(ts.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

        const jobDisplay = ts.jobcode ? buildJobPath(ts.jobcode) : 'Unknown';

        const attachment = (ts.files && ts.files.length > 0)
          ? ts.files.map(f => f.file_name).join(', ')
          : 'None';

        console.log(`📅 ${ts.date}`);
        console.log(`   Time: ${timeIn} - ${timeOut}`);
        console.log(`   Duration: ${hours}h`);
        console.log(`   Job: ${jobDisplay}`);
        console.log(`   Attachment: ${attachment}`);
        console.log(`   Notes: ${ts.notes}`);
        console.log();
      });

      const totalHours = entriesWithNotes.reduce((sum, ts) => sum + ts.duration / 3600, 0);
      console.log(`Total: ${totalHours.toFixed(2)} hours`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Found ${timesheets.length} timesheet entries`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
