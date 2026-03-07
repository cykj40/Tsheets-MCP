import { z } from 'zod';
import { syncAllHistory, syncDateRange, syncRecentData } from '../db/sync.js';

export const SyncTimesheetsArgsSchema = z.object({
  mode: z.enum(['recent', 'history', 'range']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type SyncTimesheetsArgs = z.infer<typeof SyncTimesheetsArgsSchema>;

export async function syncTimesheets(args: SyncTimesheetsArgs): Promise<string> {
  if (args.mode === 'range' && (!args.startDate || !args.endDate)) {
    throw new Error('startDate and endDate are required when mode is "range"');
  }

  const result = args.mode === 'history'
    ? await syncAllHistory()
    : args.mode === 'recent'
      ? await syncRecentData()
      : await syncDateRange(args.startDate!, args.endDate!);

  return `Synced ${result.entriesSynced} entries. Date range: ${result.startDate} to ${result.endDate}`;
}
