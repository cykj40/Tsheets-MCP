#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { TokenManager } from './auth/token-manager.js';
import { TSheetsClient } from './api/tsheets-client.js';
import { TSheetsApi } from './api/tsheets.js';
import {
  getProjectReport,
  GetProjectReportArgsSchema,
} from './tools/get-project-report.js';
import {
  getProjectReportSummary,
  GetProjectReportSummaryArgsSchema,
} from './tools/get-project-report-summary.js';
import { formatSage, FormatSageArgsSchema } from './tools/format-sage.js';
import {
  exportClipboard,
  ExportClipboardArgsSchema,
} from './tools/export-clipboard.js';
import {
  exportDocument,
  ExportDocumentArgsSchema,
} from './tools/export-document.js';
import { searchJobcodes } from './tools/search-jobcodes.js';
import { getProjectNotes } from './tools/get-project-notes.js';
import { getProjectDetails } from './tools/get-project-details.js';
import { z } from 'zod';

// Zod schemas for new tools
const SearchJobcodesArgsSchema = z.object({
  search: z.string().optional(),
  active: z.enum(['yes', 'no', 'both']).optional(),
});

const GetProjectNotesArgsSchema = z.object({
  projectId: z.number().optional(),
  jobcodeId: z.number().optional(),
});

const GetProjectDetailsArgsSchema = z.object({
  jobcodeId: z.number().optional(),
  projectName: z.string().optional(),
});

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'TSHEETS_CLIENT_ID',
  'TSHEETS_CLIENT_SECRET',
  'TSHEETS_REDIRECT_URI',
  'TOKEN_FILE_PATH',
];

console.error('[MCP Server] Checking environment variables...');
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`[MCP Server] Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('[MCP Server] Please check your Claude Desktop configuration file');
} else {
  console.error('[MCP Server] All required environment variables are set');
}

// Initialize services with error handling
console.error('[MCP Server] Using TSheets API');
let tokenManager: TokenManager | null = null;
let tsheetsClient: TSheetsClient | null = null;
let tsheetsApi: TSheetsApi | null = null;

try {
  if (process.env.TOKEN_FILE_PATH) {
    tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH);

    if (process.env.TSHEETS_CLIENT_ID && process.env.TSHEETS_CLIENT_SECRET && process.env.TSHEETS_REDIRECT_URI) {
      tsheetsClient = new TSheetsClient(tokenManager, {
        clientId: process.env.TSHEETS_CLIENT_ID,
        clientSecret: process.env.TSHEETS_CLIENT_SECRET,
        redirectUri: process.env.TSHEETS_REDIRECT_URI,
});
      tsheetsApi = new TSheetsApi(tsheetsClient);
      console.error('[MCP Server] TSheets client initialized successfully');
    }
  }
} catch (error) {
  console.error('[MCP Server] Error initializing services:', error);
}

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'get_project_report_summary',
    description:
      'Get FAST aggregated timesheet summary from TSheets Project Report API. Returns total hours by user and jobcode. Use this for quick summaries and Sage reports. Much faster than detailed report.',
    inputSchema: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'string',
          description: 'Natural language date range: "last week", "this week", "this month", "last month", "week of 11/3/2025"',
        },
        startDate: {
          type: 'string',
          description: 'Alternative: Explicit start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'Alternative: Explicit end date in YYYY-MM-DD format',
        },
        jobcodeId: {
          type: 'number',
          description: 'Optional: Filter by specific jobcode ID (e.g., 25802)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_project_report',
    description:
      'Get DETAILED timesheet data from TSheets including individual entries, employee hours, notes, and photo attachments. Slower but includes all details. Use get_project_report_summary for faster aggregated data.',
    inputSchema: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'string',
          description: 'Natural language date range: "last week", "this week", "this month", "last month", "week of 11/3/2025"',
        },
        startDate: {
          type: 'string',
          description: 'Alternative: Explicit start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'Alternative: Explicit end date in YYYY-MM-DD format',
        },
        projectName: {
          type: 'string',
          description: 'Project/jobcode name or numeric ID (e.g., "25802" or "Fort Hamilton Parkway"). Auto-detects if numeric. Partial match supported for names.',
        },
        jobcodeId: {
          type: 'number',
          description: 'Alternative: Direct numeric jobcode ID for exact matching (e.g., 25802)',
        },
      },
      required: [],
    },
  },
  {
    name: 'format_sage',
    description:
      'Transform raw TSheets timesheet data into Sage 100 Contractor format. Converts hours/minutes to decimal hours, sorts by date and employee, and calculates summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        rawReport: {
          type: 'object',
          description: 'Raw project report from get_project_report tool',
        },
      },
      required: ['rawReport'],
    },
  },
  {
    name: 'export_clipboard',
    description:
      'Export Sage-formatted report in various formats (text, markdown, CSV) ready for copy-paste into Sage 100 Contractor.',
    inputSchema: {
      type: 'object',
      properties: {
        sageReport: {
          type: 'object',
          description: 'Sage report from format_sage tool',
        },
        format: {
          type: 'string',
          enum: ['text', 'markdown', 'csv'],
          description: 'Output format',
        },
      },
      required: ['sageReport', 'format'],
    },
  },
  {
    name: 'export_document',
    description:
      'Export Sage-formatted timesheet report as a professional DOCX or PDF document with tables and formatting. Returns base64-encoded file ready for download.',
    inputSchema: {
      type: 'object',
      properties: {
        sageReport: {
          type: 'object',
          description: 'Sage report from format_sage tool',
        },
        format: {
          type: 'string',
          enum: ['docx', 'pdf'],
          description: 'Document format: docx or pdf',
        },
        filename: {
          type: 'string',
          description: 'Optional custom filename (without extension)',
        },
      },
      required: ['sageReport', 'format'],
    },
  },
  {
    name: 'search_jobcodes',
    description:
      'Search for jobcodes (projects/tasks) in TSheets by name, ID, or short code. Returns a list of matching jobcodes. Use this to find the correct jobcode ID before getting detailed reports.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search term: partial name, numeric ID, or short code (e.g., "Fort Hamilton", "25802")',
        },
        active: {
          type: 'string',
          enum: ['yes', 'no', 'both'],
          description: 'Filter by active status. Default: both',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_project_notes',
    description:
      'Get all notes and file attachments for a TSheets project. Notes include content, author, timestamps, and attached files. Requires project ID or jobcode ID.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'TSheets project ID (not the jobcode ID)',
        },
        jobcodeId: {
          type: 'number',
          description: 'Alternative: jobcode ID - will find the associated project automatically',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_project_details',
    description:
      'Get comprehensive project information including jobcode details, project metadata, and all notes with file counts. Search by jobcode ID or project name.',
    inputSchema: {
      type: 'object',
      properties: {
        jobcodeId: {
          type: 'number',
          description: 'Jobcode ID (e.g., 25802)',
        },
        projectName: {
          type: 'string',
          description: 'Alternative: Project/jobcode name to search for',
        },
      },
      required: [],
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: 'tsheets-sage-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    console.error(`[MCP Server] Tool called: ${name}`);
    console.error(`[MCP Server] Arguments: ${JSON.stringify(args || {})}`);

    // Check if services are initialized for tools that need them
    const toolsNeedingTSheets = [
      'get_project_report',
      'get_project_report_summary',
      'search_jobcodes',
      'get_project_notes',
      'get_project_details',
    ];
    if (toolsNeedingTSheets.includes(name)) {
      if (!tsheetsClient || !tsheetsApi || !tokenManager) {
        throw new Error(
          'TSheets services not initialized. Please check your environment variables:\n' +
          '- TSHEETS_CLIENT_ID\n' +
          '- TSHEETS_CLIENT_SECRET\n' +
          '- TSHEETS_REDIRECT_URI\n' +
          '- TOKEN_FILE_PATH\n' +
          'Also ensure you have run authentication (npm run auth) to create the token file.'
        );
      }
    }

    switch (name) {
      case 'get_project_report_summary': {
        const validated = GetProjectReportSummaryArgsSchema.parse(args || {});
        await tsheetsClient!.initialize();
        const result = await getProjectReportSummary(validated, tsheetsApi!);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_project_report': {
        // Safe argument parsing with default to empty object
        const validated = GetProjectReportArgsSchema.parse(args || {});
        await tsheetsClient!.initialize();
        const result = await getProjectReport(validated, tsheetsApi!);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'format_sage': {
        const validated = FormatSageArgsSchema.parse(args || {});
        const result = formatSage(validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'export_clipboard': {
        const validated = ExportClipboardArgsSchema.parse(args || {});
        const result = exportClipboard(validated);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'export_document': {
        const validated = ExportDocumentArgsSchema.parse(args || {});
        const result = await exportDocument(validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'search_jobcodes': {
        const validated = SearchJobcodesArgsSchema.parse(args || {});
        await tsheetsClient!.initialize();
        const result = await searchJobcodes(tsheetsApi!, validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_project_notes': {
        const validated = GetProjectNotesArgsSchema.parse(args || {});
        await tsheetsClient!.initialize();
        const result = await getProjectNotes(tsheetsApi!, validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_project_details': {
        const validated = GetProjectDetailsArgsSchema.parse(args || {});
        await tsheetsClient!.initialize();
        const result = await getProjectDetails(tsheetsApi!, validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`[MCP Server] Error executing tool: ${errorMessage}`);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('TSheets-Sage MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
