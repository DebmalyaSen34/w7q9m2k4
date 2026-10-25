import { expect, test } from '@playwright/test';

test('decision replay updates date/cutoff and reveals actuals explicitly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A clearer view of tomorrow.' })).toBeVisible();
  await expect(page.getByTestId('delivery-date')).toHaveText('16 Jan');
  await expect(page.getByLabel('Show actuals')).not.toBeChecked();
  await page.getByLabel('Decision date', { exact: true }).fill('2026-01-31');
  await expect(page.getByTestId('delivery-date')).toHaveText('1 Feb');
  const response = page.waitForResponse(r => r.url().includes('/api/forecast?') && r.url().includes('08%3A00'));
  await page.getByLabel('Decision cutoff').fill('08:00');
  expect((await response).status()).toBe(200);
  await expect(page.getByText('Available by 08:00 UK')).toBeVisible();
  await page.getByLabel('Show actuals').check();
  await expect(page.getByText('Retrospective comparison', { exact: true })).toBeVisible();
  await page.getByText('Explore hourly data').click();
  await expect(page.getByRole('columnheader', { name: 'Actual (MW)', exact: true })).toBeVisible();
});

test('accuracy filters update coverage and validate reversed ranges', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Forecast accuracy' }).click();
  await expect(page.getByText('744 hours have complete pairs', { exact: false })).toBeVisible();
  await page.getByLabel('Last decision date').fill('2026-01-02');
  await expect(page.getByText('48 hours have complete pairs', { exact: false })).toBeVisible();
  await page.getByLabel('First decision date').fill('2026-01-03');
  await expect(page.getByRole('alert')).toContainText('on or before');
});

test('failed requests offer a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/forecast?**', async route => {
    if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Dataset temporarily unavailable.' }) });
    else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Dataset temporarily unavailable.');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('delivery-date')).toHaveText('16 Jan');
});

test('missing forecasts are shown as gaps rather than zero', async ({ page }) => {
  await page.route('**/api/forecast?**', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.forecast_coverage = 0;
    data.mean_forecast_mw = null;
    data.peak_forecast_mw = null;
    data.points = data.points.map((p: object) => ({ ...p, forecast_mw: null, error_mw: null, publish_times: [] }));
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.getByText('No forecast available at this cutoff')).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'Forecast coverage' })).toContainText('0/24');
});

test('mobile layout fits the viewport and exposes navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('delivery-date')).toHaveText('16 Jan');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Forecast accuracy' }).click();
  await expect(page.getByRole('heading', { name: 'Put forecast error in perspective.' })).toBeVisible();
});
