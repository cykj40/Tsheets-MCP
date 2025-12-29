# TSheets MCP Search Improvements

## Problem
When searching for timesheets by project name (e.g., "MMC BCC Mammography Suite"), Claude was unable to find results even though the data existed. This was because:

1. TSheets uses a hierarchical jobcode structure (parent › child)
2. The displayed jobcode names show the full path (e.g., "MMC BCC 2nd FL Mammography Suite Renovation 25839 › 1030 GENERAL LABOR 1030")
3. The search was only matching individual jobcode names, not the full hierarchy
4. When a parent jobcode was matched, it wasn't automatically including child jobcodes

## Solution

### 1. Enhanced Search Tool Description
Updated `search_jobcodes` tool to:
- Emphasize it should be used FIRST when a project name is mentioned
- Clarify that it searches across both `name` and `short_code` fields
- Show full hierarchical paths in results

### 2. Improved Jobcode Matching Logic
Enhanced `getTimesheetsForDateRange` in `tsheets.ts` to:
- When a parent jobcode is matched (by ID or name), automatically include ALL child jobcodes
- This ensures that searching for "25839" returns timesheets for both the parent and all children (like "1030 GENERAL LABOR")

### 3. Full Hierarchy Display
Updated `search_jobcodes` to show `full_path` for each result:
```json
{
  "id": 12345,
  "name": "1030 GENERAL LABOR",
  "short_code": "1030",
  "full_path": "MMC BCC 2nd FL Mammography Suite Renovation 25839 › 1030 GENERAL LABOR 1030"
}
```

## How Claude Should Use the Tools

### Recommended Workflow

1. **User asks for project by name:**
   ```
   "Get timesheets for MMC BCC Mammography project"
   ```

2. **Claude should:**
   ```javascript
   // Step 1: Search for the jobcode
   search_jobcodes({ search: "MMC BCC Mammography" })
   
   // Step 2: Use the returned jobcode ID
   get_project_report({ 
     jobcodeId: 25839,  // from search results
     dateRange: "last week"
   })
   ```

### Why This Works Better

- **Exact Matching**: Using `jobcodeId` ensures you get exactly the right project
- **Includes Children**: Automatically includes all sub-tasks/child jobcodes
- **Clear Context**: Search results show full hierarchy so Claude can verify it found the right project

### Example Search Results

When searching for "MMC BCC":
```json
{
  "success": true,
  "jobcodes": [
    {
      "id": 25839,
      "name": "MMC BCC 2nd FL Mammography Suite Renovation 25839",
      "short_code": "25839",
      "type": "regular",
      "active": true,
      "parent_id": null,
      "has_children": true,
      "full_path": "MMC BCC 2nd FL Mammography Suite Renovation 25839"
    },
    {
      "id": 67890,
      "name": "1030 GENERAL LABOR",
      "short_code": "1030",
      "type": "regular",
      "active": true,
      "parent_id": 25839,
      "has_children": false,
      "full_path": "MMC BCC 2nd FL Mammography Suite Renovation 25839 › 1030 GENERAL LABOR 1030"
    }
  ],
  "total_count": 2,
  "search_term": "MMC BCC"
}
```

Then use `jobcodeId: 25839` to get timesheets for BOTH the parent and all children.

## Testing

After rebuilding (`npm run build`) and restarting Claude Desktop, test with:

```
Search for MMC BCC projects
```

Then:

```
Get timesheets for project 25839 from last week
```

You should see all timesheet entries for the parent project and all its child jobcodes.

