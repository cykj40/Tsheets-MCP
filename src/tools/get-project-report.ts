import { z } from 'zod';
import { TSheetsApi } from '../api/tsheets.js';
import { ProjectReport } from '../types/sage.js';
import { isValidDateString } from '../utils/date.js';
import { parseNaturalDate } from '../utils/date-parser.js';

export const GetProjectReportArgsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dateRange: z.string().optional(), // Natural language like "last week", "this month"
  projectName: z.string().optional(), // TSheets jobcode name or ID (e.g., "25802" or "Fort Hamilton Parkway")
  jobcodeId: z.number().optional(), // Direct jobcode ID for exact matching
});

export type GetProjectReportArgs = z.infer<typeof GetProjectReportArgsSchema>;

export async function getProjectReport(
  args: GetProjectReportArgs,
  tsheetsApi: TSheetsApi
): Promise<ProjectReport> {
  // Parse date range - support natural language or explicit dates
  let startDate: string;
  let endDate: string;

  if (args.dateRange) {
    console.error(`[GetProjectReport] Parsing date range: "${args.dateRange}"`);
    const parsed = parseNaturalDate(args.dateRange);
    startDate = parsed.startDate;
    endDate = parsed.endDate;
    console.error(`[GetProjectReport] Resolved to: ${startDate} to ${endDate}`);
  } else if (args.startDate && args.endDate) {
    // Validate explicit dates
    if (!isValidDateString(args.startDate) || !isValidDateString(args.endDate)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD or natural language like "last week"');
    }
    startDate = args.startDate;
    endDate = args.endDate;
  } else {
    // Default to last week
    console.error(`[GetProjectReport] No date range provided, defaulting to "last week"`);
    const parsed = parseNaturalDate('last week');
    startDate = parsed.startDate;
    endDate = parsed.endDate;
  }

  const projectName = args.projectName;
  const jobcodeId = args.jobcodeId;
  const resolvedProjectName = projectName || (jobcodeId ? `Job #${jobcodeId}` : 'All Projects');

  console.error(`[GetProjectReport] Starting report generation for ${startDate} to ${endDate}${projectName ? ` (Project: ${projectName})` : jobcodeId ? ` (Jobcode ID: ${jobcodeId})` : ' (All Projects)'}`);

  // Get timesheets from TSheets
  const timesheets = await tsheetsApi.getTimesheetsForDateRange(
    startDate,
    endDate,
    projectName,
    jobcodeId
  );

  // Check if no data was found
  if (timesheets.length === 0) {
    const projectInfo = projectName ? ` for project "${projectName}"` : ' for any projects';
    console.error(`[GetProjectReport] WARNING: No timesheet data found${projectInfo} between ${startDate} and ${endDate}`);

    // Return informative result instead of error
    return {
      jobName: resolvedProjectName,
      startDate,
      endDate,
      totalEntries: 0,
      totalHours: 0,
      timeActivities: [],
      attachments: [],
    };
  }

  console.error(`[GetProjectReport] Processing ${timesheets.length} timesheet entries`);

  // Transform to report format
  const transformedActivities = timesheets.map(timesheet => {
    const employeeName = timesheet.user
      ? `${timesheet.user.first_name} ${timesheet.user.last_name}`.trim()
      : 'Unknown';

    const jobName = timesheet.jobcode?.name || 'Unknown';
    const durationHours = timesheet.duration / 3600; // Convert seconds to hours
    const hours = Math.floor(durationHours);
    const minutes = Math.round((durationHours - hours) * 60);

    // Collect attachments (photos)
    const attachments = (timesheet.files || []).map(file => ({
      id: file.id.toString(),
      fileName: file.file_name,
      fileUrl: file.file_url || '', // URL might not be available immediately
      fileSize: file.file_size ?? 0,
    }));

    return {
      id: timesheet.id.toString(),
      date: timesheet.date,
      employeeName,
      jobName,
      hours,
      minutes,
      description: timesheet.notes || '',
      billableStatus: 'NotBillable', // TSheets doesn't have this concept by default
      hourlyRate: 0, // TSheets stores this differently
      attachments,
    };
  });

  // Calculate total hours
  const totalHours = transformedActivities.reduce((sum, activity) => {
    return sum + activity.hours + activity.minutes / 60;
  }, 0);

  // Collect all attachments
  const allAttachments = transformedActivities.flatMap(a => a.attachments);

  console.error(`[GetProjectReport] Report complete: ${transformedActivities.length} entries, ${totalHours.toFixed(2)} total hours, ${allAttachments.length} attachments`);

  return {
    jobName: resolvedProjectName,
    startDate,
    endDate,
    totalEntries: transformedActivities.length,
    totalHours: parseFloat(totalHours.toFixed(2)),
    timeActivities: transformedActivities,
    attachments: allAttachments,
  };
}
