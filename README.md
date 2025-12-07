# QuickBooks Online to Sage 100 MCP Server

A production-grade Model Context Protocol (MCP) server that automates extracting timesheet data from QuickBooks Online and formatting it for Sage 100 Contractor.

## Features

- **OAuth2 Authentication** - Secure integration with QuickBooks Online
- **Automatic Token Refresh** - Handles token expiration transparently
- **Type-Safe** - Full TypeScript with Zod validation
- **Three MCP Tools**:
  - `get_project_report` - Extract timesheet data from QBO
  - `format_sage` - Transform to Sage 100 format
  - `export_clipboard` - Export in multiple formats (text, markdown, CSV)

## Tech Stack

- TypeScript (strict mode)
- MCP SDK (@modelcontextprotocol/sdk)
- Zod for validation
- node-fetch@2 for HTTP
- QuickBooks Online API

## Installation

1. Clone the repository:
```bash
git clone https://github.com/cykj40/Tsheets-MCP.git
cd Tsheets-MCP
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` with your QuickBooks credentials:
```env
INTUIT_CLIENT_ID=your_client_id
INTUIT_CLIENT_SECRET=your_client_secret
INTUIT_REDIRECT_URI=http://localhost:3000/oauth/callback
TOKEN_FILE_PATH=./.tokens.json
```

## Authentication

Before using the MCP server, you must authenticate with QuickBooks Online:

```bash
npm run auth
```

This will:
1. Generate an OAuth authorization URL
2. Prompt you to authorize in your browser
3. Save access and refresh tokens to `.tokens.json`

## Usage

### Running the MCP Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

### Available Tools

#### 1. get_project_report

Extract timesheet data from QuickBooks Online.

**Parameters:**
- `startDate` (required) - Start date in YYYY-MM-DD format
- `endDate` (required) - End date in YYYY-MM-DD format
- `jobName` (optional) - Job/customer name to filter results

**Example:**
```json
{
  "startDate": "2024-11-01",
  "endDate": "2024-11-30",
  "jobName": "Maimonides Medical Center"
}
```

**Returns:**
```json
{
  "jobName": "Maimonides Medical Center",
  "startDate": "2024-11-01",
  "endDate": "2024-11-30",
  "totalEntries": 42,
  "totalHours": 87.50,
  "timeActivities": [...]
}
```

#### 2. format_sage

Transform raw QBO data into Sage 100 Contractor format.

**Parameters:**
- `rawReport` (required) - Output from `get_project_report`

**Returns:**
Structured Sage report with:
- Entries sorted by date, then employee
- Decimal hours (e.g., "8.50")
- Employee summaries
- Daily summaries

#### 3. export_clipboard

Export formatted data for copy-paste into Sage 100.

**Parameters:**
- `sageReport` (required) - Output from `format_sage`
- `format` (required) - One of: `text`, `markdown`, `csv`

**Text Format Example:**
```
JOB: Maimonides Medical Center
DATE RANGE: 2024-11-25 - 2024-11-30
TOTAL HOURS: 87.50

=========================================

DATE: 2024-11-25
----------------------------------------
John Doe - 8.50 hrs
  Notes: Door removal, Building A
```

**CSV Format Example:**
```csv
Date,Employee,Job,Hours,Notes
"2024-11-25","John Doe","Maimonides Medical Center","8.50","Door removal, Building A"
```

## Project Structure

```
src/
├── index.ts                 # MCP server entry point
├── auth/
│   ├── oauth.ts             # Intuit OAuth2 implementation
│   └── token-manager.ts     # Token storage and refresh
├── api/
│   ├── client.ts            # QBO HTTP client
│   └── qbo.ts               # QBO API methods
├── tools/
│   ├── get-project-report.ts
│   ├── format-sage.ts
│   └── export-clipboard.ts
├── types/
│   ├── qbo.ts               # QBO API types with Zod schemas
│   └── sage.ts              # Sage format types
└── utils/
    └── date.ts              # Date utilities
scripts/
└── auth.ts                  # OAuth authentication CLI
```

## Development

### Build

```bash
npm run build
```

### Type Checking

TypeScript is configured with strict mode. The build command will fail on type errors.

### Code Structure

The codebase follows clean architecture principles:

- **Separation of Concerns** - Auth, API, tools, and types are isolated
- **Type Safety** - Zod schemas validate all external data
- **Single Responsibility** - Each module has one clear purpose
- **Error Handling** - Descriptive errors at every layer

## QuickBooks Online API

### Query Language

The server uses QuickBooks Query Language (QQL):

```sql
SELECT * FROM TimeActivity
WHERE TxnDate >= '2024-11-01'
AND TxnDate <= '2024-11-30'
AND CustomerRef = '123'
```

### TimeActivity Schema

```typescript
{
  Id: string,
  TxnDate: string,           // YYYY-MM-DD
  NameOf: "Employee" | "Vendor",
  EmployeeRef: { value: string, name: string },
  CustomerRef: { value: string, name: string },
  ItemRef: { value: string, name: string },
  Hours: number,
  Minutes: number,
  Description: string,
  BillableStatus: "Billable" | "NotBillable" | "HasBeenBilled",
  HourlyRate: number
}
```

## Token Management

- Tokens are stored in `.tokens.json`
- Access tokens expire after 1 hour
- Refresh tokens expire after 100 days
- Automatic refresh with 5-minute buffer
- Thread-safe token operations

## Error Handling

All errors include descriptive messages:

- Missing authentication: "No valid tokens found. Please authenticate first using: npm run auth"
- Invalid job name: "No job found with name: XYZ"
- Multiple matches: "Multiple jobs found matching 'XYZ': A, B, C. Please provide exact job name."
- API errors: QBO error messages are parsed and formatted

## Security

- OAuth2 with PKCE-like state parameter
- Credentials stored in `.env` (gitignored)
- Tokens stored in `.tokens.json` (gitignored)
- No hardcoded secrets
- Automatic token refresh prevents exposure

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and questions, please open an issue on GitHub:
https://github.com/cykj40/Tsheets-MCP/issues


## Proper end-point t-sheets query time-sheet
GET /v3/company/9341455865371339/query?query=select * from TimeActivity where TxnDate > '2014-09-14'&minorversion=75

Content type:application/text
Production Base URL:https://quickbooks.api.intuit.com
Sandbox Base URL:https://sandbox-quickbooks.api.intuit.com 

{
 "QueryResponse": {
  "TimeActivity": [
   {
    "TxnDate": "2025-11-09",
    "NameOf": "Employee",
    "EmployeeRef": {
     "value": "55",
     "name": "Emily Platt"
    },
    "CustomerRef": {
     "value": "21",
     "name": "Rondonuwu Fruit and Vegi"
    },
    "ItemRef": {
     "value": "8",
     "name": "Lighting"
    },
    "TimeChargeId": 54,
    "BillableStatus": "HasBeenBilled",
    "Taxable": false,
    "HourlyRate": 15,
    "CostRate": 0,
    "Hours": 3,
    "Minutes": 0,
    "Seconds": 0,
    "Description": "Garden Lighting",
    "domain": "QBO",
    "sparse": false,
    "Id": "5",
    "SyncToken": "0",
    "MetaData": {
     "CreateTime": "2025-11-09T11:55:25-08:00",
     "LastUpdatedTime": "2025-11-09T11:55:25-08:00"
    }
   },
   {
    "TxnDate": "2025-11-09",
    "NameOf": "Employee",
    "EmployeeRef": {
     "value": "55",
     "name": "Emily Platt"
    },
    "CustomerRef": {
     "value": "21",
     "name": "Rondonuwu Fruit and Vegi"
    },
    "ItemRef": {
     "value": "18",
     "name": "Trimming"
    },
    "TimeChargeId": 53,
    "BillableStatus": "HasBeenBilled",
    "Taxable": false,
    "HourlyRate": 15,
    "CostRate": 0,
    "Hours": 2,
    "Minutes": 0,
    "Seconds": 0,
    "Description": "Tree and Shrub Trimming",
    "domain": "QBO",
    "sparse": false,
    "Id": "4",
    "SyncToken": "0",
    "MetaData": {
     "CreateTime": "2025-11-09T11:54:02-08:00",
     "LastUpdatedTime": "2025-11-09T11:54:02-08:00"
    }
   },
   {
    "TxnDate": "2025-11-08",
    "NameOf": "Employee",
    "EmployeeRef": {
     "value": "54",
     "name": "John Johnson"
    },
    "CustomerRef": {
     "value": "1",
     "name": "Amy's Bird Sanctuary"
    },
    "ItemRef": {
     "value": "4",
     "name": "Design"
    },
    "TimeChargeId": 52,
    "BillableStatus": "Billable",
    "Taxable": false,
    "HourlyRate": 75,
    "CostRate": 0,
    "Hours": 5,
    "Minutes": 0,
    "Seconds": 0,
    "Description": "Custom Design",
    "domain": "QBO",
    "sparse": false,
    "Id": "3",
    "SyncToken": "0",
    "MetaData": {
     "CreateTime": "2025-11-09T11:53:15-08:00",
     "LastUpdatedTime": "2025-11-09T11:53:15-08:00"
    }
   },
   {
    "TxnDate": "2025-11-09",
    "NameOf": "Employee",
    "EmployeeRef": {
     "value": "54",
     "name": "John Johnson"
    },
    "CustomerRef": {
     "value": "1",
     "name": "Amy's Bird Sanctuary"
    },
    "ItemRef": {
     "value": "2",
     "name": "Hours"
    },
    "BillableStatus": "NotBillable",
    "Taxable": false,
    "HourlyRate": 0,
    "CostRate": 0,
    "Hours": 4,
    "Minutes": 0,
    "Seconds": 0,
    "Description": "Gardening",
    "domain": "QBO",
    "sparse": false,
    "Id": "2",
    "SyncToken": "0",
    "MetaData": {
     "CreateTime": "2025-11-09T11:47:12-08:00",
     "LastUpdatedTime": "2025-11-09T11:47:12-08:00"
    }
   },
   {
    "TxnDate": "2025-11-04",
    "NameOf": "Employee",
    "EmployeeRef": {
     "value": "55",
     "name": "Emily Platt"
    },
    "CustomerRef": {
     "value": "17",
     "name": "Mark Cho"
    },
    "ItemRef": {
     "value": "2",
     "name": "Hours"
    },
    "BillableStatus": "NotBillable",
    "Taxable": false,
    "HourlyRate": 0,
    "CostRate": 0,
    "Hours": 4,
    "Minutes": 45,
    "Seconds": 0,
    "Description": "Designed Garden.  Poured Concrete Foundation",
    "domain": "QBO",
    "sparse": false,
    "Id": "1",
    "SyncToken": "0",
    "MetaData": {
     "CreateTime": "2025-11-09T11:23:26-08:00",
     "LastUpdatedTime": "2025-11-09T11:23:26-08:00"
    }
   }
  ],
  "startPosition": 1,
  "maxResults": 5
 },
 "time": "2025-12-07T05:53:03.631-08:00"
}

{
  "TimeActivity": {
    "TxnDate": "2014-09-17", 
    "domain": "QBO", 
    "NameOf": "Employee", 
    "Description": "Garden Lighting", 
    "ItemRef": {
      "name": "Lighting", 
      "value": "8"
    }, 
    "Minutes": 0, 
    "ProjectRef": {
      "value": "39298045"
    }, 
    "Hours": 3, 
    "BillableStatus": "HasBeenBilled", 
    "sparse": false, 
    "HourlyRate": 15, 
    "Taxable": false, 
    "EmployeeRef": {
      "name": "Emily Platt", 
      "value": "55"
    }, 
    "SyncToken": "0", 
    "CustomerRef": {
      "name": "Rondonuwu Fruit and Vegi", 
      "value": "21"
    }, 
    "Id": "5", 
    "MetaData": {
      "CreateTime": "2014-09-17T11:55:25-07:00", 
      "LastUpdatedTime": "2014-09-18T13:45:12-07:00"
    }
  }, 
  "time": "2015-07-28T10:35:07.663-07:00"
}

can i organize timesheets by job ? 
and review reports like this ?