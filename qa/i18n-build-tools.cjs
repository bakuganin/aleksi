const assert = require('node:assert/strict');

const SITE_ORIGIN = 'https://aleksi1.ee';
const LANGUAGE_PATHS = Object.freeze({ ru: '/', et: '/et/', en: '/en/' });
const LANGUAGE_LOCALES = Object.freeze({ ru: 'ru_EE', et: 'et_EE', en: 'en_EE' });
const WHATSAPP_PREFILLS = Object.freeze({
  hall_question: 'whatsapp.prefill.equipment',
  location_whatsapp: 'whatsapp.prefill.location',
  faq_whatsapp: 'whatsapp.prefill.faq',
});

const collapseWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const decodeBasicEntities = (value) => String(value)
  .replace(/&nbsp;/gi, '\u00a0')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const escapeText = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeAttribute = (value, quote) => escapeText(value)
  .replace(quote === '"' ? /"/g : /'/g, quote === '"' ? '&quot;' : '&#39;');

const readPageConfig = (html) => {
  const match = html.match(/<script\s+id=["']site-i18n-page["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  const candidate = JSON.parse(match[1]);
  assert.ok(candidate && typeof candidate === 'object' && !Array.isArray(candidate), 'Invalid page i18n config');
  return candidate;
};

const normalisePagePath = (value, fallback) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
  const parsed = new URL(value, SITE_ORIGIN);
  assert.equal(parsed.origin, SITE_ORIGIN, `Page language path must stay on ${SITE_ORIGIN}`);
  assert.equal(parsed.search, '', 'Page language path cannot contain a query');
  assert.equal(parsed.hash, '', 'Page language path cannot contain a hash');
  return parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
};

const pageLanguagePaths = (config) => Object.fromEntries(
  Object.entries(LANGUAGE_PATHS).map(([code, fallback]) => [
    code,
    normalisePagePath(config?.paths?.[code], fallback),
  ]),
);

const pageMeta = (pack, config) => ({
  ...pack.meta,
  ...(config?.meta?.[pack.code] || {}),
});

const lookupTranslation = (value, strings) => {
  const key = collapseWhitespace(decodeBasicEntities(value));
  return Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : null;
};

const translateTextChunk = (chunk, strings) => {
  const translated = lookupTranslation(chunk, strings);
  if (translated === null) return chunk;
  const leading = chunk.match(/^\s*/)?.[0] || '';
  const trailing = chunk.match(/\s*$/)?.[0] || '';
  return `${leading}${escapeText(translated)}${trailing}`;
};

const translateTagAttributes = (tag, strings) => tag.replace(
  /\b(alt|aria-label|aria-description|title|placeholder)=(['"])([\s\S]*?)\2/gi,
  (match, name, quote, value) => {
    const translated = lookupTranslation(value, strings);
    return translated === null ? match : `${name}=${quote}${escapeAttribute(translated, quote)}${quote}`;
  },
);

const translateDocumentContent = (html, strings) => {
  const protectedOrTag = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<[^>]+>/gi;
  let output = '';
  let cursor = 0;
  let match;

  while ((match = protectedOrTag.exec(html))) {
    output += translateTextChunk(html.slice(cursor, match.index), strings);
    const token = match[0];
    output += /^<(?:script|style|svg)\b|^<!--/i.test(token)
      ? token
      : translateTagAttributes(token, strings);
    cursor = match.index + token.length;
  }

  output += translateTextChunk(html.slice(cursor), strings);
  return output;
};

const replaceMeta = (html, selector, value) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(<meta\\s+[^>]*(?:name|property)=["']${escapedSelector}["'][^>]*content=["'])([^"']*)(["'][^>]*>)`, 'i');
  assert.match(html, pattern, `Missing meta tag: ${selector}`);
  return html.replace(pattern, (_, before, current, after) => `${before}${escapeAttribute(value, '"')}${after}`);
};

const replaceLinkHref = (html, relation, href) => {
  const pattern = new RegExp(`(<link\\s+[^>]*rel=["']${relation}["'][^>]*href=["'])([^"']*)(["'][^>]*>)`, 'i');
  assert.match(html, pattern, `Missing link rel=${relation}`);
  return html.replace(pattern, (_, before, current, after) => `${before}${href}${after}`);
};

const localizeJsonLd = (html, pack, canonicalUrl) => html.replace(
  /(<script\s+type=["']application\/ld\+json["']>)([\s\S]*?)(<\/script>)/i,
  (match, before, json, after) => {
    const data = JSON.parse(json);
    data['@id'] = `${SITE_ORIGIN}/#sports-club`;
    data.url = canonicalUrl;
    data.inLanguage = pack.code;
    data.name = pack.meta.schemaName;
    data.description = pack.meta.schemaDescription;
    return `${before}\n      ${JSON.stringify(data, null, 2).replace(/\n/g, '\n      ')}\n    ${after}`;
  },
);

const updateLanguageSwitches = (html, currentLanguage, paths = LANGUAGE_PATHS) => {
  const localizedLinks = html.replace(
    /<a\b[^>]*\bdata-language-switch(?:\s|=)[^>]*>/gi,
    (tag) => {
      const language = tag.match(/\bdata-language=(['"])(ru|et|en)\1/i)?.[2]?.toLowerCase();
      const cleanTag = tag
        .replace(/\s+aria-current=(['"])[^'"]*\1/gi, '')
        .replace(/\bhref=(['"])[^'"]*\1/i, (href, quote) => `href=${quote}${paths[language] || '/'}${quote}`);
      return language === currentLanguage
        ? cleanTag.replace(/>$/, ' aria-current="page">')
        : cleanTag;
    },
  );

  return localizedLinks.replace(/<(?:nav|div)\b[^>]*>/gi, (tag) => {
    const className = tag.match(/\bclass=(['"])([^'"]*)\1/i)?.[2] || '';
    if (!/(?:^|\s)language-switcher(?:\s|$)/.test(className)) return tag;

    return tag
      .replace(/\s+data-active-language=(['"])[^'"]*\1/gi, '')
      .replace(/>$/, ` data-active-language="${currentLanguage}">`);
  });
};

const localizeWhatsappPrefills = (html, pack) => html.replace(
  /<a\b[^>]*\bdata-cta=(['"])(hall_question|location_whatsapp|faq_whatsapp)\1[^>]*>/gi,
  (tag, quote, cta) => {
    const message = pack.dynamic[WHATSAPP_PREFILLS[cta]];
    assert.equal(typeof message, 'string', `Missing ${pack.code}.${WHATSAPP_PREFILLS[cta]}`);
    return tag.replace(
      /\bhref=(['"])[^'"]*\1/i,
      (href, hrefQuote) => `href=${hrefQuote}https://wa.me/37255554649?text=${encodeURIComponent(message)}${hrefQuote}`,
    );
  },
);

const rootifyPublicResources = (html) => html
  .replace(/\b(src|poster|href)=(['"])(?!\/|#|[a-z][a-z\d+.-]*:)((?:assets\/|styles\.css|groups-layout\.css|signup-modal\.css|cta-controls\.css|hero-mobile\.css|hero-desktop\.css|i18n\.js|script\.js)[^'"]*)\2/gi,
    (_, attribute, quote, value) => `${attribute}=${quote}/${value}${quote}`)
  .replace(/\bsrcset=(['"])(?!\/|[a-z][a-z\d+.-]*:)(assets\/[^'"]*)\1/gi,
    (_, quote, value) => `srcset=${quote}/${value}${quote}`);

const injectPack = (html, pack) => {
  const pattern = /(<script\s+id=["']site-i18n-pack["']\s+type=["']application\/json["']>)[\s\S]*?(<\/script>)/i;
  assert.match(html, pattern, 'Missing inline i18n pack');
  const serialized = JSON.stringify(pack).replace(/</g, '\\u003c');
  return html.replace(pattern, `$1${serialized}$2`);
};

const validatePack = (pack, expectedCode) => {
  assert.equal(pack.code, expectedCode);
  assert.equal(pack.path, LANGUAGE_PATHS[expectedCode]);
  assert.equal(pack.locale, LANGUAGE_LOCALES[expectedCode]);
  assert.ok(pack.meta && pack.strings && pack.dynamic);
  for (const key of ['title', 'description', 'ogTitle', 'ogDescription', 'schemaName', 'schemaDescription']) {
    assert.equal(typeof pack.meta[key], 'string', `${expectedCode}.meta.${key}`);
    assert.ok(pack.meta[key].trim(), `${expectedCode}.meta.${key} must not be empty`);
  }
  return pack;
};

const localizeHtml = (source, pack) => {
  validatePack(pack, pack.code);
  const config = readPageConfig(source);
  const paths = pageLanguagePaths(config);
  const meta = pageMeta(pack, config);
  const pagePack = { ...pack, path: paths[pack.code], meta };
  const canonicalUrl = `${SITE_ORIGIN}${paths[pack.code]}`;
  let html = translateDocumentContent(source, pack.strings);
  html = html.replace(/(<html\b[^>]*\blang=)["'][^"']+["']/i, `$1"${pack.code}"`);
  html = html.replace(
    /(<html\b[^>]*\bdata-schedule-language=)["'][^"']+["']/i,
    `$1"${pack.code}"`,
  );
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeText(meta.title)}</title>`);
  html = replaceMeta(html, 'description', meta.description);
  html = replaceMeta(html, 'og:title', meta.ogTitle || meta.title);
  html = replaceMeta(html, 'og:description', meta.ogDescription || meta.description);
  html = replaceMeta(html, 'og:url', canonicalUrl);
  html = replaceMeta(html, 'og:locale', pack.locale);
  html = replaceLinkHref(html, 'canonical', canonicalUrl);

  const alternateLocales = Object.entries(LANGUAGE_LOCALES)
    .filter(([code]) => code !== pack.code)
    .map(([, locale]) => `    <meta property="og:locale:alternate" content="${locale}">`)
    .join('\n');
  html = html.replace(/\s*<meta\s+property=["']og:locale:alternate["'][^>]*>/gi, '');
  html = html.replace(
    /(<meta\s+property=["']og:locale["'][^>]*>)/i,
    `$1\n${alternateLocales}`,
  );

  if (!config || config.structuredData !== false) html = localizeJsonLd(html, pagePack, canonicalUrl);
  html = localizeWhatsappPrefills(html, pack);
  html = updateLanguageSwitches(html, pack.code, paths);
  html = injectPack(html, pagePack);
  if (pack.code !== 'ru') html = rootifyPublicResources(html);
  return html;
};

module.exports = {
  LANGUAGE_LOCALES,
  LANGUAGE_PATHS,
  SITE_ORIGIN,
  collapseWhitespace,
  localizeHtml,
  localizeWhatsappPrefills,
  rootifyPublicResources,
  updateLanguageSwitches,
  validatePack,
};
