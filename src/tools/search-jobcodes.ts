/**
 * Search Jobcodes Tool
 * Search for jobcodes (projects/tasks) by name, ID, or short code
 * 
 * IMPORTANT: This searches across the FULL HIERARCHICAL PATH, not just immediate names.
 * For example, searching "Kirkwood Elevator" will find:
 * "Methodist Hospital › Kirkwood Elevator Room 7th Fl 25890"
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
        full_path: string;
    }>;
    total_count: number;
    search_term?: string;
}

/**
 * Search jobcodes by name, ID, or short code
 * Searches across full hierarchical paths for better matching
 */
export async function searchJobcodes(
    tsheetsApi: TSheetsApi,
    input: SearchJobcodesInput
): Promise<SearchJobcodesResult> {
    console.error(`[searchJobcodes] Searching for: ${input.search || '(all)'}`);

    try {
        // Get ALL jobcodes first to build hierarchy and search across full paths
        const allJobcodes = await tsheetsApi.getAllJobcodes();
        const jobcodeMap = new Map(allJobcodes.map(jc => [jc.id, jc]));

        console.error(`[searchJobcodes] Loaded ${allJobcodes.length} jobcodes into map`);

        // Build full hierarchy path for each jobcode
        const buildJobPath = (jobcode: any): string => {
            const parts: string[] = [];
            let current = jobcode;
            let depth = 0;
            const maxDepth = 10; // Prevent infinite loops

            while (current && depth < maxDepth) {
                const displayName = current.short_code
                    ? `${current.name} ${current.short_code}`
                    : current.name;
                parts.unshift(displayName);

                if (current.parent_id) {
                    current = jobcodeMap.get(current.parent_id);
                    if (!current) {
                        console.error(`[searchJobcodes] Warning: Missing parent jobcode ${current?.parent_id}`);
                        break;
                    }
                } else {
                    break;
                }
                depth++;
            }

            return parts.join(' › ');
        };

        // Apply active filter first
        let filteredJobcodes = allJobcodes;
        
        if (input.active === 'yes') {
            filteredJobcodes = filteredJobcodes.filter(jc => jc.active);
        } else if (input.active === 'no') {
            filteredJobcodes = filteredJobcodes.filter(jc => !jc.active);
        }

        console.error(`[searchJobcodes] After active filter: ${filteredJobcodes.length} jobcodes`);

        // Apply search filter across full hierarchy path
        if (input.search && input.search.trim().length > 0) {
            const searchLower = input.search.toLowerCase().trim();
            
            filteredJobcodes = filteredJobcodes.filter(jc => {
                // Build full path for this jobcode
                const fullPath = buildJobPath(jc).toLowerCase();
                const name = jc.name.toLowerCase();
                const shortCode = (jc.short_code || '').toLowerCase();
                const id = jc.id.toString();

                // Match against: full hierarchical path, name, short code, or exact ID
                const matchesPath = fullPath.includes(searchLower);
                const matchesName = name.includes(searchLower);
                const matchesShortCode = shortCode.includes(searchLower);
                const matchesId = id === searchLower;

                return matchesPath || matchesName || matchesShortCode || matchesId;
            });

            console.error(`[searchJobcodes] After search filter: ${filteredJobcodes.length} jobcodes matched "${input.search}"`);
        }

        // Build results with full paths
        const results = filteredJobcodes.map(jc => ({
            id: jc.id,
            name: jc.name,
            short_code: jc.short_code,
            type: jc.type,
            active: jc.active,
            parent_id: jc.parent_id,
            has_children: jc.has_children,
            full_path: buildJobPath(jc),
        }));

        // Sort by full_path for hierarchical display
        results.sort((a, b) => a.full_path.localeCompare(b.full_path));

        console.error(`[searchJobcodes] Returning ${results.length} results`);

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

