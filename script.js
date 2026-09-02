const WHATSAPP_NUMBER = "37255554649";
const pageRoot = document.documentElement;
const pageParams = new URLSearchParams(window.location.search);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const siteLoader = document.querySelector("[data-site-loader]");

const initSiteLoader = () => {
  if (!siteLoader || !pageRoot.classList.contains("loader-active")) {
    if (siteLoader) siteLoader.hidden = true;
    return;
  }

  const progressLabel = siteLoader.querySelector("[data-loader-progress]");
  const progressMeter = siteLoader.querySelector("[data-loader-meter]");
  const startedAt = window.performance.now();
  const minimumDuration = reduceMotion ? 0 : 850;
  const finishDuration = reduceMotion ? 0 : 260;
  const gloveSettleDuration = reduceMotion ? 0 : 180;
  let currentProgress = 0;
  let progressFrame = 0;
  let finishScheduled = false;
  let finishing = false;

  const renderProgress = (value) => {
    currentProgress = Math.min(Math.max(value, 0), 100);
    const roundedProgress = Math.round(currentProgress);

    siteLoader.style.setProperty("--loader-progress", `${currentProgress.toFixed(2)}%`);
    siteLoader.style.setProperty("--loader-scale", (currentProgress / 100).toFixed(4));
    siteLoader.style.setProperty("--loader-shift", `${((currentProgress - 50) * 0.12).toFixed(2)}px`);
    siteLoader.style.setProperty(
      "--loader-glove-fill",
      `${Math.min(currentProgress * 1.45, 145).toFixed(2)}%`,
    );

    if (progressLabel) progressLabel.textContent = String(roundedProgress).padStart(2, "0");
    if (progressMeter instanceof HTMLProgressElement) {
      progressMeter.value = currentProgress;
      progressMeter.textContent = `${roundedProgress}%`;
    }
  };

  const tickProgress = (now) => {
    if (finishing) return;
    const elapsed = now - startedAt;
    const targetProgress = Math.min(92, 9 + elapsed / 15);
    currentProgress += (targetProgress - currentProgress) * 0.075;
    renderProgress(currentProgress);
    progressFrame = window.requestAnimationFrame(tickProgress);
  };

  const revealSite = () => {
    renderProgress(100);

    try {
      window.sessionStorage.setItem("dzhikaeva-loader-seen", "1");
    } catch {
      // Storage can be unavailable in strict privacy modes; the loader still exits normally.
    }

    if (window.__siteLoaderFailsafe) window.clearTimeout(window.__siteLoaderFailsafe);
    siteLoader.classList.add("is-complete");

    window.setTimeout(() => {
      pageRoot.classList.remove("loader-active");
      siteLoader.hidden = true;

      // Let the uncovered page paint at least once before its motion layers start.
      // Starting them under the moving loader mask makes the edge graphics appear to strobe.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("site:ready"));
        });
      });
    }, reduceMotion ? 40 : 1840);
  };

  const finishProgress = () => {
    finishing = true;
    if (progressFrame) window.cancelAnimationFrame(progressFrame);
    const finishStartedAt = window.performance.now();
    const finishStartedFrom = currentProgress;

    const finishFrame = (now) => {
      const progress = finishDuration === 0 ? 1 : Math.min((now - finishStartedAt) / finishDuration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      renderProgress(finishStartedFrom + (100 - finishStartedFrom) * easedProgress);

      if (progress < 1) {
        window.requestAnimationFrame(finishFrame);
      } else {
        window.setTimeout(revealSite, gloveSettleDuration);
      }
    };

    window.requestAnimationFrame(finishFrame);
  };

  const scheduleFinish = () => {
    if (finishScheduled) return;
    finishScheduled = true;
    const elapsed = window.performance.now() - startedAt;
    window.setTimeout(finishProgress, Math.max(0, minimumDuration - elapsed));
  };

  progressFrame = window.requestAnimationFrame(tickProgress);

  if (document.readyState === "complete") {
    scheduleFinish();
  } else {
    window.addEventListener("load", scheduleFinish, { once: true });
  }

  window.setTimeout(scheduleFinish, 5200);
};

initSiteLoader();

const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const navToggle = document.querySelector("[data-nav-toggle]");

const isMobileNavViewport = () => window.matchMedia("(max-width: 880px)").matches;
const getMenuFocusableElements = () => (
  nav
    ? Array.from(nav.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true")
    : []
);

const setMenuState = (isOpen) => {
  if (!nav || !navToggle) return;

  const shouldRestoreFocus = navToggle.getAttribute("aria-expanded") === "true" && !isOpen;

  nav.classList.toggle("is-open", isOpen);
  header?.classList.toggle("is-open", isOpen);
  pageRoot.classList.toggle("nav-open", isOpen);
  document.body.classList.toggle("nav-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
  nav.setAttribute("aria-hidden", String(!isOpen && isMobileNavViewport()));

  if (isOpen && isMobileNavViewport()) {
    window.setTimeout(() => {
      if (navToggle.getAttribute("aria-expanded") === "true") {
        getMenuFocusableElements()[0]?.focus({ preventScroll: true });
      }
    }, reduceMotion ? 0 : 220);
  } else if (shouldRestoreFocus) {
    window.requestAnimationFrame(() => {
      if (!document.querySelector("[data-signup-modal][open]")) navToggle.focus({ preventScroll: true });
    });
  }
};

navToggle?.addEventListener("click", () => {
  setMenuState(navToggle.getAttribute("aria-expanded") !== "true");
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenuState(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (navToggle?.getAttribute("aria-expanded") === "true") event.preventDefault();
    setMenuState(false);
    return;
  }

  if (event.key !== "Tab" || navToggle?.getAttribute("aria-expanded") !== "true" || !isMobileNavViewport()) return;

  const focusableItems = [...getMenuFocusableElements(), navToggle].filter(Boolean);
  if (!focusableItems.length) return;

  const firstItem = focusableItems[0];
  const lastItem = focusableItems[focusableItems.length - 1];

  if (event.shiftKey && document.activeElement === firstItem) {
    event.preventDefault();
    lastItem.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === lastItem) {
    event.preventDefault();
    firstItem.focus({ preventScroll: true });
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 880) {
    setMenuState(false);
  } else if (nav) {
    nav.setAttribute("aria-hidden", String(navToggle?.getAttribute("aria-expanded") !== "true"));
  }
});

if (nav) {
  nav.setAttribute("aria-hidden", String(isMobileNavViewport()));
}

const updateHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const headerWhatsApp = document.querySelector("[data-header-whatsapp]");
const headerWhatsAppTrigger = headerWhatsApp?.querySelector("[data-whatsapp-trigger]");
const headerWhatsAppCard = headerWhatsApp?.querySelector("[data-whatsapp-card]");
const headerWhatsAppClose = headerWhatsApp?.querySelector("[data-whatsapp-close]");
const whatsappBackdrop = document.querySelector("[data-whatsapp-backdrop]");

if (
  headerWhatsApp
  && headerWhatsAppTrigger
  && headerWhatsAppCard
  && headerWhatsAppClose
  && whatsappBackdrop
) {
  const desktopWhatsAppMedia = window.matchMedia(
    "(min-width: 881px) and (hover: hover) and (pointer: fine)",
  );
  let isWhatsAppOpen = false;
  let isWhatsAppPinned = false;
  let whatsappOpenTimer = 0;
  let whatsappCloseTimer = 0;
  let whatsappHideTimer = 0;

  const clearWhatsAppTimers = () => {
    window.clearTimeout(whatsappOpenTimer);
    window.clearTimeout(whatsappCloseTimer);
    window.clearTimeout(whatsappHideTimer);
  };

  const openHeaderWhatsApp = ({ pinned = false } = {}) => {
    if (!desktopWhatsAppMedia.matches) return;

    const wasOpen = isWhatsAppOpen;

    clearWhatsAppTimers();
    isWhatsAppOpen = true;
    isWhatsAppPinned = pinned || isWhatsAppPinned;
    headerWhatsAppCard.hidden = false;
    whatsappBackdrop.hidden = false;
    headerWhatsAppCard.getBoundingClientRect();

    window.requestAnimationFrame(() => {
      if (!isWhatsAppOpen) return;
      headerWhatsApp.classList.add("is-open");
      whatsappBackdrop.classList.add("is-visible");
      headerWhatsAppTrigger.setAttribute("aria-expanded", "true");
      headerWhatsAppTrigger.setAttribute("aria-label", "Закрыть WhatsApp");
    });

    if (!wasOpen) {
      trackFunnelEvent("header_whatsapp_open", {
        method: pinned ? "click" : "hover",
      });
    }
  };

  const closeHeaderWhatsApp = ({ restoreFocus = false, immediate = false } = {}) => {
    clearWhatsAppTimers();
    isWhatsAppOpen = false;
    isWhatsAppPinned = false;
    headerWhatsApp.classList.remove("is-open");
    whatsappBackdrop.classList.remove("is-visible");
    headerWhatsAppTrigger.setAttribute("aria-expanded", "false");
    headerWhatsAppTrigger.setAttribute("aria-label", "Открыть WhatsApp");

    whatsappHideTimer = window.setTimeout(() => {
      if (isWhatsAppOpen) return;
      headerWhatsAppCard.hidden = true;
      whatsappBackdrop.hidden = true;
    }, immediate || reduceMotion ? 0 : 460);

    if (restoreFocus) headerWhatsAppTrigger.focus();
  };

  const scheduleWhatsAppOpen = () => {
    if (!desktopWhatsAppMedia.matches || isWhatsAppOpen) return;
    window.clearTimeout(whatsappCloseTimer);
    whatsappOpenTimer = window.setTimeout(() => {
      openHeaderWhatsApp({ pinned: false });
    }, 140);
  };

  const scheduleWhatsAppClose = () => {
    window.clearTimeout(whatsappOpenTimer);
    if (!isWhatsAppOpen || isWhatsAppPinned) return;
    whatsappCloseTimer = window.setTimeout(() => {
      if (!headerWhatsApp.matches(":hover") && !headerWhatsApp.contains(document.activeElement)) {
        closeHeaderWhatsApp();
      }
    }, 240);
  };

  headerWhatsApp.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") scheduleWhatsAppOpen();
  });
  headerWhatsApp.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") scheduleWhatsAppClose();
  });

  headerWhatsAppTrigger.addEventListener("click", () => {
    if (!desktopWhatsAppMedia.matches) return;

    if (isWhatsAppOpen && isWhatsAppPinned) {
      closeHeaderWhatsApp({ restoreFocus: true });
      return;
    }

    isWhatsAppPinned = true;
    openHeaderWhatsApp({ pinned: true });
  });

  headerWhatsAppClose.addEventListener("click", () => {
    closeHeaderWhatsApp({ restoreFocus: true });
  });
  whatsappBackdrop.addEventListener("pointerdown", () => closeHeaderWhatsApp());

  document.addEventListener("pointerdown", (event) => {
    if (!isWhatsAppOpen || headerWhatsApp.contains(event.target)) return;
    closeHeaderWhatsApp();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isWhatsAppOpen) return;
    event.preventDefault();
    closeHeaderWhatsApp({ restoreFocus: true });
  });

  desktopWhatsAppMedia.addEventListener("change", () => {
    closeHeaderWhatsApp({ immediate: true });
  });
}

const revealItems = document.querySelectorAll(".reveal");
const staticPreview = pageParams.get("capture") === "1";

if (!staticPreview && pageParams.has("preview")) {
  pageParams.delete("preview");
  pageParams.delete("heroSlide");
  const nextSearch = pageParams.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
  );
}

const previewHeroSlide = pageParams.get("heroSlide") === "2" ? 1 : 0;
const heroStory = document.querySelector("[data-hero-story]");
const hero = document.querySelector("[data-hero]") || document.querySelector(".hero");

const createSmoothScrollController = () => {
  const root = document.documentElement;
  const state = {
    current: window.scrollY,
    target: window.scrollY,
    rendered: window.scrollY,
    frame: 0,
    protectedUntil: 0,
  };

  const clampScroll = (value) => {
    const maxScroll = Math.max(root.scrollHeight - window.innerHeight, 0);
    return Math.min(Math.max(value, 0), maxScroll);
  };

  const stop = (syncToViewport = true) => {
    if (state.frame) window.cancelAnimationFrame(state.frame);
    state.frame = 0;
    state.protectedUntil = 0;
    root.classList.remove("is-scroll-gliding");

    if (syncToViewport) {
      state.current = window.scrollY;
      state.target = window.scrollY;
      state.rendered = window.scrollY;
    }
  };

  const render = () => {
    const distance = state.target - state.current;

    if (Math.abs(distance) < 0.35) {
      state.current = state.target;
      state.rendered = state.target;
      window.scrollTo(0, state.target);
      stop(false);
      return;
    }

    const ease = Math.abs(distance) > 900 ? 0.16 : 0.12;
    state.current += distance * ease;
    state.rendered = state.current;
    window.scrollTo(0, state.current);
    state.frame = window.requestAnimationFrame(render);
  };

  const scrollTo = (top, { immediate = false, protect = false } = {}) => {
    const nextTarget = clampScroll(top);

    if (immediate) {
      stop(false);
      state.current = nextTarget;
      state.target = nextTarget;
      state.rendered = nextTarget;
      window.scrollTo(0, nextTarget);
      return;
    }

    if (!state.frame) state.current = window.scrollY;
    state.target = nextTarget;
    state.protectedUntil = protect ? performance.now() + 2400 : state.protectedUntil;
    root.classList.add("is-scroll-gliding");
    if (!state.frame) state.frame = window.requestAnimationFrame(render);
  };

  const nestedScrollerCanMove = (origin, delta) => {
    let element = origin instanceof Element ? origin : null;

    while (element && element !== document.body) {
      const style = window.getComputedStyle(element);
      const canScroll = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;

      if (canScroll) {
        const hasRoomAbove = delta < 0 && element.scrollTop > 0;
        const hasRoomBelow = delta > 0 && element.scrollTop + element.clientHeight < element.scrollHeight - 1;
        if (hasRoomAbove || hasRoomBelow) return true;
      }

      element = element.parentElement;
    }

    return false;
  };

  const onWheel = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey
      || document.body.classList.contains("nav-open") || root.classList.contains("signup-modal-open")) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;

    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 18
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1;
    const rawDelta = event.deltaY * unit;
    const delta = Math.min(Math.max(rawDelta, -320), 320);

    if (Math.abs(delta) < 0.1 || nestedScrollerCanMove(event.target, delta)) return;

    event.preventDefault();
    if (!state.frame) {
      state.current = window.scrollY;
      state.target = window.scrollY;
    }
    scrollTo(state.target + delta);
  };

  const onNativeScroll = () => {
    const isProtectedGlide = state.frame && performance.now() < state.protectedUntil;
    if (state.frame && (isProtectedGlide || Math.abs(window.scrollY - state.rendered) <= 2)) return;
    if (state.frame) stop();
    state.current = window.scrollY;
    state.target = window.scrollY;
    state.rendered = window.scrollY;
  };

  const getAnchorTop = (target) => {
    if (target.id === "top") return 0;
    const headerHeight = Number.parseFloat(window.getComputedStyle(root).getPropertyValue("--header-height")) || 0;
    return target.getBoundingClientRect().top + window.scrollY - headerHeight - 24;
  };

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target instanceof Element ? event.target.closest("a[href^='#']") : null;
    if (!link || link.classList.contains("skip-link")) return;

    const hash = link.getAttribute("href");
    if (!hash || hash === "#") return;

    const target = document.querySelector(hash);
    if (!target) return;

    event.preventDefault();
    const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
    if (window.location.hash === hash) {
      window.history.replaceState(null, "", nextUrl);
    } else {
      window.history.pushState(null, "", nextUrl);
    }
    scrollTo(getAnchorTop(target), { protect: true });
  });

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("scroll", onNativeScroll, { passive: true });
  window.addEventListener("resize", () => {
    state.target = clampScroll(state.target);
  }, { passive: true });
  window.addEventListener("pointerdown", () => {
    if (state.frame) stop();
  }, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) && state.frame) {
      stop();
    }
  });

  root.classList.add("has-smooth-scroll");
  return { scrollTo, stop };
};

const smoothScrollController = !reduceMotion && window.matchMedia("(pointer: fine)").matches
  ? createSmoothScrollController()
  : null;

const trackFunnelEvent = (eventName, payload = {}) => {
  const details = {
    event: eventName,
    page: window.location.pathname,
    timestamp: Date.now(),
    ...payload,
  };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(details);
  window.dispatchEvent(new CustomEvent("funnel:interaction", { detail: details }));

  if (typeof window.clarity === "function") {
    window.clarity("event", eventName);
  }
};

if (staticPreview) {
  document.documentElement.classList.add("static-preview");
  document.querySelectorAll('[loading="lazy"]').forEach((item) => {
    item.setAttribute("loading", "eager");
  });
}

if (staticPreview || reduceMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.08 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

const initBenefitsNavigation = () => {
  const rail = document.querySelector("#benefits-rail");
  const controls = document.querySelector("[data-benefits-controls]");
  const previous = controls?.querySelector("[data-benefits-prev]");
  const next = controls?.querySelector("[data-benefits-next]");
  if (!rail || !controls || !previous || !next) return;

  const cards = [...rail.querySelectorAll(".benefit-profile")];
  let pendingLeft = null;
  let settleTimer = 0;
  const maxScroll = () => Math.max(0, rail.scrollWidth - rail.clientWidth);
  const sync = () => {
    const maximum = maxScroll();
    controls.hidden = maximum <= 2;
    previous.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft >= maximum - 2;
  };
  const settle = () => {
    window.clearTimeout(settleTimer);
    pendingLeft = null;
    sync();
  };
  const move = (direction) => {
    const maximum = maxScroll();
    const origin = pendingLeft ?? rail.scrollLeft;
    const left = rail.getBoundingClientRect().left;
    // Clamp card anchors to the end of the rail; the last card need not fill it.
    const anchors = cards.map((card) => Math.min(maximum, Math.max(0,
      card.getBoundingClientRect().left - left + rail.scrollLeft)));
    pendingLeft = direction > 0
      ? anchors.find((anchor) => anchor > origin + 2) ?? maximum
      : anchors.reverse().find((anchor) => anchor < origin - 2) ?? 0;
    rail.scrollTo({
      left: pendingLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
    sync();
  };

  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  rail.addEventListener("scroll", () => {
    sync();
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settle, 160);
  }, { passive: true });
  rail.addEventListener("scrollend", settle);
  rail.addEventListener("pointerdown", settle, { passive: true });
  rail.addEventListener("wheel", settle, { passive: true });
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(settle);
    observer.observe(rail);
    cards.forEach((card) => observer.observe(card));
  } else {
    window.addEventListener("resize", settle, { passive: true });
  }
  sync();
};

initBenefitsNavigation();

const pathWipeSections = document.querySelectorAll("[data-path-wipe]");
const pathWipeMotionEnabled = !staticPreview
  && !reduceMotion
  && "IntersectionObserver" in window
  && typeof Element.prototype.animate === "function";

// Keep the existing wide curtain for the signup section.
const pathWipeKeyframes = Array.from({ length: 61 }, (_, index) => {
  const offset = index / 60;
  const progress = offset < 0.5 ? 16 * offset ** 5 : 1 - ((2 - 2 * offset) ** 5) / 2;
  return { offset, transform: `translate3d(0, ${-100 * progress}%, 0)` };
});
const gridWipeKeyframes = [
  { transform: "translate3d(0, 0, 0)" },
  { transform: "translate3d(0, -100%, 0)" },
];

const createQuickStartContentMotion = (section) => {
  const items = [...section.querySelectorAll("[data-quick-reveal]")];
  if (!pathWipeMotionEnabled || items.length !== 4) {
    items.forEach((item) => { item.dataset.quickRevealState = "complete"; });
    return null;
  }

  const records = items.map((element, index) => ({ element, index, visible: false, animation: null }));
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 880px)");
  let observer = null;
  let gateOpen = false;
  let gateTimer = null;
  let tempo = 1;
  let stopped = false;

  const cleanup = () => {
    observer?.disconnect();
    window.clearTimeout(gateTimer);
    preference.removeEventListener("change", onPreferenceChange);
    window.removeEventListener("resize", observeItems);
    section.removeEventListener("focusin", onFocusIn);
    section.removeEventListener("pointerdown", onPointerDown);
    section.removeEventListener("click", onClick);
    section.classList.remove("is-quick-content-pending");
  };

  const completeItem = (record) => {
    if (record.element.dataset.quickRevealState === "complete") return;
    record.element.dataset.quickRevealState = "complete";
    record.animation?.cancel();
    record.animation = null;
    observer?.unobserve(record.element);
    if (records.every(({ element }) => element.dataset.quickRevealState === "complete")) {
      stopped = true;
      cleanup();
    } else {
      revealVisibleItems();
    }
  };

  const finishAll = () => {
    stopped = true;
    records.forEach(completeItem);
    cleanup();
  };

  const revealVisibleItems = () => {
    if (!gateOpen || stopped) return;
    if (mobile.matches && records.some(({ animation }) => animation)) return;
    const batch = records.filter(({ element, visible }) => visible && element.dataset.quickRevealState === "ready");
    (mobile.matches ? batch.slice(0, 1) : batch).forEach((record, order) => {
      if (stopped) return;
      record.element.dataset.quickRevealState = "active";
      try {
        // Move the li, not its link: hover effects and the layout stay independent.
        const animation = record.element.animate([
          { opacity: 0, transform: `translate3d(0, ${record.index === 0 ? 24 : 32}px, 0)` },
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
        ], {
          duration: mobile.matches ? 1300 : 900 * tempo,
          delay: mobile.matches ? 0 : order * 130 * tempo,
          easing: mobile.matches ? "cubic-bezier(0.25, 0.1, 0.25, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        });
        record.animation = animation;
        animation.id = "quick-start-content";
        const finish = () => {
          // A cancelled offscreen reveal must not complete a later attempt.
          if (record.animation === animation) completeItem(record);
        };
        animation.finished.then(finish, finish);
      } catch {
        finishAll();
      }
    });
  };

  const observeItems = () => {
    if (stopped) return;
    observer?.disconnect();
    const header = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
    const actions = document.querySelector(".mobile-actions")?.getBoundingClientRect().height || 0;
    const threshold = mobile.matches ? 0.25 : 0.08;
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const record = records.find(({ element }) => element === entry.target);
        if (!record) return;
        record.visible = entry.isIntersecting && entry.intersectionRatio >= threshold;
        if (mobile.matches && !entry.isIntersecting && record.animation) {
          const animation = record.animation;
          record.animation = null;
          record.element.dataset.quickRevealState = "ready";
          animation.cancel();
        }
      });
      revealVisibleItems();
    }, {
      threshold: [0, threshold],
      rootMargin: mobile.matches ? `-${header + 12}px 0px -${actions + 24}px 0px` : "0px",
    });
    records.forEach((record) => {
      record.visible = false;
      if (record.element.dataset.quickRevealState !== "complete") observer.observe(record.element);
    });
  };

  const onPreferenceChange = (event) => {
    if (event.matches) finishAll();
  };
  const onPointerDown = (event) => {
    // A finger landing on a link is also the beginning of an ordinary swipe.
    if (mobile.matches) return;
    if (event.target instanceof Element
      && event.target.closest("a, button, input, select, textarea, label, [role='button']")) finishAll();
  };
  const revealTarget = (target) => {
    if (!mobile.matches) return finishAll();
    const record = records.find(({ element }) => target instanceof Node && element.contains(target));
    if (record) completeItem(record);
  };
  const onFocusIn = (event) => revealTarget(event.target);
  const onClick = (event) => {
    if (event.target instanceof Element && event.target.closest("a, button")) revealTarget(event.target);
  };

  section.classList.add("is-quick-content-pending");
  records.forEach(({ element }) => {
    element.dataset.quickRevealState = "ready";
  });
  observeItems();
  preference.addEventListener("change", onPreferenceChange);
  window.addEventListener("resize", observeItems, { passive: true });
  section.addEventListener("focusin", onFocusIn);
  section.addEventListener("pointerdown", onPointerDown, { passive: true });
  section.addEventListener("click", onClick);

  return {
    begin: (motionTempo) => {
      if (stopped || gateOpen || gateTimer !== null) return;
      tempo = motionTempo;
      // Let the grid start opening before the title and cards rise into view.
      gateTimer = window.setTimeout(() => {
        gateOpen = true;
        revealVisibleItems();
      }, 900 * tempo);
    },
    skip: finishAll,
    revealTarget,
  };
};

pathWipeSections.forEach((section) => {
  const curtain = section.querySelector("[data-path-wipe-curtain]");
  const isGridWipe = section.dataset.pathWipe === "grid";
  const contentMotion = isGridWipe ? createQuickStartContentMotion(section) : null;
  let panels = [...section.querySelectorAll("[data-path-wipe-panel]")];
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let observer = null;
  let animations = [];
  let state = "ready";
  let gridWidth = section.clientWidth;

  const syncGridPanels = () => {
    if (!isGridWipe || !curtain) return;
    // The background and masks use the same CSS step, including the last partial column.
    const step = Number.parseFloat(getComputedStyle(section).getPropertyValue("--quick-grid-step"));
    if (!(step > 0)) return;
    gridWidth = section.clientWidth;
    const count = Math.ceil(gridWidth / step);
    if (panels.length === count) return;
    panels = Array.from({ length: count }, () => {
      const panel = document.createElement("span");
      panel.className = "path-wipe__panel";
      panel.dataset.pathWipePanel = "";
      return panel;
    });
    curtain.replaceChildren(...panels);
  };

  const finishPathWipe = (skipContent = true) => {
    if (skipContent !== false) contentMotion?.skip();
    if (state === "complete") return;
    state = "complete";
    section.classList.add("is-path-wipe-active", "is-path-wipe-complete");
    section.dataset.pathWipeState = "complete";
    observer?.disconnect();
    animations.forEach((animation) => animation.cancel());
    animations = [];
    section.removeEventListener("focusin", onPathWipeInteraction);
    section.removeEventListener("pointerdown", onPathWipePointerDown);
    section.removeEventListener("click", onPathWipeInteraction);
    window.removeEventListener("site:ready", maybeStartPathWipe);
    window.removeEventListener("resize", onPathWipeResize);
    motionPreference.removeEventListener("change", onMotionPreferenceChange);
  };

  const startPathWipe = () => {
    if (state !== "ready") return;
    state = "active";
    observer?.disconnect();
    section.classList.add("is-path-wipe-active");
    section.dataset.pathWipeState = "active";

    const tempo = window.matchMedia("(max-width: 880px)").matches ? 1.2 : 1;
    contentMotion?.begin(tempo);
    const delays = [0, 300, 400, 500, 0];
    // An asymmetric ripple starts near the intro, then spreads to both edges.
    // A small four-column rhythm keeps each grid line moving independently.
    const origin = Math.round((panels.length - 1) * 0.32);
    const waveStep = Math.min(36, 540 / Math.max(origin, panels.length - 1 - origin, 1));
    try {
      panels.forEach((panel, index) => {
        const gridDelay = Math.abs(index - origin) * waveStep
          + (index < origin ? 30 : 0) + (index % 2) * 24;
        const animation = panel.animate(isGridWipe ? gridWipeKeyframes : pathWipeKeyframes, {
          duration: (isGridWipe ? 1260 + (index % 4) * 60 : 1600) * tempo,
          delay: (isGridWipe ? gridDelay : delays[index]) * tempo,
          easing: isGridWipe ? "cubic-bezier(0.76, 0, 0.24, 1)" : "linear",
          fill: "both",
        });
        animation.id = `${section.id || "path-wipe"}-strip`;
        animations.push(animation);
      });
      Promise.allSettled(animations.map((animation) => animation.finished)).then(() => finishPathWipe(false));
    } catch {
      // Content stays usable even if a browser cannot start the reveal.
      animations.forEach((animation) => animation.finished.catch(() => {}));
      finishPathWipe();
    }
  };

  const maybeStartPathWipe = () => {
    if (state !== "ready" || pageRoot.classList.contains("loader-active")) return;
    const rect = section.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 0.75 + 1 && rect.bottom > 0) startPathWipe();
  };

  const onMotionPreferenceChange = (event) => {
    if (event.matches) finishPathWipe();
  };

  const onPathWipePointerDown = (event) => {
    if (isGridWipe && window.matchMedia("(max-width: 880px)").matches) return;
    if (event.target instanceof Element
      && event.target.closest("a, button, input, select, textarea, label, [role='button']")) {
      finishPathWipe();
    }
  };

  const onPathWipeInteraction = (event) => {
    if (!(event.target instanceof Element)
      || !event.target.closest("a, button, input, select, textarea, label, [role='button']")) return;
    if (isGridWipe && window.matchMedia("(max-width: 880px)").matches) {
      finishPathWipe(false);
      contentMotion?.begin(1.2);
      contentMotion?.revealTarget(event.target);
    } else {
      finishPathWipe();
    }
  };

  const onPathWipeResize = () => {
    // Changing width during motion must not expose seams. Mobile browser chrome
    // changes only viewport height and should not interrupt the ripple.
    if (isGridWipe && state === "active") {
      if (section.clientWidth !== gridWidth) {
        const keepMobileEntry = window.matchMedia("(max-width: 880px)").matches;
        finishPathWipe(!keepMobileEntry);
        if (keepMobileEntry) contentMotion?.begin(1.2);
      }
      return;
    }
    syncGridPanels();
    observePathWipe();
  };

  const observePathWipe = () => {
    if (state !== "ready") return;
    observer?.disconnect();
    // IntersectionObserver resolves percent margins against width, not height.
    observer = new IntersectionObserver(maybeStartPathWipe, {
      rootMargin: `0px 0px -${window.innerHeight * 0.25}px 0px`,
    });
    observer.observe(section);
    maybeStartPathWipe();
  };

  if (pathWipeMotionEnabled) syncGridPanels();
  if (!pathWipeMotionEnabled || !curtain || (isGridWipe ? panels.length === 0 : panels.length !== 5)) {
    finishPathWipe();
    return;
  }

  section.classList.add("is-path-wipe-ready");
  section.dataset.pathWipeState = "ready";
  // Never leave a keyboard/touch user interacting with visually covered links.
  section.addEventListener("focusin", onPathWipeInteraction);
  section.addEventListener("pointerdown", onPathWipePointerDown, { passive: true });
  section.addEventListener("click", onPathWipeInteraction);
  window.addEventListener("site:ready", maybeStartPathWipe);
  window.addEventListener("resize", onPathWipeResize, { passive: true });
  motionPreference.addEventListener("change", onMotionPreferenceChange);
  observePathWipe();
});

const groupsMotionSections = document.querySelectorAll("[data-groups-motion]");
const groupsMotionEnabled = !staticPreview
  && !reduceMotion
  && "IntersectionObserver" in window;
const groupsParallaxEnabled = groupsMotionEnabled
  && window.matchMedia("(min-width: 881px) and (hover: hover) and (pointer: fine)").matches;

groupsMotionSections.forEach((section) => {
  const intro = section.querySelector("[data-groups-intro]");
  const grid = section.querySelector("[data-groups-grid]");
  const cards = [...section.querySelectorAll("[data-groups-card]")];

  const finishGroupsMotion = () => {
    section.classList.add(
      "is-groups-intro-active",
      "is-groups-intro-settled",
      "is-groups-motion-complete",
    );
    section.dataset.groupsMotionState = "complete";
    section.style.setProperty("--groups-image-parallax", "0%");
    cards.forEach((card) => {
      card.classList.add("is-groups-card-active", "is-groups-card-settled");
      card.dataset.groupsCardState = "complete";
    });
  };

  if (!groupsMotionEnabled || !intro || !grid || cards.length === 0) {
    finishGroupsMotion();
    return;
  }

  section.classList.add("is-groups-motion-ready");
  section.dataset.groupsMotionState = "ready";
  section.style.setProperty("--groups-image-parallax", groupsParallaxEnabled ? "7%" : "0%");
  cards.forEach((card) => {
    card.dataset.groupsCardState = "ready";
  });

  let introSettled = false;
  let settledCards = 0;

  const updateGroupsCompletion = () => {
    if (!introSettled || settledCards !== cards.length) return;
    section.classList.add("is-groups-motion-complete");
    section.dataset.groupsMotionState = "complete";
  };

  const activateGroupsIntro = () => {
    if (section.classList.contains("is-groups-intro-active")) return;
    section.classList.add("is-groups-intro-active");
    section.dataset.groupsMotionState = "active";
    window.setTimeout(() => {
      introSettled = true;
      section.classList.add("is-groups-intro-settled");
      updateGroupsCompletion();
    }, 1750);
  };

  const activateGroupsCard = (card, index) => {
    if (card.classList.contains("is-groups-card-active")) return;
    card.classList.add("is-groups-card-active");
    card.dataset.groupsCardState = "active";
    section.dataset.groupsMotionState = "active";

    window.setTimeout(() => {
      if (card.classList.contains("is-groups-card-settled")) return;
      card.classList.add("is-groups-card-settled");
      card.dataset.groupsCardState = "complete";
      settledCards += 1;
      updateGroupsCompletion();
    }, 1780 + (index * 100));
  };

  const introObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        activateGroupsIntro();
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.12 },
  );

  introObserver.observe(intro);

  if (window.matchMedia("(max-width: 880px)").matches) {
    const mobileCardObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = cards.indexOf(entry.target);
          activateGroupsCard(entry.target, Math.max(index, 0));
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6%", threshold: 0.08 },
    );

    cards.forEach((card) => mobileCardObserver.observe(card));
  } else {
    const desktopCardObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          cards.forEach((card, index) => activateGroupsCard(card, index));
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px 12%", threshold: 0.06 },
    );

    desktopCardObserver.observe(grid);
  }

  if (!groupsParallaxEnabled) return;

  let groupsParallaxFrame = 0;
  let groupsGridInRange = false;

  const updateGroupsParallax = () => {
    groupsParallaxFrame = 0;
    if (!groupsGridInRange) return;

    const rect = grid.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 1;
    const progress = Math.min(
      Math.max((viewportHeight - rect.top) / Math.max(viewportHeight + rect.height, 1), 0),
      1,
    );
    const parallaxY = (0.5 - progress) * 14;
    section.style.setProperty("--groups-image-parallax", `${parallaxY.toFixed(3)}%`);
  };

  const queueGroupsParallax = () => {
    if (groupsParallaxFrame) return;
    groupsParallaxFrame = window.requestAnimationFrame(updateGroupsParallax);
  };

  const groupsRangeObserver = new IntersectionObserver(
    (entries) => {
      groupsGridInRange = entries.some((entry) => entry.isIntersecting);
      if (groupsGridInRange) queueGroupsParallax();
    },
    { rootMargin: "35% 0px", threshold: 0 },
  );

  groupsRangeObserver.observe(grid);
  window.addEventListener("scroll", queueGroupsParallax, { passive: true });
  window.addEventListener("resize", queueGroupsParallax, { passive: true });
  window.addEventListener("site:ready", queueGroupsParallax);
});

// The contact section uses independent editorial reveals, not the grid curtain.
document.querySelectorAll("[data-signup-motion]").forEach((section) => {
  const parts = ["copy", "photo", "panel"].map((key) => ({
    key,
    element: section.querySelector(`[data-signup-${key}]`),
    visible: false,
    animations: [],
  })).filter(({ element }) => element);
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let observer = null;
  let stopped = false;
  let layoutWidth = section.clientWidth;
  let inRange = false;
  let visibilityFrame = 0;

  const cleanup = () => {
    observer?.disconnect();
    window.cancelAnimationFrame(visibilityFrame);
    section.removeEventListener("focusin", finishAll);
    section.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("site:ready", queueVisibility);
    window.removeEventListener("scroll", queueVisibility);
    window.removeEventListener("resize", onResize);
    preference.removeEventListener("change", onPreferenceChange);
  };

  const completePart = (part) => {
    if (part.element.dataset.signupRevealState === "complete") return;
    part.element.dataset.signupRevealState = "complete";
    part.animations.forEach((animation) => animation.cancel());
    part.animations = [];
    if (parts.every(({ element }) => element.dataset.signupRevealState === "complete")) {
      section.dataset.signupMotionState = "complete";
      cleanup();
    }
  };

  const finishAll = () => {
    stopped = true;
    parts.forEach(completePart);
    section.dataset.signupMotionState = "complete";
    cleanup();
  };

  const revealVisibleParts = () => {
    if (stopped || pageRoot.classList.contains("loader-active")) return;
    const tempo = window.matchMedia("(max-width: 680px)").matches ? 0.8 : 1;
    const batch = parts.filter(({ element, visible }) => visible && element.dataset.signupRevealState === "ready");
    batch.forEach((part, order) => {
      if (stopped) return;
      part.element.dataset.signupRevealState = "active";
      section.dataset.signupMotionState = "active";
      const animate = (element, keyframes, duration, delay = 0, easing = "cubic-bezier(0.22, 1, 0.36, 1)") => {
        const animation = element.animate(keyframes, {
          duration: duration * tempo,
          delay: (order * 140 + delay) * tempo,
          easing,
          fill: "both",
        });
        animation.id = `signup-entrance-${part.key}`;
        part.animations.push(animation);
      };
      const fadeUp = (element, delay) => animate(element, [
        { opacity: 0, transform: "translate3d(0, 16px, 0)" },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ], 750, delay);

      try {
        if (part.key === "copy") {
          part.element.querySelectorAll("[data-signup-title-text]").forEach((line, index) => animate(line, [
            { opacity: 0, transform: "translate3d(0, 125%, 0)" },
            { opacity: 1, transform: "translate3d(0, 0, 0)" },
          ], 1000, 80 + index * 140));
          part.element.querySelectorAll("[data-signup-detail]").forEach((detail, index) => {
            fadeUp(detail, index === 0 ? 0 : 300 + index * 100);
          });
        } else if (part.key === "photo") {
          animate(part.element, [
            { clipPath: "inset(0 100% 0 0)" },
            { clipPath: "inset(0 0% 0 0)" },
          ], 1100, 0, "cubic-bezier(0.77, 0, 0.175, 1)");
        } else {
          const offset = window.matchMedia("(max-width: 1160px)").matches
            ? "translate3d(0, 24px, 0)" : "translate3d(36px, 0, 0)";
          animate(part.element, [
            { opacity: 0, transform: offset },
            { opacity: 1, transform: "translate3d(0, 0, 0)" },
          ], 950);
        }
        Promise.allSettled(part.animations.map((animation) => animation.finished)).then(() => completePart(part));
      } catch {
        part.animations.forEach((animation) => animation.finished.catch(() => {}));
        finishAll();
      }
    });
  };

  const onPointerDown = (event) => {
    if (event.target instanceof Element
      && event.target.closest("a, button, input, select, textarea, label, [role='button']")) finishAll();
  };
  const onPreferenceChange = (event) => {
    if (event.matches) finishAll();
  };
  const updateVisibility = () => {
    visibilityFrame = 0;
    if (!inRange || stopped) return;
    // Measure the frame, not its clipped intersection: a closed photo aperture
    // would otherwise never enter the observer and could stay invisible forever.
    parts.forEach((part) => {
      const rect = part.element.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      part.visible = visibleHeight >= Math.min(rect.height * 0.08, 64)
        && rect.right > 0 && rect.left < window.innerWidth;
    });
    revealVisibleParts();
  };
  const queueVisibility = () => {
    if (inRange && !stopped && !visibilityFrame) visibilityFrame = window.requestAnimationFrame(updateVisibility);
  };
  const onResize = () => {
    if (layoutWidth !== section.clientWidth && section.dataset.signupMotionState === "active") finishAll();
    layoutWidth = section.clientWidth;
    queueVisibility();
  };

  if (!pathWipeMotionEnabled || parts.length !== 3) {
    finishAll();
    return;
  }

  section.dataset.signupMotionState = "ready";
  parts.forEach(({ element }) => { element.dataset.signupRevealState = "ready"; });
  observer = new IntersectionObserver((entries) => {
    inRange = entries.some((entry) => entry.isIntersecting);
    queueVisibility();
  }, { threshold: 0 });
  observer.observe(section);
  section.addEventListener("focusin", finishAll);
  section.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("site:ready", queueVisibility);
  window.addEventListener("scroll", queueVisibility, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  preference.addEventListener("change", onPreferenceChange);
});

// Keep photo depth separate from its entrance aperture.
const signupPhotoParallaxEnabled = !staticPreview
  && !reduceMotion
  && "IntersectionObserver" in window
  && window.matchMedia("(min-width: 1161px) and (hover: hover) and (pointer: fine)").matches;

if (signupPhotoParallaxEnabled) {
  document.querySelectorAll("[data-signup-photo]").forEach((photo) => {
    let frame = 0;
    let inRange = false;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      frame = 0;
      if (!inRange || motionPreference.matches) return;
      const rect = photo.getBoundingClientRect();
      const progress = Math.min(Math.max(
        (window.innerHeight - rect.top) / Math.max(window.innerHeight + rect.height, 1), 0,
      ), 1);
      photo.style.setProperty("--signup-photo-parallax", `${((0.5 - progress) * 10).toFixed(3)}%`);
    };

    const queue = () => {
      if (!frame && inRange) frame = window.requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver((entries) => {
      inRange = entries.some((entry) => entry.isIntersecting);
      if (inRange) queue();
    }, { rootMargin: "35% 0px", threshold: 0 });

    const stopOnReducedMotion = (event) => {
      if (!event.matches) return;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      frame = 0;
      photo.style.setProperty("--signup-photo-parallax", "0%");
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      motionPreference.removeEventListener("change", stopOnReducedMotion);
    };

    observer.observe(photo);
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue, { passive: true });
    motionPreference.addEventListener("change", stopOnReducedMotion);
  });
}

const swipeClamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const navigateFromSwipeButton = (button) => {
  if (button.hasAttribute("data-signup-open") && openSignupModal(button)) return false;
  const rawHref = button.getAttribute("href");
  if (!rawHref) return false;

  const destination = new URL(rawHref, window.location.href);
  if (button.target === "_blank") {
    window.open(destination.href, "_blank", "noopener,noreferrer");
    return false;
  }
  const isSameDocument = destination.origin === window.location.origin
    && destination.pathname === window.location.pathname
    && destination.search === window.location.search
    && destination.hash;

  if (!isSameDocument) {
    window.location.assign(destination.href);
    return true;
  }

  const target = document.querySelector(destination.hash);
  if (!target) {
    window.location.assign(destination.href);
    return true;
  }

  const nextUrl = `${destination.pathname}${destination.search}${destination.hash}`;
  if (window.location.hash === destination.hash) {
    window.history.replaceState(null, "", nextUrl);
  } else {
    window.history.pushState(null, "", nextUrl);
  }

  const headerHeight = Number.parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue("--header-height"),
  ) || 0;
  const targetTop = target.getBoundingClientRect().top + window.scrollY - headerHeight - 24;

  if (smoothScrollController) {
    smoothScrollController.scrollTo(targetTop, { protect: true });
  } else {
    window.scrollTo({
      top: targetTop,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  return false;
};

document.querySelectorAll(".swipe-button").forEach((button) => {
  const orb = button.querySelector(".swipe-button__orb");
  const label = button.querySelector(".swipe-button__label");
  if (!orb || !label) return;
  const isQuizAction = button.hasAttribute("data-quiz-next");
  const isDirectRoute = button.hasAttribute("data-swipe-route");
  const usesTouchIntent = isQuizAction || isDirectRoute;

  let pointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartProgress = 0;
  let dragDistance = 0;
  let horizontalIntent = false;
  let suppressClickUntil = 0;
  let completionTimer = 0;
  let resetTimer = 0;

  const getProgress = () => Number.parseFloat(button.dataset.swipeProgress || "0") || 0;

  const getMaxOffset = () => {
    const leftInset = Number.parseFloat(window.getComputedStyle(orb).left) || 0;
    return Math.max(button.clientWidth - orb.offsetWidth - (leftInset * 2), 0);
  };

  const setSwipeProgress = (progress, state = button.dataset.swipeState || "idle") => {
    const nextProgress = swipeClamp(progress);
    button.dataset.swipeProgress = nextProgress.toFixed(2);
    button.dataset.swipeState = state;
    button.style.setProperty("--swipe-progress", nextProgress.toFixed(4));
    button.style.setProperty("--swipe-offset", `${(getMaxOffset() * nextProgress).toFixed(2)}px`);
  };

  const resetSwipe = () => {
    window.clearTimeout(completionTimer);
    window.clearTimeout(resetTimer);
    button.removeAttribute("aria-busy");
    const capturedPointer = pointerId;
    pointerId = null;
    horizontalIntent = false;
    if (capturedPointer !== null && orb.hasPointerCapture(capturedPointer)) orb.releasePointerCapture(capturedPointer);
    setSwipeProgress(0, "idle");
  };

  const completeSwipe = (method) => {
    if (button.dataset.swipeState === "completing") return;
    // Form validation happens before the completion animation; links keep their
    // existing navigation path. A swipe never doubles as a second native click.
    if (isQuizAction && !button.dispatchEvent(new CustomEvent("swipe:before", { cancelable: true }))) {
      resetSwipe();
      return;
    }

    window.clearTimeout(completionTimer);
    window.clearTimeout(resetTimer);
    button.setAttribute("aria-busy", "true");
    setSwipeProgress(1, "completing");

    const rawHref = button.getAttribute("href") || "";
    const destination = rawHref.startsWith("#")
      ? rawHref
      : rawHref
        ? new URL(rawHref, window.location.href).hostname
        : "";

    trackFunnelEvent("cta_click", {
      cta: button.dataset.cta || "unknown",
      destination,
    });
    trackFunnelEvent("swipe_cta_complete", {
      cta: button.dataset.cta || "unknown",
      method,
    });

    // Open external routes inside the original click/key/pointer gesture so
    // a new tab is allowed, while the visual completion can finish separately.
    if (isDirectRoute) {
      navigateFromSwipeButton(button);
      resetTimer = window.setTimeout(resetSwipe, reduceMotion ? 0 : 520);
      return;
    }

    const completionDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 380;
    completionTimer = window.setTimeout(() => {
      if (isQuizAction) {
        button.dispatchEvent(new CustomEvent("swipe:complete", { detail: { method } }));
        resetSwipe();
        return;
      }
      const leavesPage = navigateFromSwipeButton(button);
      if (!leavesPage) {
        resetTimer = window.setTimeout(resetSwipe, reduceMotion ? 0 : 520);
      }
    }, completionDelay);
  };

  const endDrag = (event, cancelled = false) => {
    if (pointerId === null || event.pointerId !== pointerId) return;

    const releasedPointerId = pointerId;
    pointerId = null;
    if (orb.hasPointerCapture(releasedPointerId)) orb.releasePointerCapture(releasedPointerId);

    const progress = getProgress();
    const wasDragged = dragDistance > 5;

    if (cancelled) {
      if (usesTouchIntent) suppressClickUntil = performance.now() + 500;
      resetSwipe();
      return;
    }

    if (progress >= 0.72) {
      suppressClickUntil = performance.now() + 700;
      completeSwipe("drag");
      return;
    }

    resetSwipe();
    if (wasDragged) suppressClickUntil = performance.now() + 500;
  };

  const accessibleLabel = label.textContent.trim();
  button.setAttribute(
    "aria-label",
    usesTouchIntent ? accessibleLabel : `${accessibleLabel}. Нажмите или протяните круглую кнопку вправо`,
  );
  if (usesTouchIntent) button.setAttribute("aria-description", "Нажмите или протяните круглую кнопку вправо");
  setSwipeProgress(0, "idle");
  button.addEventListener("swipe:reset", resetSwipe);

  orb.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (button.dataset.swipeState === "completing" || pointerId !== null) return;

    window.clearTimeout(resetTimer);
    pointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartProgress = getProgress();
    dragDistance = 0;
    horizontalIntent = !usesTouchIntent;
    if (horizontalIntent) {
      setSwipeProgress(dragStartProgress, "dragging");
      orb.setPointerCapture(pointerId);
    }
  });

  const dragTarget = usesTouchIntent ? window : orb;
  dragTarget.addEventListener("pointermove", (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;

    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;
    dragDistance = Math.max(dragDistance, Math.abs(deltaX));
    if (usesTouchIntent && !horizontalIntent) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        endDrag(event, true);
        return;
      }
      if (Math.abs(deltaX) <= 8) return;
      horizontalIntent = true;
      orb.setPointerCapture(pointerId);
    }
    const maxOffset = Math.max(getMaxOffset(), 1);
    setSwipeProgress(dragStartProgress + (deltaX / maxOffset), "dragging");

    // Form and map gestures use CSS pan-y; vertical scrolling stays native.
    if (!usesTouchIntent && dragDistance > 5 && event.cancelable) event.preventDefault();
  });

  dragTarget.addEventListener("pointerup", (event) => endDrag(event));
  dragTarget.addEventListener("pointercancel", (event) => endDrag(event, true));
  orb.addEventListener("lostpointercapture", (event) => {
    // Touch may initially capture an inner SVG. Its bubbling capture-loss event
    // is not a cancellation of the thumb that has just taken over the gesture.
    if (event.target !== orb || orb.hasPointerCapture(event.pointerId)) return;
    if (pointerId !== null && event.pointerId === pointerId) endDrag(event, true);
  });
  button.addEventListener("dragstart", (event) => event.preventDefault());

  button.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    event.stopPropagation();

    if (performance.now() < suppressClickUntil && (!usesTouchIntent || event.detail !== 0)) return;
    if (button.dataset.swipeState === "completing") return;

    completeSwipe(event.detail === 0 ? "keyboard" : "click");
  });
  if (usesTouchIntent) {
    // Once the thumb owns a horizontal gesture, prevent the browser's legacy
    // touch gesture from consuming the first tap on the newly revealed step.
    // Vertical intent is cancelled above, so page scrolling remains available.
    button.addEventListener("touchmove", (event) => {
      if (pointerId !== null && horizontalIntent && event.cancelable) event.preventDefault();
    }, { passive: false });
    window.addEventListener("resize", () => {
      if (pointerId !== null || button.dataset.swipeState === "completing") resetSwipe();
    }, { passive: true });
  }

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(() => {
      setSwipeProgress(getProgress(), button.dataset.swipeState || "idle");
    });
    resizeObserver.observe(button);
  }
});

document.querySelectorAll("[data-cta]").forEach((link) => {
  link.addEventListener("click", () => {
    if (link.classList.contains("swipe-button")) return;
    const destination = link.hash || (link.href ? new URL(link.href, window.location.href).hostname : "");
    trackFunnelEvent("cta_click", {
      cta: link.dataset.cta || "unknown",
      destination,
    });
  });
});

const funnelSections = document.querySelectorAll("[data-funnel-section]");

if ("IntersectionObserver" in window && funnelSections.length) {
  const seenSections = new Set();
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const sectionName = entry.target.dataset.funnelSection;
        if (!sectionName || seenSections.has(sectionName)) return;

        seenSections.add(sectionName);
        trackFunnelEvent("section_view", {
          section: sectionName,
          heat: entry.target.dataset.heat || "unrated",
        });
      });
    },
    { rootMargin: "-12% 0px -12%", threshold: 0.18 },
  );

  funnelSections.forEach((section) => sectionObserver.observe(section));
}

if (hero) {
  const heroSlides = [...hero.querySelectorAll("[data-hero-slide]")];
  const heroGotoButtons = [...hero.querySelectorAll("[data-hero-goto]")];
  const heroLive = hero.querySelector("[data-hero-live]");
  const heroNextButton = hero.querySelector("[data-hero-next]");
  const parallaxItems = hero.querySelectorAll("[data-parallax]");
  const viewedHeroSlides = new Set();
  const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
  let previewSlideIndex = previewHeroSlide;
  const heroState = {
    activeSlide: -1,
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0,
    frame: 0,
    scrollFrame: 0,
  };

  const syncParallax = () => {
    heroState.currentX += (heroState.targetX - heroState.currentX) * 0.08;
    heroState.currentY += (heroState.targetY - heroState.currentY) * 0.08;

    hero.style.setProperty("--hero-shift-x", `${heroState.currentX.toFixed(2)}px`);
    hero.style.setProperty("--hero-shift-y", `${heroState.currentY.toFixed(2)}px`);

    parallaxItems.forEach((item) => {
      const depth = Number(item.dataset.parallaxDepth || "1");
      const moveX = (heroState.currentX * depth * 0.5).toFixed(2);
      const moveY = (heroState.currentY * depth * 0.5).toFixed(2);
      item.style.setProperty("--parallax-item-x", `${moveX}px`);
      item.style.setProperty("--parallax-item-y", `${moveY}px`);
    });

    if (
      Math.abs(heroState.targetX - heroState.currentX) > 0.08 ||
      Math.abs(heroState.targetY - heroState.currentY) > 0.08
    ) {
      heroState.frame = window.requestAnimationFrame(syncParallax);
      return;
    }

    heroState.frame = 0;
  };

  const queueParallax = () => {
    if (heroState.frame) return;
    heroState.frame = window.requestAnimationFrame(syncParallax);
  };

  const updateHeroSlideState = (index) => {
    if (heroState.activeSlide === index) return;

    heroState.activeSlide = index;
    hero.dataset.activeSlide = String(index);
    heroStory?.setAttribute("data-active-slide", String(index));

    heroSlides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === index;
      slide.setAttribute("aria-hidden", String(!isActive));
      if (!isActive && slide.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (isActive) {
        slide.removeAttribute("inert");
      } else {
        slide.setAttribute("inert", "");
      }
    });

    heroGotoButtons.forEach((button, buttonIndex) => {
      button.setAttribute("aria-current", buttonIndex === index ? "true" : "false");
    });

    if (heroLive) {
      heroLive.textContent = index === 0
        ? "Кадр 1 из 2: набор в секцию"
        : "Кадр 2 из 2: опыт Александры и доверие";
    }

    if (!staticPreview && !viewedHeroSlides.has(index)) {
      viewedHeroSlides.add(index);
      trackFunnelEvent("hero_slide_view", {
        slide: index + 1,
        label: index === 0 ? "offer" : "coach_trust",
      });
    }
  };

  const syncPreviewUrl = (index) => {
    if (!staticPreview) return;

    const nextParams = new URLSearchParams(window.location.search);
    nextParams.delete("preview");
    nextParams.set("capture", "1");
    nextParams.set("heroSlide", index === 1 ? "2" : "1");
    const nextUrl = `${window.location.pathname}?${nextParams.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  };

  const scrollHeroStoryTo = (index) => {
    if (staticPreview) {
      previewSlideIndex = index;
      syncPreviewUrl(index);
      window.requestAnimationFrame(updateHeroProgress);
      return;
    }

    if (!heroStory) return;

    const rect = heroStory.getBoundingClientRect();
    const startY = window.scrollY + rect.top;
    const maxOffset = Math.max(heroStory.offsetHeight - window.innerHeight, 0);
    const targetY = index === 0 ? startY : startY + (maxOffset * 0.76);

    if (smoothScrollController) {
      smoothScrollController.scrollTo(targetY, { protect: true });
    } else {
      window.scrollTo({
        top: targetY,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
  };

  const updateHeroProgress = () => {
    const targetRect = heroStory ? heroStory.getBoundingClientRect() : hero.getBoundingClientRect();
    const totalScrollable = heroStory
      ? Math.max(heroStory.offsetHeight - window.innerHeight, 1)
      : window.innerHeight + hero.offsetHeight;
    const progress = staticPreview
      ? previewSlideIndex
      : heroStory
        ? clamp((-targetRect.top) / totalScrollable)
        : clamp((window.innerHeight - targetRect.top) / totalScrollable);
    const slideOneExit = clamp((progress - 0.16) / 0.3);
    const secondaryProgress = clamp((progress - 0.2) / 0.28);
    const slideOneOpacity = 1 - slideOneExit;
    const slideOneScale = 1 - (slideOneExit * 0.045);
    const slideTwoOpacity = secondaryProgress;
    const slideTwoCopyOpacity = clamp((progress - 0.48) / 0.18);
    const slideTwoSceneOpacity = clamp((progress - 0.2) / 0.28);
    const slideTwoPhotoOpacity = clamp(1 - ((progress - 0.44) / 0.2));
    const slideTwoSubjectShift = (1 - slideTwoCopyOpacity) * 78;
    const slideTwoSubjectScale = 0.84 + (slideTwoCopyOpacity * 0.07);
    const slideTwoFxOpacity = clamp((progress - 0.34) / 0.34) * 0.42;

    hero.style.setProperty("--hero-progress", progress.toFixed(3));
    hero.style.setProperty("--story-progress", progress.toFixed(3));
    hero.style.setProperty("--hero-secondary-progress", secondaryProgress.toFixed(3));
    hero.style.setProperty("--slide-one-opacity", slideOneOpacity.toFixed(3));
    hero.style.setProperty("--slide-one-scale", slideOneScale.toFixed(3));
    hero.style.setProperty("--slide-two-opacity", slideTwoOpacity.toFixed(3));
    hero.style.setProperty("--slide-two-copy-opacity", slideTwoCopyOpacity.toFixed(3));
    hero.style.setProperty("--slide-two-copy-shift", `${((1 - slideTwoCopyOpacity) * 64).toFixed(2)}px`);
    hero.style.setProperty("--slide-two-photo-opacity", slideTwoPhotoOpacity.toFixed(3));
    hero.style.setProperty("--slide-two-scene-opacity", slideTwoSceneOpacity.toFixed(3));
    hero.style.setProperty("--slide-two-subject-shift", `${slideTwoSubjectShift.toFixed(2)}px`);
    hero.style.setProperty("--slide-two-subject-scale", slideTwoSubjectScale.toFixed(3));
    hero.style.setProperty("--slide-two-fx-opacity", slideTwoFxOpacity.toFixed(3));

    parallaxItems.forEach((item) => {
      const depth = Number(item.dataset.parallaxDepth || "1");
      const scrollOffset = reduceMotion ? 0 : -(progress * 34 * depth);
      item.style.setProperty("--parallax-scroll-y", `${scrollOffset.toFixed(2)}px`);
    });

    // Keep a dead zone around the crossover so small layout/scroll corrections
    // cannot repeatedly restart the slide-specific motion layers.
    const nextSlideIndex = heroState.activeSlide === 1
      ? progress <= 0.44
        ? 0
        : 1
      : progress >= 0.52
        ? 1
        : 0;
    updateHeroSlideState(nextSlideIndex);
    heroState.scrollFrame = 0;
  };

  if (!staticPreview && !reduceMotion) {
    const activateHero = () => window.requestAnimationFrame(() => hero.classList.add("is-live"));

    if (pageRoot.classList.contains("loader-active")) {
      window.addEventListener("site:ready", activateHero, { once: true });
    } else {
      activateHero();
    }

    hero.addEventListener("pointermove", (event) => {
      const rect = hero.getBoundingClientRect();
      const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
      const offsetY = (event.clientY - rect.top) / rect.height - 0.5;

      heroState.targetX = offsetX * 26;
      heroState.targetY = offsetY * 18;
      queueParallax();
    });

    hero.addEventListener("pointerleave", () => {
      heroState.targetX = 0;
      heroState.targetY = 0;
      queueParallax();
    });
  } else {
    hero.classList.add("is-live");
  }

  heroNextButton?.addEventListener("click", () => {
    heroNextButton.blur();
    trackFunnelEvent("hero_slide_request", { slide: 2, source: "scroll_cue" });
    scrollHeroStoryTo(1);
  });

  heroGotoButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      button.blur();
      trackFunnelEvent("hero_slide_request", {
        slide: index + 1,
        source: "hero_navigation",
      });
      scrollHeroStoryTo(index);
    });
  });

  const queueHeroProgress = () => {
    if (heroState.scrollFrame) return;
    heroState.scrollFrame = window.requestAnimationFrame(updateHeroProgress);
  };

  updateHeroProgress();
  window.addEventListener("scroll", queueHeroProgress, { passive: true });
  window.addEventListener("resize", queueHeroProgress, { passive: true });
}

const faqDetails = Array.from(document.querySelectorAll(".faq details"));
const FAQ_MOTION_DURATION = 440;
const FAQ_MOTION_BUFFER = 20;

const syncFaqSummaryState = (detail) => {
  const summary = detail.querySelector("summary");
  if (!summary) return;

  summary.setAttribute(
    "aria-expanded",
    detail.open && detail.dataset.collapsing !== "true" ? "true" : "false",
  );
};

const syncFaqAnswerVisibility = (detail) => {
  const answer = detail.querySelector(".faq__answer");
  if (!answer) return;

  answer.style.visibility = detail.open ? "visible" : "hidden";
};

const clearFaqMotion = (detail) => {
  if (typeof detail.faqFrameId === "number") {
    window.cancelAnimationFrame(detail.faqFrameId);
    detail.faqFrameId = null;
  }

  if (typeof detail.faqTimeoutId === "number") {
    window.clearTimeout(detail.faqTimeoutId);
    detail.faqTimeoutId = null;
  }

  detail.classList.remove("is-expanding", "is-closing");
  delete detail.dataset.collapsing;
  detail.style.height = "";
  detail.style.overflow = "";
};

const finishFaqClose = (detail) => {
  detail.open = false;
  clearFaqMotion(detail);
  syncFaqSummaryState(detail);
  syncFaqAnswerVisibility(detail);
};

const closeFaq = (detail) => {
  if (!detail.open && detail.dataset.collapsing !== "true") return;

  const summary = detail.querySelector("summary");
  if (!summary) return;

  clearFaqMotion(detail);

  if (reduceMotion) {
    detail.open = false;
    syncFaqSummaryState(detail);
    syncFaqAnswerVisibility(detail);
    return;
  }

  const startHeight = detail.offsetHeight;
  const endHeight = summary.offsetHeight;

  detail.dataset.collapsing = "true";
  detail.classList.add("is-closing");
  detail.style.overflow = "hidden";
  detail.style.height = `${startHeight}px`;
  syncFaqSummaryState(detail);
  syncFaqAnswerVisibility(detail);
  detail.getBoundingClientRect();

  detail.faqFrameId = window.requestAnimationFrame(() => {
    detail.style.height = `${endHeight}px`;
  });

  detail.faqTimeoutId = window.setTimeout(() => {
    finishFaqClose(detail);
  }, FAQ_MOTION_DURATION + FAQ_MOTION_BUFFER);
};

const openFaq = (detail) => {
  const summary = detail.querySelector("summary");
  if (!summary) return;

  faqDetails.forEach((otherDetail) => {
    if (otherDetail !== detail && otherDetail.open) {
      closeFaq(otherDetail);
    }
  });

  clearFaqMotion(detail);

  if (reduceMotion) {
    detail.open = true;
    syncFaqSummaryState(detail);
    syncFaqAnswerVisibility(detail);
  } else {
    const startHeight = summary.offsetHeight;
    detail.classList.add("is-expanding");
    detail.style.overflow = "hidden";
    detail.style.height = `${startHeight}px`;
    detail.open = true;
    syncFaqSummaryState(detail);
    syncFaqAnswerVisibility(detail);

    const answerInner = detail.querySelector(".faq__answer-inner");
    const endHeight = summary.offsetHeight + (answerInner?.scrollHeight || 0) + 1;
    detail.getBoundingClientRect();

    detail.faqFrameId = window.requestAnimationFrame(() => {
      detail.style.height = `${endHeight}px`;
    });

    detail.faqTimeoutId = window.setTimeout(() => {
      clearFaqMotion(detail);
      syncFaqSummaryState(detail);
      syncFaqAnswerVisibility(detail);
    }, FAQ_MOTION_DURATION + FAQ_MOTION_BUFFER);
  }

  trackFunnelEvent("faq_open", {
    question: summary.textContent.trim() || "unknown",
  });
};

faqDetails.forEach((detail) => {
  syncFaqSummaryState(detail);
  syncFaqAnswerVisibility(detail);

  const summary = detail.querySelector("summary");
  if (!summary) return;

  summary.addEventListener("click", (event) => {
    event.preventDefault();

    if (!detail.open || detail.dataset.collapsing === "true") {
      openFaq(detail);
      return;
    }

    closeFaq(detail);
  });
});

const groupSelect = document.querySelector("#lead-group");
const ageInput = document.querySelector("#lead-age");
const nameInput = document.querySelector("#lead-name");
const groupSummary = document.querySelector("[data-group-summary]");
const citySummary = document.querySelector("[data-quiz-city-summary]");
const purposeSummary = document.querySelector("[data-quiz-purpose-summary]");
const leadForm = document.querySelector("[data-lead-form]");
const quizForm = document.querySelector("[data-quiz-form]");
const quizSteps = Array.from(document.querySelectorAll("[data-quiz-step]"));
const quizProgress = document.querySelector("[data-quiz-progress]");
const quizProgressItems = Array.from(document.querySelectorAll("[data-quiz-progress-item]"));
const signupDialog = document.querySelector("[data-signup-modal]");
const signupModalContent = signupDialog?.querySelector("[data-signup-modal-content]");
const signupPanel = document.querySelector("[data-signup-panel]");
let signupModalSession = null;

const GROUP_LABELS = {
  children: "Силламяэ, дети и подростки 6–16 лет",
  narva: "Нарва, дети 5–6 лет и старше",
  young: "младшая группа до 4 лет, суббота 10:00",
  individual: "индивидуальная тренировка",
  adults: "взрослая или женская группа 17+",
};

const GROUP_SUMMARIES = {
  children: "Силламяэ · дети и подростки 6–16 лет",
  narva: "Нарва · дети 5–6+",
  young: "Младшая группа · до 4 лет",
  individual: "Индивидуально · дети или взрослые",
  adults: "Взрослая / женская группа · 17+",
};

const CITY_LABELS = {
  sillamae: "Силламяэ · ESN, Kalda 14",
  narva: "Нарва · KONKIRO, Rakvere 22D",
  flexible: "Подобрать город вместе с Александрой",
};

const PURPOSE_LABELS = {
  confidence: "Уверенность и дисциплина",
  fitness: "Форма и выносливость",
  competition: "Техника и спортивный результат",
  try: "Спокойно попробовать без давления",
};

const QUIZ_STEP_NAMES = ["participant", "city", "purpose", "contact"];
let currentQuizStep = 0;

const setSelectedGroup = (group) => {
  if (!groupSelect || !GROUP_LABELS[group]) return;

  groupSelect.value = group;
  if (groupSummary) groupSummary.textContent = GROUP_SUMMARIES[group];
};

const getQuizChoice = (name) => (
  quizForm?.querySelector(`input[name="${name}"]:checked`)?.value || ""
);

const setQuizChoice = (name, value) => {
  const input = Array.from(quizForm?.querySelectorAll(`input[name="${name}"]`) || [])
    .find((item) => item.value === value);

  if (input) input.checked = true;
};

const updateQuizReview = () => {
  const city = getQuizChoice("city");
  const purpose = getQuizChoice("purpose");

  if (citySummary) citySummary.textContent = CITY_LABELS[city] || "Выберите город";
  if (purposeSummary) purposeSummary.textContent = PURPOSE_LABELS[purpose] || "Выберите цель";
};

const syncGroupFromQuiz = () => {
  const participantInput = quizForm?.querySelector('input[name="participant"]:checked');
  if (!participantInput) return;

  const participant = participantInput.value;
  const city = getQuizChoice("city");
  const age = Number(ageInput?.value);
  let group = participantInput.dataset.quizGroup || "children";

  if (participant === "individual") {
    group = "individual";
  } else if (participant === "adult") {
    group = "adults";
  } else if (Number.isFinite(age) && age >= 1 && age <= 4) {
    group = "young";
  } else if (city === "narva" || (!city && age === 5)) {
    group = "narva";
  } else {
    group = "children";
  }

  setSelectedGroup(group);
};

const showQuizStep = (stepIndex, { focus = true, track = true } = {}) => {
  if (!quizSteps.length) return;
  quizForm?.querySelectorAll("[data-quiz-next]").forEach((button) => button.dispatchEvent(new Event("swipe:reset")));

  currentQuizStep = Math.min(Math.max(stepIndex, 0), quizSteps.length - 1);

  quizSteps.forEach((step, index) => {
    const isActive = index === currentQuizStep;
    step.hidden = !isActive;
    step.classList.toggle("is-active", isActive);
    step.setAttribute("aria-hidden", String(!isActive));
  });

  quizProgress?.setAttribute("aria-valuenow", String(currentQuizStep + 1));
  quizProgress?.style.setProperty(
    "--quiz-progress",
    `${((currentQuizStep + 1) / quizSteps.length) * 100}%`,
  );

  quizProgressItems.forEach((item, index) => {
    const isCurrent = index === currentQuizStep;
    item.classList.toggle("is-current", isCurrent);
    item.classList.toggle("is-complete", index < currentQuizStep);

    if (isCurrent) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  });

  if (signupDialog?.open) signupModalContent?.scrollTo({ top: 0, behavior: "instant" });

  if (track) {
    trackFunnelEvent("quiz_step_view", {
      step: currentQuizStep + 1,
      step_name: QUIZ_STEP_NAMES[currentQuizStep],
    });
  }

  if (!focus) return;

  window.requestAnimationFrame(() => {
    const activeStep = quizSteps[currentQuizStep];
    const focusTarget = activeStep?.querySelector(
      'input:checked, input:not([type="hidden"]), button, select, textarea',
    );
    focusTarget?.focus({ preventScroll: true });
  });
};

const validateQuizStep = (stepIndex) => {
  const step = quizSteps[stepIndex];
  if (!step) return false;

  const requiredControls = Array.from(step.querySelectorAll("[required]"));
  const validatedRadioGroups = new Set();

  for (const control of requiredControls) {
    if (control instanceof HTMLInputElement && control.type === "radio") {
      if (validatedRadioGroups.has(control.name)) continue;
      validatedRadioGroups.add(control.name);

      const radioGroup = requiredControls.filter((item) => item.name === control.name);
      if (!radioGroup.some((item) => item.checked)) {
        control.reportValidity();
        return false;
      }
      continue;
    }

    if (!control.checkValidity()) {
      control.reportValidity();
      return false;
    }
  }

  return true;
};

const prefillQuizFromGroup = (group) => {
  const participantByGroup = {
    children: "child",
    narva: "child",
    young: "child",
    individual: "individual",
    adults: "adult",
  };
  const cityByGroup = {
    children: "sillamae",
    narva: "narva",
    young: "sillamae",
    individual: "flexible",
    adults: "sillamae",
  };

  setQuizChoice("participant", participantByGroup[group]);
  setQuizChoice("city", cityByGroup[group]);
  setSelectedGroup(group);
  updateQuizReview();
  showQuizStep(0, { focus: false, track: false });
};

function openSignupModal(trigger) {
  if (!signupDialog || !signupPanel || !signupModalContent || typeof signupDialog.showModal !== "function") return false;
  if (signupDialog.open) return true;
  if (signupModalSession) restoreSignupPanel();

  smoothScrollController?.stop();
  const opener = isMobileNavViewport() && trigger.closest(".site-nav") ? navToggle : trigger;
  setMenuState(false);
  const group = trigger.dataset.group;
  if (group && GROUP_LABELS[group]) {
    prefillQuizFromGroup(group);
    trackFunnelEvent("group_selected", { group });
  }

  // Reuse the live form, including its values/listeners. Keep its original grid
  // space so opening a dialog never changes the background scroll position.
  const panelStyle = getComputedStyle(signupPanel);
  const placeholder = document.createElement("div");
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.className = "signup-modal-placeholder";
  placeholder.style.height = `${signupPanel.getBoundingClientRect().height}px`;
  placeholder.style.gridColumn = panelStyle.gridColumn;
  placeholder.style.gridRow = panelStyle.gridRow;
  signupPanel.before(placeholder);

  const bodyProperties = ["position", "top", "left", "right", "width", "padding-right"];
  const bodyStyles = bodyProperties.map((property) => [property,
    document.body.style.getPropertyValue(property), document.body.style.getPropertyPriority(property)]);
  signupModalSession = { opener, placeholder, x: scrollX, y: scrollY, bodyStyles };
  const scrollbarWidth = Math.max(0, innerWidth - pageRoot.clientWidth);
  const bodyPadding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;

  signupModalContent.append(signupPanel);
  pageRoot.classList.add("signup-modal-open");
  document.body.classList.add("signup-modal-open");
  Object.assign(document.body.style, {
    position: "fixed", top: `-${signupModalSession.y}px`, left: "0", right: "0", width: "100%",
    paddingRight: `${bodyPadding + scrollbarWidth}px`,
  });

  try {
    signupDialog.showModal();
    signupModalContent.scrollTo({ top: 0, behavior: "instant" });
    signupDialog.querySelector("[data-signup-modal-close]")?.focus({ preventScroll: true });
  } catch {
    restoreSignupPanel();
    return false;
  }
  trackFunnelEvent("signup_modal_open", { cta: trigger.dataset.cta || "unknown", group: group || groupSelect?.value });
  return true;
}

function restoreSignupPanel() {
  if (!signupModalSession) return;
  const session = signupModalSession;
  signupModalSession = null;
  session.placeholder.replaceWith(signupPanel);
  pageRoot.classList.remove("signup-modal-open");
  document.body.classList.remove("signup-modal-open");
  session.bodyStyles.forEach(([property, value, priority]) => {
    if (value) document.body.style.setProperty(property, value, priority);
    else document.body.style.removeProperty(property);
  });
  window.scrollTo({ left: session.x, top: session.y, behavior: "instant" });
  smoothScrollController?.stop();
  session.opener?.dispatchEvent(new Event("swipe:reset"));
  session.opener?.focus({ preventScroll: true });
}

function closeSignupModal() {
  signupDialog?.close();
  restoreSignupPanel();
}

signupDialog?.querySelector("[data-signup-modal-close]")?.addEventListener("click", closeSignupModal);
signupDialog?.addEventListener("close", () => {
  // The native close event is queued; it must not dismantle a newly reopened dialog.
  if (!signupDialog.open) restoreSignupPanel();
});
signupDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeSignupModal();
});
signupDialog?.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const focusable = [...signupDialog.querySelectorAll(
    'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus({ preventScroll: true });
  }
});

let signupBackdropDown = false;
const outsideSignupDialog = (event) => {
  const rect = signupDialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
};
signupDialog?.addEventListener("pointerdown", (event) => {
  signupBackdropDown = event.target === signupDialog && outsideSignupDialog(event);
});
signupDialog?.addEventListener("click", (event) => {
  if (signupBackdropDown && event.target === signupDialog && outsideSignupDialog(event)) closeSignupModal();
  signupBackdropDown = false;
});

// Keep useful anchor fallbacks without JavaScript / native dialog support.
document.querySelectorAll('a[href="#quick-start"], a[href="#signup"]').forEach((link) => {
  if (signupDialog && typeof signupDialog.showModal === "function") {
    link.setAttribute("data-signup-open", "");
    link.setAttribute("aria-haspopup", "dialog");
    link.setAttribute("aria-controls", "signup-modal");
  }
  if (link.classList.contains("swipe-button")) return;
  link.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (openSignupModal(link)) {
      event.preventDefault();
    } else if (link.dataset.group) {
      prefillQuizFromGroup(link.dataset.group);
    }
  });
});

quizForm?.querySelectorAll('input[name="participant"], input[name="city"], input[name="purpose"]')
  .forEach((input) => {
    input.addEventListener("change", () => {
      syncGroupFromQuiz();
      updateQuizReview();

      trackFunnelEvent("quiz_choice", {
        question: input.name,
        choice: input.value,
      });
    });
  });

ageInput?.addEventListener("input", () => {
  syncGroupFromQuiz();
  updateQuizReview();
});

quizForm?.querySelectorAll("[data-quiz-next]").forEach((button) => {
  button.addEventListener("swipe:before", (event) => {
    const stepIndex = Number(button.closest("[data-quiz-step]")?.dataset.quizStep);
    if (stepIndex !== currentQuizStep || !validateQuizStep(stepIndex)) event.preventDefault();
  });
  button.addEventListener("swipe:complete", () => {
    const stepIndex = Number(button.closest("[data-quiz-step]")?.dataset.quizStep);
    if (!Number.isInteger(stepIndex) || stepIndex !== currentQuizStep || !validateQuizStep(stepIndex)) return;

    syncGroupFromQuiz();
    updateQuizReview();
    trackFunnelEvent("quiz_step_complete", {
      step: stepIndex + 1,
      step_name: QUIZ_STEP_NAMES[stepIndex],
    });
    showQuizStep(stepIndex + 1);
  });
});

quizForm?.querySelectorAll("[data-quiz-back]").forEach((button) => {
  button.addEventListener("click", () => {
    const stepIndex = Number(button.closest("[data-quiz-step]")?.dataset.quizStep);
    if (!Number.isInteger(stepIndex)) return;
    showQuizStep(stepIndex - 1);
  });
});

showQuizStep(0, { focus: false, track: false });
updateQuizReview();

if (leadForm) leadForm.noValidate = true;

leadForm?.addEventListener(
  "focusin",
  () => trackFunnelEvent("form_start", { group: groupSelect?.value || "children" }),
  { once: true },
);

leadForm?.addEventListener(
  "invalid",
  (event) => {
    trackFunnelEvent("form_invalid", { field: event.target.name || "unknown" });
  },
  true,
);

leadForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (currentQuizStep < quizSteps.length - 1) {
    if (!validateQuizStep(currentQuizStep)) return;

    syncGroupFromQuiz();
    updateQuizReview();
    showQuizStep(currentQuizStep + 1);
    return;
  }

  const firstInvalidStep = quizSteps.findIndex((step) => (
    Array.from(step.querySelectorAll("[required]")).some((control) => !control.checkValidity())
  ));

  if (firstInvalidStep >= 0) {
    showQuizStep(firstInvalidStep);
    window.requestAnimationFrame(() => validateQuizStep(firstInvalidStep));
    return;
  }

  const formData = new FormData(leadForm);
  const name = String(formData.get("name") || "").trim();
  const contact = String(formData.get("contact") || "").trim();
  const age = String(formData.get("age") || "").trim();
  const group = String(formData.get("group") || "children");
  const city = String(formData.get("city") || "flexible");
  const purpose = String(formData.get("purpose") || "try");

  const messageLines = [
    "Здравствуйте, Александра! Хочу оставить заявку на занятия по кикбоксингу.",
    "",
    `Группа: ${GROUP_LABELS[group] || group}`,
    `Где удобно: ${CITY_LABELS[city] || city}`,
    `Цель тренировки: ${PURPOSE_LABELS[purpose] || purpose}`,
    `Возраст участника: ${age}`,
    `Меня зовут: ${name}`,
    `Телефон / WhatsApp для связи: ${contact}`,
  ];

  messageLines.push("", "Подскажите, пожалуйста, какая группа подходит и как попасть на первую тренировку.");

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(messageLines.join("\n"))}`;
  const submitLabel = leadForm.querySelector("[data-submit-label]");

  trackFunnelEvent("lead_submit", {
    group,
    city,
    purpose,
    quiz_version: "4_step",
  });

  if (submitLabel) submitLabel.textContent = "Открываем WhatsApp...";

  const whatsappLink = document.createElement("a");
  whatsappLink.href = whatsappUrl;
  whatsappLink.target = "_blank";
  whatsappLink.rel = "noopener noreferrer";
  document.body.append(whatsappLink);
  whatsappLink.click();
  whatsappLink.remove();

  window.setTimeout(() => {
    if (submitLabel) submitLabel.textContent = "Открыть WhatsApp";
  }, 1800);
});

document.querySelectorAll("[data-training-video]").forEach((trainingVideo) => {
  const videoShell = trainingVideo.closest(".moment--video, .hall__photo");
  const fallbackNote = videoShell?.querySelector("[data-video-fallback]");

  const showVideoFallback = () => {
    videoShell?.classList.add("is-unavailable");
    fallbackNote?.removeAttribute("hidden");
  };

  const hideVideoFallback = () => {
    videoShell?.classList.remove("is-unavailable");
    fallbackNote?.setAttribute("hidden", "");
  };

  const tryPlay = () => {
    const playPromise = trainingVideo.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        showVideoFallback();
      });
    }
  };

  fallbackNote?.setAttribute("hidden", "");

  const videoFallbackTimer = window.setTimeout(() => {
    if (trainingVideo.readyState < 2 || trainingVideo.paused) {
      showVideoFallback();
    }
  }, 4500);

  trainingVideo.addEventListener("loadedmetadata", () => {
    window.clearTimeout(videoFallbackTimer);
    hideVideoFallback();
    tryPlay();
  });

  trainingVideo.addEventListener("canplay", () => {
    hideVideoFallback();
    tryPlay();
  });

  trainingVideo.addEventListener("playing", () => {
    window.clearTimeout(videoFallbackTimer);
    hideVideoFallback();
  });

  trainingVideo.addEventListener("error", showVideoFallback, { once: true });
  tryPlay();
});

// Try audible playback once per visit. If blocked, playback is controlled
// directly in the YouTube player, without a separate prompt below the video.
const newsVideoFrame = document.querySelector("[data-news-video]");

if (newsVideoFrame instanceof HTMLIFrameElement) {
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  newsVideoFrame.dataset.newsAutoplay = "manual";

  if (!staticPreview && !motionPreference.matches && "IntersectionObserver" in window) {
    let player = null;
    let ready = false;
    let initializing = false;
    let consumed = false;
    let observer = null;
    let apiTimer = 0;
    newsVideoFrame.dataset.newsAutoplay = "waiting";
    const embedUrl = new URL(newsVideoFrame.src);
    if (/^https?:$/.test(window.location.protocol)) {
      embedUrl.searchParams.set("origin", window.location.origin);
      newsVideoFrame.src = embedUrl.href;
    }

    const finishAutoplay = (state) => {
      consumed = true;
      newsVideoFrame.dataset.newsAutoplay = state;
      observer?.disconnect();
      window.clearTimeout(apiTimer);
      document.removeEventListener("visibilitychange", maybeAutoplay);
      window.removeEventListener("site:ready", maybeAutoplay);
      motionPreference.removeEventListener("change", onMotionPreferenceChange);
    };

    const useNativePlayer = () => {
      ready = false;
      finishAutoplay("manual");
    };

    const playWithSound = () => {
      // Only set the initial sound at the automatic play request, never on later
      // player state/scroll events: the visitor owns subsequent volume changes.
      player.unMute();
      player.setVolume(70);
      player.playVideo();
    };

    const isVideoVisible = () => {
      const rect = newsVideoFrame.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      return rect.width > 0 && rect.height > 0
        && visibleWidth * visibleHeight / (rect.width * rect.height) >= 0.6;
    };

    const connectPlayer = () => {
      if (consumed || player || typeof window.YT?.Player !== "function") return;
      try {
        player = new window.YT.Player(newsVideoFrame, {
          events: {
            onReady(event) {
              player = event.target;
              ready = true;
              window.clearTimeout(apiTimer);
              maybeAutoplay();
            },
            onStateChange(event) {
              // A manual start/pause also consumes the automatic attempt.
              if (event.data === 1) {
                finishAutoplay("playing");
              }
              if (event.data === 2) finishAutoplay("paused");
              if (event.data === 0) finishAutoplay("ended");
            },
            onAutoplayBlocked() {
              finishAutoplay("blocked");
            },
            onError: useNativePlayer,
          },
        });
      } catch {
        useNativePlayer();
      }
    };

    const loadPlayerApi = () => {
      if (initializing) return;
      initializing = true;
      newsVideoFrame.dataset.newsAutoplay = "loading";
      newsVideoFrame.loading = "eager";
      apiTimer = window.setTimeout(useNativePlayer, 15000);

      if (typeof window.YT?.Player === "function") {
        connectPlayer();
        return;
      }

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try {
          if (typeof previousReady === "function") previousReady();
        } finally {
          connectPlayer();
        }
      };

      const apiScript = document.createElement("script");
      apiScript.src = "https://www.youtube.com/iframe_api";
      apiScript.async = true;
      apiScript.addEventListener("error", useNativePlayer, { once: true });
      document.head.append(apiScript);
    };

    function maybeAutoplay() {
      if (consumed || document.hidden || pageRoot.classList.contains("loader-active") || !isVideoVisible()) return;
      if (!initializing) loadPlayerApi();
      if (!ready || consumed) return;

      try {
        if ([0, 1, 2, 3].includes(player.getPlayerState()) || player.getCurrentTime() > 0) {
          finishAutoplay("manual");
          return;
        }
        // Consume before calling the API so observer/ready events cannot replay it.
        finishAutoplay("requested");
        playWithSound();
      } catch {
        useNativePlayer();
      }
    }

    function onMotionPreferenceChange(event) {
      if (event.matches) finishAutoplay("manual");
    }

    observer = new IntersectionObserver(maybeAutoplay, { threshold: [0, 0.6, 1] });
    observer.observe(newsVideoFrame);
    document.addEventListener("visibilitychange", maybeAutoplay);
    window.addEventListener("site:ready", maybeAutoplay);
    motionPreference.addEventListener("change", onMotionPreferenceChange);
    maybeAutoplay();
  }
}

const locationMapShell = document.querySelector("[data-location-map-shell]");

if (locationMapShell) {
  const locationMapElement = locationMapShell.querySelector("[data-location-map]");
  const locationSwitcher = document.querySelector("[data-location-switcher]");
  const locationButtons = [...document.querySelectorAll("[data-location-select]")];
  const locationCards = [...document.querySelectorAll("[data-location-card]")];
  const fitMapButton = locationMapShell.querySelector("[data-map-fit]");
  const mapCity = locationMapShell.querySelector("[data-map-city]");
  const mapName = locationMapShell.querySelector("[data-map-name]");
  const mapAddress = locationMapShell.querySelector("[data-map-address]");
  const mapRoute = locationMapShell.querySelector("[data-map-route]");
  const mapFallback = locationMapShell.querySelector("[data-map-fallback]");
  const reduceMapMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const locations = {
    sillamae: {
      index: "01",
      city: "Силламяэ",
      name: "Молодёжный центр ESN",
      address: "Kalda 14 · 2-й этаж",
      coordinates: [59.396944, 27.767222],
      route: "https://www.google.com/maps/dir/?api=1&destination=Kalda+14%2C+Sillam%C3%A4e%2C+Estonia",
    },
    narva: {
      index: "02",
      city: "Нарва",
      name: "Клуб KONKIRO",
      address: "Rakvere 22D · 2-й этаж",
      coordinates: [59.385046, 28.192737],
      route: "https://www.google.com/maps/dir/?api=1&destination=Rakvere+22D%2C+Narva%2C+Estonia",
    },
  };

  let trainingMap = null;
  let activeLocation = "sillamae";
  const locationMarkers = {};

  const createLocationIcon = (location, isActive) => window.L.divIcon({
    className: "location-pin-shell",
    html: `<span class="location-pin${isActive ? " is-active" : ""}"><b>${location.index}</b></span>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    tooltipAnchor: [0, -30],
  });

  const renderLocationState = (locationId) => {
    const location = locations[locationId];
    if (!location) return;

    activeLocation = locationId;
    locationCards.forEach((card) => {
      card.classList.toggle("is-active", card.dataset.locationCard === locationId);
    });
    locationButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.locationSelect === locationId));
    });

    if (mapCity) mapCity.textContent = `${location.index} / ${location.city}`;
    if (mapName) mapName.textContent = location.name;
    if (mapAddress) mapAddress.textContent = location.address;
    if (mapRoute) mapRoute.href = location.route;

    Object.entries(locationMarkers).forEach(([markerId, marker]) => {
      marker.setIcon(createLocationIcon(locations[markerId], markerId === locationId));
      marker.setZIndexOffset(markerId === locationId ? 1000 : 0);
    });
  };

  const focusLocation = (locationId, { moveMap = true, track = false } = {}) => {
    const location = locations[locationId];
    if (!location) return;
    renderLocationState(locationId);

    if (moveMap && trainingMap) {
      if (reduceMapMotion) {
        trainingMap.setView(location.coordinates, 14);
      } else {
        trainingMap.flyTo(location.coordinates, 14, { duration: 0.72 });
      }
    }

    if (track) trackFunnelEvent("location_map_focus", { city: locationId });
  };

  const fitAllLocations = ({ track = false } = {}) => {
    if (!trainingMap || !window.L) return;
    const bounds = window.L.latLngBounds(Object.values(locations).map((location) => location.coordinates));
    const mobileMap = window.matchMedia("(max-width: 720px)").matches;
    const details = locationMapShell.querySelector("[data-map-active]");
    const detailsClearance = mobileMap && details
      ? Math.ceil(details.getBoundingClientRect().height + 14 + 40)
      : 112;
    trainingMap.fitBounds(bounds, {
      animate: !reduceMapMotion,
      maxZoom: 10,
      paddingTopLeft: [58, 86],
      paddingBottomRight: [58, detailsClearance],
    });
    if (track) trackFunnelEvent("location_map_fit_all");
  };

  locationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      focusLocation(button.dataset.locationSelect, { track: true });
    });
  });

  locationSwitcher?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const currentIndex = Math.max(0, locationButtons.indexOf(document.activeElement));
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + direction + locationButtons.length) % locationButtons.length;
    event.preventDefault();
    locationButtons[nextIndex].focus();
    locationButtons[nextIndex].click();
  });

  fitMapButton?.addEventListener("click", () => fitAllLocations({ track: true }));
  renderLocationState(activeLocation);

  if (!locationMapElement || !window.L) {
    locationMapShell.classList.add("is-fallback");
    if (mapFallback) {
      mapFallback.querySelector("strong").textContent = "Карта временно недоступна";
    }
  } else {
    try {
      trainingMap = window.L.map(locationMapElement, {
        zoomControl: false,
        scrollWheelZoom: false,
        minZoom: 7,
        maxZoom: 18,
        preferCanvas: true,
      });

      window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(trainingMap);

      window.L.control.zoom({ position: "topright" }).addTo(trainingMap);

      Object.entries(locations).forEach(([locationId, location]) => {
        const marker = window.L.marker(location.coordinates, {
          icon: createLocationIcon(location, locationId === activeLocation),
          keyboard: true,
          riseOnHover: true,
          title: `${location.name}, ${location.address}`,
        }).addTo(trainingMap);

        marker.bindTooltip(`${location.index} · ${location.city}`, {
          className: "location-tooltip",
          direction: "top",
          opacity: 1,
        });
        marker.on("click", () => focusLocation(locationId, { track: true }));
        locationMarkers[locationId] = marker;
      });

      renderLocationState(activeLocation);
      trainingMap.setView(locations[activeLocation].coordinates, 14);
      locationMapShell.classList.add("is-ready");

      window.requestAnimationFrame(() => {
        trainingMap.invalidateSize({ pan: false });
      });

      if ("ResizeObserver" in window) {
        const mapResizeObserver = new ResizeObserver(() => trainingMap.invalidateSize({ pan: false }));
        mapResizeObserver.observe(locationMapElement);
      }
    } catch (error) {
      locationMapShell.classList.add("is-fallback");
      if (mapFallback) {
        mapFallback.querySelector("strong").textContent = "Карта временно недоступна";
      }
      console.warn("Location map could not be initialized", error);
    }
  }
}

document.querySelectorAll("[data-year]").forEach((year) => {
  year.textContent = String(new Date().getFullYear());
});

document.querySelectorAll("[data-champion-ribbon]").forEach((ribbon) => {
  const toggle = ribbon.querySelector("[data-champion-ribbon-toggle]");
  if (!toggle) return;
  toggle.hidden = false;
  toggle.addEventListener("click", () => {
    const paused = ribbon.classList.toggle("is-paused");
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute("aria-label", paused
      ? "Продолжить бегущую строку «Чемпион»"
      : "Приостановить бегущую строку «Чемпион»");
  });
});
