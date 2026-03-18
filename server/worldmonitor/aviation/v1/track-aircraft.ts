import type {
    ServerContext,
    TrackAircraftRequest,
    TrackAircraftResponse,
    PositionSample,
} from '../../../../src/generated/server/worldmonitor/aviation/v1/service_server';
import { getRelayBaseUrl, getRelayHeaders } from './_shared';
import { cachedFetchJson, getCachedJson, setCachedJson } from '../../../_shared/redis';
import { CHROME_UA } from '../../../_shared/constants';
import { getOpenSkyBearerToken } from '../../../_shared/opensky-oauth';
import {
    OPENSKY_UAV_EMITTER_CATEGORY,
    parseOpenSkyStates,
    quantizeCoord,
} from './opensky-states';

const CACHE_TTL_SEC = Number(process.env.OPENSKY_TRACK_CACHE_TTL_SEC) || 120;
const MAX_POSITIONS = Math.min(
    5000,
    Math.max(100, Number(process.env.OPENSKY_TRACK_MAX_POSITIONS) || 800),
);
const BBOX_STEP = Math.max(0, Number(process.env.OPENSKY_BBOX_QUANT_STEP) || 0.01);

const OPENSKY_PUBLIC_BASE = 'https://opensky-network.org/api';

/** Global key: skip anonymous OpenSky after 429 until TTL (credits exhausted). */
const ANON_BACKOFF_KEY = 'aviation:opensky:anon_backoff';
/** In-process fallback when Redis is unset (local / cold starts without shared state). */
let anonBackoffUntilMs = 0;
let lastAnon429WarnAt = 0;
const ANON429_WARN_COOLDOWN_MS = 15 * 60 * 1000;

function parseRetryAfterSeconds(resp: Response): number {
    const xr = resp.headers.get('X-Rate-Limit-Retry-After-Seconds');
    if (xr) {
        const n = Number(xr);
        if (Number.isFinite(n) && n >= 0 && n < 86400) {
            return Math.min(Math.max(Math.ceil(n), 60), 3600);
        }
    }
    const h = resp.headers.get('Retry-After');
    if (h) {
        const n = parseInt(h, 10);
        if (!Number.isNaN(n) && n >= 0 && n < 86400) {
            return Math.min(Math.max(n, 60), 3600);
        }
    }
    return 600;
}

async function isOpenSkyAnonymousInBackoff(): Promise<boolean> {
    const v = await getCachedJson(ANON_BACKOFF_KEY);
    if (v === 1 || v === true) return true;
    return Date.now() < anonBackoffUntilMs;
}

async function setOpenSkyAnonymousBackoff(retryAfterSec: number): Promise<void> {
    const ttl = Math.min(Math.max(retryAfterSec, 60), 3600);
    await setCachedJson(ANON_BACKOFF_KEY, 1, ttl);
    anonBackoffUntilMs = Math.max(anonBackoffUntilMs, Date.now() + ttl * 1000);
}

interface OpenSkyResponse {
    states?: unknown[][];
}

function isUavOnly(req: TrackAircraftRequest): boolean {
    const r = req as TrackAircraftRequest & { uavEmittersOnly?: boolean; uav_emitters_only?: boolean };
    return Boolean(r.uavEmittersOnly ?? r.uav_emitters_only);
}

function applyBboxQuantization(req: TrackAircraftRequest): TrackAircraftRequest {
    if (BBOX_STEP <= 0) return req;
    if (req.swLat == null || req.neLat == null) return req;
    return {
        ...req,
        swLat: quantizeCoord(req.swLat, BBOX_STEP),
        swLon: quantizeCoord(req.swLon, BBOX_STEP),
        neLat: quantizeCoord(req.neLat, BBOX_STEP),
        neLon: quantizeCoord(req.neLon, BBOX_STEP),
    };
}

function hasMeaningfulBbox(req: TrackAircraftRequest): boolean {
    const dLat = Math.abs((req.neLat ?? 0) - (req.swLat ?? 0));
    const dLon = Math.abs((req.neLon ?? 0) - (req.swLon ?? 0));
    return dLat > 1e-6 && dLon > 1e-6;
}

function buildStatesPath(req: TrackAircraftRequest): string {
    const ext = 'extended=1';
    if (req.icao24?.trim()) {
        return `/states/all?icao24=${encodeURIComponent(req.icao24.trim())}&${ext}`;
    }
    if (hasMeaningfulBbox(req)) {
        return `/states/all?lamin=${req.swLat}&lomin=${req.swLon}&lamax=${req.neLat}&lomax=${req.neLon}&${ext}`;
    }
    return `/states/all?${ext}`;
}

function buildCacheKey(req: TrackAircraftRequest, uavOnly: boolean): string {
    const uav = uavOnly ? 'u1' : 'u0';
    if (req.icao24?.trim()) return `aviation:track:v2:icao:${req.icao24.trim()}:${uav}`;
    if (hasMeaningfulBbox(req)) {
        const a = BBOX_STEP > 0
            ? `${quantizeCoord(req.swLat, BBOX_STEP)}:${quantizeCoord(req.swLon, BBOX_STEP)}:${quantizeCoord(req.neLat, BBOX_STEP)}:${quantizeCoord(req.neLon, BBOX_STEP)}`
            : `${req.swLat}:${req.swLon}:${req.neLat}:${req.neLon}`;
        return `aviation:track:v2:bbox:${a}:${uav}`;
    }
    return `aviation:track:v2:all:${uav}`;
}

function filterUavOnly(positions: PositionSample[]): PositionSample[] {
    return positions.filter(
        (p) => (p as PositionSample & { emitterCategory?: number }).emitterCategory === OPENSKY_UAV_EMITTER_CATEGORY,
    );
}

function buildSimulatedPositions(
    icao24: string,
    callsign: string,
    swLat: number,
    swLon: number,
    neLat: number,
    neLon: number,
    uavOnly: boolean,
): PositionSample[] {
    const now = Date.now();
    const latSpan = neLat - swLat;
    const lonSpan = neLon - swLon;
    const count = latSpan > 0 && lonSpan > 0 ? Math.floor(Math.random() * 16) + 15 : 10;

    return Array.from({ length: count }, (_, i) => {
        const isUavSim = uavOnly || (i % 7 === 0);
        return {
            icao24: icao24 || `3c${(0x6543 + i).toString(16)}`,
            callsign: callsign || `SIM${100 + i}`,
            lat: swLat + Math.random() * (latSpan || 5),
            lon: swLon + Math.random() * (lonSpan || 5),
            altitudeM: 8000 + Math.random() * 3000,
            groundSpeedKts: 400 + Math.random() * 100,
            trackDeg: Math.random() * 360,
            verticalRate: (Math.random() - 0.5) * 5,
            onGround: false,
            source: 'POSITION_SOURCE_SIMULATED' as const,
            observedAt: now,
            emitterCategory: isUavSim ? OPENSKY_UAV_EMITTER_CATEGORY : 4,
        } as PositionSample;
    });
}

async function fetchOpenSkyJson(
    url: string,
    headers: Record<string, string>,
): Promise<PositionSample[]> {
    const resp = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/json', 'User-Agent': CHROME_UA, ...headers },
    });
    if (!resp.ok) throw new Error(`OpenSky HTTP ${resp.status}`);
    const data = (await resp.json()) as OpenSkyResponse;
    return parseOpenSkyStates(data.states ?? [], { maxPositions: MAX_POSITIONS });
}

/** Anonymous path: distinguish 429 from other errors (backoff + no throw). */
async function fetchOpenSkyAnonymousStates(
    url: string,
): Promise<
    | { kind: 'ok'; positions: PositionSample[] }
    | { kind: '429'; retryAfterSec: number }
    | { kind: 'err'; message: string }
> {
    const resp = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
    });
    if (resp.status === 429) {
        return { kind: '429', retryAfterSec: parseRetryAfterSeconds(resp) };
    }
    if (!resp.ok) {
        return { kind: 'err', message: `OpenSky HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as OpenSkyResponse;
    const positions = parseOpenSkyStates(data.states ?? [], { maxPositions: MAX_POSITIONS });
    return { kind: 'ok', positions };
}

export async function trackAircraft(
    _ctx: ServerContext,
    req: TrackAircraftRequest,
): Promise<TrackAircraftResponse> {
    const uavOnly = isUavOnly(req);
    const qreq = applyBboxQuantization(req);
    const cacheKey = buildCacheKey(qreq, uavOnly);

    let result: { positions: PositionSample[]; source: string } | null = null;
    try {
        result = await cachedFetchJson<{ positions: PositionSample[]; source: string }>(
            cacheKey,
            CACHE_TTL_SEC,
            async () => {
                const path = buildStatesPath(qreq);
                const relayBase = getRelayBaseUrl();

                if (relayBase) {
                    try {
                        const osUrl = `${relayBase}/opensky${path}`;
                        const resp = await fetch(osUrl, {
                            headers: getRelayHeaders({}),
                            signal: AbortSignal.timeout(12_000),
                        });
                        if (resp.ok) {
                            const data = (await resp.json()) as OpenSkyResponse;
                            let positions = parseOpenSkyStates(data.states ?? [], {
                                maxPositions: MAX_POSITIONS,
                            });
                            if (uavOnly) positions = filterUavOnly(positions);
                            if (positions.length > 0) return { positions, source: 'opensky' };
                        }
                    } catch (err) {
                        console.warn(`[Aviation] Relay failed: ${err instanceof Error ? err.message : err}`);
                    }
                }

                const token = await getOpenSkyBearerToken();
                if (token) {
                    try {
                        const positions = await fetchOpenSkyJson(`${OPENSKY_PUBLIC_BASE}${path}`, {
                            Authorization: `Bearer ${token}`,
                        });
                        let pos = positions;
                        if (uavOnly) pos = filterUavOnly(pos);
                        if (pos.length > 0) return { positions: pos, source: 'opensky-oauth' };
                    } catch (err) {
                        console.warn(`[Aviation] OpenSky OAuth failed: ${err instanceof Error ? err.message : err}`);
                    }
                }

                if (!(await isOpenSkyAnonymousInBackoff())) {
                    const anon = await fetchOpenSkyAnonymousStates(`${OPENSKY_PUBLIC_BASE}${path}`);
                    if (anon.kind === '429') {
                        await setOpenSkyAnonymousBackoff(anon.retryAfterSec);
                        if (Date.now() - lastAnon429WarnAt >= ANON429_WARN_COOLDOWN_MS) {
                            lastAnon429WarnAt = Date.now();
                            console.warn(
                                '[Aviation] OpenSky anonymous rate-limited (429). Set WS_RELAY_URL or OPENSKY_CLIENT_ID+OPENSKY_CLIENT_SECRET for live ADS-B; using simulated positions until backoff expires.',
                            );
                        }
                    } else if (anon.kind === 'err') {
                        console.warn(`[Aviation] OpenSky anonymous failed: ${anon.message}`);
                    } else {
                        let positions = anon.positions;
                        if (uavOnly) positions = filterUavOnly(positions);
                        if (positions.length > 0) {
                            return { positions, source: 'opensky-anonymous' };
                        }
                    }
                }

                return null;
            },
            CACHE_TTL_SEC,
        );
    } catch {
        /* Redis unavailable */
    }

    if (result) {
        let positions = result.positions;
        if (req.icao24) positions = positions.filter((p) => p.icao24 === req.icao24);
        if (req.callsign) {
            positions = positions.filter((p) =>
                p.callsign.includes(req.callsign.toUpperCase()),
            );
        }
        return { positions, source: result.source, updatedAt: Date.now() };
    }

    const positions = buildSimulatedPositions(
        req.icao24,
        req.callsign,
        qreq.swLat,
        qreq.swLon,
        qreq.neLat,
        qreq.neLon,
        uavOnly,
    );
    let sim = positions;
    if (uavOnly) sim = filterUavOnly(sim);
    if (sim.length === 0) sim = buildSimulatedPositions('', '', qreq.swLat, qreq.swLon, qreq.neLat, qreq.neLon, true);
    return { positions: sim, source: 'simulated', updatedAt: Date.now() };
}
