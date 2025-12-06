import { z } from 'zod';

// Reference schemas
export const ReferenceSchema = z.object({
  value: z.string(),
  name: z.string().optional(),
});

export type Reference = z.infer<typeof ReferenceSchema>;

// TimeActivity schema based on QBO API
export const TimeActivitySchema = z.object({
  Id: z.string(),
  TxnDate: z.string(), // YYYY-MM-DD format
  NameOf: z.enum(['Employee', 'Vendor']),
  EmployeeRef: ReferenceSchema.optional(),
  VendorRef: ReferenceSchema.optional(),
  CustomerRef: ReferenceSchema.optional(),
  ItemRef: ReferenceSchema.optional(),
  Hours: z.number().optional().default(0),
  Minutes: z.number().optional().default(0),
  Description: z.string().optional().default(''),
  BillableStatus: z.enum(['Billable', 'NotBillable', 'HasBeenBilled']).optional(),
  HourlyRate: z.number().optional().default(0),
  MetaData: z.object({
    CreateTime: z.string().optional(),
    LastUpdatedTime: z.string().optional(),
  }).optional(),
});

export type TimeActivity = z.infer<typeof TimeActivitySchema>;

// Query response wrapper
export const QueryResponseSchema = z.object({
  QueryResponse: z.object({
    TimeActivity: z.array(TimeActivitySchema).optional(),
    startPosition: z.number().optional(),
    maxResults: z.number().optional(),
    totalCount: z.number().optional(),
  }),
  time: z.string().optional(),
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

// Customer schema for search
export const CustomerSchema = z.object({
  Id: z.string(),
  DisplayName: z.string(),
  FullyQualifiedName: z.string().optional(),
  Active: z.boolean().optional(),
});

export type Customer = z.infer<typeof CustomerSchema>;

export const CustomerQueryResponseSchema = z.object({
  QueryResponse: z.object({
    Customer: z.array(CustomerSchema).optional(),
    startPosition: z.number().optional(),
    maxResults: z.number().optional(),
  }),
  time: z.string().optional(),
});

export type CustomerQueryResponse = z.infer<typeof CustomerQueryResponseSchema>;

// OAuth token response
export const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  x_refresh_token_expires_in: z.number().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

// Stored token data
export const StoredTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(), // Unix timestamp
  realmId: z.string(),
});

export type StoredToken = z.infer<typeof StoredTokenSchema>;

// Error response from QBO API
export const QBOErrorSchema = z.object({
  Fault: z.object({
    Error: z.array(z.object({
      Message: z.string(),
      Detail: z.string().optional(),
      code: z.string().optional(),
    })),
    type: z.string().optional(),
  }),
  time: z.string().optional(),
});

export type QBOError = z.infer<typeof QBOErrorSchema>;
