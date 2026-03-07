/**
 * Get Project Details Tool
 * Retrieves comprehensive project information including notes, files, and timesheet data
 */

import { TSheetsApi } from '../api/tsheets.js';
import { getProjectReport } from './get-project-report.js';

export interface GetProjectDetailsInput {
  jobcodeId?: number;
  projectName?: string;
}

interface FormattedTimesheetEntry {
  date: string;
  employee: string;
  hours: number;
  notes: string;
  attachment_count: number;
  sort_key?: string;
}

interface FormattedCostCodeGroup {
  cost_code: string;
  entries: FormattedTimesheetEntry[];
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
  timesheets?: {
    start_date: string;
    end_date: string;
    header: string;
    total_entries: number;
    total_hours: number;
    cost_codes: FormattedCostCodeGroup[];
    formatted: string;
  };
  message?: string;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(dateString: string): string {
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) {
    return dateString;
  }

  return `${month}/${day}`;
}

function isDisplayableDescription(description: string): boolean {
  const trimmed = description.trim();
  return !['', '.', '..', '...'].includes(trimmed);
}

function toDecimalHours(hours: number, minutes: number): number {
  return parseFloat((hours + minutes / 60).toFixed(2));
}

function normalizeCostCode(segment: string): string {
  const trimmed = segment.trim();
  const duplicateEdgeCodeMatch = trimmed.match(/^(\d+)\s+(.+?)\s+\1$/);

  if (duplicateEdgeCodeMatch) {
    return `${duplicateEdgeCodeMatch[1]} ${duplicateEdgeCodeMatch[2]}`.trim();
  }

  return trimmed;
}

function extractCostCode(jobName: string): string {
  const normalizedPath = jobName.replace(/\u00E2\u20AC\u00BA/g, '\u203A');
  const pathSegments = normalizedPath
    .split('\u203A')
    .map(segment => segment.trim())
    .filter(Boolean);

  if (pathSegments.length > 0) {
    return normalizeCostCode(pathSegments[pathSegments.length - 1]);
  }

  return normalizeCostCode(jobName);
}

function buildTimesheetHeader(jobName: string, jobcodeId: number): string {
  const client = jobName.trim().split(/\s+/)[0] || 'PROJECT';
  return `${client} \u2014 ${jobName} (${jobcodeId})`;
}

function formatTimesheetGroups(
  header: string,
  costCodeGroups: FormattedCostCodeGroup[]
): string {
  const lines: string[] = [header];

  for (const group of costCodeGroups) {
    lines.push(`\u203A ${group.cost_code}`);

    for (const entry of group.entries) {
      lines.push(`${entry.date} \u2014 ${entry.employee} | ${entry.hours} hrs`);
      lines.push(`  ${entry.notes}`);
    }
  }

  return lines.join('\n');
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

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 90);

    const detailedReport = await getProjectReport(
      {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        jobcodeId: jobcodeId!,
      },
      tsheetsApi
    );

    const groupedEntries = new Map<string, FormattedTimesheetEntry[]>();

    for (const activity of detailedReport.timeActivities) {
      if (!isDisplayableDescription(activity.description)) {
        continue;
      }

      const costCode = extractCostCode(activity.jobName);
      const entries = groupedEntries.get(costCode) || [];
      const attachmentCount = activity.attachments.length;
      const notesSuffix = attachmentCount > 0 ? ` [${attachmentCount} \u{1F4F7}]` : '';

      entries.push({
        date: formatShortDate(activity.date),
        employee: activity.employeeName,
        hours: toDecimalHours(activity.hours, activity.minutes),
        notes: `${activity.description.trim()}${notesSuffix}`,
        attachment_count: attachmentCount,
        sort_key: activity.date,
      });

      groupedEntries.set(costCode, entries);
    }

    const costCodes = Array.from(groupedEntries.entries())
      .map(([cost_code, entries]) => ({
        cost_code,
        entries: entries
          .sort((a, b) => (a.sort_key || '').localeCompare(b.sort_key || '') || a.employee.localeCompare(b.employee))
          .map(({ sort_key, ...entry }) => entry),
      }))
      .sort((a, b) => a.cost_code.localeCompare(b.cost_code));

    const timesheetHeader = buildTimesheetHeader(
      details.jobcode?.name || details.project?.name || detailedReport.jobName,
      jobcodeId!
    );

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
      timesheets: {
        start_date: detailedReport.startDate,
        end_date: detailedReport.endDate,
        header: timesheetHeader,
        total_entries: costCodes.reduce((sum, group) => sum + group.entries.length, 0),
        total_hours: detailedReport.totalHours,
        cost_codes: costCodes,
        formatted: formatTimesheetGroups(timesheetHeader, costCodes),
      },
      message: !details.project 
        ? 'Note: This jobcode does not have an associated project. Project notes are not available.' 
        : undefined,
    };
  } catch (error) {
    console.error(`[getProjectDetails] Error:`, error);
    throw error;
  }
}

