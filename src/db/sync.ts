import dotenv from 'dotenv';
import { TokenManager } from '../auth/token-manager.js';
import { TSheetsClient } from '../api/tsheets-client.js';
import { TSheetsApi } from '../api/tsheets.js';
import { getProjectReport } from '../tools/get-project-report.js';
import { ProjectReport } from '../types/sage.js';
import {
  SyncResult,
  getMostRecentSyncEndDate,
  initDatabase,
  logSync,
  replaceAttachments,
  upsertJobcodes,
  upsertTimeEntries,
} from './database.js';

dotenv.config();

const REQUIRED_ENV_VARS = [
  'TSHEETS_CLIENT_ID',
  'TSHEETS_CLIENT_SECRET',
  'TSHEETS_REDIRECT_URI',
  'TOKEN_FILE_PATH',
] as const;

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function assertEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function createTsheetsApi(): Promise<TSheetsApi> {
  assertEnv();

  const tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH!);
  const client = new TSheetsClient(tokenManager, {
    clientId: process.env.TSHEETS_CLIENT_ID!,
    clientSecret: process.env.TSHEETS_CLIENT_SECRET!,
    redirectUri: process.env.TSHEETS_REDIRECT_URI!,
  });

  await client.initialize();
  return new TSheetsApi(client);
}

function cacheProjectReport(report: ProjectReport, syncedAt: string): { entriesSynced: number; attachmentsSynced: number } {
  const entryIds = report.timeActivities.map(activity => activity.id);
  const entryRows = report.timeActivities.map(activity => ({
    id: activity.id,
    date: activity.date,
    employeeName: activity.employeeName,
    jobName: activity.jobName,
    jobcodeId: activity.jobcodeId ?? null,
    hours: activity.hours + activity.minutes / 60,
    minutes: activity.minutes,
    description: activity.description || null,
    billableStatus: activity.billableStatus || null,
    hourlyRate: activity.hourlyRate ?? 0,
    createdAt: activity.createdAt ?? null,
    lastSynced: syncedAt,
  }));

  const attachmentRows = report.timeActivities.flatMap(activity =>
    activity.attachments.map(attachment => ({
      id: attachment.id,
      entryId: activity.id,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl || null,
      fileSize: attachment.fileSize ?? null,
    }))
  );

  upsertTimeEntries(entryRows);
  replaceAttachments(entryIds, attachmentRows);

  return {
    entriesSynced: entryRows.length,
    attachmentsSynced: attachmentRows.length,
  };
}

async function syncRangeInternal(
  startDate: string,
  endDate: string,
  options?: { jobcodeId?: number; syncType?: string }
): Promise<SyncResult> {
  initDatabase();

  const syncType = options?.syncType ?? 'range';
  const syncedAt = new Date().toISOString();

  try {
    const tsheetsApi = await createTsheetsApi();
    const report = await getProjectReport(
      {
        startDate,
        endDate,
        jobcodeId: options?.jobcodeId,
      },
      tsheetsApi
    );
    const jobcodes = await tsheetsApi.getAllJobcodes();
    upsertJobcodes(jobcodes, syncedAt);

    const counts = cacheProjectReport(report, syncedAt);
    logSync({
      syncType,
      startDate,
      endDate,
      entriesSynced: counts.entriesSynced,
      syncedAt,
      status: 'success',
    });

    return {
      startDate,
      endDate,
      entriesSynced: counts.entriesSynced,
      attachmentsSynced: counts.attachmentsSynced,
      jobcodesSynced: jobcodes.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSync({
      syncType,
      startDate,
      endDate,
      entriesSynced: 0,
      syncedAt,
      status: 'error',
      error: message,
    });
    throw error;
  }
}

export async function syncDateRange(startDate: string, endDate: string): Promise<SyncResult> {
  return syncRangeInternal(startDate, endDate, { syncType: 'range' });
}

export async function syncProjectHistory(jobcodeId: number): Promise<SyncResult> {
  return syncRangeInternal('2023-01-01', formatDate(new Date()), {
    jobcodeId,
    syncType: `project:${jobcodeId}`,
  });
}

export async function syncAllHistory(): Promise<SyncResult> {
  const today = new Date();
  const finalEndDate = formatDate(today);
  let chunkStart = new Date('2023-01-01T00:00:00');
  let entriesSynced = 0;
  let attachmentsSynced = 0;
  let jobcodesSynced = 0;

  console.error('[SQLite Sync] Starting full history sync from 2023-01-01');

  while (chunkStart <= today) {
    const chunkEnd = addDays(chunkStart, 89);
    const boundedEnd = chunkEnd > today ? today : chunkEnd;
    const startDate = formatDate(chunkStart);
    const endDate = formatDate(boundedEnd);

    console.error(`[SQLite Sync] Syncing ${startDate} to ${endDate}`);
    const result = await syncRangeInternal(startDate, endDate, { syncType: 'history' });
    entriesSynced += result.entriesSynced;
    attachmentsSynced += result.attachmentsSynced;
    jobcodesSynced = result.jobcodesSynced;

    chunkStart = addDays(boundedEnd, 1);
  }

  console.error(`[SQLite Sync] Full history sync complete. Entries: ${entriesSynced}`);

  return {
    startDate: '2023-01-01',
    endDate: finalEndDate,
    entriesSynced,
    attachmentsSynced,
    jobcodesSynced,
  };
}

export async function syncRecentData(): Promise<SyncResult> {
  const endDate = new Date();
  const startDate = addDays(endDate, -90);
  return syncRangeInternal(formatDate(startDate), formatDate(endDate), { syncType: 'recent' });
}

export function getLastSyncDate(): string | null {
  initDatabase();
  return getMostRecentSyncEndDate();
}
