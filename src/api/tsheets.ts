/**
 * TSheets API - High-level methods for timesheet operations
 */

import { TSheetsClient } from './tsheets-client.js';
import { TSheetsResponseSchema, Timesheet, User, Jobcode, File } from '../types/tsheets.js';

export interface TimesheetWithDetails extends Timesheet {
  user?: User;
  jobcode?: Jobcode;
  files?: File[];
}

export class TSheetsApi {
  constructor(private client: TSheetsClient) { }

  /**
   * Get timesheets for a date range, optionally filtered by project
   */
  async getTimesheetsForDateRange(
    startDate: string, // YYYY-MM-DD
    endDate: string, // YYYY-MM-DD
    jobcodeName?: string // optional project filter
  ): Promise<TimesheetWithDetails[]> {
    console.error(`[TSheetsApi] Getting timesheets from ${startDate} to ${endDate}`);

    // Step 1: Get all jobcodes to find matching project
    const jobcodesResponse = await this.client.getJobcodes({ active: 'both' });
    const validated = TSheetsResponseSchema.parse(jobcodesResponse);
    const allJobcodes = validated.results.jobcodes || {};

    let jobcodeFilter: number[] | undefined;

    if (jobcodeName) {
      // Find matching jobcode(s) by name (case-insensitive partial match)
      const matchingJobcodes = Object.values(allJobcodes).filter(jc =>
        jc.name.toLowerCase().includes(jobcodeName.toLowerCase()) ||
        (jc.short_code && jc.short_code.toLowerCase().includes(jobcodeName.toLowerCase()))
      );

      if (matchingJobcodes.length === 0) {
        console.error(`[TSheetsApi] No jobcode found matching: ${jobcodeName}`);
        return [];
      }

      jobcodeFilter = matchingJobcodes.map(jc => jc.id);
      console.error(`[TSheetsApi] Found ${jobcodeFilter.length} matching jobcode(s)`);
    }

    // Step 2: Get timesheets
    const timesheetsResponse = await this.client.getTimesheets({
      start_date: startDate,
      end_date: endDate,
      jobcode_ids: jobcodeFilter,
    });

    const tsValidated = TSheetsResponseSchema.parse(timesheetsResponse);
    const timesheets = Object.values(tsValidated.results.timesheets || {});

    console.error(`[TSheetsApi] Found ${timesheets.length} timesheet entries`);

    if (timesheets.length === 0) {
      return [];
    }

    // Step 3: Get supplemental data (users)
    const userIds = [...new Set(timesheets.map(ts => ts.user_id))];
    const usersResponse = await this.client.getUsers({ ids: userIds });
    const usersValidated = TSheetsResponseSchema.parse(usersResponse);
    const users = usersValidated.results.users || {};

    // Step 4: Get files for timesheets that have attachments
    const timesheetsWithFiles = timesheets.filter(ts =>
      ts.attached_files && ts.attached_files.length > 0
    );

    let files: Record<string, File> = {};
    if (timesheetsWithFiles.length > 0) {
      try {
        const fileIds = timesheetsWithFiles.flatMap(ts => ts.attached_files || []);
        const uniqueFileIds = [...new Set(fileIds)];

        if (uniqueFileIds.length > 0) {
          console.error(`[TSheetsApi] Fetching ${uniqueFileIds.length} file(s)...`);
          const filesResponse = await this.client.getFiles({ ids: uniqueFileIds });
          const filesValidated = TSheetsResponseSchema.parse(filesResponse);
          files = filesValidated.results.files || {};
        }
      } catch (error) {
        console.error('[TSheetsApi] Error fetching files:', error);
        // Continue without files
      }
    }

    // Step 5: Combine all data
    const enrichedTimesheets: TimesheetWithDetails[] = timesheets.map(ts => ({
      ...ts,
      user: users[ts.user_id.toString()],
      jobcode: allJobcodes[ts.jobcode_id.toString()],
      files: (ts.attached_files || [])
        .map(fileId => files[fileId.toString()])
        .filter(f => f !== undefined),
    }));

    return enrichedTimesheets;
  }

  /**
   * Get all jobcodes (projects)
   */
  async getAllJobcodes(): Promise<Jobcode[]> {
    console.error('[TSheetsApi] Getting all jobcodes...');
    const response = await this.client.getJobcodes({ active: 'both' });
    const validated = TSheetsResponseSchema.parse(response);
    const jobcodes = Object.values(validated.results.jobcodes || {});
    console.error(`[TSheetsApi] Found ${jobcodes.length} jobcode(s)`);
    return jobcodes;
  }

  /**
   * Get all users (employees)
   */
  async getAllUsers(): Promise<User[]> {
    console.error('[TSheetsApi] Getting all users...');
    const response = await this.client.getUsers({ active: 'both' });
    const validated = TSheetsResponseSchema.parse(response);
    const users = Object.values(validated.results.users || {});
    console.error(`[TSheetsApi] Found ${users.length} user(s)`);
    return users;
  }

  /**
   * Download a file by its URL
   */
  async downloadFile(fileUrl: string): Promise<Buffer> {
    return this.client.downloadFile(fileUrl);
  }
}
