import { expect, test } from '@playwright/test';

/**
 * UAP variant app smoke (runs only when VITE_VARIANT=uap — same gating pattern as theme-toggle + happy).
 */
test.describe('UAP variant app', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (process.env.VITE_VARIANT !== 'uap') {
      testInfo.skip(true, 'Requires VITE_VARIANT=uap');
    }
  });

  test('build exposes uap site variant', async ({ page }) => {
    await page.goto('/');
    const variant = await page.evaluate(async () => {
      const mod = await import('/src/config/variant.ts');
      return mod.SITE_VARIANT;
    });
    expect(variant).toBe('uap');
  });

  test('loads map and core UAP panels', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.deckgl-map-wrapper')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#mapSection')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.panel[data-panel="uap-sightings"]')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('.panel[data-panel="uap-aai"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.panel[data-panel="uap-sensors"]')).toBeVisible({
      timeout: 20000,
    });
  });

  test('AAI panel renders after load (live API or empty state)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.deckgl-map-wrapper')).toBeVisible({ timeout: 45000 });

    const aai = page.locator('.panel[data-panel="uap-aai"]');
    await expect(aai).toBeVisible({ timeout: 20000 });
    await expect(
      aai.locator('.uap-aai-card, .panel-empty-state, .panel-loading, .panel-error-state'),
    ).toBeVisible({ timeout: 60000 });
  });
});
