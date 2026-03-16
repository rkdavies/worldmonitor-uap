import type { MapLayers } from '@/types';
// boundary-ignore: isDesktopRuntime is a pure env probe with no service dependencies
import { isDesktopRuntime } from '@/services/runtime';

export type MapRenderer = 'flat' | 'globe';
export type MapVariant = 'full' | 'tech' | 'finance' | 'happy' | 'commodity' | 'uap';

const _desktop = isDesktopRuntime();

export interface LayerDefinition {
  key: keyof MapLayers;
  icon: string;
  i18nSuffix: string;
  fallbackLabel: string;
  renderers: MapRenderer[];
  premium?: 'locked' | 'enhanced';
}

const def = (
  key: keyof MapLayers,
  icon: string,
  i18nSuffix: string,
  fallbackLabel: string,
  renderers: MapRenderer[] = ['flat', 'globe'],
  premium?: 'locked' | 'enhanced',
): LayerDefinition => ({ key, icon, i18nSuffix, fallbackLabel, renderers, ...(premium && { premium }) });

export const LAYER_REGISTRY: Record<keyof MapLayers, LayerDefinition> = {
  iranAttacks:              def('iranAttacks',              '&#127919;', 'iranAttacks',              'Iran Attacks', ['flat', 'globe'], _desktop ? 'locked' : undefined),
  hotspots:                 def('hotspots',                 '&#127919;', 'intelHotspots',            'Intel Hotspots'),
  conflicts:                def('conflicts',                '&#9876;',   'conflictZones',            'Conflict Zones'),

  bases:                    def('bases',                    '&#127963;', 'militaryBases',            'Military Bases'),
  nuclear:                  def('nuclear',                  '&#9762;',   'nuclearSites',             'Nuclear Sites'),
  irradiators:              def('irradiators',              '&#9888;',   'gammaIrradiators',         'Gamma Irradiators'),
  spaceports:               def('spaceports',               '&#128640;', 'spaceports',               'Spaceports'),
  satellites:               def('satellites',               '&#128752;', 'satellites',               'Orbital Surveillance', ['flat', 'globe']),

  cables:                   def('cables',                   '&#128268;', 'underseaCables',           'Undersea Cables'),
  pipelines:                def('pipelines',                '&#128738;', 'pipelines',                'Pipelines'),
  datacenters:              def('datacenters',              '&#128421;', 'aiDataCenters',            'AI Data Centers'),
  military:                 def('military',                 '&#9992;',   'militaryActivity',         'Military Activity'),
  ais:                      def('ais',                      '&#128674;', 'shipTraffic',              'Ship Traffic'),
  tradeRoutes:              def('tradeRoutes',              '&#9875;',   'tradeRoutes',              'Trade Routes'),
  flights:                  def('flights',                  '&#9992;',   'flightDelays',             'Aviation'),
  protests:                 def('protests',                 '&#128226;', 'protests',                 'Protests'),
  ucdpEvents:               def('ucdpEvents',               '&#9876;',   'ucdpEvents',               'Armed Conflict Events'),
  displacement:             def('displacement',             '&#128101;', 'displacementFlows',        'Displacement Flows'),
  climate:                  def('climate',                  '&#127787;', 'climateAnomalies',         'Climate Anomalies'),
  weather:                  def('weather',                  '&#9928;',   'weatherAlerts',            'Weather Alerts'),
  outages:                  def('outages',                  '&#128225;', 'internetOutages',          'Internet Outages'),
  cyberThreats:             def('cyberThreats',             '&#128737;', 'cyberThreats',             'Cyber Threats'),
  natural:                  def('natural',                  '&#127755;', 'naturalEvents',            'Natural Events'),
  fires:                    def('fires',                    '&#128293;', 'fires',                    'Fires'),
  waterways:                def('waterways',                '&#9875;',   'strategicWaterways',       'Strategic Waterways'),
  economic:                 def('economic',                 '&#128176;', 'economicCenters',          'Economic Centers'),
  minerals:                 def('minerals',                 '&#128142;', 'criticalMinerals',         'Critical Minerals'),
  gpsJamming:               def('gpsJamming',               '&#128225;', 'gpsJamming',               'GPS Jamming', ['flat', 'globe'], _desktop ? 'locked' : undefined),
  ciiChoropleth:            def('ciiChoropleth',            '&#127758;', 'ciiChoropleth',            'CII Instability', ['flat'], _desktop ? 'enhanced' : undefined),
  dayNight:                 def('dayNight',                 '&#127763;', 'dayNight',                 'Day/Night', ['flat']),
  sanctions:                def('sanctions',                '&#128683;', 'sanctions',                'Sanctions', []),
  startupHubs:              def('startupHubs',              '&#128640;', 'startupHubs',              'Startup Hubs'),
  techHQs:                  def('techHQs',                  '&#127970;', 'techHQs',                  'Tech HQs'),
  accelerators:             def('accelerators',             '&#9889;',   'accelerators',             'Accelerators'),
  cloudRegions:             def('cloudRegions',             '&#9729;',   'cloudRegions',             'Cloud Regions'),
  techEvents:               def('techEvents',               '&#128197;', 'techEvents',               'Tech Events'),
  stockExchanges:           def('stockExchanges',           '&#127963;', 'stockExchanges',           'Stock Exchanges'),
  financialCenters:         def('financialCenters',         '&#128176;', 'financialCenters',         'Financial Centers'),
  centralBanks:             def('centralBanks',             '&#127974;', 'centralBanks',             'Central Banks'),
  commodityHubs:            def('commodityHubs',            '&#128230;', 'commodityHubs',            'Commodity Hubs'),
  gulfInvestments:          def('gulfInvestments',          '&#127760;', 'gulfInvestments',          'GCC Investments'),
  positiveEvents:           def('positiveEvents',           '&#127775;', 'positiveEvents',           'Positive Events'),
  kindness:                 def('kindness',                 '&#128154;', 'kindness',                 'Acts of Kindness'),
  happiness:                def('happiness',                '&#128522;', 'happiness',                'World Happiness'),
  speciesRecovery:          def('speciesRecovery',          '&#128062;', 'speciesRecovery',          'Species Recovery'),
  renewableInstallations:   def('renewableInstallations',   '&#9889;',   'renewableInstallations',   'Clean Energy'),
  miningSites:              def('miningSites',              '&#128301;', 'miningSites',              'Mining Sites'),
  processingPlants:         def('processingPlants',         '&#127981;', 'processingPlants',         'Processing Plants'),
  commodityPorts:           def('commodityPorts',           '&#9973;',   'commodityPorts',           'Commodity Ports'),
  webcams:                  def('webcams',                  '&#128247;', 'webcams',                  'Live Webcams'),
  uapSightings:             def('uapSightings',             '&#128760;', 'uapSightings',            'UAP Sightings'),
  uapSensorStations:        def('uapSensorStations',        '&#128225;', 'uapSensorStations',       'Sensor Stations'),
  uapHistoricalHotspots:    def('uapHistoricalHotspots',   '&#128293;', 'uapHistoricalHotspots',   'Historical Hotspots'),
};

/**
 * NUFORC shape categories for UAP map legend and dot color.
 * Aligned with https://nuforc.org/ndx/?id=shape. Combined groups use a single general descriptor.
 */
export const UAP_LEGEND_ENTRIES: Array<{ label: string; dotColor: string }> = [
  { label: 'Oval', dotColor: 'rgb(160, 220, 120)' },
  { label: 'Orb', dotColor: 'rgb(255, 100, 80)' },
  { label: 'Cylinder', dotColor: 'rgb(180, 100, 50)' },
  { label: 'Triangle', dotColor: 'rgb(80, 200, 120)' },
  { label: 'Fireball', dotColor: 'rgb(255, 80, 60)' },
  { label: 'Light', dotColor: 'rgb(255, 220, 100)' },
  { label: 'Formation', dotColor: 'rgb(100, 150, 255)' },
  { label: 'Chevron', dotColor: 'rgb(255, 180, 60)' },
  { label: 'Rectangle', dotColor: 'rgb(180, 120, 220)' },
  { label: 'Changing', dotColor: 'rgb(200, 100, 200)' },
  { label: 'Diamond', dotColor: 'rgb(100, 200, 180)' },
  { label: 'Cone', dotColor: 'rgb(150, 150, 200)' },
  { label: 'Cross', dotColor: 'rgb(180, 180, 180)' },
  { label: 'Cube', dotColor: 'rgb(120, 120, 140)' },
  { label: 'Star', dotColor: 'rgb(255, 200, 100)' },
  { label: 'Other', dotColor: 'rgb(100, 100, 120)' },
  { label: 'Unknown', dotColor: 'rgb(140, 140, 160)' },
  { label: 'Unspecified', dotColor: 'rgb(130, 130, 150)' },
];

function uapShapeKey(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '').replace(/\//g, '');
}
const UAP_SHAPE_TO_DOT_COLOR = new Map(
  UAP_LEGEND_ENTRIES.map((e) => [uapShapeKey(e.label), e.dotColor])
);

// Map NUFORC shape names to combined or distinct legend entries (see nuforc.org/ndx/?id=shape)
const UAP_SHAPE_ALIASES: Array<{ legendKey: string; aliases: string[] }> = [
  { legendKey: 'oval', aliases: ['egg', 'oval', 'eggs', 'ovals', 'eggshaped', 'teardrop', 'teardrops'] },
  { legendKey: 'orb', aliases: ['circle', 'disk', 'sphere', 'orb', 'circles', 'disks', 'spheres', 'orbs'] },
  { legendKey: 'cylinder', aliases: ['cigar', 'cylinder', 'cigars', 'cylinders'] },
  { legendKey: 'light', aliases: ['light', 'lights', 'flash', 'flashes'] },
  { legendKey: 'triangle', aliases: ['triangles'] },
  { legendKey: 'fireball', aliases: ['fireballs'] },
  { legendKey: 'formation', aliases: ['formations'] },
  { legendKey: 'chevron', aliases: ['chevrons'] },
  { legendKey: 'rectangle', aliases: ['rectangles'] },
];
for (const { legendKey, aliases } of UAP_SHAPE_ALIASES) {
  const color = UAP_SHAPE_TO_DOT_COLOR.get(legendKey);
  if (color) for (const a of aliases) UAP_SHAPE_TO_DOT_COLOR.set(a, color);
}

const orbEntry = UAP_LEGEND_ENTRIES.find((e) => uapShapeKey(e.label) === 'orb');
const ovalEntry = UAP_LEGEND_ENTRIES.find((e) => uapShapeKey(e.label) === 'oval');
const cylinderEntry = UAP_LEGEND_ENTRIES.find((e) => uapShapeKey(e.label) === 'cylinder');
const lightEntry = UAP_LEGEND_ENTRIES.find((e) => uapShapeKey(e.label) === 'light');
const UAP_DEFAULT_DOT_COLOR = 'rgb(124, 58, 237)';

/** If exact key not in map, try substring match for combined shapes (e.g. "light orb", "egg shaped"). */
function uapShapeFallback(key: string): string | null {
  if (orbEntry && (key.includes('orb') || key.includes('sphere') || key.includes('circle') || key.includes('disk'))) return orbEntry.dotColor;
  if (ovalEntry && (key.includes('egg') || key.includes('oval') || key.includes('teardrop'))) return ovalEntry.dotColor;
  if (cylinderEntry && (key.includes('cigar') || key.includes('cylinder'))) return cylinderEntry.dotColor;
  if (lightEntry && (key.includes('light') || key.includes('flash'))) return lightEntry.dotColor;
  return null;
}

/** Resolve NUFORC shape string to dot color (rgb string) for map and legend. */
export function getUapShapeDotColor(shape: string | undefined | null): string {
  if (shape == null || shape === '') return UAP_DEFAULT_DOT_COLOR;
  const key = uapShapeKey(shape);
  return UAP_SHAPE_TO_DOT_COLOR.get(key) ?? uapShapeFallback(key) ?? UAP_DEFAULT_DOT_COLOR;
}

/** Build alias -> legend label map for resolving raw shape to display label. */
const UAP_SHAPE_TO_LEGEND_LABEL = new Map<string, string>();
for (const { legendKey, aliases } of UAP_SHAPE_ALIASES) {
  const entry = UAP_LEGEND_ENTRIES.find((e) => uapShapeKey(e.label) === legendKey);
  if (entry) for (const a of aliases) UAP_SHAPE_TO_LEGEND_LABEL.set(a, entry.label);
}
for (const e of UAP_LEGEND_ENTRIES) UAP_SHAPE_TO_LEGEND_LABEL.set(uapShapeKey(e.label), e.label);

/** Resolve raw NUFORC shape string to the canonical legend label (e.g. "Teardrop" -> "Oval"). */
export function getUapShapeLegendLabel(shape: string | undefined | null): string | null {
  if (shape == null || shape === '') return null;
  const key = uapShapeKey(shape);
  const label = UAP_SHAPE_TO_LEGEND_LABEL.get(key);
  if (label) return label;
  if (key.includes('orb') || key.includes('sphere') || key.includes('circle') || key.includes('disk')) return 'Orb';
  if (key.includes('egg') || key.includes('oval') || key.includes('teardrop')) return 'Oval';
  if (key.includes('cigar') || key.includes('cylinder')) return 'Cylinder';
  if (key.includes('light') || key.includes('flash')) return 'Light';
  return null;
}

/** Parse rgb(r,g,b) to [r,g,b,a] for deck.gl getFillColor. */
export function parseRgbToRgba(rgb: string, a = 200): [number, number, number, number] {
  const m = /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(rgb);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  return [124, 58, 237, a];
}

const VARIANT_LAYER_ORDER: Record<MapVariant, Array<keyof MapLayers>> = {
  full: [
    'iranAttacks', 'hotspots', 'conflicts',
    'bases', 'nuclear', 'irradiators', 'spaceports',
    'cables', 'pipelines', 'datacenters', 'military',
    'ais', 'tradeRoutes', 'flights', 'protests',
    'ucdpEvents', 'displacement', 'climate', 'weather',
    'outages', 'cyberThreats', 'natural', 'fires',
    'waterways', 'economic', 'minerals', 'gpsJamming',
    'satellites', 'ciiChoropleth', 'dayNight', 'webcams',
    'uapSightings', 'uapSensorStations', 'uapHistoricalHotspots',
  ],
  tech: [
    'startupHubs', 'techHQs', 'accelerators', 'cloudRegions',
    'datacenters', 'cables', 'outages', 'cyberThreats',
    'techEvents', 'natural', 'fires', 'dayNight',
  ],
  finance: [
    'stockExchanges', 'financialCenters', 'centralBanks', 'commodityHubs',
    'gulfInvestments', 'tradeRoutes', 'cables', 'pipelines',
    'outages', 'weather', 'economic', 'waterways',
    'natural', 'cyberThreats', 'dayNight',
  ],
  happy: [
    'positiveEvents', 'kindness', 'happiness',
    'speciesRecovery', 'renewableInstallations',
  ],
  commodity: [
    'miningSites', 'processingPlants', 'commodityPorts', 'commodityHubs',
    'minerals', 'pipelines', 'waterways', 'tradeRoutes',
    'ais', 'economic', 'fires', 'climate',
    'natural', 'weather', 'outages', 'dayNight',
  ],
  uap: [
    'uapSightings', 'uapSensorStations', 'uapHistoricalHotspots',
    'nuclear', 'bases', 'military', 'conflicts',
    'weather', 'dayNight',
  ],
};

const SVG_ONLY_LAYERS: Partial<Record<MapVariant, Array<keyof MapLayers>>> = {
  full: ['sanctions'],
  finance: ['sanctions'],
  commodity: ['sanctions'],
  uap: [],
};

const I18N_PREFIX = 'components.deckgl.layers.';

export function getLayersForVariant(variant: MapVariant, renderer: MapRenderer): LayerDefinition[] {
  const keys = VARIANT_LAYER_ORDER[variant] ?? VARIANT_LAYER_ORDER.full;
  return keys
    .map(k => LAYER_REGISTRY[k])
    .filter(d => d.renderers.includes(renderer));
}

export function getAllowedLayerKeys(variant: MapVariant): Set<keyof MapLayers> {
  const keys = new Set(VARIANT_LAYER_ORDER[variant] ?? VARIANT_LAYER_ORDER.full);
  for (const k of SVG_ONLY_LAYERS[variant] ?? []) keys.add(k);
  return keys;
}

export function sanitizeLayersForVariant(layers: MapLayers, variant: MapVariant): MapLayers {
  const allowed = getAllowedLayerKeys(variant);
  const sanitized = { ...layers };
  for (const key of Object.keys(sanitized) as Array<keyof MapLayers>) {
    if (!allowed.has(key)) sanitized[key] = false;
  }
  return sanitized;
}

export const LAYER_SYNONYMS: Record<string, Array<keyof MapLayers>> = {
  aviation: ['flights'],
  flight: ['flights'],
  airplane: ['flights'],
  plane: ['flights'],
  notam: ['flights'],
  ship: ['ais', 'tradeRoutes'],
  vessel: ['ais'],
  maritime: ['ais', 'waterways', 'tradeRoutes'],
  sea: ['ais', 'waterways', 'cables'],
  ocean: ['cables', 'waterways'],
  war: ['conflicts', 'ucdpEvents', 'military'],
  battle: ['conflicts', 'ucdpEvents'],
  army: ['military', 'bases'],
  navy: ['military', 'ais'],
  missile: ['iranAttacks', 'military'],
  nuke: ['nuclear'],
  radiation: ['nuclear', 'irradiators'],
  space: ['spaceports', 'satellites'],
  orbit: ['satellites'],
  internet: ['outages', 'cables', 'cyberThreats'],
  cyber: ['cyberThreats', 'outages'],
  hack: ['cyberThreats'],
  earthquake: ['natural'],
  volcano: ['natural'],
  tsunami: ['natural'],
  storm: ['weather', 'natural'],
  hurricane: ['weather', 'natural'],
  typhoon: ['weather', 'natural'],
  cyclone: ['weather', 'natural'],
  flood: ['weather', 'natural'],
  wildfire: ['fires'],
  forest: ['fires'],
  refugee: ['displacement'],
  migration: ['displacement'],
  riot: ['protests'],
  demonstration: ['protests'],
  oil: ['pipelines', 'commodityHubs'],
  gas: ['pipelines'],
  energy: ['pipelines', 'renewableInstallations'],
  solar: ['renewableInstallations'],
  wind: ['renewableInstallations'],
  green: ['renewableInstallations', 'speciesRecovery'],
  money: ['economic', 'financialCenters', 'stockExchanges'],
  bank: ['centralBanks', 'financialCenters'],
  stock: ['stockExchanges'],
  trade: ['tradeRoutes', 'waterways'],
  cloud: ['cloudRegions', 'datacenters'],
  ai: ['datacenters'],
  startup: ['startupHubs', 'accelerators'],
  tech: ['techHQs', 'techEvents', 'startupHubs', 'cloudRegions', 'datacenters'],
  gps: ['gpsJamming'],
  jamming: ['gpsJamming'],
  mineral: ['minerals', 'miningSites'],
  mining: ['miningSites'],
  port: ['commodityPorts'],
  happy: ['happiness', 'kindness', 'positiveEvents'],
  good: ['positiveEvents', 'kindness'],
  animal: ['speciesRecovery'],
  wildlife: ['speciesRecovery'],
  gulf: ['gulfInvestments'],
  gcc: ['gulfInvestments'],
  sanction: ['sanctions'],
  night: ['dayNight'],
  sun: ['dayNight'],
  webcam: ['webcams'],
  camera: ['webcams'],
  livecam: ['webcams'],
};

export function resolveLayerLabel(def: LayerDefinition, tFn?: (key: string) => string): string {
  if (tFn) {
    const translated = tFn(I18N_PREFIX + def.i18nSuffix);
    if (translated && translated !== I18N_PREFIX + def.i18nSuffix) return translated;
  }
  return def.fallbackLabel;
}

export function bindLayerSearch(container: HTMLElement): void {
  const searchInput = container.querySelector('.layer-search') as HTMLInputElement | null;
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const synonymHits = new Set<string>();
    if (q) {
      for (const [alias, keys] of Object.entries(LAYER_SYNONYMS)) {
        if (alias.includes(q)) keys.forEach(k => synonymHits.add(k));
      }
    }
    container.querySelectorAll('.layer-toggle').forEach(label => {
      const el = label as HTMLElement;
      if (el.hasAttribute('data-layer-hidden')) return;
      if (!q) { el.style.display = ''; return; }
      const key = label.getAttribute('data-layer') || '';
      const text = label.textContent?.toLowerCase() || '';
      const match = text.includes(q) || key.toLowerCase().includes(q) || synonymHits.has(key);
      el.style.display = match ? '' : 'none';
    });
  });
}
