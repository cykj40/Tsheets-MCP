/**
 * Search Jobcodes Tool
 * Search for jobcodes (projects/tasks) by name, ID, or short code
 */

import { TSheetsApi } from '../api/tsheets.js';

export interface SearchJobcodesInput {
    search?: string;
    active?: 'yes' | 'no' | 'both';
}

export interface SearchJobcodesResult {
    success: boolean;
    jobcodes: Array<{
        id: number;
        name: string;
        short_code?: string;
        type: string;
        active: boolean;
        parent_id?: number;
        has_children: boolean;
    }>;
    total_count: number;
    search_term?: string;
}

/**
 * Search jobcodes by name, ID, or short code
 */
export async function searchJobcodes(
    tsheetsApi: TSheetsApi,
    input: SearchJobcodesInput
): Promise<SearchJobcodesResult> {
    console.error(`[searchJobcodes] Searching for: ${input.search || '(all)'}`);

    try {
        const jobcodes = await tsheetsApi.searchJobcodes(
            input.search,
            input.active || 'both'
        );

        const results = jobcodes.map(jc => ({
            id: jc.id,
            name: jc.name,
            short_code: jc.short_code,
            type: jc.type,
            active: jc.active,
            parent_id: jc.parent_id,
            has_children: jc.has_children,
        }));

        // Sort by name
        results.sort((a, b) => a.name.localeCompare(b.name));

        return {
            success: true,
            jobcodes: results,
            total_count: results.length,
            search_term: input.search,
        };
    } catch (error) {
        console.error(`[searchJobcodes] Error:`, error);
        throw error;
    }
}

