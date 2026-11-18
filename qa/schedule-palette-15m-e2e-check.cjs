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

assert.ok(adminUsername, 'Set SCHEDULE_ADMIN_USERNAME (or TEST_ADMIN_USERNAME) for the palette E2E check.');
assert.ok(adminPassword, 'Set SCHEDULE_ADMIN_PASSWORD (or TEST_ADMIN_PASSWORD) for the palette E2E check.');

const selectors = Object.freeze({
  app: '[data-schedule-app]',
  calendarPanel: '[data-schedule-panel="schedule"]',
  sessionDialog: '[data-schedule-session-dialog]',
  manageDialog: '[data-schedule-manage-dialog]',
  create: '[data-calendar-create]',
  modalClose: '[data-schedule-modal-close]',
  calendar: '[data-schedule-calendar]',
  calendarGrid: '[data-calendar-grid]',
  calendarCard: '[data-calendar-card]',
  calendarSlot: '[data-calendar-slot]',
  palette: '[data-schedule-palette]',
  paletteCard: '[data-schedule-palette-card][data-template-id]',
  paletteSelect: '[data-schedule-palette-select]',
  form: '[data-schedule-form]',
  save: '[data-schedule-save]',
});

function url(pathname, query = {}) {
  const target = new URL(pathname, `${siteOrigin}/`);
  Object.entries(query).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  return target.href;
}

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function createContext(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: Boolean(viewport.isMobile),
    hasTouch: Boolean(viewport.hasTouch),
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });

  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('dzhikaeva-loader-seen', '1');
      localStorage.setItem('dzhikaeva-analytics-consent', 'denied');
    } catch {
      // Storage assertions below will report browsers that reject local persistence.
    }
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

async function waitForEditorPage(page) {
  const response = await page.goto(url('/schedule/', { qa: 'palette-15m' }), {
    waitUntil: 'domcontentloaded',
  });
  assert.ok(response && response.status() < 400, 'Authenticated editor page must load successfully');
  assert.equal(new URL(page.url()).pathname, '/schedule/', 'Authenticated editor must not redirect to login');
  await page.locator(selectors.app).waitFor({ state: 'visible' });
  await page.waitForFunction((appSelector) => (
    document.querySelector(appSelector)?.getAttribute('data-schedule-ready') === 'true'
  ), selectors.app);
  await page.waitForFunction((calendarSelector) => {
    const calendar = document.querySelector(calendarSelector);
    return calendar
      && calendar.getAttribute('data-schedule-calendar-mounted') === 'true'
      && calendar.querySelectorAll('[data-calendar-day]').length === 7;
  }, selectors.calendar);
}

async function selectMode(page, mode) {
  if (mode === 'editor') {
    const dialog = page.locator(selectors.sessionDialog);
    if (!await dialog.isVisible()) await page.locator(selectors.create).click();
    await dialog.waitFor({ state: 'visible' });
    return dialog;
  }

  for (const dialogSelector of [selectors.sessionDialog, selectors.manageDialog]) {
    const dialog = page.locator(dialogSelector);
    if (await dialog.isVisible()) {
      await dialog.locator(selectors.modalClose).click();
      await dialog.waitFor({ state: 'hidden' });
    }
  }
  const calendar = page.locator(selectors.calendarPanel);
  await calendar.waitFor({ state: 'visible' });
  return calendar;
}

async function snapshotLocalStorage(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
}

async function restoreLocalStorage(page, snapshot) {
  await page.evaluate((stored) => {
    localStorage.clear();
    Object.entries(stored).forEach(([key, value]) => localStorage.setItem(key, value));
  }, snapshot);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForEditorPage(page);
  // Offline QA has no Supabase connection, so startup may legitimately flip
  // the transient sync flag back to pending. Restore the captured bytes once
  // the app has finished booting; the context is closed immediately after.
  await page.evaluate((stored) => {
    localStorage.clear();
    Object.entries(stored).forEach(([key, value]) => localStorage.setItem(key, value));
  }, snapshot);
  assert.deepEqual(
    await snapshotLocalStorage(page),
    snapshot,
    'The E2E check must restore localStorage byte-for-byte after exercising the editor',
  );
}

async function withEditor(browser, viewport, callback) {
  const context = await createContext(browser, viewport);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let snapshot;
  let primaryError;
  try {
    await waitForEditorPage(page);
    snapshot = await snapshotLocalStorage(page);
    await callback(page);
    assert.deepEqual(pageErrors, [], `Unexpected browser errors: ${pageErrors.join(' | ')}`);
  } catch (error) {
    primaryError = error;
  } finally {
    if (snapshot) {
      try {
        await restoreLocalStorage(page, snapshot);
      } catch (restoreError) {
        primaryError = primaryError
          ? new AggregateError([primaryError, restoreError], 'Feature assertion failed and localStorage cleanup also failed')
          : restoreError;
      }
    }
    await context.close();
  }
  if (primaryError) throw primaryError;
}

async function inspectPaletteLayout(page) {
  await selectMode(page, 'schedule');
  const palette = page.locator(selectors.palette);
  await palette.waitFor({ state: 'visible' });
  const grid = page.locator(`${selectors.calendar} ${selectors.calendarGrid}`);
  await grid.waitFor({ state: 'visible' });
  const paletteBox = await palette.boundingBox();
  const gridBox = await grid.boundingBox();
  assert.ok(paletteBox && gridBox, 'Desktop palette and calendar grid need measurable boxes');
  assert.ok(
    paletteBox.x + paletteBox.width <= gridBox.x + 4,
    'The compact training-card palette must sit to the left of the desktop calendar grid',
  );
  assert.ok(
    paletteBox.y < gridBox.y + gridBox.height && paletteBox.y + paletteBox.height > gridBox.y,
    'The palette must remain beside the visible calendar instead of above or below it',
  );
  assert.ok(paletteBox.width >= 140 && paletteBox.width <= 300, `Desktop palette width should stay compact; got ${paletteBox.width}px`);

  const cards = palette.locator(selectors.paletteCard);
  assert.ok(await cards.count() >= 1, 'Editable calendar needs at least one draggable training template in its side palette');
  const first = cards.first();
  assert.equal(await first.evaluate((node) => node.draggable), false, 'Only the dedicated handle may start template dragging');
  assert.equal(await first.locator(selectors.paletteSelect).evaluate((node) => node.draggable), false, 'Template content must not be draggable');
  assert.equal(
    await first.locator('time').count(),
    0,
    'Reusable training cards must not display a scheduled start or end time',
  );
  const cardBox = await first.boundingBox();
  assert.ok(cardBox && cardBox.height >= 44 && cardBox.height <= 132, `Palette cards should be compact touch targets; got ${cardBox?.height}px`);
  const handle = first.locator('[data-schedule-palette-drag-handle]');
  const handleBox = await handle.boundingBox();
  assert.ok(
    handleBox && cardBox && handleBox.width >= 44 && handleBox.width <= 64 && handleBox.width < cardBox.width * 0.4,
    `The drag handle must be a narrow left rail; card=${cardBox?.width}px, handle=${handleBox?.width}px`,
  );
  assert.ok(Math.abs(handleBox.x - cardBox.x) <= 2, 'The drag rail must stay on the left edge of the card');
  assert.equal(await handle.evaluate((node) => getComputedStyle(node).touchAction), 'none', 'Only the drag rail may block touch panning');
  const handleBackground = await handle.evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.notEqual(handleBackground, 'rgb(237, 23, 48)', 'The drag handle must use a quiet background instead of the bright brand red');

  const edit = first.locator('[data-schedule-palette-edit]');
  const editBox = await edit.boundingBox();
  assert.ok(editBox && editBox.width >= 44 && editBox.height >= 44, 'Template edit icon needs a 44px touch target');
  assert.ok(Math.abs((editBox.x + editBox.width) - (cardBox.x + cardBox.width)) <= 2, 'Template edit icon must stay on the right edge');
  assert.ok(Math.abs(editBox.y - cardBox.y) <= 2, 'Template edit icon must stay in the top-right corner');
  assert.equal(await edit.locator('svg').count(), 1, 'Template edit action must be represented by an icon');
}

async function inspectQuarterHourGrid(page) {
  await selectMode(page, 'schedule');
  const calendar = page.locator(selectors.calendar);
  assert.equal(
    await calendar.getAttribute('data-step'),
    '15',
    'Editable calendar must declare a 15-minute scheduling step',
  );

  const monday = calendar.locator('[data-calendar-day="1"]');
  const quarter = ['11:00', '11:15', '11:30', '11:45'];
  for (const time of quarter) {
    assert.equal(
      await monday.locator(`${selectors.calendarSlot}[data-time="${time}"]`).count(),
      1,
      `Monday must contain one real drop/tap slot at ${time}`,
    );
  }

  const geometry = await monday.evaluate((day) => {
    const times = ['11:00', '11:15', '11:30', '11:45', '12:00'];
    return times.map((time) => {
      const slot = day.querySelector(`[data-calendar-slot][data-time="${time}"]`);
      const rect = slot?.getBoundingClientRect();
      return rect ? { time, top: rect.top, height: rect.height } : null;
    });
  });
  assert.ok(geometry.every(Boolean), 'Quarter-hour geometry needs consecutive slots through 12:00');
  const gaps = geometry.slice(1).map((item, index) => item.top - geometry[index].top);
  assert.ok(gaps.every((gap) => gap > 0), `Quarter-hour slots need distinct vertical positions; got ${gaps.join(', ')}`);
  assert.ok(
    Math.max(...gaps) - Math.min(...gaps) <= 1.5,
    `11:00, 11:15, 11:30 and 11:45 slots must be evenly spaced; got ${gaps.join(', ')}`,
  );
}

async function inspectHourLabelGeometry(page) {
  await selectMode(page, 'schedule');
  const calendar = page.locator(selectors.calendar);
  const label = calendar.locator('.schedule-calendar__time-label').filter({ hasText: /^11:00$/ });
  assert.equal(await label.count(), 1, 'The time rail must contain one full-hour label for 11:00');
  await label.scrollIntoViewIfNeeded();

  const result = await calendar.evaluate(() => {
    const labels = [...document.querySelectorAll('.schedule-calendar__time-label')];
    const hourLabel = labels.find((node) => (node.textContent || '').trim() === '11:00');
    const startSlot = document.querySelector('[data-calendar-day="1"] [data-calendar-slot][data-time="11:00"]');
    const endSlot = document.querySelector('[data-calendar-day="1"] [data-calendar-slot][data-time="12:00"]');
    if (!hourLabel || !startSlot || !endSlot) return null;
    const labelRect = hourLabel.getBoundingClientRect();
    const startRect = startSlot.getBoundingClientRect();
    const endRect = endSlot.getBoundingClientRect();
    return {
      labelCenter: labelRect.top + labelRect.height / 2,
      rowTop: startRect.top,
      rowBottom: endRect.top,
      labels: labels.map((node) => (node.textContent || '').trim()),
    };
  });
  assert.ok(result, 'Hour-label geometry needs the 11:00–12:00 calendar row');
  const rowHeight = result.rowBottom - result.rowTop;
  assert.ok(rowHeight > 0, 'The 11:00 hour row needs positive height');
  const relativeCenter = (result.labelCenter - result.rowTop) / rowHeight;
  assert.ok(
    relativeCenter >= 0.35 && relativeCenter <= 0.65,
    `The 11:00 label must sit inside the middle of its 11:00–12:00 row, not on a boundary (position ${(relativeCenter * 100).toFixed(1)}%)`,
  );
  assert.ok(
    result.labels.every((value) => /^\d{2}:00$/.test(value)),
    `The visible time rail should label hour rows, not every 15-minute boundary: ${result.labels.join(', ')}`,
  );
}

async function createSourceTemplateAndFindPaletteCard(page, marker) {
  await selectMode(page, 'schedule');
  const templateId = `qa-palette-${Date.now()}`;
  const sessionCountBefore = await page.evaluate(() => window.DzhikaevaSchedule.getSessions().length);
  await page.evaluate(({ id, title }) => {
    window.DzhikaevaSchedule.upsertTemplate({
      id,
      venue: 'sillamae',
      title: { ru: title, et: title, en: title },
      audience: { ru: 'QA RU', et: 'QA ET', en: 'QA EN' },
      durationMinutes: 45,
    });
  }, { id: templateId, title: marker });

  assert.equal(
    await page.evaluate(() => window.DzhikaevaSchedule.getSessions().length),
    sessionCountBefore,
    'Creating a reusable training card must not create a scheduled session',
  );
  const paletteCard = page.locator(`${selectors.paletteCard}[data-template-id="${templateId}"]`);
  await paletteCard.waitFor({ state: 'visible' });
  assert.equal(
    await paletteCard.locator('time').count(),
    0,
    'A reusable training card must stay time-free until it is placed in the calendar',
  );
  return { paletteCard, templateId };
}

async function installNewSessionEventProbe(page) {
  await page.evaluate(() => {
    window.__schedulePaletteNewEvents = [];
    window.addEventListener('dzhikaeva:schedulenew', (event) => {
      window.__schedulePaletteNewEvents.push(event.detail || null);
    });
  });
}

async function latestNewSessionEvent(page) {
  return page.evaluate(() => window.__schedulePaletteNewEvents?.at(-1) || null);
}

async function saveDraftAsWeekly(page, templateId, expected) {
  const sessionDialog = page.locator(selectors.sessionDialog);
  await sessionDialog.waitFor({ state: 'visible' });
  const form = sessionDialog.locator(selectors.form);
  assert.equal(await form.getAttribute('data-schedule-form-mode'), 'template-placement', 'Dropped card must open streamlined template placement');
  assert.equal(collapse(await form.locator('[data-schedule-form-heading]').innerText()), expected.marker, 'Dropped card heading must use the add icon and its template name');
  assert.equal(await form.locator('[data-schedule-form-heading]').evaluate((node) => node.classList.contains('schedule-form__placement-heading')), true, 'Dropped card heading must use the circular add icon');
  assert.equal(collapse(await form.locator('[data-schedule-form-subtitle]').textContent()), 'Группа · QA RU', 'Dropped card heading must show its saved group');
  assert.equal(await form.locator('[name="group-preset"]').isHidden(), true, 'Dropped card must not ask for a ready-made group again');
  assert.equal(await form.locator('[data-schedule-language-details]').isHidden(), true, 'Dropped card must not expose language text editing');
  assert.equal(await form.locator('[name="start"]').inputValue(), expected.start, 'Dropped card must prefill the exact quarter-hour start');
  assert.equal(await form.locator('[name="date"]').inputValue(), expected.date, 'Dropped card must prefill the target date');
  assert.equal(await form.locator('[name="repeat-weekly"]').isChecked(), false, 'A concrete placement should default to a one-off session');
  assert.match(await form.locator('[name="title-ru"]').inputValue(), /PALETTE QA/, 'Scheduling draft must inherit the selected template text');

  const detail = await latestNewSessionEvent(page);
  assert.ok(detail, 'Dropping a palette card must announce dzhikaeva:schedulenew');
  assert.equal(detail.templateId, templateId, 'Scheduling event must identify the selected template');
  assert.equal(detail.start, expected.start, 'Scheduling event must preserve the exact drop time');
  assert.equal(detail.date, expected.date, 'Scheduling event must preserve the exact drop date');
  assert.equal(Number(detail.weekday), expected.weekday, 'Scheduling event must preserve the target weekday');

  await form.locator('[name="repeat-weekly"]').check();
  const targetDay = form.locator(`[name="weekdays"][value="${expected.weekday}"]`);
  if (!await targetDay.isChecked()) await targetDay.check();
  for (let value = 1; value <= 7; value += 1) {
    if (value === expected.weekday) continue;
    const checkbox = form.locator(`[name="weekdays"][value="${value}"]`);
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  await form.locator('[name="starts-on"]').fill(expected.date);
  await form.locator(selectors.save).click();
  await sessionDialog.waitFor({ state: 'hidden' });
  await page.locator(selectors.calendarPanel).waitFor({ state: 'visible' });
  const placed = page.locator(
    `${selectors.calendarCard}[data-occurrence-date="${expected.date}"]`,
  ).filter({ hasText: expected.marker }).filter({ hasText: expected.start });
  await placed.waitFor({ state: 'visible' });
  assert.match(collapse(await placed.innerText()), new RegExp(expected.start.replace(':', '\\:')), 'Placed weekly card must render at the exact drop time');
}

async function inspectDesktopTemplateDrag(page) {
  const marker = `PALETTE QA DESKTOP ${Date.now()}`;
  const { paletteCard, templateId } = await createSourceTemplateAndFindPaletteCard(page, marker);
  const target = page.locator('[data-calendar-day="1"] [data-calendar-slot][data-time="11:15"]');
  assert.equal(await target.count(), 1, 'Desktop calendar needs one Monday 11:15 drop slot');
  const expected = {
    marker,
    start: '11:15',
    date: await target.getAttribute('data-date'),
    weekday: 1,
  };
  assert.match(expected.date, /^\d{4}-\d{2}-\d{2}$/, 'Desktop drop target needs an exact ISO date');
  await installNewSessionEventProbe(page);
  const handle = paletteCard.locator('[data-schedule-palette-drag-handle]');
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(handleBox && targetBox, 'Template drag needs visible handle and target geometry');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 12, handleBox.y + handleBox.height / 2 + 4, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 24 });
  await page.mouse.up();
  await saveDraftAsWeekly(page, templateId, expected);
}

async function inspectMobileSelectAndTap(page) {
  const marker = `PALETTE QA MOBILE ${Date.now()}`;
  const { paletteCard, templateId } = await createSourceTemplateAndFindPaletteCard(page, marker);
  await paletteCard.scrollIntoViewIfNeeded();
  const paletteBox = await paletteCard.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(paletteBox && paletteBox.height >= 44, 'Mobile palette card needs a touch target at least 44px high');
  assert.ok(
    paletteBox.x >= -1 && paletteBox.x + paletteBox.width <= viewport.width + 1,
    'Mobile palette card must remain inside the viewport without horizontal clipping',
  );

  const paletteList = page.locator('[data-schedule-palette-list]');
  const mobileTouchContract = await paletteList.evaluate((node) => ({
    touchAction: getComputedStyle(node).touchAction,
    overscrollY: getComputedStyle(node).overscrollBehaviorY,
  }));
  assert.notEqual(mobileTouchContract.touchAction, 'pan-x', 'Palette content must allow vertical page panning');
  assert.notEqual(mobileTouchContract.touchAction, 'none', 'Palette content must not trap all touch gestures');
  assert.equal(mobileTouchContract.overscrollY, 'auto', 'Vertical overscroll must chain to the page');

  const handle = paletteCard.locator('[data-schedule-palette-drag-handle]');
  assert.equal(await handle.evaluate((node) => getComputedStyle(node).touchAction), 'none', 'Only the drag rail may capture touch gestures');
  await handle.tap({ force: true });
  assert.equal(
    await paletteCard.getAttribute('data-schedule-palette-selected'),
    null,
    'Tapping the drag rail without moving must not select the template',
  );

  const mainBox = await paletteCard.locator(selectors.paletteSelect).boundingBox();
  assert.ok(mainBox, 'Template content must remain visible for the vertical swipe check');
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const cdp = await page.context().newCDPSession(page);
  const touchX = mainBox.x + Math.min(mainBox.width / 2, 80);
  const touchStartY = mainBox.y + mainBox.height / 2;
  const touchEndY = Math.max(70, touchStartY - 130);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchStartY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX, y: touchEndY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  assert.ok(await page.evaluate(() => window.scrollY) > scrollBefore, 'A vertical swipe started on template content must scroll the page');

  // Start the placement gesture from a fresh document so DevTools' synthetic
  // swipe stream cannot suppress the next compatibility click.
  await waitForEditorPage(page);
  await selectMode(page, 'schedule');
  await paletteCard.waitFor({ state: 'visible' });
  await paletteCard.scrollIntoViewIfNeeded();

  await installNewSessionEventProbe(page);
  await paletteCard.locator(selectors.paletteSelect).tap();
  const selected = await paletteCard.evaluate((node) => (
    node.getAttribute('aria-pressed') === 'true'
    || node.getAttribute('data-schedule-palette-selected') === 'true'
  ));
  assert.equal(selected, true, 'First mobile tap must visibly select the template card');

  const target = page.locator('[data-calendar-day="2"] [data-calendar-slot][data-time="11:45"]');
  assert.equal(await target.count(), 1, 'Mobile calendar needs one Tuesday 11:45 tap slot');
  const expected = {
    marker,
    start: '11:45',
    date: await target.getAttribute('data-date'),
    weekday: 2,
  };
  await target.scrollIntoViewIfNeeded();
  await target.click({ force: true });

  const sessionDialog = page.locator(selectors.sessionDialog);
  await sessionDialog.waitFor({ state: 'visible' });
  const form = sessionDialog.locator(selectors.form);
  assert.equal(await form.getAttribute('data-schedule-form-mode'), 'template-placement', 'Mobile template tap must open streamlined placement');
  assert.equal(collapse(await form.locator('[data-schedule-form-heading]').innerText()), marker, 'Mobile placement heading must use the add icon and its template name');
  assert.equal(await form.locator('[data-schedule-form-heading]').evaluate((node) => node.classList.contains('schedule-form__placement-heading')), true, 'Mobile placement heading must use the circular add icon');
  assert.equal(collapse(await form.locator('[data-schedule-form-subtitle]').textContent()), 'Группа · QA RU', 'Mobile placement heading must show its saved group');
  assert.equal(await form.locator('[name="group-preset"]').isHidden(), true, 'Mobile placement must hide the redundant group selector');
  assert.equal(await form.locator('[data-schedule-language-details]').isHidden(), true, 'Mobile placement must hide language text editing');
  assert.equal(await form.locator('[name="start"]').inputValue(), '11:45', 'Select-card + tap must prefill 11:45 exactly');
  assert.equal(await form.locator('[name="date"]').inputValue(), expected.date, 'Mobile placement must preserve the tapped date');
  assert.equal(await form.locator('[name="repeat-weekly"]').isChecked(), false, 'Mobile placement must allow recurrence choice and default to once');
  const detail = await latestNewSessionEvent(page);
  assert.equal(detail?.templateId, templateId, 'Mobile placement event must retain the selected template id');
  assert.equal(detail?.start, '11:45', 'Mobile placement event must retain the tapped quarter-hour');

  await form.locator(selectors.save).click();
  await sessionDialog.waitFor({ state: 'hidden' });
  await page.locator(selectors.calendarPanel).waitFor({ state: 'visible' });
  const placed = page.locator(
    `${selectors.calendarCard}[data-occurrence-date="${expected.date}"]`,
  ).filter({ hasText: marker });
  await placed.waitFor({ state: 'visible' });
  assert.match(collapse(await placed.innerText()), /11:45/, 'Mobile one-off card must render at 11:45');
}

async function runCase(name, callback, failures) {
  try {
    await callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const failures = [];
  const desktop = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844, isMobile: true, hasTouch: true };

  try {
    await runCase(
      'editable calendar has a compact left-side template palette',
      () => withEditor(browser, desktop, inspectPaletteLayout),
      failures,
    );
    await runCase(
      'calendar grid exposes evenly spaced 15-minute slots',
      () => withEditor(browser, desktop, inspectQuarterHourGrid),
      failures,
    );
    await runCase(
      'hour labels sit inside their hour rows instead of on boundaries',
      () => withEditor(browser, desktop, inspectHourLabelGeometry),
      failures,
    );
    await runCase(
      'desktop drag creates a scheduling draft at exactly 11:15 with recurrence available',
      () => withEditor(browser, desktop, inspectDesktopTemplateDrag),
      failures,
    );
    await runCase(
      'mobile select-card plus tap creates a one-off session at exactly 11:45',
      () => withEditor(browser, mobile, inspectMobileSelectAndTap),
      failures,
    );
  } finally {
    await browser.close();
  }

  if (failures.length) {
    const summary = failures.map(({ name, error }) => (
      `- ${name}: ${collapse(error instanceof Error ? error.message : error)}`
    )).join('\n');
    throw new Error(`Schedule palette/15-minute E2E contract is RED (${failures.length}/5):\n${summary}`);
  }

  console.log('Schedule palette/15-minute E2E contract passed (5/5).');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
