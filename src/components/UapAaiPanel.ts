import type { AaiScore } from '@/generated/client/worldmonitor/uap/v1/service_client';
import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';
import { Panel } from './Panel';

function levelToClass(level: string): string {
  const l = (level ?? '').toLowerCase();
  if (l === 'high' || l === 'critical') return 'uap-aai-level-high';
  if (l === 'elevated') return 'uap-aai-level-elevated';
  if (l === 'moderate') return 'uap-aai-level-moderate';
  return 'uap-aai-level-low';
}

function trendIcon(trend: string): string {
  const t = (trend ?? '').toLowerCase();
  if (t === 'up' || t === 'rising') return '↑';
  if (t === 'down' || t === 'falling') return '↓';
  return '→';
}

function formatLevel(level: string): string {
  const s = (level ?? '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function regionDisplay(regionId: string): { name: string; title?: string } {
  const id = (regionId ?? '').trim();
  if (!id || id === 'Unknown') {
    return {
      name: t('components.uapAai.regionUnlisted'),
      title: t('components.uapAai.regionUnlistedHint'),
    };
  }
  return { name: id };
}

export class UapAaiPanel extends Panel {
  private scores: AaiScore[] = [];

  constructor() {
    super({
      id: 'uap-aai',
      title: 'Anomalous Activity Index',
      showCount: true,
      infoTooltip: t('components.uapAai.infoTooltip'),
    });
    this.showLoading();
  }

  setScores(scores: AaiScore[]): void {
    this.scores = scores ?? [];
    this.setCount(this.scores.length);
    if (this.scores.length === 0) {
      this.setContent('<div class="panel-empty-state">No regional scores available.</div>');
      return;
    }
    const cards = this.scores
      .map((row) => {
        const levelClass = levelToClass(row.level);
        const trendSym = trendIcon(row.trend);
        const density = Math.round(row.sightingDensity ?? 0);
        const adj = row.adjustedAaiScore ?? row.score;
        const raw = row.score;
        const ctx = row.observationContextIndex ?? '—';
        const res = row.residualActivityIndex ?? '—';
        const reg = regionDisplay(row.regionId);
        const regAttrs = reg.title
          ? ` class="uap-aai-region uap-aai-region--hint" title="${escapeHtml(reg.title)}"`
          : ' class="uap-aai-region"';
        const levelText = formatLevel(row.level);
        return `
<div class="uap-aai-card">
  <div class="uap-aai-field">
    <span class="uap-aai-field-label">${escapeHtml(t('components.uapAai.regionLabel'))}</span>
    <span${regAttrs}>${escapeHtml(reg.name)}</span>
  </div>
  <div class="uap-aai-field uap-aai-field-score">
    <span class="uap-aai-field-label">${escapeHtml(t('components.uapAai.scoreLabel'))}</span>
    <span class="uap-aai-score ${levelClass}">${escapeHtml(String(adj))}<span class="uap-aai-score-max">/100</span></span>
  </div>
  <div class="uap-aai-card-meta uap-aai-card-meta--grid">
    <span class="uap-aai-meta-pair"><span class="uap-aai-meta-k">${escapeHtml(t('components.uapAai.rawScoreLabel'))}</span> <span class="uap-aai-density">${escapeHtml(String(raw))}</span></span>
    <span class="uap-aai-meta-pair"><span class="uap-aai-meta-k">${escapeHtml(t('components.uapAai.contextLabel'))}</span> <span>${escapeHtml(String(ctx))}</span></span>
    <span class="uap-aai-meta-pair"><span class="uap-aai-meta-k">${escapeHtml(t('components.uapAai.residualLabel'))}</span> <span>${escapeHtml(String(res))}</span></span>
    <span class="uap-aai-meta-pair"><span class="uap-aai-meta-k">${escapeHtml(t('components.uapAai.levelLabel'))}</span> <span class="uap-aai-level-badge ${levelClass}">${escapeHtml(levelText)}</span></span>
    <span class="uap-aai-meta-pair"><span class="uap-aai-meta-k">${escapeHtml(t('components.uapAai.trendLabel'))}</span> <span class="uap-aai-trend-badge" title="${escapeHtml(row.trend)}">${escapeHtml(trendSym)}</span></span>
    <span class="uap-aai-meta-pair uap-aai-meta-sightings"><span class="uap-aai-meta-k">${escapeHtml(t('components.uapAai.sightingsLabel'))}</span> <span class="uap-aai-density">${escapeHtml(String(density))}</span></span>
  </div>
</div>`;
      })
      .join('');
    const intro = `<p class="uap-aai-intro">${t('components.uapAai.listIntro')}</p>`;
    const html = `<div class="uap-aai-list">${intro}${cards}</div>`;
    this.setContent(html);
  }
}
