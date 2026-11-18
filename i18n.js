(function () {
  "use strict";

  var DEFAULT_LANGUAGE_PATHS = {
    ru: "/",
    et: "/et/",
    en: "/en/"
  };
  var PAGE_CONFIG = readPageConfig();
  var LANGUAGE_PATHS = resolveLanguagePaths(PAGE_CONFIG && PAGE_CONFIG.paths);
  var LANGUAGE_LOCALES = {
    ru: "ru_EE",
    et: "et_EE",
    en: "en_EE"
  };
  var SITE_ORIGIN = "https://aleksi1.ee";
  var TRANSLATABLE_ATTRIBUTES = ["alt", "aria-label", "aria-description", "title", "placeholder"];
  var WHATSAPP_PREFILLS = [
    {
      selector: '[data-cta="hall_question"]',
      key: "whatsapp.prefill.equipment",
      fallback: "Здравствуйте! Подскажите, пожалуйста, что взять на первую тренировку."
    },
    {
      selector: '[data-cta="location_whatsapp"]',
      key: "whatsapp.prefill.location",
      fallback: "Здравствуйте! Помогите выбрать зал и группу."
    },
    {
      selector: '[data-cta="faq_whatsapp"]',
      key: "whatsapp.prefill.faq",
      fallback: "Здравствуйте! У меня есть вопрос о тренировках."
    }
  ];
  var SKIPPED_TAGS = {
    SCRIPT: true,
    STYLE: true,
    NOSCRIPT: true,
    TEMPLATE: true
  };

  var packCache = Object.create(null);
  var pendingPacks = Object.create(null);
  var packIndexes = new WeakMap();
  var knownSourceKeys = new Map();
  var textKeys = new WeakMap();
  var attributeKeys = new WeakMap();
  var observer = null;
  var observerStarted = false;
  var switchSequence = 0;
  var transitionToken = 0;
  var activeLanguageTransition = null;
  var initialized = false;
  var LANGUAGE_CONCEAL_MS = 110;
  var LANGUAGE_REVEAL_MS = 280;

  var embeddedPack = readEmbeddedPack();
  var routeLanguage = languageFromPath(window.location.pathname);
  var documentLanguage = normaliseLanguage(
    embeddedPack && embeddedPack.code,
    normaliseLanguage(document.documentElement.getAttribute("lang"), routeLanguage)
  );
  var currentPack = embeddedPack || emptyPack(documentLanguage);
  var currentLanguage = documentLanguage;

  rememberPack(currentPack);

  var api = {
    language: currentLanguage,
    t: translateDynamic,
    switchLanguage: switchLanguage,
    ready: null
  };

  window.siteI18n = api;
  api.ready = initialise().catch(function (error) {
    reportError("Could not initialise the language layer", error);
    updateLanguageMetadata(currentPack);
    updateLanguageSwitches(currentLanguage);
    updateWhatsAppPrefills(currentPack);
    startObserver();
    initialized = true;
    return api;
  });

  document.addEventListener("click", handleLanguageClick);
  window.addEventListener("popstate", handlePopState);
  window.addEventListener("pageshow", handlePageShow);

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function readPageConfig() {
    var element = document.getElementById("site-i18n-page");
    if (!element) return null;

    try {
      var candidate = JSON.parse(element.textContent || "");
      return isObject(candidate) ? candidate : null;
    } catch (error) {
      reportError("The page language config is invalid", error);
      return null;
    }
  }

  function normaliseRoutePath(value, fallback) {
    if (typeof value !== "string" || value.charAt(0) !== "/" || value.indexOf("//") === 0) {
      return fallback;
    }

    try {
      var url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin || url.search || url.hash) return fallback;
      return url.pathname.charAt(url.pathname.length - 1) === "/" ? url.pathname : url.pathname + "/";
    } catch (error) {
      return fallback;
    }
  }

  function resolveLanguagePaths(candidate) {
    var paths = {};
    Object.keys(DEFAULT_LANGUAGE_PATHS).forEach(function (language) {
      var configured = isObject(candidate) ? candidate[language] : null;
      paths[language] = normaliseRoutePath(configured, DEFAULT_LANGUAGE_PATHS[language]);
    });
    return paths;
  }

  function normaliseLanguage(value, fallback) {
    var language = String(value || "").toLowerCase().split(/[-_]/)[0];
    if (hasOwn(LANGUAGE_PATHS, language)) return language;
    return typeof fallback === "string" ? fallback : "ru";
  }

  function languageFromPath(pathname) {
    var path = String(pathname || "/");
    var languages = Object.keys(LANGUAGE_PATHS).sort(function (left, right) {
      return LANGUAGE_PATHS[right].length - LANGUAGE_PATHS[left].length;
    });

    for (var index = 0; index < languages.length; index += 1) {
      var language = languages[index];
      var route = LANGUAGE_PATHS[language];
      if (route === "/") continue;
      var routeWithoutSlash = route.replace(/\/$/, "");
      if (path === routeWithoutSlash || path.indexOf(route) === 0) return language;
    }

    return normaliseLanguage(PAGE_CONFIG && PAGE_CONFIG.defaultLanguage, "ru");
  }

  function emptyPack(language) {
    var code = normaliseLanguage(language, "ru");
    return {
      code: code,
      locale: code + "_EE",
      path: LANGUAGE_PATHS[code],
      meta: {},
      strings: {},
      dynamic: {}
    };
  }

  function readEmbeddedPack() {
    var element = document.getElementById("site-i18n-pack");
    if (!element) return null;

    try {
      return validatePack(JSON.parse(element.textContent || ""));
    } catch (error) {
      reportError("The embedded language pack is invalid", error);
      return null;
    }
  }

  function validatePack(candidate, expectedLanguage) {
    if (!isObject(candidate)) throw new Error("Language pack must be an object");

    var code = normaliseLanguage(candidate.code, "");
    if (!code || (expectedLanguage && code !== expectedLanguage)) {
      throw new Error("Unexpected language pack code");
    }

    return {
      code: code,
      locale: typeof candidate.locale === "string" ? candidate.locale : code + "_EE",
      path: LANGUAGE_PATHS[code],
      meta: isObject(candidate.meta) ? candidate.meta : {},
      strings: isObject(candidate.strings) ? candidate.strings : {},
      dynamic: isObject(candidate.dynamic) ? candidate.dynamic : {}
    };
  }

  function isCompletePack(pack) {
    return Boolean(
      pack &&
        isObject(pack.meta) &&
        typeof pack.meta.title === "string" &&
        typeof pack.meta.description === "string"
    );
  }

  function rememberPack(pack) {
    if (!pack || !hasOwn(LANGUAGE_PATHS, pack.code)) return;
    packCache[pack.code] = pack;

    var strings = pack.strings || {};
    Object.keys(strings).forEach(function (source) {
      var normalisedSource = normaliseText(source);
      if (normalisedSource && !knownSourceKeys.has(normalisedSource)) {
        knownSourceKeys.set(normalisedSource, source);
      }
    });
  }

  function loadPack(language) {
    var code = normaliseLanguage(language, "");
    if (!code) return Promise.reject(new Error("Unsupported language"));

    if (packCache[code] && isCompletePack(packCache[code])) {
      return Promise.resolve(packCache[code]);
    }
    if (pendingPacks[code]) return pendingPacks[code];
    if (typeof window.fetch !== "function") {
      return Promise.reject(new Error("This browser cannot load language packs"));
    }

    pendingPacks[code] = window
      .fetch("/locales/" + code + ".json", {
        credentials: "same-origin",
        cache: "no-cache",
        headers: { Accept: "application/json" }
      })
      .then(function (response) {
        if (!response.ok) throw new Error("Language pack request failed: " + response.status);
        return response.json();
      })
      .then(function (candidate) {
        var pack = validatePack(candidate, code);
        if (!isCompletePack(pack)) throw new Error("Language pack metadata is incomplete");
        rememberPack(pack);
        return pack;
      })
      .finally(function () {
        delete pendingPacks[code];
      });

    return pendingPacks[code];
  }

  function initialise() {
    var desiredLanguage = routeLanguage;
    var packPromise;

    if (currentPack.code === desiredLanguage && isCompletePack(currentPack)) {
      packPromise = Promise.resolve(currentPack);
    } else {
      packPromise = loadPack(desiredLanguage).catch(function (error) {
        if (currentPack.code === desiredLanguage) return currentPack;
        throw error;
      });
    }

    return packPromise.then(function (desiredPack) {
      var previousLanguage = currentLanguage;
      applyTranslations(currentPack, desiredPack);
      currentPack = desiredPack;
      currentLanguage = desiredPack.code;
      api.language = currentLanguage;
      updateLanguageMetadata(desiredPack);
      updateLanguageSwitches(currentLanguage);
      updateWhatsAppPrefills(desiredPack);
      startObserver();
      initialized = true;

      if (previousLanguage !== currentLanguage) {
        dispatchLanguageChange(currentLanguage, previousLanguage);
      }

      return api;
    });
  }

  function switchLanguage(language, options) {
    var code = normaliseLanguage(language, "");
    if (!code) return Promise.reject(new Error("Unsupported language"));

    if (!initialized) {
      return api.ready.then(function () {
        return performLanguageSwitch(code, options);
      });
    }

    return performLanguageSwitch(code, options);
  }

  function performLanguageSwitch(language, options) {
    var settings = options || {};
    var sequence = ++switchSequence;
    setLanguageSwitchIntent(language);

    return loadPack(language).then(function (nextPack) {
      if (sequence !== switchSequence) return null;

      var previousLanguage = currentLanguage;
      var needsTranslation = previousLanguage !== language || currentPack !== nextPack;
      var commit = function () {
        if (sequence !== switchSequence) return false;

        if (needsTranslation) {
          applyTranslations(currentPack, nextPack);
          currentPack = nextPack;
          currentLanguage = language;
          api.language = language;
        }

        updateLanguageMetadata(nextPack);
        updateLanguageSwitches(language);
        updateWhatsAppPrefills(nextPack);

        if (settings.history !== "none") {
          updateHistory(language, settings.history === "replace");
        }

        if (previousLanguage !== language) {
          dispatchLanguageChange(language, previousLanguage);
        }

        return true;
      };

      if (!needsTranslation) {
        cancelLanguageTransition();
        return commit() ? nextPack : null;
      }

      return runLanguageTransition(sequence, language, previousLanguage, commit).then(function (committed) {
        return committed ? nextPack : null;
      });
    }).catch(function (error) {
      if (sequence !== switchSequence) return null;
      cancelLanguageTransition();
      updateLanguageSwitches(currentLanguage);
      dispatchSiteEvent("site:languageerror", {
        language: language,
        previousLanguage: currentLanguage,
        error: error
      });
      throw error;
    });
  }

  function runLanguageTransition(sequence, language, previousLanguage, commit) {
    cancelLanguageTransition();

    if (!shouldAnimateLanguageChange(previousLanguage, language)) {
      return Promise.resolve(sequence === switchSequence && commit());
    }

    var root = document.documentElement;
    var token = ++transitionToken;

    root.classList.add("is-language-switching", "is-language-switching-out");
    root.classList.remove("is-language-switching-in");
    root.setAttribute("data-language-transition", "out");
    dispatchSiteEvent("site:languagetransitionstart", {
      language: language,
      previousLanguage: previousLanguage
    });

    return new Promise(function (resolve, reject) {
      activeLanguageTransition = {
        token: token,
        sequence: sequence,
        language: language,
        previousLanguage: previousLanguage,
        timer: window.setTimeout(function () {
          if (!ownsLanguageTransition(token) || sequence !== switchSequence) {
            finishLanguageTransition(token, false, true);
            return;
          }

          var committed = false;
          try {
            committed = commit();
          } catch (error) {
            failLanguageTransition(token, error);
            return;
          }

          if (!committed || sequence !== switchSequence) {
            finishLanguageTransition(token, false, true);
            return;
          }

          root.classList.remove("is-language-switching-out");
          root.classList.add("is-language-switching-in");
          root.setAttribute("data-language-transition", "in");
          activeLanguageTransition.timer = window.setTimeout(function () {
            finishLanguageTransition(token, sequence === switchSequence, sequence !== switchSequence);
          }, LANGUAGE_REVEAL_MS);
        }, LANGUAGE_CONCEAL_MS),
        resolve: resolve,
        reject: reject
      };
    });
  }

  function shouldAnimateLanguageChange(previousLanguage, language) {
    if (previousLanguage === language || document.visibilityState === "hidden") return false;
    if (typeof window.matchMedia !== "function") return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function ownsLanguageTransition(token) {
    return Boolean(activeLanguageTransition && activeLanguageTransition.token === token);
  }

  function finishLanguageTransition(token, committed, cancelled) {
    if (!ownsLanguageTransition(token)) return;

    var transition = activeLanguageTransition;
    window.clearTimeout(transition.timer);
    activeLanguageTransition = null;
    clearLanguageTransitionPresentation();
    dispatchSiteEvent("site:languagetransitionend", {
      language: transition.language,
      previousLanguage: transition.previousLanguage,
      committed: Boolean(committed),
      cancelled: Boolean(cancelled)
    });
    transition.resolve(Boolean(committed));
  }

  function failLanguageTransition(token, error) {
    if (!ownsLanguageTransition(token)) return;

    var transition = activeLanguageTransition;
    window.clearTimeout(transition.timer);
    activeLanguageTransition = null;
    clearLanguageTransitionPresentation();
    transition.reject(error);
  }

  function cancelLanguageTransition() {
    if (!activeLanguageTransition) {
      clearLanguageTransitionPresentation();
      return;
    }
    finishLanguageTransition(activeLanguageTransition.token, false, true);
  }

  function clearLanguageTransitionPresentation() {
    var root = document.documentElement;
    root.classList.remove(
      "is-language-switching",
      "is-language-switching-out",
      "is-language-switching-in"
    );
    root.removeAttribute("data-language-transition");
  }

  function handleLanguageClick(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    var anchor = closestLanguageSwitch(event.target);
    if (!anchor || anchor.hasAttribute("download")) return;
    if (anchor.target && anchor.target.toLowerCase() !== "_self") return;

    var language = normaliseLanguage(anchor.getAttribute("data-language"), "");
    if (!language) return;

    var destination;
    try {
      destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
    } catch (error) {
      return;
    }

    event.preventDefault();
    switchLanguage(language).catch(function (error) {
      reportError("The language could not be changed without navigation", error);
    });
  }

  function closestLanguageSwitch(startNode) {
    var element = startNode && startNode.nodeType === 1 ? startNode : startNode && startNode.parentElement;

    while (element && element !== document.documentElement) {
      if (
        element.tagName === "A" &&
        element.hasAttribute("data-language-switch") &&
        element.hasAttribute("data-language")
      ) {
        return element;
      }
      element = element.parentElement;
    }

    return null;
  }

  function handlePopState() {
    var language = languageFromPath(window.location.pathname);
    switchLanguage(language, { history: "none" }).catch(function (error) {
      reportError("The history language state could not be restored", error);
      updateHistory(currentLanguage, true);
    });
  }

  function handlePageShow(event) {
    if (!event.persisted) return;
    switchSequence += 1;
    cancelLanguageTransition();
    updateLanguageSwitches(currentLanguage);
  }

  function updateHistory(language, replace) {
    var nextUrl = LANGUAGE_PATHS[language] + window.location.search + window.location.hash;
    var currentUrl = window.location.pathname + window.location.search + window.location.hash;
    if (nextUrl === currentUrl) return;

    var state = { siteLanguage: language };
    if (replace) {
      window.history.replaceState(state, "", nextUrl);
    } else {
      window.history.pushState(state, "", nextUrl);
    }
  }

  function normaliseText(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim();
  }

  function getPackIndex(pack) {
    if (!pack) return { sources: new Map(), reverse: new Map() };
    if (packIndexes.has(pack)) return packIndexes.get(pack);

    var sources = new Map();
    var reverse = new Map();
    var strings = pack.strings || {};

    Object.keys(strings).forEach(function (source) {
      var sourceText = normaliseText(source);
      var translatedText = normaliseText(strings[source]);
      if (sourceText && !sources.has(sourceText)) sources.set(sourceText, source);
      if (translatedText && !reverse.has(translatedText)) reverse.set(translatedText, source);
    });

    var index = { sources: sources, reverse: reverse };
    packIndexes.set(pack, index);
    return index;
  }

  function translatedValue(pack, sourceKey) {
    if (!pack || !sourceKey) return null;

    var normalisedKey = normaliseText(sourceKey);
    var index = getPackIndex(pack);
    var storedKey = index.sources.get(normalisedKey) || sourceKey;

    if (hasOwn(pack.strings || {}, storedKey) && typeof pack.strings[storedKey] === "string") {
      return pack.strings[storedKey];
    }
    if (pack.code === "ru") return storedKey;
    return null;
  }

  function cachedKeyMatches(sourceKey, normalisedValue, fromPack, toPack) {
    if (!sourceKey) return false;
    if (normaliseText(sourceKey) === normalisedValue) return true;

    var fromValue = translatedValue(fromPack, sourceKey);
    if (fromValue !== null && normaliseText(fromValue) === normalisedValue) return true;

    var toValue = translatedValue(toPack, sourceKey);
    return toValue !== null && normaliseText(toValue) === normalisedValue;
  }

  function resolveSourceKey(value, cachedKey, fromPack, toPack) {
    var normalisedValue = normaliseText(value);
    if (!normalisedValue) return null;

    if (cachedKeyMatches(cachedKey, normalisedValue, fromPack, toPack)) return cachedKey;

    var fromIndex = getPackIndex(fromPack);
    var toIndex = getPackIndex(toPack);

    if (fromIndex.reverse.has(normalisedValue)) return fromIndex.reverse.get(normalisedValue);
    if (toIndex.reverse.has(normalisedValue)) return toIndex.reverse.get(normalisedValue);
    if (fromIndex.sources.has(normalisedValue)) return fromIndex.sources.get(normalisedValue);
    if (toIndex.sources.has(normalisedValue)) return toIndex.sources.get(normalisedValue);
    if (knownSourceKeys.has(normalisedValue)) return knownSourceKeys.get(normalisedValue);

    return null;
  }

  function applyTranslations(fromPack, toPack) {
    stopObserver();
    localiseSubtree(document.body, fromPack, toPack);
    startObserver();
  }

  function localiseSubtree(root, fromPack, toPack) {
    if (!root) return;

    if (root.nodeType === 3) {
      if (!isInsideSkippedElement(root.parentElement)) {
        localiseTextNode(root, fromPack, toPack);
      }
      return;
    }

    if (root.nodeType !== 1) return;
    if (isSkippedElement(root)) return;

    localiseAttributes(root, fromPack, toPack);

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var node = walker.nextNode();
    while (node) {
      if (node.nodeType === 1) {
        if (!isInsideSkippedElement(node)) localiseAttributes(node, fromPack, toPack);
      } else if (!isInsideSkippedElement(node.parentElement)) {
        localiseTextNode(node, fromPack, toPack);
      }
      node = walker.nextNode();
    }
  }

  function isSkippedElement(element) {
    return Boolean(
      !element ||
        SKIPPED_TAGS[element.tagName] ||
        element.hasAttribute("data-i18n-ignore") ||
        element.getAttribute("translate") === "no"
    );
  }

  function isInsideSkippedElement(element) {
    var current = element;
    while (current && current !== document.body) {
      if (isSkippedElement(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function localiseTextNode(node, fromPack, toPack) {
    var rawValue = node.nodeValue;
    var sourceKey = resolveSourceKey(rawValue, textKeys.get(node), fromPack, toPack);
    if (!sourceKey) return;

    textKeys.set(node, sourceKey);
    var nextValue = translatedValue(toPack, sourceKey);
    if (nextValue === null || normaliseText(rawValue) === normaliseText(nextValue)) return;

    node.nodeValue = preserveOuterWhitespace(rawValue, nextValue);
  }

  function preserveOuterWhitespace(original, translated) {
    var leadingMatch = String(original).match(/^\s*/);
    var trailingMatch = String(original).match(/\s*$/);
    var leading = leadingMatch ? leadingMatch[0] : "";
    var trailing = trailingMatch ? trailingMatch[0] : "";
    return leading + String(translated) + trailing;
  }

  function localiseAttributes(element, fromPack, toPack) {
    var keys = attributeKeys.get(element) || Object.create(null);
    var hasKeys = false;

    TRANSLATABLE_ATTRIBUTES.forEach(function (attributeName) {
      if (!element.hasAttribute(attributeName)) return;

      var rawValue = element.getAttribute(attributeName);
      var sourceKey = resolveSourceKey(rawValue, keys[attributeName], fromPack, toPack);
      if (!sourceKey) return;

      keys[attributeName] = sourceKey;
      hasKeys = true;
      var nextValue = translatedValue(toPack, sourceKey);
      if (nextValue !== null && rawValue !== nextValue) {
        element.setAttribute(attributeName, nextValue);
      }
    });

    if (hasKeys) attributeKeys.set(element, keys);
  }

  function startObserver() {
    if (observerStarted || typeof window.MutationObserver !== "function" || !document.body) return;

    if (!observer) observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES
    });
    observerStarted = true;
  }

  function stopObserver() {
    if (!observer || !observerStarted) return;
    observer.disconnect();
    observerStarted = false;
  }

  function handleMutations(mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === "characterData") {
        if (!isInsideSkippedElement(mutation.target.parentElement)) {
          localiseTextNode(mutation.target, currentPack, currentPack);
        }
        return;
      }

      if (mutation.type === "attributes") {
        if (!isInsideSkippedElement(mutation.target)) {
          localiseAttributes(mutation.target, currentPack, currentPack);
        }
        return;
      }

      Array.prototype.forEach.call(mutation.addedNodes, function (node) {
        localiseSubtree(node, currentPack, currentPack);
      });
    });
  }

  function updateLanguageMetadata(pack) {
    if (!pack) return;

    var language = normaliseLanguage(pack.code, currentLanguage);
    var meta = pageMetaFor(language, pack.meta || {});
    var canonicalUrl = SITE_ORIGIN + LANGUAGE_PATHS[language];

    document.documentElement.setAttribute("lang", language);
    if (meta.title) document.title = meta.title;
    setMetaContent("name", "description", meta.description);
    setMetaContent("property", "og:title", meta.ogTitle || meta.title);
    setMetaContent("property", "og:description", meta.ogDescription || meta.description);
    setMetaContent("property", "og:url", canonicalUrl);
    setMetaContent("property", "og:locale", pack.locale || language + "_EE");
    updateOpenGraphLocaleAlternates(language);
    setCanonical(canonicalUrl);
    updateAlternateLanguageLinks();
    if (!PAGE_CONFIG || PAGE_CONFIG.structuredData !== false) {
      updateStructuredData({ code: pack.code, meta: meta }, canonicalUrl);
    }
  }

  function pageMetaFor(language, fallback) {
    var pageMeta = PAGE_CONFIG && isObject(PAGE_CONFIG.meta) && PAGE_CONFIG.meta[language];
    if (!isObject(pageMeta)) return fallback;

    var merged = {};
    Object.keys(fallback || {}).forEach(function (key) {
      merged[key] = fallback[key];
    });
    Object.keys(pageMeta).forEach(function (key) {
      if (typeof pageMeta[key] === "string" && pageMeta[key]) merged[key] = pageMeta[key];
    });
    return merged;
  }

  function updateAlternateLanguageLinks() {
    var alternates = document.head.querySelectorAll('link[rel="alternate"][hreflang]');
    Array.prototype.forEach.call(alternates, function (link) {
      var hreflang = String(link.getAttribute("hreflang") || "").toLowerCase();
      var language = hreflang === "x-default" ? "ru" : normaliseLanguage(hreflang, "");
      if (!language || !hasOwn(LANGUAGE_PATHS, language)) return;
      link.setAttribute("href", SITE_ORIGIN + LANGUAGE_PATHS[language]);
    });
  }

  function updateOpenGraphLocaleAlternates(current) {
    var existing = document.head.querySelectorAll('meta[property="og:locale:alternate"]');
    Array.prototype.forEach.call(existing, function (element) {
      element.parentNode.removeChild(element);
    });

    Object.keys(LANGUAGE_LOCALES).forEach(function (language) {
      if (language === current) return;
      var alternate = document.createElement("meta");
      alternate.setAttribute("property", "og:locale:alternate");
      alternate.setAttribute("content", LANGUAGE_LOCALES[language]);
      document.head.appendChild(alternate);
    });
  }

  function setMetaContent(attributeName, attributeValue, content) {
    if (typeof content !== "string" || !content) return;

    var selector = "meta[" + attributeName + '=\"' + attributeValue + '\"]';
    var element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attributeName, attributeValue);
      document.head.appendChild(element);
    }
    element.setAttribute("content", content);
  }

  function setCanonical(url) {
    var canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);
  }

  function updateStructuredData(pack, canonicalUrl) {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    Array.prototype.forEach.call(scripts, function (script) {
      try {
        var data = JSON.parse(script.textContent || "");
        var target = findSportsLocation(data);
        if (!target) return;

        target.url = canonicalUrl;
        target.inLanguage = pack.code;
        if (pack.meta.schemaName) target.name = pack.meta.schemaName;
        if (pack.meta.schemaDescription) target.description = pack.meta.schemaDescription;
        script.textContent = JSON.stringify(data);
      } catch (error) {
        // An unrelated JSON-LD block should never prevent the language switch.
      }
    });
  }

  function findSportsLocation(data) {
    if (!isObject(data)) return null;
    if (data["@type"] === "SportsActivityLocation") return data;
    if (!Array.isArray(data["@graph"])) return null;

    for (var index = 0; index < data["@graph"].length; index += 1) {
      if (isObject(data["@graph"][index]) && data["@graph"][index]["@type"] === "SportsActivityLocation") {
        return data["@graph"][index];
      }
    }
    return null;
  }

  function updateLanguageSwitches(language) {
    var switches = document.querySelectorAll("a[data-language-switch][data-language]");
    Array.prototype.forEach.call(switches, function (anchor) {
      var isCurrent = normaliseLanguage(anchor.getAttribute("data-language"), "") === language;
      if (isCurrent) {
        anchor.setAttribute("aria-current", "page");
      } else {
        anchor.removeAttribute("aria-current");
      }
    });

    var switchers = document.querySelectorAll(".language-switcher");
    Array.prototype.forEach.call(switchers, function (switcher) {
      switcher.setAttribute("data-active-language", language);
      switcher.removeAttribute("aria-busy");
    });
  }

  function setLanguageSwitchIntent(language) {
    var switchers = document.querySelectorAll(".language-switcher");
    Array.prototype.forEach.call(switchers, function (switcher) {
      switcher.setAttribute("data-active-language", language);
      switcher.setAttribute("aria-busy", "true");
    });
  }

  function updateWhatsAppPrefills(pack) {
    var dynamic = (pack && pack.dynamic) || {};

    WHATSAPP_PREFILLS.forEach(function (prefill) {
      var message =
        hasOwn(dynamic, prefill.key) && typeof dynamic[prefill.key] === "string"
          ? dynamic[prefill.key]
          : prefill.fallback;
      var anchors = document.querySelectorAll(prefill.selector);

      Array.prototype.forEach.call(anchors, function (anchor) {
        try {
          var url = new URL(anchor.getAttribute("href"), window.location.href);
          url.searchParams.set("text", message);
          anchor.setAttribute("href", url.href);
        } catch (error) {
          // Keep the genuine fallback link untouched if its URL is malformed.
        }
      });
    });
  }

  function translateDynamic(key, params, fallback) {
    var replacements = isObject(params) ? params : {};
    var dynamic = (currentPack && currentPack.dynamic) || {};
    var template = hasOwn(dynamic, key) && typeof dynamic[key] === "string" ? dynamic[key] : fallback;

    if (typeof template !== "string") template = String(key == null ? "" : key);

    return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, function (placeholder, name) {
      return hasOwn(replacements, name) ? String(replacements[name]) : placeholder;
    });
  }

  function dispatchLanguageChange(language, previousLanguage) {
    dispatchSiteEvent("site:languagechange", {
      language: language,
      previousLanguage: previousLanguage,
      path: LANGUAGE_PATHS[language]
    });
  }

  function dispatchSiteEvent(name, detail) {
    var event;

    if (typeof window.CustomEvent === "function") {
      event = new CustomEvent(name, { detail: detail });
    } else {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent(name, false, false, detail);
    }

    window.dispatchEvent(event);
  }

  function reportError(message, error) {
    if (window.console && typeof window.console.error === "function") {
      window.console.error("[site-i18n] " + message, error);
    }
  }
})();
