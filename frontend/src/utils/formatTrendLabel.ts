export type BucketUnit = 'day' | 'week' | 'month';

export function formatTrendLabel(periodStart: string, bucketUnit: BucketUnit): string {
    const date = new Date(periodStart);
    if (bucketUnit === 'month') {
        // A 12-month window can span two calendar years, so include the year to disambiguate.
        return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
