import { z } from 'zod';
import { TSheetsApi } from '../api/tsheets.js';
import { isValidDateString } from '../utils/date.js';
import { parseNaturalDate } from '../utils/date-parser.js';

export const GetProjectReportSummaryArgsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dateRange: z.string().optional(), // Natural language like "last week", "this month"
  jobcodeId: z.number().optional(), // Direct jobcode ID for exact matching
});

export type GetProjectReportSummaryArgs = z.infer<typeof GetProjectReportSummaryArgsSchema>;

export async function getProjectReportSummary(
  args: GetProjectReportSummaryArgs,
  tsheetsApi: TSheetsApi
): Promise<any> {
  // Parse date range - support natural language or explicit dates
  let startDate: string;
  let endDate: string;

  if (args.dateRange) {
    console.error(`[GetProjectReportSummary] Parsing date range: "${args.dateRange}"`);
    const parsed = parseNaturalDate(args.dateRange);
    startDate = parsed.startDate;
    endDate = parsed.endDate;
    console.error(`[GetProjectReportSummary] Resolved to: ${startDate} to ${endDate}`);
  } else if (args.startDate && args.endDate) {
    // Validate explicit dates
    if (!isValidDateString(args.startDate) || !isValidDateString(args.endDate)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD or natural language like "last week"');
    }
    startDate = args.startDate;
    endDate = args.endDate;
  } else {
    // Default to last week
    console.error(`[GetProjectReportSummary] No date range provided, defaulting to "last week"`);
    const parsed = parseNaturalDate('last week');
    startDate = parsed.startDate;
    endDate = parsed.endDate;
  }

  const jobcodeId = args.jobcodeId;

  console.error(`[GetProjectReportSummary] Fetching aggregated report for ${startDate} to ${endDate}${jobcodeId ? ` (Jobcode ID: ${jobcodeId})` : ' (All Projects)'}`);

  // Get aggregated project report from TSheets
  const reportResponse = await tsheetsApi.getProjectReportForDateRange(
    startDate,
    endDate,
    jobcodeId
  );

  const report = reportResponse.results.project_report;
  const supplementalData = reportResponse.supplemental_data;

  // Transform to readable format with user/jobcode names
  const userTotals = Object.entries(report.totals.users || {}).map(([userId, hours]) => {
    const user = supplementalData?.users?.[userId];
    return {
      userId: parseInt(userId),
      userName: user ? `${user.first_name} ${user.last_name}` : `User ${userId}`,
      hours: typeof hours === 'string' ? parseFloat(hours) : hours,
    };
  });

  const jobcodeTotals = Object.entries(report.totals.jobcodes || {}).map(([jobcodeId, hours]) => {
    const jobcode = supplementalData?.jobcodes?.[jobcodeId];
    return {
      jobcodeId: parseInt(jobcodeId),
      jobcodeName: jobcode?.name || `Jobcode ${jobcodeId}`,
      hours: typeof hours === 'string' ? parseFloat(hours) : hours,
    };
  });

  const totalHours = userTotals.reduce((sum, u) => sum + u.hours, 0);

  console.error(`[GetProjectReportSummary] Report complete: ${userTotals.length} users, ${jobcodeTotals.length} jobcodes, ${totalHours.toFixed(2)} total hours`);

  return {
    startDate: report.start_date,
    endDate: report.end_date,
    totalHours: parseFloat(totalHours.toFixed(2)),
    userTotals,
    jobcodeTotals,
    rawReport: report,
    supplementalData,
  };
}

