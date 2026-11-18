#!/usr/bin/env node

const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');

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
  create: '[data-calendar-create]',
  modal: 'dialog[data-schedule-session-dialog]',
  form: '[data-schedule-form]',
  custom: '.schedule-select[data-schedule-select]',
  native: 'select[data-schedule-select-native]',
  trigger: '[data-schedule-select-trigger]',
  listbox: '[data-schedule-select-listbox]',
  option: '[data-schedule-select-option]',
});

const languageCases = Object.freeze({
  ru: {
    path: '/schedule/',
    groupLabel: 'Готовая группа',
    group: [
      'Другая / вручную',
      'Силламяэ · дети 6–16',
      'Силламяэ · малыши до 4',
      'Нарва · от 5–6 лет',
    ],
    status: ['Активно', 'Приостановлено'],
    venue: ['Силламяэ · Kalda 14', 'Нарва · Rakvere 22D'],
  },
  et: {
    path: '/schedule/et/',
    groupLabel: 'Valmis rühm',
    group: [
      'Muu / käsitsi',
      'Sillamäe · lapsed 6–16',
      'Sillamäe · kuni 4-aastased',
      'Narva · alates 5.–6. eluaastast',
    ],
    status: ['Aktiivne', 'Peatatud'],
    venue: ['Sillamäe · Kalda 14', 'Narva · Rakvere 22D'],
  },
  en: {
    path: '/schedule/en/',
    groupLabel: 'Saved group',
    group: [
      'Other / manual',
      'Sillamäe · ages 6–16',
      'Sillamäe · toddlers under 4',
      'Narva · ages 5–6 and up',
    ],
    status: ['Active', 'Paused'],
    venue: ['Sillamäe · Kalda 14', 'Narva · Rakvere 22D'],
  },
});

function url(pathname, query = {}) {
  const target = new URL(pathname, `${siteOrigin}/`);
  Object.entries(query).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  return target.href;
}

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseCssTimes(value) {
  return String(value || '').split(',').map((part) => {
    const token = part.trim().toLowerCase();
    if (token.endsWith('ms')) return Number.parseFloat(token) / 1000;
    if (token.endsWith('s')) return Number.parseFloat(token);
    return 0;
  }).filter(Number.isFinite);
}

function maxCssTime(snapshot) {
  return Math.max(
    0,
    ...parseCssTimes(snapshot.transitionDuration),
    ...parseCssTimes(snapshot.animationDuration),
  );
}

async function createAuthenticatedContext(browser, viewport, reducedMotion = 'reduce') {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: Boolean(viewport.isMobile),
    hasTouch: Boolean(viewport.hasTouch),
    reducedMotion,
    serviceWorkers: 'block',
  });

  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('dzhikaeva-loader-seen', '1');
      localStorage.setItem('dzhikaeva-analytics-consent', 'denied');
    } catch {
      // The assertions below expose browsers where storage is unavailable.
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

async function openCreateModal(page, language = 'ru') {
  const currentCase = languageCases[language];
  const response = await page.goto(url(currentCase.path, { qa: 'custom-select' }), {
    waitUntil: 'domcontentloaded',
  });
  assert.ok(response && response.status() < 400, `${language}: protected schedule page must load`);
  assert.equal(new URL(page.url()).pathname, currentCase.path, `${language}: editor must not redirect to login`);
  await page.locator(selectors.app).waitFor({ state: 'visible' });
  await page.waitForFunction((appSelector) => (
    document.querySelector(appSelector)?.getAttribute('data-schedule-ready') === 'true'
  ), selectors.app);
  await page.locator(selectors.create).click();
  const modal = page.locator(selectors.modal);
  await modal.waitFor({ state: 'visible' });
  assert.equal(await modal.evaluate((node) => node.open && node.matches(':modal')), true, `${language}: create editor must use a native modal dialog`);
  return modal;
}

function customByName(modal, name) {
  return modal.locator(`${selectors.custom}:has(${selectors.native}[name="${name}"])`);
}

async function visibleListboxCount(page) {
  return page.locator(`${selectors.listbox}:visible`).count();
}

async function assertClosed(control, label) {
  const trigger = control.locator(selectors.trigger);
  const listbox = control.locator(selectors.listbox);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false', `${label}: closed trigger must expose aria-expanded=false`);
  assert.equal(await listbox.getAttribute('aria-hidden'), 'true', `${label}: closing popup must leave the accessibility tree immediately`);
  const wasAnimatingClosed = await control.evaluate((node) => (
    node.hasAttribute('data-schedule-select-closing')
    && !node.querySelector('[data-schedule-select-listbox]')?.hidden
  ));
  if (wasAnimatingClosed) {
    assert.equal(
      await listbox.evaluate((node) => getComputedStyle(node).visibility),
      'visible',
      `${label}: closing transition must retain a visible animation surface before cleanup`,
    );
  }
  await listbox.waitFor({ state: 'hidden', timeout: 700 });
  assert.equal(await listbox.isVisible(), false, `${label}: closed listbox must not remain visible`);
}

async function assertOpen(control, label) {
  const trigger = control.locator(selectors.trigger);
  const listbox = control.locator(selectors.listbox);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true', `${label}: open trigger must expose aria-expanded=true`);
  await listbox.waitFor({ state: 'visible', timeout: 1200 });
  assert.equal(await listbox.isVisible(), true, `${label}: popup listbox must be visible`);
}

async function assertProgressiveControl(modal, name, expectedOptionCount) {
  const native = modal.locator(`select[name="${name}"]`);
  const control = customByName(modal, name);
  assert.equal(await native.count(), 1, `${name}: original native select must remain in the form`);
  assert.equal(await control.count(), 1, `${name}: visible select needs exactly one custom enhancement`);
  assert.equal(await control.locator(selectors.native).count(), 1, `${name}: enhanced wrapper must retain the original select`);

  const semantics = await native.evaluate((node) => ({
    tagName: node.tagName,
    name: node.name,
    required: node.required,
    disabled: node.disabled,
    formConnected: Boolean(node.form),
    optionCount: node.options.length,
    value: node.value,
    formDataValue: node.form ? new FormData(node.form).get(node.name) : null,
    rectWidth: node.getBoundingClientRect().width,
    rectHeight: node.getBoundingClientRect().height,
  }));
  assert.equal(semantics.tagName, 'SELECT', `${name}: enhancement must not replace the semantic select`);
  assert.equal(semantics.name, name, `${name}: original form field name must be preserved`);
  assert.equal(semantics.disabled, false, `${name}: original select must stay enabled for submission`);
  assert.equal(semantics.formConnected, true, `${name}: original select must remain associated with the editor form`);
  assert.equal(semantics.optionCount, expectedOptionCount, `${name}: enhancement must preserve every native option`);
  assert.equal(semantics.formDataValue, semantics.value, `${name}: FormData must submit the selected native value`);
  assert.ok(
    semantics.rectWidth > 0 && semantics.rectHeight > 0,
    `${name}: native select must retain a nonzero box for legacy form automation`,
  );
  if (name === 'venue' || name === 'status') {
    assert.equal(semantics.required, true, `${name}: required form semantics must be preserved`);
  }

  const trigger = control.locator(selectors.trigger);
  const listbox = control.locator(selectors.listbox);
  const options = listbox.locator(selectors.option);
  assert.equal(await trigger.count(), 1, `${name}: custom select needs one visible trigger`);
  assert.equal(await trigger.isVisible(), true, `${name}: custom trigger must be visible`);
  assert.equal(await trigger.getAttribute('role'), 'combobox', `${name}: trigger must expose the combobox role`);
  assert.equal(await trigger.getAttribute('aria-haspopup'), 'listbox', `${name}: trigger must identify its listbox popup`);
  assert.equal(await trigger.getAttribute('type'), 'button', `${name}: trigger must not accidentally submit the form`);
  assert.equal(await listbox.getAttribute('role'), 'listbox', `${name}: popup must expose role=listbox`);
  const listboxId = await listbox.getAttribute('id');
  assert.ok(listboxId, `${name}: popup listbox needs a stable id`);
  assert.equal(await trigger.getAttribute('aria-controls'), listboxId, `${name}: combobox must control its listbox`);
  assert.equal(await options.count(), expectedOptionCount, `${name}: custom listbox must mirror native options`);

  const accessibleName = await trigger.evaluate((node) => {
    const direct = String(node.getAttribute('aria-label') || '').trim();
    const labelledBy = String(node.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return direct || labelledBy;
  });
  assert.ok(accessibleName.length >= 2, `${name}: custom combobox needs an accessible localized name`);

  const values = await options.evaluateAll((nodes) => nodes.map((node) => ({
    value: node.getAttribute('data-value'),
    role: node.getAttribute('role'),
  })));
  const nativeValues = await native.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value));
  assert.deepEqual(values.map((item) => item.value), nativeValues, `${name}: custom option values must mirror native values in order`);
  assert.ok(values.every((item) => item.role === 'option'), `${name}: every popup choice must expose role=option`);
  await assertClosed(control, name);
  return control;
}

async function inspectProgressiveEnhancementAndMouse(page) {
  const modal = await openCreateModal(page);
  const venue = await assertProgressiveControl(modal, 'venue', 2);
  const group = await assertProgressiveControl(modal, 'group-preset', 4);
  const status = await assertProgressiveControl(modal, 'status', 2);

  assert.equal(
    await modal.locator(`${selectors.custom} select[name="weekday"]`).count(),
    0,
    'The hidden legacy weekday field must stay native and must not gain a duplicate custom control',
  );
  assert.equal(await modal.locator('select[name="weekday"]').count(), 1, 'The hidden legacy weekday select must still exist');

  const groupNative = group.locator(selectors.native);
  await page.evaluate(() => { window.__customSelectChanges = 0; });
  await groupNative.evaluate((node) => {
    node.addEventListener('change', () => { window.__customSelectChanges += 1; });
  });

  await group.locator(selectors.trigger).click();
  await assertOpen(group, 'group mouse open');
  assert.equal(await visibleListboxCount(page), 1, 'Opening one custom select must expose exactly one popup');

  const popupStyle = await group.locator(selectors.listbox).evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      tagName: node.tagName,
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderStyle: style.borderTopStyle,
      borderRadius: Number.parseFloat(style.borderTopLeftRadius) || 0,
      zIndex: style.zIndex,
      width: rect.width,
    };
  });
  assert.notEqual(popupStyle.tagName, 'SELECT', 'The visible popup must be a styled DOM listbox, not the operating-system select UI');
  const [r, g, b] = (popupStyle.backgroundColor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  assert.ok([r, g, b].every(Number.isFinite) && Math.max(r, g, b) < 100, `Popup must use a dark brand surface; got ${popupStyle.backgroundColor}`);
  assert.notEqual(popupStyle.borderStyle, 'none', 'Popup needs a deliberate styled border');
  assert.ok(popupStyle.borderRadius >= 4, `Popup needs styled corners; got ${popupStyle.borderRadius}px`);
  assert.ok(popupStyle.width >= 180, `Popup needs a usable width; got ${popupStyle.width}px`);

  const customChoice = group.locator(`${selectors.option}[data-value="sillamae-toddlers"]`);
  await customChoice.click();
  await assertClosed(group, 'group mouse selection');
  assert.equal(await groupNative.inputValue(), 'sillamae-toddlers', 'Mouse choice must synchronize the original native select');
  assert.equal(
    await modal.locator(selectors.form).evaluate((form) => new FormData(form).get('group-preset')),
    'sillamae-toddlers',
    'Mouse choice must be the value submitted by FormData',
  );
  assert.ok(await page.evaluate(() => window.__customSelectChanges) >= 1, 'Custom selection must dispatch the native change event');

  await status.locator(selectors.trigger).click();
  await assertOpen(status, 'status mouse open');
  await status.locator(`${selectors.option}[data-value="cancelled"]`).click();
  await assertClosed(status, 'status mouse selection');
  assert.equal(await status.locator(selectors.native).inputValue(), 'cancelled', 'Status custom control must synchronize its native select');

  await group.locator(selectors.trigger).click();
  await venue.locator(selectors.trigger).click();
  await assertClosed(group, 'group after venue opens');
  await assertOpen(venue, 'venue after group closes');
  assert.equal(await visibleListboxCount(page), 1, 'Only one custom popup may remain open at a time');

  await modal.locator('[data-schedule-form-heading]').click();
  await assertClosed(venue, 'venue outside click');
  assert.equal(await visibleListboxCount(page), 0, 'Clicking outside must close the open popup');

  await venue.locator(selectors.trigger).click();
  await venue.locator(`${selectors.option}[data-value="narva"]`).click();
  assert.equal(await venue.locator(selectors.native).inputValue(), 'narva', 'Venue custom control must synchronize its native select');

  await groupNative.selectOption('narva-children');
  assert.equal(
    collapse(await group.locator(selectors.trigger).innerText()),
    languageCases.ru.group[3],
    'Programmatic native changes must update the custom trigger label',
  );
}

async function inspectKeyboardContract(page) {
  const modal = await openCreateModal(page);
  const group = await assertProgressiveControl(modal, 'group-preset', 4);
  const trigger = group.locator(selectors.trigger);
  const native = group.locator(selectors.native);

  await trigger.focus();
  await trigger.press('ArrowDown');
  await assertOpen(group, 'ArrowDown open');
  assert.equal(await trigger.evaluate((node) => document.activeElement === node), true, 'Open combobox must retain DOM focus on its trigger');
  assert.equal(await activeCustomOptionValue(group), 'sillamae-children', 'Opening by keyboard must expose the selected option through aria-activedescendant');

  await page.keyboard.press('Home');
  let activeValue = await activeCustomOptionValue(group);
  assert.equal(activeValue, 'custom', 'Home must move the active choice to the first option');

  await page.keyboard.press('End');
  activeValue = await activeCustomOptionValue(group);
  assert.equal(activeValue, 'narva-children', 'End must move the active choice to the final option');
  await page.keyboard.press('Enter');
  await assertClosed(group, 'Enter selection');
  assert.equal(await native.inputValue(), 'narva-children', 'Enter must commit the active choice to the native select');

  await trigger.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await native.inputValue(), 'sillamae-children', 'Arrow keys must navigate custom choices one option at a time');

  const beforeEscape = await native.inputValue();
  await trigger.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await assertClosed(group, 'Escape close');
  assert.equal(await native.inputValue(), beforeEscape, 'Escape must close without committing the active preview');
  assert.equal(await trigger.evaluate((node) => document.activeElement === node), true, 'Escape must return/keep focus on the combobox trigger');

  await trigger.press(' ');
  await assertOpen(group, 'Space open');
  await page.keyboard.press('Home');
  await page.keyboard.press(' ');
  await assertClosed(group, 'Space selection');
  assert.equal(await native.inputValue(), 'custom', 'Space must commit the active choice to the native select');
}

async function activeCustomOptionValue(control) {
  return control.evaluate((root) => {
    const trigger = root.querySelector('[data-schedule-select-trigger]');
    const activeId = trigger?.getAttribute('aria-activedescendant') || '';
    return document.getElementById(activeId)?.getAttribute('data-value') || '';
  });
}

async function inspectLanguageLabels(page) {
  const modal = await openCreateModal(page, 'ru');
  for (const [language, expected] of Object.entries(languageCases)) {
    if (language !== 'ru') {
      await page.evaluate((nextLanguage) => {
        window.dispatchEvent(new CustomEvent('site:languagechange', {
          detail: { language: nextLanguage },
        }));
      }, language);
      await page.waitForFunction((nextLanguage) => document.documentElement.lang === nextLanguage, language);
    }
    assert.equal(documentLanguage(await page.locator('html').getAttribute('lang')), language, `${language}: document language must match the active SPA language`);

    for (const [name, labels] of Object.entries({
      venue: expected.venue,
      'group-preset': expected.group,
      status: expected.status,
    })) {
      const control = customByName(modal, name);
      assert.equal(await control.count(), 1, `${language}/${name}: translated custom select must be mounted`);
      await control.locator(selectors.trigger).click();
      await assertOpen(control, `${language}/${name} language check`);
      const optionLabels = await control.locator(selectors.option).allTextContents();
      assert.deepEqual(optionLabels.map(collapse), labels, `${language}/${name}: custom option labels must be fully translated`);
      if (language !== 'ru') {
        assert.equal(/[А-Яа-яЁё]/.test(optionLabels.join(' ')), false, `${language}/${name}: translated options must not leak Cyrillic text`);
      }
      await page.keyboard.press('Escape');
      await assertClosed(control, `${language}/${name} language close`);
    }

    const groupTrigger = customByName(modal, 'group-preset').locator(selectors.trigger);
    const accessibleName = await groupTrigger.evaluate((node) => {
      const ids = String(node.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      return ids.map((id) => document.getElementById(id)?.textContent || '').join(' ').replace(/\s+/g, ' ').trim()
        || node.getAttribute('aria-label')
        || '';
    });
    assert.ok(accessibleName.includes(expected.groupLabel), `${language}: group combobox accessible name must include “${expected.groupLabel}”`);
  }
  await modal.locator('[data-schedule-modal-close]').click();
  await modal.waitFor({ state: 'hidden' });
}

function documentLanguage(value) {
  return String(value || '').toLowerCase().split(/[-_]/)[0];
}

async function inspectMotion(page, reduced) {
  const modal = await openCreateModal(page);
  const group = customByName(modal, 'group-preset');
  await group.locator(selectors.trigger).click();
  const motion = await group.locator(selectors.listbox).evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      animationName: style.animationName,
      animationDuration: style.animationDuration,
    };
  });
  const duration = maxCssTime(motion);
  if (reduced) {
    assert.ok(duration <= 0.02, `Reduced-motion popup must remove or nearly eliminate motion; got ${duration}s`);
  } else {
    assert.ok(duration >= 0.08, `Popup needs a perceptible open/close transition; got ${duration}s`);
    const properties = `${motion.transitionProperty} ${motion.animationName}`.toLowerCase();
    assert.ok(
      /opacity|transform|scale|schedule|select/.test(properties),
      `Popup transition must animate a visible property such as opacity/transform; got ${properties}`,
    );
  }
}

async function inspectMobileTouch(page) {
  const modal = await openCreateModal(page);
  const viewport = page.viewportSize();
  assert.ok(viewport, 'Mobile test needs a viewport');

  for (const name of ['venue', 'group-preset', 'status']) {
    const control = customByName(modal, name);
    const trigger = control.locator(selectors.trigger);
    const triggerBox = await trigger.boundingBox();
    assert.ok(triggerBox && triggerBox.height >= 44, `${name}: mobile trigger needs a 44px touch target`);
    assert.ok(triggerBox.x >= -1 && triggerBox.x + triggerBox.width <= viewport.width + 1, `${name}: mobile trigger must fit the viewport`);
  }

  const group = customByName(modal, 'group-preset');
  await group.locator(selectors.trigger).tap();
  await assertOpen(group, 'mobile touch open');
  const listboxBox = await group.locator(selectors.listbox).boundingBox();
  assert.ok(listboxBox, 'Mobile popup needs measurable geometry');
  assert.ok(listboxBox.x >= -1 && listboxBox.x + listboxBox.width <= viewport.width + 1, `Mobile popup must fit 390px without clipping; box=${JSON.stringify(listboxBox)}`);
  const optionBoxes = await group.locator(selectors.option).evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
  }));
  assert.ok(optionBoxes.every((box) => box.height >= 44), `Every mobile option needs a 44px touch target; got ${JSON.stringify(optionBoxes)}`);
  assert.ok(
    optionBoxes.every((box) => box.left >= -1 && box.right <= viewport.width + 1),
    'Every mobile option must stay inside the viewport',
  );

  await group.locator(`${selectors.option}[data-value="custom"]`).tap();
  assert.equal(await group.locator(selectors.native).inputValue(), 'custom', 'Touch selection must synchronize the native field');
  await assertClosed(group, 'mobile touch selection');

  const overflow = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  assert.ok(overflow.html <= 1 && overflow.body <= 1, `Custom selects must not create horizontal mobile overflow; got ${JSON.stringify(overflow)}`);
}

async function inspectMobileTopPlacement(page) {
  const modal = await openCreateModal(page);
  const group = customByName(modal, 'group-preset');
  const trigger = group.locator(selectors.trigger);
  const listbox = group.locator(selectors.listbox);

  await group.evaluate((root) => {
    const triggerNode = root.querySelector('[data-schedule-select-trigger]');
    const dialog = root.closest('[data-schedule-session-dialog]');
    const scroller = root.closest('.schedule-editor-dialog__content');
    if (!triggerNode || !dialog || !scroller) return;
    const triggerRect = triggerNode.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const usableBottom = Math.min(innerHeight, dialogRect.bottom, scrollerRect.bottom);
    scroller.scrollTop += triggerRect.bottom - (usableBottom - 12);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const before = await group.evaluate((root) => {
    const triggerRect = root.querySelector('[data-schedule-select-trigger]').getBoundingClientRect();
    const dialogRect = root.closest('[data-schedule-session-dialog]').getBoundingClientRect();
    const scrollerRect = root.closest('.schedule-editor-dialog__content').getBoundingClientRect();
    const boundaryTop = Math.max(0, dialogRect.top, scrollerRect.top);
    const boundaryBottom = Math.min(innerHeight, dialogRect.bottom, scrollerRect.bottom);
    return {
      trigger: { top: triggerRect.top, bottom: triggerRect.bottom },
      boundaryTop,
      boundaryBottom,
      roomAbove: triggerRect.top - boundaryTop,
      roomBelow: boundaryBottom - triggerRect.bottom,
    };
  });
  assert.ok(before.roomBelow >= 0 && before.roomBelow <= 24, `Fixture must place the group trigger near the mobile lower edge; got ${JSON.stringify(before)}`);

  // Dispatch without Playwright's pre-action scroll: the fixture deliberately
  // keeps the trigger at the lower edge so placement is decided against the
  // genuinely constrained geometry rather than after an automation scroll.
  await trigger.evaluate((node) => node.click());
  await assertOpen(group, 'mobile long-list placement open');
  const transitionSnapshot = await listbox.evaluate((node) => ({
    transitionDuration: getComputedStyle(node).transitionDuration,
    animationDuration: getComputedStyle(node).animationDuration,
  }));
  const transitionSeconds = maxCssTime(transitionSnapshot);
  await page.waitForTimeout(Math.min(700, Math.max(80, Math.ceil(transitionSeconds * 1000) + 80)));

  const geometry = await group.evaluate((root) => {
    const triggerRect = root.querySelector('[data-schedule-select-trigger]').getBoundingClientRect();
    const listboxRect = root.querySelector('[data-schedule-select-listbox]').getBoundingClientRect();
    const dialogRect = root.closest('[data-schedule-session-dialog]').getBoundingClientRect();
    const scrollerRect = root.closest('.schedule-editor-dialog__content').getBoundingClientRect();
    const boundaryTop = Math.max(0, dialogRect.top, scrollerRect.top);
    const boundaryBottom = Math.min(innerHeight, dialogRect.bottom, scrollerRect.bottom);
    return {
      trigger: { top: triggerRect.top, bottom: triggerRect.bottom },
      listbox: {
        top: listboxRect.top,
        bottom: listboxRect.bottom,
        left: listboxRect.left,
        right: listboxRect.right,
        width: listboxRect.width,
        height: listboxRect.height,
      },
      dialog: { top: dialogRect.top, bottom: dialogRect.bottom },
      scroller: { top: scrollerRect.top, bottom: scrollerRect.bottom },
      boundaryTop,
      boundaryBottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      placement: root.getAttribute('data-schedule-select-placement') || '',
      opacity: getComputedStyle(root.querySelector('[data-schedule-select-listbox]')).opacity,
    };
  });

  assert.ok(
    before.roomBelow < geometry.listbox.height + 7,
    `Fixture must leave less room below than the long popup needs; got room=${before.roomBelow}px popup=${geometry.listbox.height}px`,
  );
  assert.ok(geometry.listbox.height >= 4 * 44, `Long group listbox must retain four usable options; got ${geometry.listbox.height}px`);
  assert.equal(geometry.opacity, '1', 'Placement must be measured after the opening transition completes');
  assert.ok(
    geometry.listbox.bottom <= geometry.trigger.top + 2,
    `With insufficient room below, the long popup must use top placement; got ${JSON.stringify(geometry)}`,
  );
  assert.ok(
    geometry.listbox.top >= geometry.boundaryTop - 1
      && geometry.listbox.bottom <= geometry.boundaryBottom + 1,
    `Top-placed popup must remain fully inside the dialog scroll viewport; got ${JSON.stringify(geometry)}`,
  );
  assert.ok(
    geometry.listbox.left >= -1
      && geometry.listbox.right <= geometry.viewportWidth + 1
      && geometry.listbox.top >= -1
      && geometry.listbox.bottom <= geometry.viewportHeight + 1,
    `Top-placed popup must remain fully inside the mobile viewport; got ${JSON.stringify(geometry)}`,
  );
}

async function inspectProtectedOnly(page) {
  for (const pathname of ['/', '/calendar/']) {
    const response = await page.goto(url(pathname, { qa: 'custom-select-public-isolation' }), {
      waitUntil: 'domcontentloaded',
    });
    assert.ok(response && response.status() < 400, `${pathname}: public page must load`);
    await page.locator('body').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator(`${selectors.custom}, ${selectors.trigger}, ${selectors.listbox}`).count(),
      0,
      `${pathname}: protected editor custom controls must not be injected into the public calendar`,
    );
  }
}

async function withPage(browser, viewport, callback, options = {}) {
  const context = await createAuthenticatedContext(browser, viewport, options.reducedMotion || 'reduce');
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await callback(page);
    assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await context.close();
  }
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
      'editor selects are progressively enhanced, styled and mouse-operable without losing form semantics',
      () => withPage(browser, desktop, inspectProgressiveEnhancementAndMouse),
      failures,
    );
    await runCase(
      'custom editor selects support complete keyboard interaction',
      () => withPage(browser, desktop, inspectKeyboardContract),
      failures,
    );
    await runCase(
      'custom editor selects expose correct RU, ET and EN labels',
      () => withPage(browser, desktop, inspectLanguageLabels),
      failures,
    );
    await runCase(
      'custom popup has a perceptible transition',
      () => withPage(browser, desktop, (page) => inspectMotion(page, false), { reducedMotion: 'no-preference' }),
      failures,
    );
    await runCase(
      'custom popup respects reduced-motion preference',
      () => withPage(browser, desktop, (page) => inspectMotion(page, true), { reducedMotion: 'reduce' }),
      failures,
    );
    await runCase(
      'custom selects fit 390px and work by touch',
      () => withPage(browser, mobile, inspectMobileTouch),
      failures,
    );
    await runCase(
      'custom editor controls stay out of public pages',
      () => withPage(browser, desktop, inspectProtectedOnly),
      failures,
    );
  } finally {
    await browser.close();
  }

  if (process.env.SKIP_WEBKIT === '1') {
    console.log('SKIP WebKit mobile long-list placement (SKIP_WEBKIT=1)');
  } else {
    await runCase(
      'WebKit keeps the long mobile group popup above the trigger and inside the dialog',
      async () => {
        const webkitBrowser = await webkit.launch({ headless: true });
        try {
          await withPage(
            webkitBrowser,
            mobile,
            inspectMobileTopPlacement,
            { reducedMotion: 'no-preference' },
          );
        } finally {
          await webkitBrowser.close();
        }
      },
      failures,
    );
  }

  if (failures.length) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      `${failures.length} custom-select requirement(s) failed`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
