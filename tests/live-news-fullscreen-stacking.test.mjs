/**
 * Guardrail: live stream "fullscreen" is CSS fixed overlay; it must stack above
 * .map-section.pinned (z-index 100) and hide map-bottom-grid siblings when needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainCss = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8');

describe('live-news fullscreen stacking', () => {
  it('pinned map z-index is 100 so fullscreen can target above it', () => {
    assert.match(
      mainCss,
      /\.map-section\.pinned\s*\{[^}]*z-index:\s*100/s,
      'expected .map-section.pinned { z-index: 100 }'
    );
  });

  it('raises panels-grid above pinned map while stream fullscreen is active', () => {
    assert.ok(
      mainCss.includes('body.live-news-fullscreen-active .panels-grid') &&
        /body\.live-news-fullscreen-active\s+\.panels-grid\s*\{[^}]*z-index:\s*10[1-9]/.test(
          mainCss
        ),
      'expected body.live-news-fullscreen-active .panels-grid { z-index: 101+ }'
    );
  });

  it('hides map-bottom-grid siblings when a stream panel is fullscreen there', () => {
    assert.ok(
      mainCss.includes('body.live-news-fullscreen-active .map-bottom-grid > .panel:not(.live-news-fullscreen)'),
      'expected rule to hide non-fullscreen panels in map-bottom-grid'
    );
  });

  it('hides map resize bar and panel resize chrome during stream fullscreen', () => {
    assert.ok(
      mainCss.includes('body.live-news-fullscreen-active .map-resize-handle'),
      'expected map-resize-handle hidden while stream fullscreen'
    );
    assert.ok(
      mainCss.includes('body.live-news-fullscreen-active .live-news-fullscreen .panel-resize-handle'),
      'expected panel resize hidden on fullscreen stream panel'
    );
  });
});
