export type BucketUnit = 'day' | 'week' | 'month';

// periodStart is a date-only string (e.g. '2025-09-08') built server-side with UTC-anchored
// arithmetic. Parsing it as UTC and formatting with timeZone: 'UTC' keeps the displayed date
// correct regardless of the viewer's local timezone offset.
function addUtcDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function formatTrendLabel(periodStart: string, bucketUnit: BucketUnit): string {
    const date = new Date(`${periodStart}T00:00:00Z`);

    if (bucketUnit === 'month') {
        // A 12-month window can span two calendar years, so include the year to disambiguate.
        return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    }

    if (bucketUnit === 'week') {
        const endStr = addUtcDays(periodStart, 6);
        const end = new Date(`${endStr}T00:00:00Z`);
        const sameMonth = date.getUTCMonth() === end.getUTCMonth();
        const startLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const endLabel = sameMonth
            ? end.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' })
            : end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
        return `${startLabel}–${endLabel}`;
    }

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
