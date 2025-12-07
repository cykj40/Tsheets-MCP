import { z } from 'zod';
import { QBOApi } from '../api/qbo.js';
import { ProjectReport } from '../types/sage.js';
import { isValidDateString } from '../utils/date.js';

export const GetProjectReportArgsSchema = z.object({
  startDate: z.string().refine(isValidDateString, {
    message: 'Invalid date format. Use YYYY-MM-DD',
  }),
  endDate: z.string().refine(isValidDateString, {
    message: 'Invalid date format. Use YYYY-MM-DD',
  }),
  jobName: z.string().optional(),
});

export type GetProjectReportArgs = z.infer<typeof GetProjectReportArgsSchema>;

export async function getProjectReport(
  args: GetProjectReportArgs,
  qboApi: QBOApi
): Promise<ProjectReport> {
  const { startDate, endDate, jobName } = args;

  console.error(`[GetProjectReport] Starting report generation for ${startDate} to ${endDate}${jobName ? ` (Job: ${jobName})` : ' (All Jobs)'}`);

  let customerId: string | undefined;
  let resolvedJobName = jobName || 'All Jobs';

  // If jobName provided, search for the customer
  if (jobName) {
    const customer = await qboApi.getCustomerByName(jobName);

    if (!customer) {
      // Try searching for partial matches
      const customers = await qboApi.searchCustomers(jobName);

      if (customers.length === 0) {
        throw new Error(
          `No job found with name: "${jobName}"\n\n` +
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
          `Multiple jobs found matching "${jobName}": ${matches}. Please provide exact job name.`
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
    const jobInfo = jobName ? ` for job "${resolvedJobName}"` : ' for any jobs';
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
