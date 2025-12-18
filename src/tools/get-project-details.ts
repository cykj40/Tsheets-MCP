/**
 * Get Project Details Tool
 * Retrieves comprehensive project information including notes, files, and timesheet data
 */

import { TSheetsApi } from '../api/tsheets.js';

export interface GetProjectDetailsInput {
  jobcodeId?: number;
  projectName?: string;
}

export interface GetProjectDetailsResult {
  success: boolean;
  jobcode?: {
    id: number;
    name: string;
    short_code?: string;
    type: string;
    active: boolean;
    parent_id?: number;
  };
  project?: {
    id: number;
    name: string;
    description?: string;
    status?: string;
    start_date?: string;
    due_date?: string;
    completed_date?: string;
    active: boolean;
    created?: string;
    last_modified?: string;
  };
  notes: Array<{
    id: number;
    note: string;
    author: string;
    created?: string;
    file_count: number;
  }>;
  total_notes: number;
  total_files: number;
  message?: string;
}

/**
 * Get comprehensive project details including notes and files
 */
export async function getProjectDetails(
  tsheetsApi: TSheetsApi,
  input: GetProjectDetailsInput
): Promise<GetProjectDetailsResult> {
  console.error(`[getProjectDetails] Getting details for project`);

  // Need either jobcodeId or projectName
  if (!input.jobcodeId && !input.projectName) {
    throw new Error('Either jobcodeId or projectName is required');
  }

  try {
    let jobcodeId = input.jobcodeId;

    // If we have a project name, search for the jobcode first
    if (!jobcodeId && input.projectName) {
      const jobcodes = await tsheetsApi.searchJobcodes(input.projectName);
      if (jobcodes.length === 0) {
        return {
          success: false,
          notes: [],
          total_notes: 0,
          total_files: 0,
          message: `No jobcode found matching: ${input.projectName}`,
        };
      }
      if (jobcodes.length > 1) {
        const matches = jobcodes.map(jc => `${jc.id}: ${jc.name}`).join(', ');
        return {
          success: false,
          notes: [],
          total_notes: 0,
          total_files: 0,
          message: `Multiple jobcodes match "${input.projectName}". Please specify by ID: ${matches}`,
        };
      }
      jobcodeId = jobcodes[0].id;
    }

    // Get comprehensive details
    const details = await tsheetsApi.getProjectWithDetails(jobcodeId!);

    const noteSummaries = details.notes.map(note => {
      const author = details.noteAuthors[note.user_id.toString()];
      return {
        id: note.id,
        note: note.note,
        author: author ? `${author.first_name} ${author.last_name}` : `User ${note.user_id}`,
        created: note.created,
        file_count: (note.files || []).length,
      };
    });

    const totalFiles = noteSummaries.reduce((sum, n) => sum + n.file_count, 0);

    return {
      success: true,
      jobcode: details.jobcode ? {
        id: details.jobcode.id,
        name: details.jobcode.name,
        short_code: details.jobcode.short_code,
        type: details.jobcode.type,
        active: details.jobcode.active,
        parent_id: details.jobcode.parent_id,
      } : undefined,
      project: details.project ? {
        id: details.project.id,
        name: details.project.name,
        description: details.project.description,
        status: details.project.status,
        start_date: details.project.start_date,
        due_date: details.project.due_date,
        completed_date: details.project.completed_date,
        active: details.project.active,
        created: details.project.created,
        last_modified: details.project.last_modified,
      } : undefined,
      notes: noteSummaries,
      total_notes: noteSummaries.length,
      total_files: totalFiles,
      message: !details.project 
        ? 'Note: This jobcode does not have an associated project. Project notes are not available.' 
        : undefined,
    };
  } catch (error) {
    console.error(`[getProjectDetails] Error:`, error);
    throw error;
  }
}

