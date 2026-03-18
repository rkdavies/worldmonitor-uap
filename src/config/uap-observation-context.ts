/**
 * Map overlay: regional reporting-opportunity index (aligned with server AAI context).
 * Data: shared/uap-observation-context-by-region.json + Medina et al. Sci Rep 2023 weights.
 *
 * Large countries use **mapAnchors** (multiple disks, same national context index).
 * Primary lat/lon remains the reference for docs; AAI still one score per regionId.
 */
import raw from '../../shared/uap-observation-context-by-region.json';

const W_SKY = 0.35;
const W_AIR = 0.32;
const W_MIL = 0.33;

type MapAnchor = { lat: number; lon: number; label: string };
type Row = {
  lat: number;
  lon: number;
  sky: number;
  airTraffic: number;
  militaryTraining: number;
  mapAnchors?: MapAnchor[];
};
const DATA = raw as Record<string, Row>;

function contextIndexForRow(r: Row): number {
  const v = W_SKY * r.sky + W_AIR * r.airTraffic + W_MIL * r.militaryTraining;
  return Math.round(Math.min(100, Math.max(0, v)));
}

function anchorSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export interface UapReportingContextPoint {
  regionId: string;
  lat: number;
  lon: number;
  observationContextIndex: number;
  /** Sub-area label when country has multiple map anchors */
  mapSubLabel?: string;
  /** Unique key for globe markers / picking */
  mapPointId: string;
}

function buildReportingContextPoints(): UapReportingContextPoint[] {
  const out: UapReportingContextPoint[] = [];
  for (const [regionId, r] of Object.entries(DATA)) {
    if (regionId === 'Unknown') continue;
    const idx = contextIndexForRow(r);
    const anchors = r.mapAnchors;
    if (anchors && anchors.length > 0) {
      for (const a of anchors) {
        const slug = anchorSlug(a.label);
        out.push({
          regionId,
          lat: a.lat,
          lon: a.lon,
          observationContextIndex: idx,
          mapSubLabel: a.label,
          mapPointId: `${regionId}-${slug}`,
        });
      }
    } else {
      out.push({
        regionId,
        lat: r.lat,
        lon: r.lon,
        observationContextIndex: idx,
        mapPointId: regionId,
      });
    }
  }
  return out;
}

export const UAP_REPORTING_CONTEXT_POINTS: UapReportingContextPoint[] = buildReportingContextPoints();
