# TSheets MCP Server

MCP (Model Context Protocol) server for querying TSheets timesheet and project data from Claude Desktop. Fetch employee hours, notes, and photo attachments by project and date range; format results for Sage 100 Contractor; and optionally cache history in a local SQLite database for faster project lookups.

## Features

- **TSheets integration** — OAuth 2.0 auth, timesheets by date range and jobcode, employees, hierarchical jobcodes, project notes, and file attachments
- **Fast vs detailed reports** — aggregated Project Report summaries or full entry-level detail (hours, notes, photos)
- **Jobcode search** — find projects/tasks by name, numeric ID, or short code across the full hierarchy path
- **Sage 100 Contractor export** — transform timesheets to Sage format; export as text, markdown, CSV, DOCX, or PDF
- **Local SQLite cache** — sync recent or historical data for offline-style project history queries
- **Claude Desktop (stdio MCP)** — natural-language queries through the MCP tools listed below

## Requirements

- Node.js and npm (native build tools required for `better-sqlite3`)
- A TSheets account with the **API** add-on enabled
- [Claude Desktop](https://claude.ai/download) (for MCP usage)

> **Note:** This repo does not pin a Node `engines` range. Use a current Node LTS. On corporate networks, scripts already set `NODE_OPTIONS=--use-system-ca` to help with TLS/certificate issues.

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/cykj40/Tsheets-MCP.git
cd Tsheets-MCP
npm install
```

### 2. Create a TSheets API application

1. Log into TSheets
2. Go to **Feature Add-ons** → **Manage Add-ons**
3. Install the **API** add-on if needed
4. **Add a new application** and set:
   - **Name**: e.g. `MCP Server`
   - **OAuth Redirect URI**: `http://localhost:3000/oauth/callback`
5. Save and copy the **Client ID** and **Client Secret**

### 3. Configure environment

Create a `.env` file in the project root (there is currently no committed `.env.example`):

```bash
TSHEETS_CLIENT_ID=your_client_id
TSHEETS_CLIENT_SECRET=your_client_secret
TSHEETS_REDIRECT_URI=http://localhost:3000/oauth/callback
TOKEN_FILE_PATH=.tokens.json
```

Optional:

```bash
# Absolute or relative path to the SQLite DB file.
# Default when unset: <project>/data/tsheets-cache.db
TSHEETS_DB_PATH=./data/tsheets-cache.db
```

Do not commit `.env`, `.tokens.json`, or `*.db` files (they are gitignored).

### 4. Authenticate

```bash
npm run auth
```

This starts a local OAuth callback server (default port **3000**), opens the TSheets authorize URL, and writes tokens to `TOKEN_FILE_PATH`.

If the browser does not open, copy the URL printed in the terminal. If token exchange fails on a corporate network, ensure `NODE_OPTIONS=--use-system-ca` is set (the npm scripts already include this).

### 5. Verify the TSheets connection

Use the dedicated connectivity script (not `npm test`, which runs Vitest unit tests):

```bash
# Recent timesheets
npm run test:tsheets

# List employees
npm run test:tsheets -- --users

# List jobcodes / projects
npm run test:tsheets -- --jobs

# Dump users, jobs, and recent timesheets
npm run test:tsheets -- --dump
```

### 6. Build and run the MCP server

```bash
npm run build
npm start
```

Development (watch mode):

```bash
npm run dev
```

The server speaks MCP over **stdio** (`StdioServerTransport`). It is meant to be launched by an MCP host such as Claude Desktop, not used as an HTTP API.

### 7. Connect Claude Desktop

Edit `claude_desktop_config.json`:

| OS | Typical path |
|----|----------------|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |

Example (adjust paths to your machine):

```json
{
  "mcpServers": {
    "tsheets": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/Tsheets-MCP/dist/index.js"
      ],
      "env": {
        "NODE_OPTIONS": "--use-system-ca",
        "TSHEETS_CLIENT_ID": "your_client_id",
        "TSHEETS_CLIENT_SECRET": "your_client_secret",
        "TSHEETS_REDIRECT_URI": "http://localhost:3000/oauth/callback",
        "TOKEN_FILE_PATH": "/ABSOLUTE/PATH/TO/Tsheets-MCP/.tokens.json"
      }
    }
  }
}
```

On Windows, use escaped backslashes in JSON paths (e.g. `C:\\Users\\YOUR_USER\\...\\dist\\index.js`).

Restart Claude Desktop after saving. Then try:

```
Get timesheet data for all projects from last week
```

## Configuration reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `TSHEETS_CLIENT_ID` | Yes | TSheets OAuth client ID |
| `TSHEETS_CLIENT_SECRET` | Yes | TSheets OAuth client secret |
| `TSHEETS_REDIRECT_URI` | Yes | Must match the app redirect URI (default in docs: `http://localhost:3000/oauth/callback`) |
| `TOKEN_FILE_PATH` | Yes | Path to stored OAuth tokens (e.g. `.tokens.json`) |
| `TSHEETS_DB_PATH` | No | Path to SQLite cache file; default `data/tsheets-cache.db` under the project |

Token refresh uses a file lock (`TOKEN_FILE_PATH` + `.lock`) so concurrent processes do not rotate the refresh token at the same time.

## Available MCP tools

| Tool | Description |
|------|-------------|
| `search_jobcodes` | Search jobcodes by name, ID, or short code (prefer this before filtering reports by project name) |
| `get_project_report_summary` | Fast aggregated hours by user/jobcode (Project Report API) |
| `get_project_report` | Detailed entries: hours, notes, attachments |
| `get_project_notes` | Project notes and file attachments (`projectId` or `jobcodeId`) |
| `get_project_details` | Jobcode/project metadata, notes, and cached timesheet history by cost code (SQLite-first; syncs on miss) |
| `format_sage` | Convert a raw project report into Sage 100 Contractor shape (decimal hours, summaries) |
| `export_clipboard` | Export Sage report as `text`, `markdown`, or `csv` |
| `export_document` | Export Sage report as `docx` or `pdf` (base64 payload) |
| `sync_timesheets` | Sync into SQLite: `recent` (last 90 days), `history` (from 2023-01-01), or `range` with `startDate`/`endDate` |

Server name registered with MCP: `tsheets-sage-mcp` (v1.0.0). Tools only — no MCP resources or prompts are registered.

## Usage examples (Claude Desktop)

```
Search for all jobcodes matching "Acme" and show their IDs.
```

```
Get a timesheet summary for last week
```

```
Show me detailed timesheets for jobcode 10001 from last week
```

```
Get last week's timesheets, format for Sage, and export as CSV
```

```
Get last week's timesheets, format for Sage, and export as a PDF
```

```
Sync recent timesheet data into the local cache
```

```
Get project details for jobcode 10001
```

Natural-language date ranges supported by the built-in parser include expressions such as `last week`, `this week`, `last month`, `this month`, `today`, `yesterday`, and `week of MM/DD/YYYY` (or `YYYY-MM-DD`). You can also pass explicit `startDate` / `endDate` as `YYYY-MM-DD`.

TSheets API notes used by this project are in [`docs/TSHEETS_API.md`](docs/TSHEETS_API.md).

## npm scripts

| Script | What it does |
|--------|----------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled MCP server (`dist/index.js`) |
| `npm run dev` | Run `src/index.ts` with `tsx watch` |
| `npm run auth` | Interactive TSheets OAuth flow |
| `npm run test:tsheets` | Live API smoke test (`--users`, `--jobs`, `--dump`) |
| `npm test` / `npm run test:watch` | Vitest unit tests (interactive / watch) |
| `npm run test:run` | Vitest once (CI-style) |
| `npm run test:coverage` | Vitest with coverage |
| `npm run db:sync-recent` | CLI sync of last ~90 days into SQLite (**requires prior `npm run build`**) |
| `npm run db:sync-history` | CLI full history sync from 2023-01-01 in ~90-day chunks (**requires prior `npm run build`**) |

## Project structure

```
Tsheets-MCP/
├── src/
│   ├── index.ts              # MCP server entry (stdio, tool registration)
│   ├── api/                  # TSheets HTTP client + API helpers
│   ├── auth/                 # OAuth + token manager (refresh locking)
│   ├── db/                   # SQLite schema, sync, queries
│   ├── tools/                # One module per MCP tool
│   ├── types/                # TSheets / Sage types
│   ├── utils/                # Date parsing and formatting
│   └── tests/                # Vitest tests + fixtures
├── scripts/
│   ├── auth-tsheets.ts       # OAuth CLI
│   └── test-tsheets.ts       # Live connectivity CLI
├── docs/
│   └── TSHEETS_API.md        # API notes for this project
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

Runtime artifacts (gitignored): `.env`, `.tokens.json`, `data/` / `*.db`, `dist/`.

## Troubleshooting

**"No tokens found" / services not initialized**  
Run `npm run auth` and ensure `TOKEN_FILE_PATH` points at the same token file Claude Desktop uses (include the leading dot if the file is `.tokens.json`).

**"Failed to call tool"**  
Confirm all four required env vars are set in Claude Desktop config, paths are absolute, and Claude was restarted after edits.

**"No timesheets found"**  
Check that time is being tracked in TSheets for that range; try `npm run test:tsheets -- --dump`. Prefer `search_jobcodes` then pass a numeric `jobcodeId` for exact matches.

**TLS / certificate errors during auth or API calls**  
Use `NODE_OPTIONS=--use-system-ca` (already set in package scripts; add it to Claude Desktop `env` as shown above).

**Empty or stale project history from `get_project_details`**  
Sync the cache first (`sync_timesheets` with `recent`/`history`, or `npm run db:sync-recent` / `npm run db:sync-history` after building). Full history sync starts at **2023-01-01** by design.

**Port 3000 in use during `npm run auth`**  
The OAuth callback server defaults to port 3000 to match `TSHEETS_REDIRECT_URI`. Free the port or change both the redirect URI in TSheets and your env to match.

## Known limitations / missing documentation

- No committed `.env.example`, Docker setup, or CI workflows in this repository
- No Node.js version declared in `package.json` `engines`
- License metadata is inconsistent: root `LICENSE` is **MIT**; `package.json` currently says **ISC**
- `assets/` may be empty and is not used by the app
- MCP host examples focus on Claude Desktop; other MCP clients are not documented here
- History sync is hard-coded to begin at `2023-01-01`

## API references

- [TSheets API docs](https://tsheetsteam.github.io/api_docs/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

See [`LICENSE`](LICENSE) in this repository (MIT License text as committed). Resolve the `package.json` `"license"` field if you need metadata to match.
