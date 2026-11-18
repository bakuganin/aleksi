(function () {
  "use strict";

  var store = window.DzhikaevaSchedule;
  if (!store) return;

  var LANGUAGE_PATHS = {
    ru: "/calendar/",
    et: "/calendar/et/",
    en: "/calendar/en/"
  };
  var DAYS = {
    ru: ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
    et: ["", "Esmaspäev", "Teisipäev", "Kolmapäev", "Neljapäev", "Reede", "Laupäev", "Pühapäev"],
    en: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  };
  var COPY = {
    ru: {
      sillamae: "Силламяэ · Kalda 14",
      narva: "Нарва · Rakvere 22D",
      cancelled: "Занятия приостановлены",
      empty: "Для этого фильтра занятий пока нет.",
      details: "Открыть расписание",
      time: "Время"
    },
    et: {
      sillamae: "Sillamäe · Kalda 14",
      narva: "Narva · Rakvere 22D",
      cancelled: "Treeningud on peatatud",
      empty: "Selle filtri jaoks ei ole praegu treeninguid.",
      details: "Ava tunniplaan",
      time: "Kellaaeg"
    },
    en: {
      sillamae: "Sillamäe · Kalda 14",
      narva: "Narva · Rakvere 22D",
      cancelled: "Sessions paused",
      empty: "There are no sessions for this filter yet.",
      details: "Open schedule",
      time: "Time"
    }
  };

  var currentLanguage = resolveLanguage();

  function normaliseLanguage(value) {
    var language = String(value || "").toLowerCase().split(/[-_]/)[0];
    return language === "et" || language === "en" ? language : "ru";
  }

  function resolveLanguage() {
    var path = window.location.pathname;
    if (/^\/schedule\/et(?:\/|$)/i.test(path)) return "et";
    if (/^\/schedule\/en(?:\/|$)/i.test(path)) return "en";
    if (window.siteI18n && window.siteI18n.language) return normaliseLanguage(window.siteI18n.language);
    return normaliseLanguage(document.documentElement.lang);
  }

  function translated(localized, language) {
    if (!localized || typeof localized !== "object") return "";
    return String(localized[language] || localized.ru || localized.et || localized.en || "");
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function sortSessions(sessions) {
    return sessions.slice().sort(function (left, right) {
      if (left.weekday !== right.weekday) return left.weekday - right.weekday;
      if (left.start !== right.start) return left.start.localeCompare(right.start);
      return left.id.localeCompare(right.id);
    });
  }

  function groupSessions(sessions, language) {
    var groups = Object.create(null);
    sortSessions(sessions).forEach(function (item) {
      var key = [
        item.venue,
        item.start,
        item.end,
        item.title.ru,
        item.title.et,
        item.title.en,
        item.audience.ru,
        item.audience.et,
        item.audience.en,
        item.status,
        item.recurrence,
        item.date,
        item.startsOn,
        item.endsOn
      ].join("\u001f");
      if (!groups[key]) {
        groups[key] = {
          id: item.id,
          ids: [],
          weekdays: [],
          start: item.start,
          end: item.end,
          venue: item.venue,
          title: item.title,
          audience: item.audience,
          status: item.status
        };
      }
      groups[key].ids.push(item.id);
      (item.weekdays || [item.weekday]).forEach(function (weekday) {
        if (groups[key].weekdays.indexOf(weekday) === -1) groups[key].weekdays.push(weekday);
      });
      groups[key].weekdays.sort(function (left, right) { return left - right; });
    });
    return Object.keys(groups).map(function (key) {
      return groups[key];
    }).sort(function (left, right) {
      return left.weekdays[0] - right.weekdays[0] || left.start.localeCompare(right.start);
    });
  }

  function getViewList(view) {
    if (view.matches && view.matches("[data-schedule-list]")) return view;
    return view.querySelector("[data-schedule-list]");
  }

  function getFilter(view) {
    var value = view.getAttribute("data-schedule-active-filter") || "sillamae";
    return value === "narva" ? "narva" : "sillamae";
  }

  function renderCard(item, language) {
    var copy = COPY[language];
    var card = element("article", "schedule-card");
    card.setAttribute("data-schedule-item", "");
    card.setAttribute("data-schedule-id", item.id);
    card.setAttribute("data-schedule-ids", item.ids.join(" "));
    card.setAttribute("data-schedule-venue", item.venue);
    if (item.status === "cancelled") card.classList.add("schedule-card--cancelled");

    var top = element("div", "schedule-card__top");
    top.appendChild(element("span", "schedule-card__day", item.weekdays.map(function (day) {
      return DAYS[language][day];
    }).join(" · ")));
    top.appendChild(element("span", "schedule-card__venue", copy[item.venue]));
    card.appendChild(top);

    var time = element("p", "schedule-card__time", item.start + "–" + item.end);
    time.setAttribute("aria-label", copy.time + ": " + item.start + "–" + item.end);
    card.appendChild(time);
    card.appendChild(element("h3", "schedule-card__title", translated(item.title, language)));
    card.appendChild(element("p", "schedule-card__audience", translated(item.audience, language)));

    if (item.status === "cancelled") {
      var status = element("strong", "schedule-card__status", copy.cancelled);
      status.setAttribute("role", "status");
      card.appendChild(status);
    }

    return card;
  }

  function renderView(view) {
    if (view.matches && view.matches("[data-schedule-calendar]")) return;
    if (view.querySelector && view.querySelector("[data-schedule-calendar]")) return;
    var list = getViewList(view);
    if (!list) return;
    var language = currentLanguage;
    var filter = getFilter(view);
    var sessions = store.getSessions().filter(function (item) {
      return item.venue === filter;
    });
    var groupedSessions = groupSessions(sessions, language);

    list.replaceChildren();
    groupedSessions.forEach(function (item) {
      list.appendChild(renderCard(item, language));
    });

    if (!groupedSessions.length) {
      var empty = element("p", "schedule-empty", COPY[language].empty);
      empty.setAttribute("data-schedule-empty", "");
      list.appendChild(empty);
    }

    Array.prototype.forEach.call(view.querySelectorAll("[data-schedule-filter]"), function (control) {
      var value = control.getAttribute("data-schedule-filter") || control.value || "sillamae";
      if (control.tagName === "SELECT") {
        control.value = filter;
      } else {
        control.setAttribute("aria-pressed", String(value === filter));
      }
      var copyKey = value === "narva" ? "narva" : "sillamae";
      var label = control.querySelector("[data-schedule-filter-label]");
      if (label) label.textContent = COPY[language][copyKey];
    });

    var event;
    var detail = { view: view, language: language, filter: filter, count: groupedSessions.length };
    if (typeof window.CustomEvent === "function") {
      event = new CustomEvent("dzhikaeva:schedulerender", { detail: detail });
    } else {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent("dzhikaeva:schedulerender", false, false, detail);
    }
    window.dispatchEvent(event);
  }

  function views() {
    var found = Array.prototype.slice.call(document.querySelectorAll("[data-schedule-view]"));
    if (!found.length) {
      found = Array.prototype.slice.call(document.querySelectorAll("[data-schedule-section]"));
    }
    return found.filter(function (view) {
      if (view.matches && view.matches("[data-schedule-calendar]")) return false;
      return !(view.querySelector && view.querySelector("[data-schedule-calendar]"));
    });
  }

  function renderAll() {
    currentLanguage = resolveLanguage();
    views().forEach(renderView);
    Array.prototype.forEach.call(document.querySelectorAll("[data-schedule-page-link]"), function (link) {
      link.setAttribute("href", LANGUAGE_PATHS[currentLanguage]);
      var label = link.querySelector("[data-schedule-page-link-label]");
      if (label) label.textContent = COPY[currentLanguage].details;
    });
  }

  function restoreInitialFilter() {
    if (!document.querySelector("[data-schedule-app]") || !store.getUi) return;
    var saved = store.getUi().filterVenue;
    var filter = saved === "narva" ? "narva" : "sillamae";
    views().forEach(function (view) {
      view.setAttribute("data-schedule-active-filter", filter);
    });
  }

  function setViewFilter(view, value) {
    var filter = value === "narva" ? "narva" : "sillamae";
    view.setAttribute("data-schedule-active-filter", filter);
    renderView(view);
    if (store.setUi) store.setUi({ filterVenue: filter });
  }

  document.addEventListener("click", function (event) {
    var control = event.target.closest && event.target.closest("[data-schedule-filter]");
    if (!control || control.tagName === "SELECT") return;
    var view = control.closest("[data-schedule-view], [data-schedule-section]");
    if (!view) return;
    if ((view.matches && view.matches("[data-schedule-calendar]")) || (view.querySelector && view.querySelector("[data-schedule-calendar]"))) return;
    setViewFilter(view, control.getAttribute("data-schedule-filter"));
  });

  document.addEventListener("change", function (event) {
    var control = event.target.closest && event.target.closest("select[data-schedule-filter]");
    if (!control) return;
    var view = control.closest("[data-schedule-view], [data-schedule-section]");
    if (!view) return;
    if ((view.matches && view.matches("[data-schedule-calendar]")) || (view.querySelector && view.querySelector("[data-schedule-calendar]"))) return;
    setViewFilter(view, control.value);
  });

  window.addEventListener("site:languagechange", function (event) {
    currentLanguage = normaliseLanguage(event.detail && event.detail.language);
    renderAll();
  });
  window.addEventListener("dzhikaeva:schedulechange", renderAll);
  window.addEventListener("storage", function (event) {
    if (event.key === store.storageKey) renderAll();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      restoreInitialFilter();
      renderAll();
    }, { once: true });
  } else {
    restoreInitialFilter();
    renderAll();
  }

  window.DzhikaevaScheduleWidget = Object.freeze({
    renderAll: renderAll,
    setLanguage: function (language) {
      currentLanguage = normaliseLanguage(language);
      renderAll();
    },
    paths: Object.freeze(LANGUAGE_PATHS)
  });
}());
