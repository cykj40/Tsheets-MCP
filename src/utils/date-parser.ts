/**
 * Parse natural language date expressions into YYYY-MM-DD format
 * Supports: "last week", "this week", "this month", "last month", specific dates
 */

export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Parse natural language date expression
 */
export function parseNaturalDate(input: string): DateRange {
  const today = new Date();
  const normalizedInput = input.toLowerCase().trim();

  // Handle "last week"
  if (normalizedInput.includes('last week')) {
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - today.getDay() - 7); // Last Sunday

    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6); // Last Saturday

    return {
      startDate: formatDate(lastWeekStart),
      endDate: formatDate(lastWeekEnd),
    };
  }

  // Handle "this week"
  if (normalizedInput.includes('this week')) {
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay()); // This Sunday

    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6); // This Saturday

    return {
      startDate: formatDate(thisWeekStart),
      endDate: formatDate(thisWeekEnd),
    };
  }

  // Handle "last month"
  if (normalizedInput.includes('last month')) {
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    return {
      startDate: formatDate(lastMonthStart),
      endDate: formatDate(lastMonthEnd),
    };
  }

  // Handle "this month"
  if (normalizedInput.includes('this month')) {
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    return {
      startDate: formatDate(thisMonthStart),
      endDate: formatDate(thisMonthEnd),
    };
  }

  // Handle "yesterday"
  if (normalizedInput === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    return {
      startDate: formatDate(yesterday),
      endDate: formatDate(yesterday),
    };
  }

  // Handle "today"
  if (normalizedInput === 'today') {
    return {
      startDate: formatDate(today),
      endDate: formatDate(today),
    };
  }

  // Handle week of specific date (e.g., "week of 11/3/2025" or "week of 2025-11-03")
  const weekOfMatch = normalizedInput.match(/week of (\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
  if (weekOfMatch) {
    const dateStr = weekOfMatch[1];
    let targetDate: Date;

    if (dateStr.includes('/')) {
      // Parse MM/DD/YYYY
      const [month, day, year] = dateStr.split('/').map(Number);
      targetDate = new Date(year, month - 1, day);
    } else {
      // Parse YYYY-MM-DD
      targetDate = new Date(dateStr);
    }

    const weekStart = new Date(targetDate);
    weekStart.setDate(targetDate.getDate() - targetDate.getDay()); // Sunday

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Saturday

    return {
      startDate: formatDate(weekStart),
      endDate: formatDate(weekEnd),
    };
  }

  // If input contains two dates separated by "to" or "-"
  const rangeMatch = normalizedInput.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    return {
      startDate: rangeMatch[1],
      endDate: rangeMatch[2],
    };
  }

  // If it's a single YYYY-MM-DD date, use it for both start and end
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedInput)) {
    return {
      startDate: normalizedInput,
      endDate: normalizedInput,
    };
  }

  // Default to last week if can't parse
  console.error(`[DateParser] Could not parse "${input}", defaulting to last week`);
  return parseNaturalDate('last week');
}

/**
 * Format Date object as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse job identifier which might include number and name
 * e.g., "25802 MMC Fort Hamilton" -> { jobNumber: "25802", jobName: "MMC Fort Hamilton" }
 */
export function parseJobIdentifier(input: string): { jobNumber?: string; jobName?: string } {
  const trimmed = input.trim();

  // Check if it starts with a number
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (match) {
    return {
      jobNumber: match[1],
      jobName: match[2],
    };
  }

  // If it's just a number
  if (/^\d+$/.test(trimmed)) {
    return {
      jobNumber: trimmed,
    };
  }

  // Otherwise treat as job name
  return {
    jobName: trimmed,
  };
}
