/**
 * Get Project Notes Tool
 * Retrieves notes and attached files for a project
 */

import { TSheetsApi } from '../api/tsheets.js';

export interface GetProjectNotesInput {
  projectId?: number;
  jobcodeId?: number;
}

export interface ProjectNoteResult {
  id: number;
  note: string;
  created_by: {
    user_id: number;
    name: string;
    email?: string;
  };
  created: string;
  last_modified: string;
  files: Array<{
    id: number;
    file_name: string;
    size?: number;
  }>;
}

export interface GetProjectNotesResult {
  success: boolean;
  project?: {
    id: number;
    name: string;
    description?: string;
    status?: string;
    jobcode_id: number;
  };
  jobcode?: {
    id: number;
    name: string;
  };
  notes: ProjectNoteResult[];
  total_notes: number;
  total_files: number;
}

/**
 * Get project notes with file attachments
 */
export async function getProjectNotes(
  tsheetsApi: TSheetsApi,
  input: GetProjectNotesInput
): Promise<GetProjectNotesResult> {
  console.error(`[getProjectNotes] Getting notes for project/jobcode`);

  // Need either projectId or jobcodeId
  if (!input.projectId && !input.jobcodeId) {
    throw new Error('Either projectId or jobcodeId is required');
  }

  try {
    let project = null;
    let jobcode = null;
    let projectId = input.projectId;

    // If we have a jobcodeId, first get the project associated with it
    if (input.jobcodeId && !projectId) {
      const jobcodes = await tsheetsApi.searchJobcodes(input.jobcodeId.toString());
      if (jobcodes.length > 0) {
        jobcode = jobcodes[0];
      }

      project = await tsheetsApi.getProjectByJobcodeId(input.jobcodeId);
      if (project) {
        projectId = project.id;
      }
    }

    // If we have a projectId but no project info yet, get it
    if (projectId && !project) {
      const projects = await tsheetsApi.getAllProjects();
      project = projects.find(p => p.id === projectId) || null;
      
      // Also get jobcode info
      if (project && !jobcode) {
        const jobcodes = await tsheetsApi.searchJobcodes(project.jobcode_id.toString());
        if (jobcodes.length > 0) {
          jobcode = jobcodes[0];
        }
      }
    }

    if (!projectId) {
      return {
        success: true,
        jobcode: jobcode ? {
          id: jobcode.id,
          name: jobcode.name,
        } : undefined,
        notes: [],
        total_notes: 0,
        total_files: 0,
      };
    }

    // Get the notes
    const notesData = await tsheetsApi.getProjectNotes(projectId);

    // Transform notes with author info and files
    const notes: ProjectNoteResult[] = notesData.notes.map(note => {
      const author = notesData.users[note.user_id.toString()];
      const noteFiles = (note.files || []).map(fileId => {
        const file = notesData.files[fileId.toString()];
        return file ? {
          id: file.id,
          file_name: file.file_name,
          size: file.size || file.file_size,
        } : {
          id: fileId,
          file_name: '(unknown)',
        };
      });

      return {
        id: note.id,
        note: note.note,
        created_by: {
          user_id: note.user_id,
          name: author ? `${author.first_name} ${author.last_name}` : `User ${note.user_id}`,
          email: author?.email,
        },
        created: note.created || '',
        last_modified: note.last_modified || '',
        files: noteFiles,
      };
    });

    // Sort by creation date (newest first)
    notes.sort((a, b) => {
      if (!a.created || !b.created) return 0;
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });

    const totalFiles = notes.reduce((sum, n) => sum + n.files.length, 0);

    return {
      success: true,
      project: project ? {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        jobcode_id: project.jobcode_id,
      } : undefined,
      jobcode: jobcode ? {
        id: jobcode.id,
        name: jobcode.name,
      } : undefined,
      notes,
      total_notes: notes.length,
      total_files: totalFiles,
    };
  } catch (error) {
    console.error(`[getProjectNotes] Error:`, error);
    throw error;
  }
}

