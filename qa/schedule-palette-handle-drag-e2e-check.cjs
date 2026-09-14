#!/usr/bin/env node

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const rawSiteUrl = process.env.SITE_URL
  || process.env.BASE_URL
  || process.argv[2]
  || 'http://127.0.0.1:4208';
const siteOrigin = new URL(rawSiteUrl).origin;
const adminUsername = process.env.SCHEDULE_ADMIN_USERNAME
  || process.env.TEST_ADMIN_USERNAME
  || '';
const adminPassword = process.env.SCHEDULE_ADMIN_PASSWORD
  || process.env.TEST_ADMIN_PASSWORD
  || '';

assert.ok(adminUsername, 'Set SCHEDULE_ADMIN_USERNAME (or TEST_ADMIN_USERNAME).');
assert.ok(adminPassword, 'Set SCHEDULE_ADMIN_PASSWORD (or TEST_ADMIN_PASSWORD).');

const selectors = Object.freeze({
  app: '[data-schedule-app]',
  calendarMode: 'button[data-schedule-mode="schedule"]',
  calendarPanel: '[data-schedule-panel="schedule"]',
  editorPanel: '[data-schedule-panel="editor"]',
  calendar: '[data-schedule-calendar]',
  paletteCard: '[data-schedule-palette-card][data-template-id]',
  paletteHandle: '[data-schedule-palette-drag-handle]',
  form: '[data-schedule-form]',
});

function url(pathname, query = {}) {
  const target = new URL(pathname, `${siteOrigin}/`);
  Object.entries(query).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  return target.href;
}

async function createAuthenticatedContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });

  await context.addInitScript(() => {
    sessionStorage.setItem('dzhikaeva-loader-seen', '1');
    localStorage.setItem('dzhikaeva-analytics-consent', 'denied');
  });
  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== siteOrigin) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  const loginResponse = await context.request.post(url('/api/auth/login'), {
    data: { username: adminUsername, password: adminPassword },
    headers: { Origin: siteOrigin },
  });
  assert.equal(loginResponse.status(), 200, `Editor login failed with HTTP ${loginResponse.status()}`);
  return context;
}

async function waitForEditor(page) {
  const response = await page.goto(url('/schedule/', { qa: 'palette-handle-drag' }), {
    waitUntil: 'domcontentloaded',
  });
  assert.ok(response && response.status() < 400, 'Authenticated editor must load');
  await page.locator(selectors.app).waitFor({ state: 'visible' });
  await page.waitForFunction((selector) => (
    document.querySelector(selector)?.getAttribute('data-schedule-ready') === 'true'
  ), selectors.app);
  await page.locator(selectors.calendarMode).click();
  await page.locator(selectors.calendarPanel).waitFor({ state: 'visible' });
  await page.waitForFunction((selector) => (
    document.querySelector(selector)?.getAttribute('data-schedule-calendar-mounted') === 'true'
  ), selectors.calendar);
}

async function installDragProbe(page) {
  await page.evaluate(() => {
    window.__paletteHandleDragProbe = [];
    const record = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      window.__paletteHandleDragProbe.push({
        type: event.type,
        target: target?.closest('[data-schedule-palette-drag-handle]')
          ? 'handle'
          : target?.closest('[data-schedule-palette-card]')
            ? 'palette-card'
            : target?.closest('[data-calendar-slot]')
              ? 'slot'
              : target?.closest('[data-calendar-day]')
                ? 'day'
                : 'other',
        defaultPrevented: event.defaultPrevented,
        dropEffect: event.dataTransfer?.dropEffect || '',
      });
    };
    ['pointerdown', 'dragstart', 'dragenter', 'dragover', 'drop', 'dragend', 'pointerup']
      .forEach((type) => document.addEventListener(type, record));
  });
}

async function realMouseDrag(page, source, target) {
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(sourceBox && targetBox, 'The drag handle and target slot must have measurable boxes');

  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const finish = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 4, { steps: 4 });
  await page.mouse.move(finish.x, finish.y, { steps: 24 });
  await page.mouse.up();
}

async function verifyVisibleHandleDrag(page) {
  await waitForEditor(page);
  const sourceCard = page.locator(selectors.paletteCard).first();
  const handle = sourceCard.locator(selectors.paletteHandle);
  await handle.waitFor({ state: 'visible' });
  const templateId = await sourceCard.getAttribute('data-template-id');
  assert.ok(templateId, 'The source card needs a stable template id');

  const target = page.locator('[data-calendar-day="7"] [data-calendar-slot][data-time="15:15"]');
  assert.equal(await target.count(), 1, 'The calendar needs one concrete Sunday 15:15 target');
  const expectedDate = await target.getAttribute('data-date');
  assert.match(expectedDate, /^\d{4}-\d{2}-\d{2}$/, 'The target slot needs an exact date');

  await installDragProbe(page);
  await realMouseDrag(page, handle, target);

  const editorPanel = page.locator(selectors.editorPanel);
  let opened = true;
  try {
    await editorPanel.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    opened = false;
  }
  const trace = await page.evaluate(() => window.__paletteHandleDragProbe || []);
  assert.equal(
    opened,
    true,
    `Dragging the visible handle must open a draft at the target instead of ending in a forbidden/no-drop state. Event trace: ${JSON.stringify(trace)}`,
  );

  const form = editorPanel.locator(selectors.form);
  assert.equal(await form.locator('[name="date"]').inputValue(), expectedDate, 'The draft must use the slot date');
  assert.equal(await form.locator('[name="start"]').inputValue(), '15:15', 'The draft must use the exact 15-minute slot');

  const startedFromHandle = trace.some((event) => (
    (event.type === 'pointerdown' || event.type === 'dragstart') && event.target === 'handle'
  ));
  assert.equal(startedFromHandle, true, `The real mouse gesture must begin on the visible handle. Event trace: ${JSON.stringify(trace)}`);
  const nativeStarted = trace.some((event) => event.type === 'dragstart');
  const acceptedNativeDrop = trace.some((event) => event.type === 'drop' && event.target === 'slot');
  const completedPointerDrop = trace.some((event) => event.type === 'pointerup');
  const endedAsForbiddenNativeDrag = nativeStarted
    && !acceptedNativeDrop
    && trace.some((event) => event.type === 'dragend' && event.dropEffect === 'none');
  assert.equal(
    endedAsForbiddenNativeDrag,
    false,
    `The handle must not finish as a native no-drop operation. Event trace: ${JSON.stringify(trace)}`,
  );
  assert.equal(
    acceptedNativeDrop || completedPointerDrop,
    true,
    `The browser gesture must complete as an accepted native or pointer drop. Event trace: ${JSON.stringify(trace)}`,
  );
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    try {
      await verifyVisibleHandleDrag(page);
      console.log('PASS visible palette handle supports a real Chromium mouse drag to Sunday 15:15');
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
