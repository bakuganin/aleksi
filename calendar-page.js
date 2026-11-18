(function () {
  "use strict";

  var HOME_PATHS = Object.freeze({
    ru: "/",
    et: "/et/",
    en: "/en/"
  });
  var CALENDAR_PATHS = Object.freeze({
    ru: "/calendar/",
    et: "/calendar/et/",
    en: "/calendar/en/"
  });
  var header = document.querySelector(".calendar-page__header");
  var navigation = document.querySelector("[data-calendar-nav]");
  var toggle = document.querySelector("[data-calendar-nav-toggle]");
  var main = document.querySelector(".calendar-page__main");
  var pageRoot = document.documentElement;
  var pageBody = document.body;
  var lockedScrollY = 0;

  if (!header || !navigation || !toggle) return;

  function isMobileNavigation() {
    return window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
  }

  function menuFocusableElements() {
    return Array.prototype.filter.call(
      header.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (element) {
        return !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true";
      }
    );
  }

  function normaliseLanguage(value) {
    var code = String(value || "").toLowerCase().split(/[-_]/)[0];
    return Object.prototype.hasOwnProperty.call(HOME_PATHS, code) ? code : "ru";
  }

  function currentLanguage() {
    if (window.siteI18n && window.siteI18n.language) {
      return normaliseLanguage(window.siteI18n.language);
    }
    return normaliseLanguage(document.documentElement.getAttribute("lang"));
  }

  function translatedLabel(key, fallback) {
    if (!window.siteI18n || typeof window.siteI18n.t !== "function") return fallback;
    return window.siteI18n.t(key, null, fallback);
  }

  function updateToggleLabel(isOpen) {
    toggle.setAttribute(
      "aria-label",
      isOpen
        ? translatedLabel("nav.closeMenu", "Закрыть меню")
        : translatedLabel("nav.openMenu", "Открыть меню")
    );
  }

  function setMenuOpen(isOpen, restoreFocus) {
    var nextState = Boolean(isOpen);
    var wasOpen = toggle.getAttribute("aria-expanded") === "true";

    if (nextState && !wasOpen && isMobileNavigation()) {
      lockedScrollY = window.scrollY || pageRoot.scrollTop || 0;
    }

    navigation.classList.toggle("is-open", nextState);
    header.classList.toggle("is-menu-open", nextState);
    pageRoot.classList.toggle("calendar-nav-open", nextState);
    pageBody.classList.toggle("calendar-nav-open", nextState);
    if (main) main.inert = nextState;
    toggle.setAttribute("aria-expanded", String(nextState));
    navigation.setAttribute("aria-hidden", String(!nextState && isMobileNavigation()));
    updateToggleLabel(nextState);

    if (!nextState && wasOpen) {
      window.scrollTo(0, lockedScrollY);
    }

    if (nextState && isMobileNavigation()) {
      window.setTimeout(function () {
        if (toggle.getAttribute("aria-expanded") === "true") {
          var firstLink = navigation.querySelector("a[href]");
          if (firstLink) firstLink.focus({ preventScroll: true });
        }
      }, 220);
    } else if (!nextState && restoreFocus) {
      window.requestAnimationFrame(function () {
        toggle.focus({ preventScroll: true });
      });
    }
  }

  function syncRoutes(language) {
    var code = normaliseLanguage(language || currentLanguage());
    var homePath = HOME_PATHS[code];

    Array.prototype.forEach.call(document.querySelectorAll("[data-calendar-home-link]"), function (link) {
      link.setAttribute("href", homePath);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-calendar-site-link]"), function (link) {
      var section = String(link.getAttribute("data-calendar-site-link") || "").replace(/^#/, "");
      if (section) link.setAttribute("href", homePath + "#" + section);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-schedule-page-link]"), function (link) {
      link.setAttribute("href", CALENDAR_PATHS[code]);
    });

    updateToggleLabel(toggle.getAttribute("aria-expanded") === "true");
  }

  toggle.addEventListener("click", function () {
    setMenuOpen(toggle.getAttribute("aria-expanded") !== "true", false);
  });

  navigation.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("a") : null;
    if (target) setMenuOpen(false, false);
    else if (event.target === navigation) setMenuOpen(false, true);
  });

  document.addEventListener("click", function (event) {
    if (toggle.getAttribute("aria-expanded") !== "true") return;
    if (!header.contains(event.target)) setMenuOpen(false, false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      setMenuOpen(false, true);
      return;
    }

    if (event.key !== "Tab" || toggle.getAttribute("aria-expanded") !== "true" || !isMobileNavigation()) return;

    var focusable = menuFocusableElements();
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });

  window.addEventListener("resize", function () {
    if (!isMobileNavigation()) {
      setMenuOpen(false, false);
      navigation.setAttribute("aria-hidden", "false");
    } else {
      navigation.setAttribute("aria-hidden", String(toggle.getAttribute("aria-expanded") !== "true"));
    }
  });

  window.addEventListener("site:languagechange", function (event) {
    syncRoutes(event.detail && event.detail.language);
  });

  syncRoutes();
  setMenuOpen(false, false);
})();
