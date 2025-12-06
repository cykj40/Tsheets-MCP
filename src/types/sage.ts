import { z } from 'zod';

// Sage timesheet entry
export const SageEntrySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  employeeName: z.string(),
  jobName: z.string(),
  hours: z.number(),
  decimalHours: z.string(), // Formatted as "8.50"
  notes: z.string(),
  costCode: z.string().optional(),
});

export type SageEntry = z.infer<typeof SageEntrySchema>;

// Employee summary
export interface EmployeeSummary {
  name: string;
  totalHours: number;
  entries: SageEntry[];
}

// Daily summary
export interface DailySummary {
  date: string;
  entries: SageEntry[];
  totalHours: number;
}

// Complete Sage report
export interface SageReport {
  jobName: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  totalEntries: number;
  entries: SageEntry[];
  employeeSummaries: EmployeeSummary[];
  dailySummaries: DailySummary[];
}

// Raw project report from QBO
export interface ProjectReport {
  jobName: string;
  startDate: string;
  endDate: string;
  totalEntries: number;
  totalHours: number;
  timeActivities: Array<{
    id: string;
    date: string;
    employeeName: string;
    jobName: string;
    hours: number;
    minutes: number;
    description: string;
    billableStatus: string;
    hourlyRate: number;
  }>;
}

// Export format options
export type ExportFormat = 'text' | 'markdown' | 'csv';

export const ExportFormatSchema = z.enum(['text', 'markdown', 'csv']);
