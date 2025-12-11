# Testing Guide: Sandbox to Production

## 🎯 Your Goal
Fetch TimeActivity data from QuickBooks Online:
- **Employee Name** → `EmployeeRef.name`
- **Hours Worked** → `Hours` + `Minutes`
- **Notes** → `Description`
- **Project/Job** → `CustomerRef.name`
- **Date** → `TxnDate`

---

## 📋 Step-by-Step Testing Checklist

### Phase 1: Environment Setup

- [ ] Create `.env` file with these variables:
```env
INTUIT_CLIENT_ID=your_client_id
INTUIT_CLIENT_SECRET=your_client_secret
INTUIT_REDIRECT_URI=http://localhost:3000/oauth/callback
TOKEN_FILE_PATH=./tokens.json
USE_SANDBOX=true
```

- [ ] For **Sandbox testing**: `USE_SANDBOX=true`
- [ ] For **Production**: `USE_SANDBOX=false` (or remove the line)

### Phase 2: Authentication

1. Run authentication:
```bash
npm run auth
```

2. Open the URL in your browser
3. Log into QuickBooks (sandbox or production account)
4. Authorize the app
5. Tokens are saved to `tokens.json`

**Note:** Sandbox and Production use **different tokens**. You'll need to re-authenticate when switching.

### Phase 3: Test with Sandbox

Run these tests in order:

#### Test 1: Basic Connection
```bash
npm run test:qbo -- --sandbox
```
✅ Should show: Connected to QuickBooks, list of customers

#### Test 2: Dump All Data (See Raw JSON)
```bash
npm run test:qbo -- --sandbox --dump
```
✅ Should show: All Employees, Customers, TimeActivities in your sandbox

#### Test 3: Query TimeActivities
```bash
npm run test:qbo -- --sandbox --raw --dates 2014-01-01 2025-12-31
```
✅ Should show: TimeActivity records with raw JSON

#### Test 4: Filter by Job
```bash
npm run test:qbo -- --sandbox --job "Rondonuwu"
```
✅ Should show: TimeActivities for that customer/project

### Phase 4: Test MCP Server

1. Build the project:
```bash
npm run build
```

2. Test with Claude Desktop (add to `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "quickbooks-sage": {
      "command": "node",
      "args": ["C:/Users/cyrus/Documents/github/Tsheets-MCP/dist/index.js"],
      "env": {
        "INTUIT_CLIENT_ID": "your_client_id",
        "INTUIT_CLIENT_SECRET": "your_client_secret",
        "INTUIT_REDIRECT_URI": "http://localhost:3000/oauth/callback",
        "TOKEN_FILE_PATH": "C:/Users/cyrus/Documents/github/Tsheets-MCP/tokens.json",
        "USE_SANDBOX": "true"
      }
    }
  }
}
```

3. Ask Claude: "Get timesheet data for last week"

---

## ✅ When to Switch to Production

You're ready for production when ALL of these pass:

| Test | Status |
|------|--------|
| `npm run test:qbo -- --sandbox` connects successfully | ⬜ |
| TimeActivities are returned in `--dump` | ⬜ |
| Employee names appear correctly | ⬜ |
| Hours/Minutes are calculated correctly | ⬜ |
| Description (notes) field is populated | ⬜ |
| CustomerRef shows correct project names | ⬜ |
| MCP server responds in Claude Desktop | ⬜ |
| `get_project_report` tool works | ⬜ |
| `format_sage` tool converts data correctly | ⬜ |

---

## 🔄 Switching to Production

1. **Update your Intuit Developer App**:
   - Go to https://developer.intuit.com
   - Navigate to your app → Settings
   - Ensure your Production keys are ready

2. **Update `.env`**:
```env
USE_SANDBOX=false
# (or just remove the USE_SANDBOX line)
```

3. **Re-authenticate** (production requires new tokens):
```bash
npm run auth
```
- Log in with your **real company** QuickBooks account

4. **Test with production**:
```bash
npm run test:qbo
```

5. **Update Claude Desktop config** to remove `"USE_SANDBOX": "true"`

---

## 🚨 Common Issues

### "No time activities found"
- Your sandbox might be empty - create test data in QuickBooks sandbox
- Try a wider date range: `--dates 2014-01-01 2025-12-31`

### "Token expired"
- Re-run `npm run auth`

### "Invalid client"
- Check your Client ID/Secret match the environment (sandbox vs production)

### "Unsupported Operation" error
- You tried to use direct GET on TimeActivity - use Query instead (already fixed in code)

---

## 📊 Sample Output You Should See

```json
{
  "TimeActivity": {
    "TxnDate": "2014-09-17",
    "NameOf": "Employee",
    "Description": "Garden Lighting",
    "Hours": 3,
    "Minutes": 0,
    "EmployeeRef": {
      "name": "Emily Platt",
      "value": "55"
    },
    "CustomerRef": {
      "name": "Rondonuwu Fruit and Vegi",
      "value": "21"
    },
    "HourlyRate": 15,
    "BillableStatus": "HasBeenBilled",
    "Id": "5"
  }
}
```

---

## 🎉 Success Criteria

Your MCP server is ready for production when:

1. ✅ You can query TimeActivities from sandbox
2. ✅ The data matches what you see in QuickBooks UI
3. ✅ Claude can call `get_project_report` and get results
4. ✅ The Sage formatting works correctly
5. ✅ You've tested with at least one real project name
