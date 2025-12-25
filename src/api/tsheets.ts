/**
 * TSheets API - High-level methods for timesheet operations
 */

import { TSheetsClient } from './tsheets-client.js';
import {
  TSheetsResponseSchema,
  Timesheet,
  User,
  Jobcode,
  File,
  ProjectReportResponseSchema,
  ProjectReportResponse,
  Project,
  ProjectSchema,
  ProjectsResponseSchema,
  ProjectNote,
  ProjectNoteSchema,
  ProjectNotesResponseSchema,
  ProjectFile,
  ProjectFileSchema,
} from '../types/tsheets.js';

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
    jobcodeName?: string, // optional project name filter
    jobcodeId?: number // optional direct jobcode ID
  ): Promise<TimesheetWithDetails[]> {
    console.error(`[TSheetsApi] Getting timesheets from ${startDate} to ${endDate}`);

    // Step 1: Get all jobcodes to find matching project
    const jobcodesResponse = await this.client.getJobcodes({ active: 'both' });
    const validated = TSheetsResponseSchema.parse(jobcodesResponse);
    const allJobcodes = validated.results.jobcodes || {};

    let jobcodeFilter: number[] | undefined;

    if (jobcodeId) {
      // Direct ID lookup - check if it exists
      const jobcode = allJobcodes[jobcodeId.toString()];
      if (!jobcode) {
        console.error(`[TSheetsApi] No jobcode found with ID: ${jobcodeId}`);
        return [];
      }
      jobcodeFilter = [jobcodeId];
      console.error(`[TSheetsApi] Using jobcode ID: ${jobcodeId} (${jobcode.name})`);
    } else if (jobcodeName) {
      // Auto-detect: if jobcodeName is numeric, try ID first, then fall back to name search
      const numericId = parseInt(jobcodeName, 10);
      if (!isNaN(numericId) && allJobcodes[numericId.toString()]) {
        // It's a valid numeric ID
        const jobcode = allJobcodes[numericId.toString()];
        jobcodeFilter = [numericId];
        console.error(`[TSheetsApi] Detected numeric ID: ${numericId} (${jobcode.name})`);
      } else {
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
        console.error(`[TSheetsApi] Found ${jobcodeFilter.length} matching jobcode(s) by name`);
      }
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
        // Safely log error - Zod errors can't be directly serialized
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[TSheetsApi] Error fetching files:', errorMsg);
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

  /**
   * Get aggregated project report for a date range
   */
  async getProjectReportForDateRange(
    startDate: string, // YYYY-MM-DD
    endDate: string, // YYYY-MM-DD
    jobcodeId?: number
  ): Promise<ProjectReportResponse> {
    console.error(`[TSheetsApi] Getting project report from ${startDate} to ${endDate}`);

    const params: any = {
      start_date: startDate,
      end_date: endDate,
      jobcode_type: 'all',
    };

    if (jobcodeId) {
      params.jobcode_ids = [jobcodeId];
      console.error(`[TSheetsApi] Filtering by jobcode ID: ${jobcodeId}`);
    }

    const response = await this.client.getProjectReport(params);
    const validated = ProjectReportResponseSchema.parse(response);

    return validated;
  }

  /**
   * Search jobcodes by name or ID
   * Allows partial matching on name or short_code
   */
  async searchJobcodes(search?: string, active: 'yes' | 'no' | 'both' = 'both'): Promise<Jobcode[]> {
    console.error(`[TSheetsApi] Searching jobcodes${search ? ` for: ${search}` : ''}...`);

    // If search is a numeric ID, try to get it directly
    const numericId = search ? parseInt(search, 10) : NaN;
    if (!isNaN(numericId)) {
      try {
        const response = await this.client.searchJobcodes({ ids: [numericId], active });
        const validated = TSheetsResponseSchema.parse(response);
        const jobcodes = Object.values(validated.results.jobcodes || {});
        if (jobcodes.length > 0) {
          console.error(`[TSheetsApi] Found jobcode by ID: ${numericId}`);
          return jobcodes;
        }
      } catch {
        // Fall through to name search
      }
    }

    // Get all jobcodes and filter client-side for partial matching
    const response = await this.client.searchJobcodes({ active });
    const validated = TSheetsResponseSchema.parse(response);
    const allJobcodes = Object.values(validated.results.jobcodes || {});

    if (!search) {
      console.error(`[TSheetsApi] Returning all ${allJobcodes.length} jobcodes`);
      return allJobcodes;
    }

    const searchLower = search.toLowerCase();
    const matches = allJobcodes.filter(jc =>
      jc.name.toLowerCase().includes(searchLower) ||
      (jc.short_code && jc.short_code.toLowerCase().includes(searchLower)) ||
      jc.id.toString() === search
    );

    console.error(`[TSheetsApi] Found ${matches.length} jobcode(s) matching "${search}"`);
    return matches;
  }

  /**
   * Get project by jobcode ID
   * Projects in TSheets are linked to jobcodes
   */
  async getProjectByJobcodeId(jobcodeId: number): Promise<Project | null> {
    console.error(`[TSheetsApi] Getting project for jobcode ID: ${jobcodeId}`);

    try {
      const response = await this.client.getProjects({ jobcode_ids: [jobcodeId] });
      const validated = ProjectsResponseSchema.parse(response);
      const projects = Object.values(validated.results.projects || {});

      if (projects.length > 0) {
        console.error(`[TSheetsApi] Found project: ${projects[0].name}`);
        return projects[0];
      }

      console.error(`[TSheetsApi] No project found for jobcode ID: ${jobcodeId}`);
      return null;
    } catch (error) {
      console.error(`[TSheetsApi] Error getting project:`, error);
      return null;
    }
  }

  /**
   * Get all projects
   */
  async getAllProjects(active: 'yes' | 'no' | 'both' = 'both', status?: 'in_progress' | 'complete' | 'cancelled'): Promise<Project[]> {
    console.error(`[TSheetsApi] Getting all projects...`);

    try {
      const response = await this.client.getProjects({ active, status });
      const validated = ProjectsResponseSchema.parse(response);
      const projects = Object.values(validated.results.projects || {});
      console.error(`[TSheetsApi] Found ${projects.length} project(s)`);
      return projects;
    } catch (error) {
      console.error(`[TSheetsApi] Error getting projects:`, error);
      return [];
    }
  }

  /**
   * Get project notes for a project
   * Returns notes with attached file information
   */
  async getProjectNotes(projectId: number): Promise<{
    notes: ProjectNote[];
    files: Record<string, ProjectFile>;
    users: Record<string, User>;
  }> {
    console.error(`[TSheetsApi] Getting notes for project ID: ${projectId}`);

    try {
      const response = await this.client.getProjectNotes({
        project_id: projectId,
        supplemental_data: 'yes',
      });

      const validated = ProjectNotesResponseSchema.parse(response);
      const notes = Object.values(validated.results.project_notes || {});
      const files = validated.supplemental_data?.files || {};
      const users = validated.supplemental_data?.users || {};

      console.error(`[TSheetsApi] Found ${notes.length} note(s) with ${Object.keys(files).length} file(s)`);

      return {
        notes,
        files: files as Record<string, ProjectFile>,
        users: users as Record<string, User>,
      };
    } catch (error) {
      console.error(`[TSheetsApi] Error getting project notes:`, error);
      return { notes: [], files: {}, users: {} };
    }
  }

  /**
   * Search projects by name or description
   */
  async searchProjects(search?: string): Promise<Project[]> {
    const projects = await this.getAllProjects();

    if (!search) {
      return projects;
    }

    const searchLower = search.toLowerCase();
    return projects.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      (p.description && p.description.toLowerCase().includes(searchLower))
    );
  }

  /**
   * Get comprehensive project info including notes and timesheets
   */
  async getProjectWithDetails(jobcodeId: number): Promise<{
    jobcode: Jobcode | null;
    project: Project | null;
    notes: ProjectNote[];
    files: Record<string, ProjectFile>;
    noteAuthors: Record<string, User>;
  }> {
    console.error(`[TSheetsApi] Getting comprehensive project details for jobcode: ${jobcodeId}`);

    // Get jobcode info
    const jobcodes = await this.searchJobcodes(jobcodeId.toString());
    const jobcode = jobcodes.length > 0 ? jobcodes[0] : null;

    // Get project if it exists
    const project = await this.getProjectByJobcodeId(jobcodeId);

    // Get notes if project exists
    let notes: ProjectNote[] = [];
    let files: Record<string, ProjectFile> = {};
    let noteAuthors: Record<string, User> = {};

    if (project) {
      const notesData = await this.getProjectNotes(project.id);
      notes = notesData.notes;
      files = notesData.files;
      noteAuthors = notesData.users;
    }

    return {
      jobcode,
      project,
      notes,
      files,
      noteAuthors,
    };
  }
}
