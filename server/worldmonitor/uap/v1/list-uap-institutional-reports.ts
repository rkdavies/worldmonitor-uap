/**
 * ListUapInstitutionalReports — returns AARO/NASA/GEIPAN etc. reports (static/seed initially).
 */

import type {
  ServerContext,
  ListUapInstitutionalReportsRequest,
  ListUapInstitutionalReportsResponse,
} from '../../../../src/generated/server/worldmonitor/uap/v1/service_server';

import { getCachedJson, setCachedJson } from '../../../_shared/redis';

const CACHE_KEY = 'uap:institutional:v1';
const CACHE_TTL = 1800; // 30 min

export async function listUapInstitutionalReports(
  _ctx: ServerContext,
  req: ListUapInstitutionalReportsRequest,
): Promise<ListUapInstitutionalReportsResponse> {
  const cacheKey = `${CACHE_KEY}:${req.org ?? ''}:${req.limit ?? 0}`;
  const cached = (await getCachedJson(cacheKey)) as ListUapInstitutionalReportsResponse | null;
  if (cached?.reports) return { reports: cached.reports };

  const reports: ListUapInstitutionalReportsResponse['reports'] = [];
  await setCachedJson(cacheKey, { reports }, CACHE_TTL);
  return { reports };
}
