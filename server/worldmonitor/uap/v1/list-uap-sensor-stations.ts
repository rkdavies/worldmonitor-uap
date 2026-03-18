/**
 * ListUapSensorStations — returns static list of Galileo Project, Skinwalker Ranch, etc.
 */

import type {
  ServerContext,
  ListUapSensorStationsRequest,
  ListUapSensorStationsResponse,
  UapSensorStation,
} from '../../../../src/generated/server/worldmonitor/uap/v1/service_server';

import { getCachedJson, setCachedJson } from '../../../_shared/redis';

const CACHE_KEY = 'uap:sensor-stations:v1';
const CACHE_TTL = 86400; // 24h static

const STATIC_STATIONS: UapSensorStation[] = [
  { id: 'galileo-harvard', name: 'Galileo Project (Harvard)', lat: 42.3744, lon: -71.1167, type: 'galileo', status: 'active' },
  { id: 'skinwalker-ranch', name: 'Skinwalker Ranch', lat: 40.2583, lon: -109.0881, type: 'skinwalker', status: 'active' },
];

export async function listUapSensorStations(
  _ctx: ServerContext,
  _req: ListUapSensorStationsRequest,
): Promise<ListUapSensorStationsResponse> {
  const cached = (await getCachedJson(CACHE_KEY)) as ListUapSensorStationsResponse | null;
  if (cached?.stations?.length) return { stations: cached.stations };

  await setCachedJson(CACHE_KEY, { stations: STATIC_STATIONS }, CACHE_TTL);
  return { stations: STATIC_STATIONS };
}
