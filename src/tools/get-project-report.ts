import { z } from 'zod';
import { QBOApi } from '../api/qbo.js';
import { ProjectReport } from '../types/sage.js';
import { isValidDateString } from '../utils/date.js';
import { parseNaturalDate, parseJobIdentifier } from '../utils/date-parser.js';

export const GetProjectReportArgsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dateRange: z.string().optional(), // Natural language like "last week", "this month"
  jobName: z.string().optional(),
  jobIdentifier: z.string().optional(), // Can include number + name like "25802 MMC Fort Hamilton"
});

export type GetProjectReportArgs = z.infer<typeof GetProjectReportArgsSchema>;

export async function getProjectReport(
  args: GetProjectReportArgs,
  qboApi: QBOApi
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

  // Parse job identifier - support "25802 MMC Fort Hamilton" format
  let jobName: string | undefined;
  let jobNumber: string | undefined;

  if (args.jobIdentifier) {
    const parsed = parseJobIdentifier(args.jobIdentifier);
    jobName = parsed.jobName;
    jobNumber = parsed.jobNumber;
    console.error(`[GetProjectReport] Parsed job identifier: Number=${jobNumber}, Name=${jobName}`);
  } else if (args.jobName) {
    jobName = args.jobName;
  }

  const searchJobName = jobName || (jobNumber ? jobNumber : undefined);

  console.error(`[GetProjectReport] Starting report generation for ${startDate} to ${endDate}${searchJobName ? ` (Job: ${searchJobName})` : ' (All Jobs)'}`);

  let customerId: string | undefined;
  let resolvedJobName = searchJobName || 'All Jobs';

  // If job identifier provided, search for the customer
  if (searchJobName) {
    const customer = await qboApi.getCustomerByName(searchJobName);

    if (!customer) {
      // Try searching for partial matches
      const customers = await qboApi.searchCustomers(searchJobName);

      if (customers.length === 0) {
        throw new Error(
          `No job found with name: "${searchJobName}"\n\n` +
          `Troubleshooting tips:\n` +
          `- Check the job name spelling in QuickBooks Online\n` +
          `- Try using a partial name (e.g., "Maimonides" instead of full name)\n` +
          `- Verify the customer/job exists in your QBO account`
        );
      }

      if (customers.length === 1) {
        customerId = customers[0].Id;
        resolvedJobName = customers[0].DisplayName;
        console.error(`[GetProjectReport] Found matching job: ${resolvedJobName} (ID: ${customerId})`);
      } else {
        // Multiple matches found
        const matches = customers.map(c => c.DisplayName).join(', ');
        throw new Error(
          `Multiple jobs found matching "${searchJobName}": ${matches}. Please provide exact job name.`
        );
      }
    } else {
      customerId = customer.Id;
      resolvedJobName = customer.DisplayName;
      console.error(`[GetProjectReport] Using exact job match: ${resolvedJobName} (ID: ${customerId})`);
    }
  }

  // Query time activities
  const timeActivities = await qboApi.queryTimeActivities(
    startDate,
    endDate,
    customerId
  );

  // Check if no data was found
  if (timeActivities.length === 0) {
    const jobInfo = searchJobName ? ` for job "${resolvedJobName}"` : ' for any jobs';
    console.error(`[GetProjectReport] WARNING: No timesheet data found${jobInfo} between ${startDate} and ${endDate}`);

    // Return informative result instead of error
    return {
      jobName: resolvedJobName,
      startDate,
      endDate,
      totalEntries: 0,
      totalHours: 0,
      timeActivities: [],
    };
  }

  console.error(`[GetProjectReport] Processing ${timeActivities.length} time activities`);

  // Transform to report format
  const transformedActivities = timeActivities.map(activity => {
    const employeeName = activity.EmployeeRef?.name ||
                        activity.VendorRef?.name ||
                        'Unknown';
    const customerName = activity.CustomerRef?.name || 'Unknown';
    const hours = activity.Hours || 0;
    const minutes = activity.Minutes || 0;

    return {
      id: activity.Id,
      date: activity.TxnDate,
      employeeName,
      jobName: customerName,
      hours,
      minutes,
      description: activity.Description || '',
      billableStatus: activity.BillableStatus || 'NotBillable',
      hourlyRate: activity.HourlyRate || 0,
    };
  });

  // Calculate total hours
  const totalHours = transformedActivities.reduce((sum, activity) => {
    return sum + activity.hours + activity.minutes / 60;
  }, 0);

  console.error(`[GetProjectReport] Report complete: ${transformedActivities.length} entries, ${totalHours.toFixed(2)} total hours`);

  return {
    jobName: resolvedJobName,
    startDate,
    endDate,
    totalEntries: transformedActivities.length,
    totalHours: parseFloat(totalHours.toFixed(2)),
    timeActivities: transformedActivities,
  };
}
