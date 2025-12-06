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
import { QBOClient } from './api/client.js';
import { QBOApi } from './api/qbo.js';
import {
  getProjectReport,
  GetProjectReportArgsSchema,
} from './tools/get-project-report.js';
import { formatSage, FormatSageArgsSchema } from './tools/format-sage.js';
import {
  exportClipboard,
  ExportClipboardArgsSchema,
} from './tools/export-clipboard.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'INTUIT_CLIENT_ID',
  'INTUIT_CLIENT_SECRET',
  'INTUIT_REDIRECT_URI',
  'TOKEN_FILE_PATH',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Initialize services
const tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH!);
const qboClient = new QBOClient(tokenManager, {
  clientId: process.env.INTUIT_CLIENT_ID!,
  clientSecret: process.env.INTUIT_CLIENT_SECRET!,
  redirectUri: process.env.INTUIT_REDIRECT_URI!,
});
const qboApi = new QBOApi(qboClient);

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'get_project_report',
    description:
      'Extract timesheet data from QuickBooks Online for a specific date range and optional job. Returns raw project report with time activities.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
        jobName: {
          type: 'string',
          description: 'Optional job/customer name to filter results',
        },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'format_sage',
    description:
      'Transform raw QuickBooks timesheet data into Sage 100 Contractor format. Converts hours/minutes to decimal hours, sorts by date and employee, and calculates summaries.',
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
];

// Create MCP server
const server = new Server(
  {
    name: 'quickbooks-sage-mcp',
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
        await qboClient.initialize();
        const result = await getProjectReport(validated, qboApi);
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
  console.error('QuickBooks-Sage MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
