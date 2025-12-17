/**
 * TSheets API Response Types
 * Based on https://tsheetsteam.github.io/api_docs/
 */

import { z } from 'zod';

// Timesheet entry
export const TimesheetSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  jobcode_id: z.number(),
  start: z.string(), // ISO 8601 datetime
  end: z.string(), // ISO 8601 datetime
  duration: z.number(), // seconds
  date: z.string(), // YYYY-MM-DD
  notes: z.string().optional(),
  customfields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).transform(val => {
    // Convert all values to strings for consistency
    if (!val) return undefined;
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [k, v === null ? '' : String(v)])
    );
  }).optional(),
  created: z.string().optional(),
  last_modified: z.string(),
  attached_files: z.array(z.number()).optional(), // file IDs
});

export type Timesheet = z.infer<typeof TimesheetSchema>;

// User (employee)
export const UserSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string(),
  username: z.string().optional(),
  email: z.string().optional(),
  employee_number: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  active: z.boolean(),
});

export type User = z.infer<typeof UserSchema>;

// Jobcode (project/task)
export const JobcodeSchema = z.object({
  id: z.number(),
  parent_id: z.number().optional(),
  name: z.string(),
  short_code: z.string().optional(),
  type: z.enum(['regular', 'pto', 'paid_break', 'unpaid_break', 'unpaid_time_off']),
  active: z.boolean(),
  has_children: z.boolean(),
});

export type Jobcode = z.infer<typeof JobcodeSchema>;

// File attachment
export const FileSchema = z.object({
  id: z.number(),
  uploaded_by_user_id: z.number(),
  file_name: z.string(),
  file_size: z.number(), // bytes
  file_url: z.string(), // download URL
  active: z.boolean(),
  created: z.string().optional(), // TSheets sometimes omits this
  linked_objects: z.array(z.object({
    id: z.number(),
    type: z.string(), // e.g., "timesheet"
  })).optional(),
});

export type File = z.infer<typeof FileSchema>;

// API Response wrapper
export const TSheetsResponseSchema = z.object({
  results: z.object({
    timesheets: z.record(z.string(), TimesheetSchema).optional(),
    users: z.record(z.string(), UserSchema).optional(),
    jobcodes: z.record(z.string(), JobcodeSchema).optional(),
    files: z.record(z.string(), FileSchema).optional(),
  }),
  supplemental_data: z.object({
    users: z.record(z.string(), UserSchema).optional(),
    jobcodes: z.record(z.string(), JobcodeSchema).optional(),
  }).optional(),
  more: z.boolean().optional(), // pagination
});

export type TSheetsResponse = z.infer<typeof TSheetsResponseSchema>;

// Project Report Types
export const ProjectReportTotalsSchema = z.object({
  users: z.record(z.string(), z.union([z.string(), z.number()])), // user_id -> hours
  groups: z.record(z.string(), z.union([z.string(), z.number()])), // group_id -> hours
  jobcodes: z.record(z.string(), z.union([z.string(), z.number()])), // jobcode_id -> hours
  customfields: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number()]))).optional(), // customfield_id -> item_id -> hours
});

export const ProjectReportSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  totals: ProjectReportTotalsSchema,
});

export const ProjectReportResponseSchema = z.object({
  results: z.object({
    filters: z.object({
      user_ids: z.array(z.number()).optional(),
      group_ids: z.array(z.number()).optional(),
      jobcode_type: z.string().optional(),
      customfielditems: z.record(z.string(), z.array(z.string())).optional(),
      jobcode_ids: z.array(z.union([z.string(), z.number()])).optional(),
    }).optional(),
    project_report: ProjectReportSchema,
  }),
  supplemental_data: z.object({
    users: z.record(z.string(), UserSchema).optional(),
    jobcodes: z.record(z.string(), JobcodeSchema).optional(),
    customfields: z.record(z.string(), z.any()).optional(),
    customfielditems: z.record(z.string(), z.any()).optional(),
  }).optional(),
});

export type ProjectReportTotals = z.infer<typeof ProjectReportTotalsSchema>;
export type ProjectReport = z.infer<typeof ProjectReportSchema>;
export type ProjectReportResponse = z.infer<typeof ProjectReportResponseSchema>;
