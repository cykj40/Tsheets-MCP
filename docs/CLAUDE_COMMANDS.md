# Claude Desktop Commands for TSheets MCP

Quick reference for common TSheets queries in Claude Desktop.

---

## 📋 Weekly Timesheet Reports

### Get Last Week's Timesheets (Grouped by Job & Date)
```
Get 02/02/2026 - 02/08/2026 timesheets. Group by job (full hierarchy), then by date. 
Only show entries with notes. Format: Job header, then dates, then 
employee/time/hours/notes for each entry. exclude entries with .., ..., ${name} has the notes 
```

# TSheets MCP — Claude Desktop Prompt Reference

CD to project:
cd H:\Documents\GitHub\Tsheets-MCP

---

## WEEKLY NOTES REPORT (basic)
Get xx/xx/xxxx - xx/xx/xxxx timesheets. Group by job (full hierarchy), then by date.
Only show entries with notes. Format: Job header, then dates, then
employee/time/hours/notes for each entry. Leave out entries with ".", "..", "...", 
"office", "supervision"

---

## WEEKLY NOTES REPORT (with name exclusions)
Get 02/02/2026 - 02/08/2026 timesheets. Group by job (full hierarchy), then by date.
Only show entries with notes. Format: Job header, then dates, then
employee/time/hours/notes for each entry. Exclude entries with "..", "...",
[NAME] has the notes

→ Replace [NAME] with actual employee name to exclude their entries
→ Example: "Cyrus has the notes" or "Marc has the notes"
→ Replace dates with actual week range

---

## PROJECT FULL HISTORY (single job, all time)
Get project details for jobcode XXXXX including all notes and files.

→ Returns ALL entries ever logged to that job grouped by cost code:
  CLIENT — Job Name (jobcodeId)
  › 1040 SUPERVISION
  02/05 — Employee | 8.5 hrs
    Notes here [2 📷]
  › 1030 GENERAL LABOR
  02/04 — Employee | 5.5 hrs
    Notes here

---

## SEARCH FOR A JOB
Search jobcodes for "SEARCH TERM"

→ Examples:
  Search jobcodes for "Buckley"
  Search jobcodes for "MMC BCC"
  Search jobcodes for "25831"

---

## SAGE EXPORT — CLIPBOARD (text)
Get xx/xx/xxxx - xx/xx/xxxx timesheets, format for Sage, and export as text.

---

## SAGE EXPORT — CLIPBOARD (CSV)
Get xx/xx/xxxx - xx/xx/xxxx timesheets, format for Sage, and export as csv.

---

## SAGE EXPORT — CLIPBOARD (markdown)
Get xx/xx/xxxx - xx/xx/xxxx timesheets, format for Sage, and export as markdown.

---

## SAGE EXPORT — DOCX
Get xx/xx/xxxx - xx/xx/xxxx timesheets, format for Sage, and export as a docx.

---

## SAGE EXPORT — PDF
Get xx/xx/xxxx - xx/xx/xxxx timesheets, format for Sage, and export as a pdf.

---

## SINGLE JOB SAGE EXPORT
Get timesheets for jobcode XXXXX from xx/xx/xxxx - xx/xx/xxxx,
format for Sage, and export as a docx.

---

## QUICK SUMMARY (fast, no details)
Get a timesheet summary for xx/xx/xxxx - xx/xx/xxxx
(optional: for jobcode XXXXX)

---

## SYNC DATABASE — RECENT (last 90 days)
Sync recent timesheet data into the local cache.

---

## SYNC DATABASE — FULL HISTORY
Sync all historical timesheet data from 2023 to today.

---

## SYNC DATABASE — CUSTOM RANGE
Sync timesheets from xx/xx/xxxx to xx/xx/xxxx into the local cache.

---

## NOTES
- Always use jobcode ID (number) not job name when you know it — more accurate
- Use search_jobcodes first if you only know the job name
- export_clipboard formats: text | markdown | csv
- export_document formats: docx | pdf
- DB sync required before querying old jobs — run full history sync once
- Replace xx/xx/xxxx with actual dates e.g. 02/02/2026 - 02/08/2026
- Replace XXXXX with actual jobcode ID e.g. 25831
- Project dir: H:\Documents\GitHub\Tsheets-MCP
## 📊 Sage 100 Export

### Format for Sage (CSV)
```
Get last week's timesheets, format for Sage 100, and export as CSV.
```

### Format for Sage (Table)
```
Get last week's timesheets and format for Sage 100 Contractor. Show as a table.
```

### Export as Document
```
Get last week's timesheets, format for Sage, and export as PDF.
```

---

## 👥 Employee-Focused Reports

### Specific Employee's Hours
```
Get last week's timesheets grouped by employee, then by job.
```

### Employee with Notes
```
Show all timesheet entries with notes from last week, grouped by employee.
```

---

## 📎 Reports with Attachments

### Entries with Photos
```
Get last week's timesheets that have photo attachments, grouped by job.
```

### Full Report with Attachment Count
```
Get detailed timesheets for this week showing which entries have files attached.
```

---

## 🗓️ Date Range Examples

| Natural Language | What It Means |
|-----------------|---------------|
| `last week` | Previous Mon-Sun |
| `this week` | Current Mon-Sun |
| `last month` | Previous calendar month |
| `this month` | Current calendar month |
| `week of 12/18/2025` | Mon-Sun containing that date |
| `December 18-24, 2025` | Specific date range |
| `2025-12-18 to 2025-12-24` | Explicit YYYY-MM-DD format |

---

## 🎯 Pro Tips

1. **Add "with notes"** to filter out empty entries
2. **Add "grouped by job"** for job-first organization
3. **Add "grouped by employee"** for employee-first organization
4. **Add "format for Sage"** when you need Sage 100 Contractor format
5. **Use "quick summary"** for faster aggregated data (no individual entries)
6. **Specify "full job hierarchy"** to ensure complete job paths are shown

---

## 📌 Favorite Commands (Copy-Paste Ready)

**Daily Operations:**
```
Get last week's timesheets. Group by job (full hierarchy), then by date. Only show entries with notes.
```

**Sage Export:**
```
Get last week's timesheets, format for Sage 100, and show as CSV.
```

**Project Lookup:**
```
Search for all jobcodes matching "MMC" and show their IDs.
```

**Quick Check:**
```
Get a quick summary of this week's hours by employee.
```
