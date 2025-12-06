/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to Date object
 */
export function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Convert hours and minutes to decimal hours string
 * @param hours - Number of hours
 * @param minutes - Number of minutes
 * @returns Formatted decimal hours (e.g., "8.50")
 */
export function formatDecimalHours(hours: number = 0, minutes: number = 0): string {
  const totalHours = hours + minutes / 60;
  return totalHours.toFixed(2);
}

/**
 * Validate date string format (YYYY-MM-DD)
 */
export function isValidDateString(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }

  const date = parseDate(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Get date range as string
 */
export function getDateRangeString(startDate: string, endDate: string): string {
  return `${startDate} - ${endDate}`;
}

/**
 * Calculate total hours from an array of hour/minute pairs
 */
export function calculateTotalHours(entries: Array<{ hours?: number; minutes?: number }>): number {
  return entries.reduce((total, entry) => {
    const hours = entry.hours || 0;
    const minutes = entry.minutes || 0;
    return total + hours + minutes / 60;
  }, 0);
}
