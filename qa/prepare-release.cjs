// Assemble only audited public files. Legal drafts stay local until confirmed.
//
//   node qa/prepare-release.cjs             a complete project in qa/release-*/ for `vercel deploy`
//   node qa/prepare-release.cjs --out dist  only the public static files in dist/. Vercel runs this
//                                           on every deploy (vercel.json) and builds api/ and
//                                           middleware.js from the repository root itself.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { localizeHtml, validatePack } = require('./i18n-build-tools.cjs');
const root = path.resolve(__dirname, '..');
const outArgument = process.argv.indexOf('--out');
const staticOut = outArgument === -1 ? null : process.argv[outArgument + 1];
assert.ok(outArgument === -1 || staticOut, 'Usage: node qa/prepare-release.cjs [--out <folder>]');
const drafts = new Set(['privacy.html', 'cookies.html', 'legal.css']);
// The build itself is never published; server code only goes into a complete project.
const buildTooling = (file) => file.startsWith('qa/') || file === '.vercelignore';
const serverSide = (file) =>
  /^(api|server)\//.test(file) || ['middleware.js', 'package.json', 'package-lock.json', 'vercel.json'].includes(file);
const entries = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/)
  .filter(line => line.startsWith('!')).map(line => line.slice(1))
  .filter(file => !drafts.has(file) && fs.statSync(path.join(root, file)).isFile());
assert.ok(
  ['hero-scene.css', 'assets/images/hero-layers/hero-athlete-v3.webp', 'assets/images/hero-layers/hero-athlete-phone-v1.webp']
    .every((file) => entries.includes(file)),
  'Hero scene layers must be published',
);
assert.ok(entries.includes('hero-mobile.css') && entries.includes('hero-desktop.css'));
assert.ok(entries.includes('i18n.js') && entries.includes('robots.txt') && entries.includes('sitemap.xml'));
assert.ok(entries.includes('locales/ru.json') && entries.includes('locales/et.json') && entries.includes('locales/en.json'));
for (const file of [
  'package.json',
  'package-lock.json',
  'middleware.js',
  'schedule.css',
  'calendar-page.css',
  'calendar-page.js',
  'schedule-dates.js',
  'schedule-data.js',
  'schedule-widget.js',
  'schedule-calendar.js',
  'schedule-app.js',
  'schedule-auth.js',
  'schedule-auth.css',
  'schedule/index.html',
  'schedule/login/index.html',
  'schedule/sw.js',
  'schedule/manifest.webmanifest',
  'calendar/index.html',
  'api/auth/login.js',
  'api/auth/session.js',
  'api/auth/logout.js',
  'api/schedule/state.js',
  'server/auth-session.js',
  'server/password.js',
  'server/schedule-schema.js',
  'server/schedule-repository.js',
  'assets/pwa/icon-192.png',
  'assets/pwa/icon-512.png',
  'assets/pwa/icon-maskable-512.png',
  'assets/pwa/apple-touch-icon.png',
]) {
  assert.ok(entries.includes(file), `Schedule PWA file must be published: ${file}`);
}
let destination;
if (staticOut) {
  destination = path.resolve(root, staticOut);
  const inside = path.relative(root, destination);
  assert.ok(inside && !inside.startsWith('..') && !path.isAbsolute(inside), 'The static folder must be inside the repository');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
} else {
  destination = fs.mkdtempSync(path.join(__dirname, 'release-20260903-'));
}
const published = entries.filter((file) => !buildTooling(file) && !(staticOut && serverSide(file)));
for (const file of published) {
  const source = path.resolve(root, file);
  const target = path.resolve(destination, file);
  assert.ok(!path.relative(root, source).startsWith('..') && !path.relative(destination, target).startsWith('..'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
const sourceIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cleanIndex = sourceIndex
  .replace(/\s*<nav class="container site-footer__legal"[^>]*>[\s\S]*?<\/nav>/, '')
  .replace(/\s*<a href="\/(?:privacy|cookies)\.html"[^>]*>[\s\S]*?<\/a>\./g, '');
assert.equal((sourceIndex.match(/href="\/(?:privacy|cookies)\.html"/g) || []).length, 4);
assert.ok(!/href="\/(?:privacy|cookies)\.html"/.test(cleanIndex), 'No links to unpublished drafts');
assert.ok(cleanIndex.includes('При открытии WhatsApp текст анкеты передаётся этому сервису.'));

const packs = Object.fromEntries(['ru', 'et', 'en'].map((code) => {
  const pack = JSON.parse(fs.readFileSync(path.join(root, `locales/${code}.json`), 'utf8'));
  return [code, validatePack(pack, code)];
}));
const dynamicKeys = Object.keys(packs.ru.dynamic).sort();
for (const code of ['et', 'en']) {
  assert.deepEqual(Object.keys(packs[code].dynamic).sort(), dynamicKeys, `${code} dynamic keys must match Russian`);
}

const publicCalendarPaths = Object.freeze({
  ru: '/calendar/',
  et: '/calendar/et/',
  en: '/calendar/en/',
});
const publicHomePaths = Object.freeze({
  ru: '/',
  et: '/et/',
  en: '/en/',
});

for (const [code, pack] of Object.entries(packs)) {
  const target = code === 'ru'
    ? path.join(destination, 'index.html')
    : path.join(destination, code, 'index.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const localizedIndex = localizeHtml(cleanIndex, pack)
    .replace(
      /href="\/calendar\/"(?=\s+data-schedule-page-link)/g,
      `href="${publicCalendarPaths[code]}"`,
    )
    .replace(/\/schedule\/login\/\?lang=(?:ru|et|en)/g, `/schedule/login/?lang=${code}`);
  fs.writeFileSync(target, localizedIndex);
}

const scheduleSource = fs.readFileSync(path.join(root, 'schedule/index.html'), 'utf8');
const scheduleTargets = {
  ru: path.join(destination, 'schedule', 'index.html'),
  et: path.join(destination, 'schedule', 'et', 'index.html'),
  en: path.join(destination, 'schedule', 'en', 'index.html'),
};
for (const [code, target] of Object.entries(scheduleTargets)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, localizeHtml(scheduleSource, packs[code]));
}
const calendarSource = fs.readFileSync(path.join(root, 'calendar/index.html'), 'utf8');
const calendarTargets = {
  ru: path.join(destination, 'calendar', 'index.html'),
  et: path.join(destination, 'calendar', 'et', 'index.html'),
  en: path.join(destination, 'calendar', 'en', 'index.html'),
};
for (const [code, target] of Object.entries(calendarTargets)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const localizedCalendar = localizeHtml(calendarSource, packs[code])
    .replace(
      /href="\/"(?=\s+data-calendar-home-link)/g,
      `href="${publicHomePaths[code]}"`,
    )
    .replace(
      /href="\/#([a-z-]+)"(?=\s+data-calendar-site-link)/g,
      (_match, section) => `href="${publicHomePaths[code]}#${section}"`,
    )
    .replace(
      /href="\/calendar\/"(?=\s+data-schedule-page-link)/g,
      `href="${publicCalendarPaths[code]}"`,
    );
  fs.writeFileSync(target, localizedCalendar);
}
if (!staticOut) {
  // A complete project is deployed as it is: no build step of its own.
  const projectConfig = JSON.parse(fs.readFileSync(path.join(destination, 'vercel.json'), 'utf8'));
  projectConfig.buildCommand = '';
  projectConfig.outputDirectory = '.';
  fs.writeFileSync(path.join(destination, 'vercel.json'), `${JSON.stringify(projectConfig, null, 2)}\n`);
  fs.mkdirSync(path.join(destination, '.vercel'));
  fs.copyFileSync(path.join(root, '.vercel/project.json'), path.join(destination, '.vercel/project.json'));
}
console.log(JSON.stringify({
  destination,
  publicFiles: published.length,
  localizedPages: ['/', '/et/', '/en/', '/calendar/', '/calendar/et/', '/calendar/en/', '/schedule/', '/schedule/et/', '/schedule/en/', '/schedule/login/'],
  excludedDrafts: [...drafts],
}));
