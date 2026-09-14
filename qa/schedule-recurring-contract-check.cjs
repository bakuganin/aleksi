const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function holidayByDate(holidays, date) {
  return holidays.find((holiday) => (
    holiday && typeof holiday === 'object'
      ? holiday.date === date || holiday.iso === date || holiday.isoDate === date
      : false
  ));
}

function holidayName(holiday) {
  if (!holiday || typeof holiday !== 'object') return '';
  return String(holiday.name || holiday.label || holiday.title || '').trim();
}

function allowlistEntries(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('!'))
    .map((line) => line.replace(/^!\/?/, '').replace(/\/$/, ''));
}

test('schedule-dates exposes deterministic Tallinn, week, holiday, and occurrence helpers', () => {
  const modulePath = path.join(root, 'schedule-dates.js');
  assert.ok(fs.existsSync(modulePath), 'schedule-dates.js must exist before the multi-week calendar can run');

  delete require.cache[require.resolve(modulePath)];
  const dates = require(modulePath);
  const expectedExports = [
    'getTallinnToday',
    'isoDate',
    'startOfWeek',
    'addDays',
    'weekDates',
    'dateToWeekday',
    'getEstonianPublicHolidays',
    'occurrenceForDate',
  ];

  expectedExports.forEach((name) => {
    assert.equal(typeof dates[name], 'function', `schedule-dates.js must export ${name}()`);
  });

  assert.equal(
    dates.getTallinnToday(new Date('2026-09-13T21:30:00.000Z')),
    '2026-09-14',
    'Tallinn local date must roll over at the Estonia timezone boundary',
  );
  assert.equal(dates.isoDate(new Date(Date.UTC(2026, 8, 14))), '2026-09-14');
  assert.equal(dates.startOfWeek('2026-09-14'), '2026-09-14', 'Monday must start its own week');
  assert.equal(dates.startOfWeek('2026-09-20'), '2026-09-14', 'Sunday must resolve to the preceding Monday');
  assert.equal(dates.addDays('2026-09-14', 7), '2026-09-21', 'next-week navigation must add seven days');
  assert.equal(dates.addDays('2026-09-14', -7), '2026-09-07', 'previous-week navigation must subtract seven days');
  assert.deepEqual(
    dates.weekDates('2026-09-14'),
    [
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ],
    'weekDates() must return the complete Monday-Sunday ISO range',
  );
  assert.equal(dates.dateToWeekday('2026-09-14'), 1, 'Monday must use ISO weekday 1');
  assert.equal(dates.dateToWeekday('2026-09-20'), 7, 'Sunday must use ISO weekday 7');

  const expectedHolidayDates = [
    '2026-02-24',
    '2026-04-03',
    '2026-04-05',
    '2026-05-24',
    '2026-12-24',
    '2026-12-25',
    '2026-12-26',
  ];
  const localizedNamePatterns = {
    ru: /независ/i,
    et: /iseseis/i,
    en: /independence/i,
  };

  Object.entries(localizedNamePatterns).forEach(([language, namePattern]) => {
    const holidays = dates.getEstonianPublicHolidays(2026, language);
    assert.ok(Array.isArray(holidays), `${language}: holidays must be returned as an array`);
    expectedHolidayDates.forEach((date) => {
      const holiday = holidayByDate(holidays, date);
      assert.ok(holiday, `${language}: Estonian public holiday ${date} is missing`);
      assert.ok(holidayName(holiday), `${language}: holiday ${date} needs a localized name`);
    });
    assert.match(
      holidayName(holidayByDate(holidays, '2026-02-24')),
      namePattern,
      `${language}: Independence Day must be localized`,
    );
  });

  const weekly = {
    id: 'weekly-wed-thu',
    recurrence: 'weekly',
    weekdays: [3, 4],
    start: '17:00',
    end: '18:00',
  };
  assert.equal(Boolean(dates.occurrenceForDate(weekly, '2026-09-14')), false, 'weekly session must not render on Monday');
  assert.equal(Boolean(dates.occurrenceForDate(weekly, '2026-09-16')), true, 'weekly session must render on Wednesday');
  assert.equal(Boolean(dates.occurrenceForDate(weekly, '2026-09-17')), true, 'weekly session must render on Thursday');

  const once = {
    id: 'one-off-friday',
    recurrence: 'once',
    date: '2026-09-18',
    start: '12:00',
    end: '13:00',
  };
  assert.equal(Boolean(dates.occurrenceForDate(once, '2026-09-17')), false, 'one-off session must not render before its date');
  assert.equal(Boolean(dates.occurrenceForDate(once, '2026-09-18')), true, 'one-off session must render on its exact date');
});

test('landing exposes the public calendar without revealing the private editor link', () => {
  const html = read('index.html');
  assert.equal(html.includes('data-schedule-editor-link'), false, 'landing must not expose data-schedule-editor-link');
  assert.equal(/href=["']\/schedule\/login\//i.test(html), false, 'landing must not link ordinary visitors to /schedule/login/');
  assert.match(html, /href=["']\/calendar\//i, 'landing must link to the standalone public calendar');
});

test('standalone public calendar page exists', () => {
  const file = path.join(root, 'calendar', 'index.html');
  assert.ok(fs.existsSync(file), 'calendar/index.html must exist');
  assert.match(fs.readFileSync(file, 'utf8'), /data-schedule-calendar-standalone/, 'standalone page needs a stable calendar mount marker');
});

test('editor form contains weekly recurrence and seven weekday controls', () => {
  const html = read(path.join('schedule', 'index.html'));
  assert.match(html, /name=["']repeat-weekly["']/i, 'editor form needs the repeat-weekly control');
  const weekdayCheckboxes = html.match(/<input\b[^>]*type=["']checkbox["'][^>]*name=["']weekdays["'][^>]*>/gi) || [];
  assert.equal(weekdayCheckboxes.length, 7, 'editor form needs one weekdays checkbox for every day from Monday to Sunday');
});

test('release builder and both audited allowlists include calendar assets', () => {
  const requiredFiles = ['schedule-dates.js', 'calendar/index.html'];
  const gitAllowlist = allowlistEntries(read('.gitignore'));
  const vercelAllowlist = allowlistEntries(read('.vercelignore'));

  requiredFiles.forEach((file) => {
    assert.ok(gitAllowlist.includes(file), `.gitignore publish allowlist must include ${file}`);
    assert.ok(vercelAllowlist.includes(file), `.vercelignore publish allowlist must include ${file}`);
  });

  const builder = read(path.join('qa', 'prepare-release.cjs'));
  requiredFiles.forEach((file) => {
    assert.ok(builder.includes(file), `release builder must include ${file}`);
  });
  assert.match(builder, /calendar["']?\s*,?\s*["']?et/i, 'release builder must create the Estonian calendar route');
  assert.match(builder, /calendar["']?\s*,?\s*["']?en/i, 'release builder must create the English calendar route');
});
