/**
 * TSheets API Client
 * 
 * API Docs: https://tsheetsteam.github.io/api_docs/
 */

import fetch from 'node-fetch';
import { TokenManager } from '../auth/token-manager.js';
import { TSheetsOAuth, TSheetsOAuthConfig } from '../auth/tsheets-oauth.js';

const TSHEETS_API_BASE_URL = 'https://rest.tsheets.com/api/v1';

export class TSheetsClient {
  private tokenManager: TokenManager;
  private oauth: TSheetsOAuth;

  constructor(tokenManager: TokenManager, oauthConfig: TSheetsOAuthConfig) {
    this.tokenManager = tokenManager;
    this.oauth = new TSheetsOAuth(oauthConfig);
  }

  /**
   * Initialize by refreshing token if needed
   */
  async initialize(): Promise<void> {
    console.error('[TSheetsClient] Initializing...');

    // Check if we have valid tokens
    const hasValid = await this.tokenManager.hasValidTokens();

    if (!hasValid) {
      // Try to refresh if we have a refresh token
      const refreshToken = await this.tokenManager.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No tokens found. Please run authentication first.');
      }

      console.error('[TSheetsClient] Token expired, refreshing...');
      const newTokens = await this.oauth.refreshAccessToken(refreshToken);

      // Save new tokens
      await this.tokenManager.saveTokens(newTokens);
      console.error('[TSheetsClient] Token refreshed successfully');
    }
  }

  /**
   * Make authenticated GET request to TSheets API
   */
  private async get<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const accessToken = await this.tokenManager.getValidAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const url = new URL(`${TSHEETS_API_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });

    console.error(`[TSheetsClient] GET ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TSheets API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get timesheets with filters
   * @param params - Query parameters (start_date, end_date, user_ids, jobcode_ids, etc.)
   */
  async getTimesheets(params: {
    start_date?: string; // YYYY-MM-DD
    end_date?: string; // YYYY-MM-DD
    user_ids?: number[];
    jobcode_ids?: number[];
    modified_since?: string; // ISO 8601
  } = {}): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params.start_date) queryParams.start_date = params.start_date;
    if (params.end_date) queryParams.end_date = params.end_date;
    if (params.user_ids) queryParams.user_ids = params.user_ids.join(',');
    if (params.jobcode_ids) queryParams.jobcode_ids = params.jobcode_ids.join(',');
    if (params.modified_since) queryParams.modified_since = params.modified_since;

    return this.get('/timesheets', queryParams);
  }

  /**
   * Get users (employees)
   */
  async getUsers(params: {
    ids?: number[];
    active?: 'yes' | 'no' | 'both';
  } = {}): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params.ids) queryParams.ids = params.ids.join(',');
    if (params.active) queryParams.active = params.active;

    return this.get('/users', queryParams);
  }

  /**
   * Get jobcodes (projects/tasks)
   */
  async getJobcodes(params: {
    ids?: number[];
    active?: 'yes' | 'no' | 'both';
    parent_ids?: number[];
  } = {}): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params.ids) queryParams.ids = params.ids.join(',');
    if (params.active) queryParams.active = params.active;
    if (params.parent_ids) queryParams.parent_ids = params.parent_ids.join(',');

    return this.get('/jobcodes', queryParams);
  }

  /**
   * Get files (attachments/photos)
   */
  async getFiles(params: {
    ids?: number[];
    linked_objects?: Array<{ id: number; type: string }>;
  } = {}): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params.ids) queryParams.ids = params.ids.join(',');
    if (params.linked_objects) {
      queryParams.linked_objects = JSON.stringify(params.linked_objects);
    }

    return this.get('/files', queryParams);
  }

  /**
   * Download file by URL
   */
  async downloadFile(fileUrl: string): Promise<Buffer> {
    const accessToken = await this.tokenManager.getValidAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    console.error(`[TSheetsClient] Downloading file: ${fileUrl}`);

    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    return response.buffer();
  }

  /**
   * Get project report (aggregated timesheet data)
   * @param params - Report parameters (start_date, end_date, filters)
   */
  async getProjectReport(params: {
    start_date: string; // YYYY-MM-DD
    end_date: string; // YYYY-MM-DD
    user_ids?: number[];
    group_ids?: number[];
    jobcode_ids?: number[];
    jobcode_type?: 'regular' | 'pto' | 'unpaid_break' | 'paid_break' | 'all';
    customfielditems?: Record<string, string[]>;
  }): Promise<any> {
    const accessToken = await this.tokenManager.getValidAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const url = `${TSHEETS_API_BASE_URL}/reports/project`;

    console.error(`[TSheetsClient] POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: params }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TSheets API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get projects with filters
   * Projects are associated with jobcodes and contain additional tracking info
   * @param params - Query parameters
   */
  async getProjects(params: {
    ids?: number[];
    jobcode_ids?: number[];
    active?: 'yes' | 'no' | 'both';
    status?: 'in_progress' | 'complete' | 'cancelled';
    modified_before?: string;
    modified_since?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params.ids) queryParams.ids = params.ids.join(',');
    if (params.jobcode_ids) queryParams.jobcode_ids = params.jobcode_ids.join(',');
    if (params.active) queryParams.active = params.active;
    if (params.status) queryParams.status = params.status;
    if (params.modified_before) queryParams.modified_before = params.modified_before;
    if (params.modified_since) queryParams.modified_since = params.modified_since;
    if (params.page) queryParams.page = params.page.toString();
    if (params.limit) queryParams.limit = params.limit.toString();

    return this.get('/projects', queryParams);
  }

  /**
   * Get project notes
   * Retrieves notes associated with a project
   * @param params - Query parameters (project_id is required)
   */
  async getProjectNotes(params: {
    project_id: number;
    ids?: number[];
    user_ids?: number[];
    active?: 'yes' | 'no' | 'both';
    modified_before?: string;
    modified_since?: string;
    supplemental_data?: 'yes' | 'no';
    page?: number;
    limit?: number;
  }): Promise<any> {
    const queryParams: Record<string, string> = {
      project_id: params.project_id.toString(),
    };

    if (params.ids) queryParams.ids = params.ids.join(',');
    if (params.user_ids) queryParams.user_ids = params.user_ids.join(',');
    if (params.active) queryParams.active = params.active;
    if (params.modified_before) queryParams.modified_before = params.modified_before;
    if (params.modified_since) queryParams.modified_since = params.modified_since;
    if (params.supplemental_data) queryParams.supplemental_data = params.supplemental_data;
    if (params.page) queryParams.page = params.page.toString();
    if (params.limit) queryParams.limit = params.limit.toString();

    return this.get('/project_notes', queryParams);
  }

  /**
   * Search jobcodes by name or short_code
   * @param search - Search string to match against jobcode names
   * @param params - Additional filter parameters
   */
  async searchJobcodes(params: {
    name?: string;
    ids?: number[];
    parent_ids?: number[];
    active?: 'yes' | 'no' | 'both';
    type?: 'regular' | 'pto' | 'unpaid_break' | 'paid_break' | 'all';
    has_children?: 'yes' | 'no' | 'both';
    page?: number;
    limit?: number;
  } = {}): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params.name) queryParams.name = params.name;
    if (params.ids) queryParams.ids = params.ids.join(',');
    if (params.parent_ids) queryParams.parent_ids = params.parent_ids.join(',');
    if (params.active) queryParams.active = params.active;
    if (params.type) queryParams.type = params.type;
    if (params.has_children) queryParams.has_children = params.has_children;
    if (params.page) queryParams.page = params.page.toString();
    if (params.limit) queryParams.limit = params.limit.toString();

    return this.get('/jobcodes', queryParams);
  }

  /**
   * Get file download URL and metadata
   * @param fileId - The file ID to get info for
   */
  async getFileById(fileId: number): Promise<any> {
    return this.get('/files', { ids: fileId.toString() });
  }
}
