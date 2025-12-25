# TSheets API Documentation

## Base URL
`https://rest.tsheets.com/api/v1`

## Key Information

### Rate Limiting
- Requests are throttled within a 5-minute window
- Monitor your request count to avoid throttling

### Response Size Limit
- API responses have size limits
- Use pagination for large datasets

### Authentication
- OAuth 2.0 based authentication
- Access tokens can be refreshed
- Store tokens securely

## Important Objects

### Jobcodes (Projects/Tasks)
- Jobcodes have a hierarchical structure via `parent_id`
- Each jobcode can have:
  - `id`: Unique identifier
  - `parent_id`: Parent jobcode ID (for hierarchy)
  - `name`: Display name
  - `short_code`: Project/job number
  - `type`: 'regular', 'pto', 'paid_break', 'unpaid_break', 'unpaid_time_off'
  - `active`: Boolean status
  - `has_children`: Boolean indicating child jobcodes exist

**Full Job Path Display Format:**
When displaying jobcode hierarchies, traverse from child to root using `parent_id` and join with ` › ` separator.

Example: `NYP Buckley 4 Telemetry Rooms/Corridor Construction 25831 › 1030 GENERAL LABOR`

Format: `{parent.name} {parent.short_code} › {child.name} {child.short_code}`

### Timesheets
- `id`: Unique identifier
- `user_id`: Employee who logged time
- `jobcode_id`: Associated project/task
- `start`: ISO 8601 datetime
- `end`: ISO 8601 datetime
- `duration`: Total seconds
- `date`: YYYY-MM-DD format
- `notes`: Optional text notes
- `attached_files`: Array of file IDs
- `customfields`: Record of custom field values

### Users (Employees)
- `id`: Unique identifier
- `first_name`, `last_name`: Name fields
- `email`: Email address
- `employee_number`: Employee identifier
- `active`: Boolean status
- `display_name`: Preferred display name

### Files (Attachments)
- `id`: Unique identifier
- `file_name`: Original filename
- `file_size` or `size`: File size in bytes
- `file_url`: Download URL
- `linked_objects`: Related entities (timesheets, projects, notes)
- `meta_data`: Additional info like image rotation

### Projects
- Separate from jobcodes but linked via `jobcode_id`
- `id`: Unique project identifier
- `jobcode_id`: Associated jobcode
- `parent_jobcode_id`: Parent jobcode if hierarchical
- `name`: Project name
- `status`: 'in_progress', 'complete', 'cancelled'
- `description`: Project details
- `start_date`, `due_date`, `completed_date`: Date tracking

### Project Notes
- `id`: Unique identifier
- `project_id`: Associated project
- `user_id`: Note author
- `note`: Note content
- `files`: Array of file IDs attached to note
- `linked_objects`: Related entities

### Project Activities
- Tracks activity on projects (like notes)
- `activity_type`: Type of activity (e.g., 'note')
- `unread_replies_count`: Number of unread replies
- `following`: Boolean indicating if user follows activity

## API Endpoints Used in This Project

### GET /timesheets
Query Parameters:
- `start_date`: YYYY-MM-DD
- `end_date`: YYYY-MM-DD
- `jobcode_ids`: Array of jobcode IDs to filter
- `supplemental_data`: Request additional related data

Returns:
- `results.timesheets`: Map of timesheet objects
- `supplemental_data.users`: Related user objects
- `supplemental_data.jobcodes`: Related jobcode objects

### GET /jobcodes
Query Parameters:
- `active`: 'yes', 'no', 'both'
- `ids`: Array of specific IDs
- `name`: Filter by name

Returns:
- `results.jobcodes`: Map of jobcode objects

### GET /users
Query Parameters:
- `active`: 'yes', 'no', 'both'
- `ids`: Array of specific user IDs

Returns:
- `results.users`: Map of user objects

### GET /files
Query Parameters:
- `ids`: Array of file IDs

Returns:
- `results.files`: Map of file objects

### GET /projects
Query Parameters:
- `jobcode_ids`: Array of jobcode IDs
- `active`: 'yes', 'no', 'both'
- `status`: 'in_progress', 'complete', 'cancelled'

Returns:
- `results.projects`: Map of project objects
- `supplemental_data`: Related users, jobcodes

### GET /project_notes
Query Parameters:
- `project_id`: Specific project ID
- `supplemental_data`: Request additional data ('yes')

Returns:
- `results.project_notes`: Map of note objects
- `supplemental_data.files`: File objects
- `supplemental_data.users`: User objects
- `supplemental_data.project_activities`: Activity objects

### GET /reports/project
Query Parameters:
- `start_date`: YYYY-MM-DD
- `end_date`: YYYY-MM-DD
- `jobcode_ids`: Filter by specific jobcodes
- `jobcode_type`: 'all', 'regular', etc.

Returns:
- Aggregated totals by users, groups, jobcodes
- Summary data for reporting

## Important Notes

### Supplemental Data
- Many endpoints support `supplemental_data` parameter
- Reduces API calls by including related objects
- Check `supplemental_data` in responses before making additional requests

### Pagination
- Large result sets use pagination
- Check `more: true` in response to indicate more data available
- Use appropriate filtering to manage response sizes

### Date Formats
- **Dates**: YYYY-MM-DD (e.g., "2025-12-25")
- **Datetimes**: ISO 8601 format (e.g., "2019-11-21T18:42:06+00:00")

### Object Relationships
- Timesheets link to users via `user_id` and jobcodes via `jobcode_id`
- Jobcodes can be hierarchical via `parent_id`
- Files link to multiple object types via `linked_objects`
- Projects link to jobcodes via `jobcode_id`

## Common Workflows

### Getting Timesheet Details with All Related Data
1. GET /timesheets with date range
2. Check supplemental_data for users/jobcodes (API often includes these automatically)
3. GET /files for any `attached_files` IDs
4. Build jobcode hierarchy by traversing `parent_id` relationships

### Building Full Jobcode Hierarchy
1. GET /jobcodes to fetch all jobcodes
2. Create a Map indexed by jobcode ID
3. For each jobcode, traverse parent_id chain to root
4. Build display string with ` › ` separator
5. Include both name and short_code in each level

### Working with Project Notes
1. GET /projects to find project by jobcode_id
2. GET /project_notes with project_id and supplemental_data=yes
3. supplemental_data will include files and users automatically
4. Link files to notes via linked_objects

## Reference Links
- Official API Docs: https://tsheetsteam.github.io/api_docs/
- GitHub Repository: https://github.com/tsheetsteam/api_docs
- Postman Collection: Available in official docs

