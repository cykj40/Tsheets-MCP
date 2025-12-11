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
import { formatSage, FormatSageArgsSchema } from './tools/format-sage.js';
import {
  exportClipboard,
  ExportClipboardArgsSchema,
} from './tools/export-clipboard.js';
import {
  exportDocument,
  ExportDocumentArgsSchema,
} from './tools/export-document.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'TSHEETS_CLIENT_ID',
  'TSHEETS_CLIENT_SECRET',
  'TSHEETS_REDIRECT_URI',
  'TOKEN_FILE_PATH',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Initialize services
console.error('[MCP Server] Using TSheets API');
const tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH!);
const tsheetsClient = new TSheetsClient(tokenManager, {
  clientId: process.env.TSHEETS_CLIENT_ID!,
  clientSecret: process.env.TSHEETS_CLIENT_SECRET!,
  redirectUri: process.env.TSHEETS_REDIRECT_URI!,
});
const tsheetsApi = new TSheetsApi(tsheetsClient);

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'get_project_report',
    description:
      'Get timesheet data from TSheets including employee hours, notes, and photo attachments. Supports natural language dates like "last week", "this month". Can filter by project/jobcode name.',
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
          description: 'Project/jobcode name to filter results (partial match supported)',
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

    switch (name) {
      case 'get_project_report': {
        const validated = GetProjectReportArgsSchema.parse(args);
        await tsheetsClient.initialize();
        const result = await getProjectReport(validated, tsheetsApi);
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
        const validated = FormatSageArgsSchema.parse(args);
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
        const validated = ExportClipboardArgsSchema.parse(args);
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
        const validated = ExportDocumentArgsSchema.parse(args);
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

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
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
