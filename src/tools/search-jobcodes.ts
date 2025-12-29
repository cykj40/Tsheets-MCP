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
        full_path?: string;
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

        // Get all jobcodes to build hierarchy paths
        const allJobcodes = await tsheetsApi.getAllJobcodes();
        const jobcodeMap = new Map(allJobcodes.map(jc => [jc.id, jc]));

        // Build full hierarchy path for each jobcode
        const buildJobPath = (jobcode: any): string => {
            const parts: string[] = [];
            let current = jobcode;

            while (current) {
                const displayName = current.short_code
                    ? `${current.name} ${current.short_code}`
                    : current.name;
                parts.unshift(displayName);

                if (current.parent_id) {
                    current = jobcodeMap.get(current.parent_id);
                } else {
                    break;
                }
            }

            return parts.join(' › ');
        };

        const results = jobcodes.map(jc => ({
            id: jc.id,
            name: jc.name,
            short_code: jc.short_code,
            type: jc.type,
            active: jc.active,
            parent_id: jc.parent_id,
            has_children: jc.has_children,
            full_path: buildJobPath(jc),
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

