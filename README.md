# TSheets MCP Server

MCP (Model Context Protocol) server for accessing TSheets timesheet data through Claude Desktop.

Fetch employee hours, notes, and photo attachments for your projects and export them to Sage 100 Contractor format.

## Features

✅ **TSheets Integration**
- Fetch timesheets by date range and project
- Get employee hours with notes
- Access photo attachments from timesheets
- Support for all TSheets jobcodes (projects/tasks)

✅ **Sage 100 Contractor Export**
- Transform timesheet data to Sage format
- Export as CSV, text, markdown, DOCX, or PDF
- Automatic decimal hour conversion
- Employee and daily summaries

✅ **Claude Desktop Integration**
- Natural language queries ("Get timesheets for Project X last week")
- Automatic data formatting
- Easy copy-paste to Sage

## Quick Start

### 1. Get TSheets API Credentials

1. Log into your TSheets account
2. Go to **Feature Add-ons** → **Manage Add-ons**
3. Find **API** add-on and click **Install**
4. Click **Add a new application**
5. Fill in:
   - **Name**: "MCP Server" (or whatever you want)
   - **OAuth Redirect URI**: `http://localhost:3000/oauth/callback`
6. Click **Save** and copy your **Client ID** and **Client Secret**

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file:

```bash
TSHEETS_CLIENT_ID=your_client_id_here
TSHEETS_CLIENT_SECRET=your_client_secret_here
TSHEETS_REDIRECT_URI=http://localhost:3000/oauth/callback
TOKEN_FILE_PATH=.tokens.json
```

### 4. Authenticate

```bash
npm run auth
```

This will:
- Open your browser to TSheets
- Ask you to authorize the app
- Save OAuth tokens automatically

### 5. Test the Connection

```bash
# See recent timesheets
npm test

# List all employees
npm test -- --users

# List all projects/jobcodes
npm test -- --jobs

# Dump all data (users, jobs, timesheets, files)
npm test -- --dump
```

### 6. Build and Start

```bash
npm run build
npm start
```

### 7. Connect to Claude Desktop

Edit your `claude_desktop_config.json`:

**Windows**: `C:\Users\YOUR_NAME\AppData\Roaming\Claude\claude_desktop_config.json`

**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this:

```json
{
  "mcpServers": {
    "tsheets": {
      "command": "node",
      "args": [
        "C:\\Users\\YOUR_NAME\\Documents\\github\\Tsheets-MCP\\dist\\index.js"
      ],
      "env": {
        "TSHEETS_CLIENT_ID": "your_client_id",
        "TSHEETS_CLIENT_SECRET": "your_client_secret",
        "TSHEETS_REDIRECT_URI": "http://localhost:3000/oauth/callback",
        "TOKEN_FILE_PATH": "C:\\Users\\YOUR_NAME\\Documents\\github\\Tsheets-MCP\\.tokens.json"
      }
    }
  }
}
```

**Restart Claude Desktop**, then try:

```
Get timesheet data for all projects from last week
```

## Usage Examples

In Claude Desktop, you can ask:

```
Show me timesheets for Project X from last week
```

```
Get all employee hours for November 2024
```

```
Export timesheet data for Project ABC to Sage format
```

```
Show me timesheets with attached photos from this month
```

## Available Tools

The MCP server exposes these tools to Claude:

1. **`get_project_report`** - Fetch timesheet data by project and date
2. **`format_sage`** - Convert to Sage 100 Contractor format
3. **`export_clipboard`** - Export as text/CSV/markdown
4. **`export_document`** - Export as DOCX or PDF

## API Documentation

- TSheets API Docs: https://tsheetsteam.github.io/api_docs/
- MCP Protocol: https://modelcontextprotocol.io/

## Troubleshooting

**"No tokens found"**
- Run `npm run auth` first

**"Failed to call tool"**
- Make sure `TOKEN_FILE_PATH` in Claude config points to `.tokens.json` (with the leading dot!)
- Restart Claude Desktop after config changes

**"No timesheets found"**
- Check that employees are tracking time in TSheets
- Verify the date range matches your data
- Use `npm test -- --dump` to see what data exists

## License

ISC
