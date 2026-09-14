import strava from 'strava-v3';

export interface StravaGear {
    id: string;
    name: string;
    distance: number; // meters, Strava's own lifetime total for this gear
}

export interface StravaAthlete {
    id: number;
    shoes?: StravaGear[];
    bikes?: StravaGear[];
    [key: string]: unknown;
}

// Cache the full athlete profile per access token across warm Lambda invocations
// to avoid calling strava.athlete.get() on every request.
const athleteCache = new Map<string, StravaAthlete>();

export async function resolveAthlete(accessToken: string): Promise<StravaAthlete> {
    await strava.client(accessToken);

    let athlete = athleteCache.get(accessToken);
    if (!athlete) {
        athlete = await (strava.athlete.get({}) as unknown as Promise<StravaAthlete>);
        athleteCache.set(accessToken, athlete);
    }
    return athlete;
}

export async function resolveAthleteId(accessToken: string): Promise<number> {
    const athlete = await resolveAthlete(accessToken);
    return athlete.id;
}
