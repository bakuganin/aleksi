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
  calendar: '[data-schedule-calendar]',
  palette: '[data-schedule-palette]',
  paletteCreate: '[data-schedule-palette-create]',
  paletteCard: '[data-schedule-palette-card][data-template-id]',
  paletteSelect: '[data-schedule-palette-select]',
  paletteInstructions: '[data-schedule-palette-instructions]',
  paletteEdit: '[data-schedule-palette-edit]',
  paletteDelete: '[data-schedule-palette-delete]',
  sessionCreate: '[data-calendar-create]',
  sessionDialog: 'dialog[data-schedule-session-dialog]',
  form: '[data-schedule-form]',
  formHeading: '[data-schedule-form-heading]',
  formSubtitle: '[data-schedule-form-subtitle]',
  sessionOnly: '[data-schedule-session-only]',
  placementHidden: '[data-schedule-placement-hidden]',
  save: '[data-schedule-save]',
  saveIcon: '[data-schedule-save] .schedule-primary__icon svg',
  closeSession: '[data-schedule-close-session]',
  manageOpen: '[data-schedule-open-manage]',
  manageDialog: 'dialog[data-schedule-manage-dialog]',
  manageClose: '[data-schedule-close-manage]',
  editorList: '[data-schedule-editor-list]',
  filterSillamae: '[data-schedule-filter="sillamae"]',
  filterNarva: '[data-schedule-filter="narva"]',
});

const languageLabels = Object.freeze({
  ru: 'Управление расписанием',
  et: 'Halda tunniplaani',
  en: 'Manage schedule',
});

const scheduledTemplateFields = Object.freeze([
  'start',
  'end',
  'date',
  'starts-on',
  'ends-on',
  'weekday',
  'repeat-weekly',
  'weekdays',
  'status',
]);

const absoluteTimePattern = /\b(?:[01]\d|2[0-3]):[0-5]\d\b/;

function url(pathname, query = {}) {
  const target = new URL(pathname, `${siteOrigin}/`);
  Object.entries(query).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  return target.href;
}

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function createAuthenticatedContext(browser, viewport) {
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
      localStorage.setItem('aleksi.schedule.ui.v1', JSON.stringify({
        mode: 'schedule',
        filterVenue: 'all',
        language: 'ru',
      }));
    } catch {
      // Assertions below expose storage failures.
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

async function waitForSchedule(page, label) {
  const response = await page.goto(url('/schedule/', { qa: `template-flow-${label}` }), {
    waitUntil: 'domcontentloaded',
  });
  assert.ok(response && response.status() < 400, `${label}: protected schedule must load`);
  assert.equal(new URL(page.url()).pathname, '/schedule/', `${label}: authenticated editor must not redirect`);
  await page.locator(selectors.app).waitFor({ state: 'visible' });
  await page.waitForFunction((appSelector) => (
    document.querySelector(appSelector)?.getAttribute('data-schedule-ready') === 'true'
  ), selectors.app);
  await page.waitForFunction((calendarSelector) => {
    const calendar = document.querySelector(calendarSelector);
    return calendar?.getAttribute('data-schedule-calendar-mounted') === 'true'
      && calendar.querySelectorAll('[data-calendar-day]').length === 7;
  }, selectors.calendar);
  await page.locator(selectors.palette).waitFor({ state: 'visible' });
}

async function collections(page) {
  return page.evaluate(() => ({
    templates: window.DzhikaevaSchedule.getTemplates(),
    sessions: window.DzhikaevaSchedule.getSessions(),
  }));
}

function templateByTitle(state, title) {
  return state.templates.find((item) => item.title?.ru === title) || null;
}

function sessionByTitle(state, title) {
  return state.sessions.find((item) => item.title?.ru === title) || null;
}

async function switchLanguage(page, language) {
  const html = page.locator('html');
  if (await html.getAttribute('lang') === language) return;
  await page.locator(`[data-schedule-language-switch][data-language="${language}"]`).click();
  await page.waitForFunction((code) => document.documentElement.lang === code, language);
}

async function assertManageTrigger(page, language, viewportLabel) {
  const expected = languageLabels[language];
  const trigger = page.locator(selectors.manageOpen);
  assert.equal(await trigger.count(), 1, `${viewportLabel} ${language}: one management opener is required`);
  await trigger.scrollIntoViewIfNeeded();
  assert.equal(await trigger.isVisible(), true, `${viewportLabel} ${language}: management opener must be visible`);
  assert.equal(
    collapse(await trigger.innerText()).toLocaleLowerCase(language === 'et' ? 'et-EE' : language === 'en' ? 'en-GB' : 'ru-RU'),
    expected.toLocaleLowerCase(language === 'et' ? 'et-EE' : language === 'en' ? 'en-GB' : 'ru-RU'),
    `${viewportLabel} ${language}: management opener needs a visible localized label`,
  );
  assert.equal(await trigger.getAttribute('aria-label'), expected, `${viewportLabel} ${language}: visible and accessible labels must agree`);

  const geometry = await trigger.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const label = node.querySelector('span');
    const labelRect = label?.getBoundingClientRect();
    const labelStyle = label ? getComputedStyle(label) : null;
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      viewportWidth: innerWidth,
      labelWidth: labelRect?.width || 0,
      labelHeight: labelRect?.height || 0,
      labelScrollWidth: label?.scrollWidth || 0,
      labelClientWidth: label?.clientWidth || 0,
      labelDisplay: labelStyle?.display || 'none',
      labelVisibility: labelStyle?.visibility || 'hidden',
      labelOpacity: Number(labelStyle?.opacity || 0),
    };
  });
  assert.ok(geometry.height >= 44, `${viewportLabel} ${language}: management opener needs a 44px touch target; got ${geometry.height}px`);
  assert.ok(geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1, `${viewportLabel} ${language}: management opener must fit the viewport`);
  assert.ok(geometry.labelWidth > 0 && geometry.labelHeight > 0, `${viewportLabel} ${language}: management text needs a measurable visible box`);
  assert.notEqual(geometry.labelDisplay, 'none', `${viewportLabel} ${language}: management text must not be display:none`);
  assert.notEqual(geometry.labelVisibility, 'hidden', `${viewportLabel} ${language}: management text must not be hidden`);
  assert.ok(geometry.labelOpacity > 0, `${viewportLabel} ${language}: management text must be opaque enough to see`);
  assert.ok(
    geometry.labelScrollWidth <= geometry.labelClientWidth + 3,
    `${viewportLabel} ${language}: management label must not be clipped (${geometry.labelScrollWidth}px > ${geometry.labelClientWidth}px)`,
  );
}

async function assertRedundantHeroRemoved(page, viewportLabel) {
  assert.equal(await page.locator('.schedule-hero').count(), 0, `${viewportLabel}: redundant schedule hero must be removed`);
  assert.equal(await page.locator('[data-schedule-install]').count(), 0, `${viewportLabel}: redundant in-page install button must be removed`);
  const widths = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  assert.ok(widths.html <= widths.viewport + 1, `${viewportLabel}: schedule page must not overflow horizontally`);
}

async function assertShell(page, viewportLabel) {
  await assertRedundantHeroRemoved(page, viewportLabel);
  for (const language of ['ru', 'et', 'en']) {
    await switchLanguage(page, language);
    await assertManageTrigger(page, language, viewportLabel);
  }
  await switchLanguage(page, 'ru');
  const sessionCreateCopy = collapse(await page.locator(selectors.sessionCreate).innerText());
  const templateCreateCopy = collapse(await page.locator(selectors.paletteCreate).innerText());
  assert.match(sessionCreateCopy, /занят/i, `${viewportLabel}: primary create action must describe a scheduled session`);
  assert.match(templateCreateCopy, /шаблон/i, `${viewportLabel}: reusable-card action must identify a template`);
  assert.notEqual(sessionCreateCopy, templateCreateCopy, `${viewportLabel}: session and template creation need distinct labels`);
  const venueFilters = page.locator('[data-schedule-filter]');
  assert.equal(await venueFilters.count(), 2, `${viewportLabel}: only Sillamäe and Narva filters should remain`);
  assert.equal(await page.locator('[data-schedule-filter="all"]').count(), 0, `${viewportLabel}: all filter must be absent`);
  assert.deepEqual(
    (await venueFilters.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-schedule-filter')))).sort(),
    ['narva', 'sillamae'],
    `${viewportLabel}: venue filter values mismatch`,
  );
  assert.equal(
    await page.locator('[data-schedule-active-filter]').first().getAttribute('data-schedule-active-filter'),
    'sillamae',
    `${viewportLabel}: legacy all preference must normalize to Sillamäe`,
  );
}

async function assertTemplateMode(dialog, label) {
  const form = dialog.locator(selectors.form);
  assert.equal(await dialog.getAttribute('data-schedule-form-mode'), 'template', `${label}: dialog must declare template mode`);
  assert.equal(await form.getAttribute('data-schedule-form-mode'), 'template', `${label}: form must declare template mode`);
  const hint = dialog.locator('.schedule-template-hint');
  assert.equal(await hint.isVisible(), true, `${label}: template mode needs a visible explanation`);
  assert.ok(collapse(await hint.innerText()).length >= 40, `${label}: template explanation must be informative`);

  const sessionOnly = dialog.locator(selectors.sessionOnly);
  assert.ok(await sessionOnly.count() >= 3, `${label}: schedule-only fields need stable wrappers`);
  for (let index = 0; index < await sessionOnly.count(); index += 1) {
    const wrapper = sessionOnly.nth(index);
    assert.equal(await wrapper.isHidden(), true, `${label}: schedule-only wrapper ${index + 1} must be hidden`);
    const controls = wrapper.locator('input, select, textarea, button');
    for (let controlIndex = 0; controlIndex < await controls.count(); controlIndex += 1) {
      assert.equal(await controls.nth(controlIndex).isDisabled(), true, `${label}: hidden schedule control must be disabled`);
    }
  }

  for (const name of scheduledTemplateFields) {
    const controls = form.locator(`[name="${name}"]`);
    assert.ok(await controls.count() >= 1, `${label}: shared form must retain ${name} for session mode`);
    for (let index = 0; index < await controls.count(); index += 1) {
      assert.equal(await controls.nth(index).isDisabled(), true, `${label}: ${name} must be disabled while editing a template`);
    }
  }

  for (const name of ['venue', 'group-preset', 'template-duration', 'title-ru', 'audience-ru']) {
    const control = form.locator(`[name="${name}"]`);
    assert.equal(await control.count(), 1, `${label}: template form needs ${name}`);
    assert.equal(await control.isDisabled(), false, `${label}: template field ${name} must remain enabled`);
    if (['venue', 'group-preset', 'template-duration'].includes(name)) {
      assert.equal(await control.isVisible(), true, `${label}: primary template field ${name} must remain visible`);
    }
  }
  return form;
}

async function assertSessionPlacementMode(dialog, expected) {
  const form = dialog.locator(selectors.form);
  assert.equal(await dialog.getAttribute('data-schedule-form-mode'), 'template-placement', 'Dropped template must open streamlined placement mode');
  assert.equal(await form.getAttribute('data-schedule-form-mode'), 'template-placement', 'Dropped template must keep the form in streamlined placement mode');
  const placementHeading = dialog.locator(selectors.formHeading);
  assert.equal(collapse(await placementHeading.innerText()), expected.title, 'Placement heading must identify the selected template immediately');
  assert.equal(await placementHeading.getAttribute('aria-label'), `Добавить в расписание: ${expected.title}`, 'Placement heading needs a meaningful accessible action label');
  const placementIcon = await placementHeading.evaluate((node) => {
    const style = getComputedStyle(node, '::before');
    return {
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      radius: style.borderRadius,
      background: style.backgroundImage,
    };
  });
  assert.ok(placementIcon.width >= 32 && placementIcon.height >= 32, 'Placement heading needs a visible add icon');
  assert.match(placementIcon.radius, /999px|50%/, 'Placement add icon must be circular');
  assert.match(placementIcon.background, /linear-gradient/, 'Placement add icon must draw a plus instead of plain text');
  assert.equal(collapse(await dialog.locator(selectors.formSubtitle).textContent()), `Группа · ${expected.audience}`, 'Placement heading must show the preconfigured group beneath the title');
  assert.equal(await dialog.getAttribute('aria-describedby'), 'schedule-form-dialog-subtitle', 'Placement dialog must expose its group subtitle to assistive technology');

  for (const selector of ['[name="start"]', '[name="end"]', '[data-schedule-recurrence]']) {
    const control = form.locator(selector);
    assert.equal(await control.count(), 1, `Placement form needs ${selector}`);
    assert.equal(await control.isVisible(), true, `Placement form must show ${selector}`);
  }
  for (const name of ['start', 'end', 'repeat-weekly', 'venue']) {
    assert.equal(await form.locator(`[name="${name}"]`).isDisabled(), false, `Placement control ${name} must be editable`);
  }

  const placementHidden = form.locator(selectors.placementHidden);
  assert.ok(await placementHidden.count() >= 3, 'Placement flow needs stable wrappers for preconfigured template fields');
  for (let index = 0; index < await placementHidden.count(); index += 1) {
    const wrapper = placementHidden.nth(index);
    assert.equal(await wrapper.isHidden(), true, `Preconfigured placement wrapper ${index + 1} must be hidden`);
    const controls = wrapper.locator('input, select, textarea, button');
    for (let controlIndex = 0; controlIndex < await controls.count(); controlIndex += 1) {
      assert.equal(await controls.nth(controlIndex).isDisabled(), true, 'Hidden preconfigured template controls must be disabled');
    }
  }
  assert.equal(await form.locator('[name="status"]').isDisabled(), true, 'New template placement must keep its active status implicit');
  assert.equal(await form.locator('[name="group-preset"]').isHidden(), true, 'Placement must not ask for a ready-made group again');
  assert.equal(await form.locator('[data-schedule-language-details]').isHidden(), true, 'Placement must not expose language text editing');
  assert.equal(await form.locator(selectors.saveIcon).isVisible(), true, 'Placement confirmation must use the calendar-add icon');
  assert.equal((await form.locator(selectors.save).innerText()).includes('→'), false, 'Placement confirmation must not fall back to a text arrow');

  assert.equal(await form.locator('[name="date"]').inputValue(), expected.date, 'Placement must preserve the tapped date');
  assert.equal(await form.locator('[name="start"]').inputValue(), expected.start, 'Placement must preserve the exact 15-minute slot');
  assert.equal(await form.locator('[name="end"]').inputValue(), expected.end, 'Placement must propose an editable end from template duration');
  assert.equal(await form.locator('[name="repeat-weekly"]').isChecked(), false, 'A concrete placement should start as a one-off session');
  assert.equal(await form.locator('[name="title-ru"]').inputValue(), expected.title, 'Placement must inherit template title');
  assert.equal(await form.locator('[name="venue"]').inputValue(), expected.venue, 'Placement must inherit template venue');
  return form;
}

async function fillCustomTemplate(form, title, audience, venue) {
  await form.locator('[name="group-preset"]').selectOption('custom');
  const details = form.locator('[data-schedule-language-details]');
  if (!await details.evaluate((node) => node.open)) await details.locator('summary').click();
  await form.locator('[name="venue"]').selectOption(venue);
  for (const language of ['ru', 'et', 'en']) {
    await form.locator(`[name="title-${language}"]`).fill(`${title} ${language.toUpperCase()}`);
    await form.locator(`[name="audience-${language}"]`).fill(`${audience} ${language.toUpperCase()}`);
  }
}

async function inspectTemplateLifecycleAndPlacement(page) {
  await assertShell(page, 'Chromium desktop', 440);
  const marker = `QA TEMPLATE ${Date.now()}`;
  const createdTitle = `${marker} RU`;
  const editedMarker = `${marker} EDITED`;
  const editedTitle = `${editedMarker} RU`;
  const audience = 'QA AUDIENCE';
  const initial = await collections(page);

  const create = page.locator(selectors.paletteCreate);
  assert.equal(await create.count(), 1, 'Template palette needs one visible New card control');
  const dialog = page.locator(selectors.sessionDialog);

  await page.locator(selectors.filterNarva).click();
  await create.click();
  await dialog.waitFor({ state: 'visible' });
  let form = await assertTemplateMode(dialog, 'Narva-filtered new template');
  assert.equal(await form.locator('[name="venue"]').inputValue(), 'narva', 'New card must inherit the active Narva filter');
  await dialog.locator(selectors.closeSession).click();
  await dialog.waitFor({ state: 'hidden' });

  const directSlot = page.locator('[data-calendar-day="1"] [data-calendar-slot][data-time="09:15"]');
  await directSlot.click({ force: true });
  await dialog.waitFor({ state: 'visible' });
  form = dialog.locator(selectors.form);
  assert.equal(await form.getAttribute('data-schedule-form-mode'), 'session', 'An empty slot must open the direct session flow');
  assert.equal(await form.locator('[name="venue"]').inputValue(), 'narva', 'Direct session creation must inherit the active Narva filter');
  assert.equal(await form.locator('[name="group-preset"]').isVisible(), true, 'Direct session creation must retain the group selector');
  assert.equal(await form.locator('[data-schedule-language-details]').isVisible(), true, 'Direct session creation must retain language text controls');
  await dialog.locator(selectors.closeSession).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator(selectors.filterSillamae).click();

  await create.click();
  await dialog.waitFor({ state: 'visible' });
  form = await assertTemplateMode(dialog, 'new template');
  await fillCustomTemplate(form, marker, audience, 'sillamae');
  await form.locator('[name="template-duration"]').fill('75');
  await form.locator(selectors.save).click();
  await dialog.waitFor({ state: 'hidden' });

  const afterCreate = await collections(page);
  assert.deepEqual(afterCreate.sessions, initial.sessions, 'Saving a reusable card must not create or mutate scheduled sessions');
  assert.equal(afterCreate.templates.length, initial.templates.length + 1, 'Saving a reusable card must add exactly one template');
  const createdTemplate = templateByTitle(afterCreate, createdTitle);
  assert.ok(createdTemplate, 'Saved template must be present in the template collection');
  assert.equal(createdTemplate.durationMinutes, 75, 'Reusable template must persist its editable duration');
  assert.equal(Object.hasOwn(createdTemplate, 'start'), false, 'Reusable template must not store an absolute start time');
  assert.equal(Object.hasOwn(createdTemplate, 'end'), false, 'Reusable template must not store an absolute end time');
  for (const key of ['date', 'weekday', 'weekdays', 'recurrence', 'status']) {
    assert.equal(Object.hasOwn(createdTemplate, key), false, `Reusable template must not contain schedule-only field ${key}`);
  }

  let card = page.locator(`${selectors.paletteCard}[data-template-id="${createdTemplate.id}"]`);
  await card.waitFor({ state: 'visible' });
  const cardText = collapse(await card.innerText());
  const cardControlLabel = await card.locator(selectors.paletteSelect).getAttribute('aria-label');
  assert.equal(absoluteTimePattern.test(cardText), false, `Reusable card must not render HH:MM text: ${cardText}`);
  assert.equal(absoluteTimePattern.test(cardControlLabel || ''), false, `Reusable card accessible name must not contain HH:MM: ${cardControlLabel}`);
  assert.equal(await card.locator('time').count(), 0, 'Reusable card must not render a <time> element');

  const sessionsBeforeEdit = afterCreate.sessions;
  const templateCountBeforeEdit = afterCreate.templates.length;
  await card.locator(selectors.paletteEdit).click();
  await dialog.waitFor({ state: 'visible' });
  form = await assertTemplateMode(dialog, 'edit template');
  assert.equal(await form.locator('[name="title-ru"]').inputValue(), createdTitle, 'Template edit mode must load the selected card');
  await fillCustomTemplate(form, editedMarker, audience, 'narva');
  await form.locator('[name="template-duration"]').fill('45');
  await form.locator(selectors.save).click();
  await dialog.waitFor({ state: 'hidden' });

  const afterEdit = await collections(page);
  assert.deepEqual(afterEdit.sessions, sessionsBeforeEdit, 'Editing a reusable card must not mutate scheduled sessions');
  assert.equal(afterEdit.templates.length, templateCountBeforeEdit, 'Editing a reusable card must not add a duplicate template');
  const editedTemplate = templateByTitle(afterEdit, editedTitle);
  assert.ok(editedTemplate, 'Edited template must remain in the template collection');
  assert.equal(editedTemplate.id, createdTemplate.id, 'Editing a reusable card must preserve template identity');
  assert.equal(editedTemplate.venue, 'narva', 'Template edit must persist non-time fields');
  assert.equal(editedTemplate.durationMinutes, 45, 'Template edit must persist the updated duration');
  assert.equal(Object.hasOwn(editedTemplate, 'start'), false, 'Edited template must remain free of absolute start time');
  assert.equal(Object.hasOwn(editedTemplate, 'end'), false, 'Edited template must remain free of absolute end time');

  await page.locator(selectors.filterNarva).click();
  card = page.locator(`${selectors.paletteCard}[data-template-id="${editedTemplate.id}"]`);
  await card.waitFor({ state: 'visible' });
  assert.equal(absoluteTimePattern.test(collapse(await card.innerText())), false, 'Edited reusable card must remain free of HH:MM text');

  const stateBeforePlacement = await collections(page);
  const templateBeforePlacement = templateByTitle(stateBeforePlacement, editedTitle);
  await card.locator(selectors.paletteSelect).click();
  assert.equal(await card.getAttribute('data-schedule-palette-selected'), 'true', 'Reusable card must visibly select before slot placement');
  assert.equal(
    collapse(await page.locator(selectors.paletteInstructions).innerText()),
    'Шаблон выбран. Теперь нажмите или перетащите на нужное время в календаре.',
    'Selected-template hint must explain both supported placement gestures',
  );

  const slot = page.locator('[data-calendar-day="2"] [data-calendar-slot][data-time="11:45"]');
  assert.equal(await slot.count(), 1, 'Calendar needs one exact Tuesday 11:45 slot');
  const targetDate = await slot.getAttribute('data-date');
  assert.match(targetDate, /^\d{4}-\d{2}-\d{2}$/, 'Placement slot needs a concrete ISO date');
  await slot.click({ force: true });
  await dialog.waitFor({ state: 'visible' });

  const beforeConfirm = await collections(page);
  assert.deepEqual(beforeConfirm.sessions, stateBeforePlacement.sessions, 'Opening placement confirmation must not write a session early');
  assert.deepEqual(beforeConfirm.templates, stateBeforePlacement.templates, 'Opening placement confirmation must not mutate its reusable card');
  form = await assertSessionPlacementMode(dialog, {
    date: targetDate,
    start: '11:45',
    end: '12:30',
    title: editedTitle,
    audience: `${audience} RU`,
    venue: 'narva',
  });

  await form.locator('[name="start"]').fill('11:35');
  await form.locator('[name="end"]').fill('12:20');
  await form.locator('[name="repeat-weekly"]').check();
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const checkbox = form.locator(`[name="weekdays"][value="${weekday}"]`);
    const shouldCheck = weekday === 2 || weekday === 4;
    if (shouldCheck && !await checkbox.isChecked()) await checkbox.check();
    if (!shouldCheck && await checkbox.isChecked()) await checkbox.uncheck();
  }
  await form.locator('[name="starts-on"]').fill(targetDate);
  await form.locator(selectors.save).click();
  await dialog.waitFor({ state: 'hidden' });

  const afterSessionSave = await collections(page);
  assert.equal(afterSessionSave.sessions.length, stateBeforePlacement.sessions.length + 1, 'Confirming placement must create exactly one session record');
  assert.deepEqual(
    afterSessionSave.templates,
    stateBeforePlacement.templates,
    'Confirming a scheduled session must not add, remove, or mutate reusable templates',
  );
  assert.deepEqual(
    templateByTitle(afterSessionSave, editedTitle),
    templateBeforePlacement,
    'Scheduling and editing time/recurrence must not mutate the reusable template',
  );
  const savedSession = sessionByTitle(afterSessionSave, editedTitle);
  assert.ok(savedSession, 'Confirmed placement must persist the template as a scheduled session');
  assert.equal(savedSession.start, '11:35', 'Confirmed session must preserve manually edited start time');
  assert.equal(savedSession.end, '12:20', 'Confirmed session must preserve manually edited end time');
  assert.equal(savedSession.recurrence, 'weekly', 'Confirmed session must preserve recurrence choice');
  assert.deepEqual(savedSession.weekdays, [2, 4], 'Confirmed session must preserve all selected recurrence days');
  assert.equal(savedSession.startsOn, targetDate, 'Confirmed weekly session must start from the selected date');
  assert.equal(savedSession.venue, 'narva', 'Confirmed session must inherit the edited template venue');

  card = page.locator(`${selectors.paletteCard}[data-template-id="${editedTemplate.id}"]`);
  page.once('dialog', (confirmation) => confirmation.accept());
  await card.locator(selectors.paletteDelete).click();
  await card.waitFor({ state: 'detached' });
  const afterTemplateDelete = await collections(page);
  assert.equal(templateByTitle(afterTemplateDelete, editedTitle), null, 'Deleting a reusable card must remove the template');
  assert.deepEqual(afterTemplateDelete.sessions, afterSessionSave.sessions, 'Deleting a reusable card must leave scheduled sessions untouched');
  assert.ok(sessionByTitle(afterTemplateDelete, editedTitle), 'Scheduled session must remain after its source template is deleted');

  const manageTrigger = page.locator(selectors.manageOpen);
  await manageTrigger.click();
  const manageDialog = page.locator(selectors.manageDialog);
  await manageDialog.waitFor({ state: 'visible' });
  const activeItems = manageDialog.locator(`${selectors.editorList} [data-schedule-item]`);
  assert.equal(await activeItems.count(), afterTemplateDelete.sessions.length, 'Management modal must list sessions, not reusable templates');
  assert.equal(
    await activeItems.filter({ hasText: editedTitle }).count(),
    1,
    'Management modal must retain the scheduled session after its source template is deleted',
  );
  await manageDialog.locator(selectors.manageClose).click();
  await manageDialog.waitFor({ state: 'hidden' });
}

async function inspectMobileWebKitSmoke(page) {
  await assertShell(page, 'WebKit mobile', 500);
  const stateBefore = await collections(page);
  const card = page.locator(selectors.paletteCard).first();
  await card.waitFor({ state: 'visible' });
  assert.equal(absoluteTimePattern.test(collapse(await card.innerText())), false, 'WebKit mobile reusable card must not expose HH:MM text');
  assert.equal(await card.locator('time').count(), 0, 'WebKit mobile reusable card must not contain <time>');

  await card.locator(selectors.paletteSelect).tap();
  const target = page.locator('[data-calendar-day="3"] [data-calendar-slot][data-time="14:15"]');
  assert.equal(await target.count(), 1, 'WebKit mobile calendar needs one Wednesday 14:15 slot');
  const expectedDate = await target.getAttribute('data-date');
  await target.scrollIntoViewIfNeeded();
  await target.tap({ force: true });

  const dialog = page.locator(selectors.sessionDialog);
  await dialog.waitFor({ state: 'visible' });
  const form = dialog.locator(selectors.form);
  assert.equal(await dialog.getAttribute('data-schedule-form-mode'), 'template-placement', 'WebKit touch placement must open streamlined placement mode');
  assert.match(collapse(await dialog.locator(selectors.formHeading).innerText()), /^\S/, 'WebKit placement heading must show the template name');
  assert.equal(await dialog.locator(selectors.formHeading).evaluate((node) => node.classList.contains('schedule-form__placement-heading')), true, 'WebKit placement heading must use the circular add icon');
  assert.match(collapse(await dialog.locator(selectors.formSubtitle).textContent()), /^Группа · \S/, 'WebKit placement heading must include the template group');
  assert.equal(await form.locator('[name="group-preset"]').isHidden(), true, 'WebKit placement must hide the redundant group selector');
  assert.equal(await form.locator('[data-schedule-language-details]').isHidden(), true, 'WebKit placement must hide language text editing');
  assert.equal(await form.locator('[name="start"]').inputValue(), '14:15', 'WebKit touch placement must keep the exact 15-minute slot');
  assert.equal(await form.locator('[name="date"]').inputValue(), expectedDate, 'WebKit touch placement must keep the tapped date');
  assert.equal(await form.locator('[name="repeat-weekly"]').isVisible(), true, 'WebKit touch placement must expose recurrence');
  assert.deepEqual(await collections(page), stateBefore, 'WebKit touch placement must not persist before confirmation');
  await dialog.locator(selectors.closeSession).tap();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(await collections(page), stateBefore, 'Cancelling WebKit touch placement must leave both collections unchanged');
}

async function withAuthenticatedPage(browser, viewport, label, callback) {
  const context = await createAuthenticatedContext(browser, viewport);
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await waitForSchedule(page, label);
    await callback(page);
    assert.deepEqual(pageErrors, [], `${label}: unexpected page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const failures = [];
  const run = async (name, callback) => {
    try {
      await callback();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error });
      console.error(`FAIL ${name}`);
      console.error(error instanceof Error ? error.stack : error);
    }
  };

  const chromiumBrowser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  try {
    await run('Chromium template lifecycle, placement confirmation, and management label', () => (
      withAuthenticatedPage(
        chromiumBrowser,
        { width: 1440, height: 900 },
        'chromium-desktop',
        inspectTemplateLifecycleAndPlacement,
      )
    ));
    await run('Chromium mobile management label without redundant hero', () => (
      withAuthenticatedPage(
        chromiumBrowser,
        { width: 390, height: 844, isMobile: true, hasTouch: true },
        'chromium-mobile',
        (page) => assertShell(page, 'Chromium mobile', 500),
      )
    ));
  } finally {
    await chromiumBrowser.close();
  }

  if (process.env.SKIP_WEBKIT !== '1') {
    const webkitBrowser = await webkit.launch({ headless: true });
    try {
      await run('WebKit mobile touch placement keeps templates and sessions separate', () => (
        withAuthenticatedPage(
          webkitBrowser,
          { width: 390, height: 844, isMobile: true, hasTouch: true },
          'webkit-mobile',
          inspectMobileWebKitSmoke,
        )
      ));
    } finally {
      await webkitBrowser.close();
    }
  }

  if (failures.length) {
    const summary = failures.map(({ name, error }) => (
      `- ${name}: ${collapse(error instanceof Error ? error.message : error)}`
    )).join('\n');
    throw new Error(`Schedule template-flow E2E contract is RED (${failures.length} failure(s)):\n${summary}`);
  }

  console.log('Schedule template-flow E2E contract passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
