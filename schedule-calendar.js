(function () {
  "use strict";

  var store = window.DzhikaevaSchedule;
  var dates = window.DzhikaevaScheduleDates;
  if (!store || !dates) return;

  var DEFAULT_START = 8 * 60;
  var DEFAULT_END = 21 * 60;
  var DEFAULT_STEP = 15;
  var DEFAULT_NEW_DURATION = 60;
  var controllers = [];
  var calendarUid = 0;
  var detailDossier = null;
  var DETAIL_DIALOG_ID = "schedule-detail-dialog";

  var COPY = {
    ru: {
      calendar: "Недельный календарь тренировок",
      title: "Календарь",
      recurring: "Повторения и разовые занятия",
      instructions: "Перетащите занятие за маркер или используйте Alt и стрелки. Изменение повторяющейся карточки применяется ко всей серии.",
      paletteTitle: "Шаблоны занятий",
      paletteInstructions: "Шаблон — это готовая группа без даты и времени. Перетащите его за ручку слева или выберите и нажмите нужное время в календаре.",
      paletteEmpty: "Создайте первый шаблон для быстрого добавления занятий.",
      paletteSelected: "Шаблон выбран. Теперь нажмите или перетащите на нужное время в календаре.",
      paletteCreate: "Создать шаблон",
      paletteEdit: "Изменить шаблон",
      paletteDelete: "Удалить шаблон",
      paletteDrag: "Перетащить шаблон в календарь",
      templatePlaced: "Шаблон перенесён. Проверьте время и подтвердите добавление.",
      create: "Добавить занятие в расписание",
      today: "Сегодня",
      previousWeek: "Предыдущая неделя",
      nextWeek: "Следующая неделя",
      holidays: "Государственный праздник Эстонии",
      time: "Время",
      venueSillamae: "Силламяэ · Kalda 14",
      venueNarva: "Нарва · Rakvere 22D",
      paused: "Приостановлено",
      edit: "Изменить занятие",
      drag: "Перетащить занятие",
      previousDay: "Перенести на предыдущий день",
      nextDay: "Перенести на следующий день",
      earlier: "Перенести на 30 минут раньше",
      later: "Перенести на 30 минут позже",
      addAt: "Создать занятие",
      moved: "Занятие перенесено",
      unchanged: "Занятие уже находится в этом времени",
      moveError: "Не удалось перенести занятие",
      detailEyebrow: "Информация о тренировке",
      detailOpen: "Открыть информацию о тренировке",
      detailClose: "Закрыть",
      detailDate: "Дата",
      detailTime: "Время",
      detailDuration: "Продолжительность",
      detailVenue: "Зал",
      detailAddress: "Адрес",
      detailAudience: "Для кого",
      detailRecurrence: "Периодичность",
      detailStatus: "Статус",
      detailTimezone: "Часовой пояс",
      detailWeekly: "Каждую неделю",
      detailOnce: "Разовое занятие",
      detailActive: "Занятие проводится",
      detailPaused: "Занятие приостановлено",
      days: ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
    },
    et: {
      calendar: "Treeningute nädalakalender",
      title: "Kalender",
      recurring: "Korduvad ja ühekordsed treeningud",
      instructions: "Lohista treeningut käepidemest või kasuta Alt-klahvi ja nooli. Korduva kaardi muudatus rakendub kogu sarjale.",
      paletteTitle: "Treeningumallid",
      paletteInstructions: "Mall on valmis rühm ilma kuupäeva ja kellaajata. Lohista seda vasakust käepidemest või vali mall ja puuduta kalendris sobivat aega.",
      paletteEmpty: "Loo esimene mall treeningute kiireks lisamiseks.",
      paletteSelected: "Mall on valitud. Puuduta sobivat aega või lohista mall kalendris õigesse kohta.",
      paletteCreate: "Loo mall",
      paletteEdit: "Muuda malli",
      paletteDelete: "Kustuta mall",
      paletteDrag: "Lohista mall kalendrisse",
      templatePlaced: "Mall on paigas. Kontrolli aega ja kinnita lisamine.",
      create: "Lisa treening tunniplaani",
      today: "Täna",
      previousWeek: "Eelmine nädal",
      nextWeek: "Järgmine nädal",
      holidays: "Eesti riigipüha",
      time: "Kellaaeg",
      venueSillamae: "Sillamäe · Kalda 14",
      venueNarva: "Narva · Rakvere 22D",
      paused: "Peatatud",
      edit: "Muuda treeningut",
      drag: "Lohista treeningut",
      previousDay: "Tõsta eelmisele päevale",
      nextDay: "Tõsta järgmisele päevale",
      earlier: "Tõsta 30 minutit varasemaks",
      later: "Tõsta 30 minutit hilisemaks",
      addAt: "Lisa treening",
      moved: "Treening on ümber tõstetud",
      unchanged: "Treening on juba sellel ajal",
      moveError: "Treeningu ümbertõstmine ebaõnnestus",
      detailEyebrow: "Treeningu info",
      detailOpen: "Ava treeningu üksikasjad",
      detailClose: "Sulge",
      detailDate: "Kuupäev",
      detailTime: "Kellaaeg",
      detailDuration: "Kestus",
      detailVenue: "Saal",
      detailAddress: "Aadress",
      detailAudience: "Kellele",
      detailRecurrence: "Kordumine",
      detailStatus: "Staatus",
      detailTimezone: "Ajavöönd",
      detailWeekly: "Igal nädalal",
      detailOnce: "Ühekordne treening",
      detailActive: "Treening toimub",
      detailPaused: "Treening on peatatud",
      days: ["", "Esmaspäev", "Teisipäev", "Kolmapäev", "Neljapäev", "Reede", "Laupäev", "Pühapäev"]
    },
    en: {
      calendar: "Weekly training calendar",
      title: "Calendar",
      recurring: "Recurring and one-off sessions",
      instructions: "Drag a session by its handle or use Alt and the arrow keys. Changes to a recurring card apply to the whole series.",
      paletteTitle: "Session templates",
      paletteInstructions: "A template is a saved group without a date or time. Drag it by the left handle, or select it and tap the time you need.",
      paletteEmpty: "Create your first template for quickly adding sessions.",
      paletteSelected: "Template selected. Now tap or drag it to the time you need in the calendar.",
      paletteCreate: "Create template",
      paletteEdit: "Edit template",
      paletteDelete: "Delete template",
      paletteDrag: "Drag template into the calendar",
      templatePlaced: "Template placed. Check the time and confirm adding it.",
      create: "Add session to schedule",
      today: "Today",
      previousWeek: "Previous week",
      nextWeek: "Next week",
      holidays: "Estonian public holiday",
      time: "Time",
      venueSillamae: "Sillamäe · Kalda 14",
      venueNarva: "Narva · Rakvere 22D",
      paused: "Paused",
      edit: "Edit session",
      drag: "Drag session",
      previousDay: "Move to the previous day",
      nextDay: "Move to the next day",
      earlier: "Move 30 minutes earlier",
      later: "Move 30 minutes later",
      addAt: "Create a session",
      moved: "Session moved",
      unchanged: "The session is already at this time",
      moveError: "Could not move the session",
      detailEyebrow: "Session details",
      detailOpen: "Open session details",
      detailClose: "Close",
      detailDate: "Date",
      detailTime: "Time",
      detailDuration: "Duration",
      detailVenue: "Gym",
      detailAddress: "Address",
      detailAudience: "Who it is for",
      detailRecurrence: "Recurrence",
      detailStatus: "Status",
      detailTimezone: "Time zone",
      detailWeekly: "Every week",
      detailOnce: "One-off session",
      detailActive: "Session is running",
      detailPaused: "Session is paused",
      days: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    }
  };

  function language() {
    var value = document.documentElement.getAttribute("data-schedule-language") || document.documentElement.lang || "ru";
    var code = String(value).toLowerCase().split(/[-_]/)[0];
    return code === "et" || code === "en" ? code : "ru";
  }

  function copy(key) {
    var pack = COPY[language()] || COPY.ru;
    return pack[key] || COPY.ru[key] || key;
  }

  function element(tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function button(className, label) {
    var node = element("button", className);
    node.type = "button";
    node.setAttribute("aria-label", label);
    return node;
  }

  function svgIcon(kind) {
    var namespace = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(namespace, "svg");
    var path = document.createElementNS(namespace, "path");
    var paths = {
      grip: "M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01",
      edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z",
      left: "m15 18-6-6 6-6",
      right: "m9 18 6-6-6-6",
      up: "m18 15-6-6-6 6",
      down: "m6 9 6 6 6-6",
      trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6",
      clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
      plus: "M12 5v14M5 12h14"
    };
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    path.setAttribute("d", paths[kind] || paths.plus);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", kind === "grip" ? "3" : "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  function parseTime(value) {
    var match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(String(value || ""));
    if (!match) return -1;
    var parts = String(value).split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function formatTime(value) {
    var safe = Math.max(0, Math.min(1439, Math.round(value)));
    var hours = Math.floor(safe / 60);
    var minutes = safe % 60;
    return (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes;
  }

  function roundDown(value, step) {
    return Math.floor(value / step) * step;
  }

  function roundUp(value, step) {
    return Math.ceil(value / step) * step;
  }

  function calendarStep(container) {
    var value = container.getAttribute("data-calendar-step") || container.getAttribute("data-step");
    var parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 15 && parsed <= 60 && 60 % parsed === 0 ? parsed : DEFAULT_STEP;
  }

  function calendarTimeAttribute(container, primary, alias) {
    var value = container.getAttribute(primary);
    if (value === null || value === "") value = container.getAttribute(alias);
    return parseTime(value);
  }

  function translated(value) {
    if (!value || typeof value !== "object") return "";
    return value[language()] || value.ru || value.et || value.en || "";
  }

  function venueLabel(venue) {
    return copy(venue === "narva" ? "venueNarva" : "venueSillamae");
  }

  function emit(target, name, detail) {
    var event;
    if (typeof window.CustomEvent === "function") {
      event = new CustomEvent(name, { bubbles: true, detail: detail });
    } else {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent(name, true, false, detail);
    }
    target.dispatchEvent(event);
  }

  function duration(item) {
    return parseTime(item.end) - parseTime(item.start);
  }

  function compareSessions(left, right) {
    return String(left.date || "").localeCompare(String(right.date || ""))
      || parseTime(left.start) - parseTime(right.start)
      || left.id.localeCompare(right.id);
  }

  function localeCode() {
    return language() === "et" ? "et-EE" : language() === "en" ? "en-GB" : "ru-RU";
  }

  function dateObject(iso) {
    return new Date(String(iso) + "T12:00:00Z");
  }

  function formatDayDate(iso) {
    return new Intl.DateTimeFormat(localeCode(), {
      day: "numeric",
      month: "short",
      timeZone: "UTC"
    }).format(dateObject(iso)).replace(/\.$/, "");
  }

  function formatFullDate(iso) {
    return new Intl.DateTimeFormat(localeCode(), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Tallinn"
    }).format(dateObject(iso)).replace(/\s+/g, " ").trim();
  }

  function formatFullWeekday(iso) {
    return new Intl.DateTimeFormat(localeCode(), {
      weekday: "long",
      timeZone: "Europe/Tallinn"
    }).format(dateObject(iso)).replace(/\s+/g, " ").trim();
  }

  function venueCity(venue) {
    if (venue === "narva") return language() === "ru" ? "Нарва" : "Narva";
    return language() === "ru" ? "Силламяэ" : "Sillamäe";
  }

  function venueAddress(venue) {
    return venue === "narva" ? "Rakvere 22D" : "Kalda 14";
  }

  function durationText(minutes) {
    if (language() === "et") return minutes + " minutit";
    if (language() === "en") return minutes + (minutes === 1 ? " minute" : " minutes");
    var remainder100 = minutes % 100;
    var remainder10 = minutes % 10;
    if (remainder100 >= 11 && remainder100 <= 14) return minutes + " минут";
    if (remainder10 === 1) return minutes + " минута";
    if (remainder10 >= 2 && remainder10 <= 4) return minutes + " минуты";
    return minutes + " минут";
  }

  function recurrenceText(item) {
    if (item.recurrence !== "weekly") return copy("detailOnce");
    var weekdays = Array.isArray(item.weekdays) && item.weekdays.length
      ? item.weekdays.slice()
      : [item.weekday];
    var seen = {};
    var labels = weekdays.map(Number).filter(function (weekday) {
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || seen[weekday]) return false;
      seen[weekday] = true;
      return true;
    }).sort(function (left, right) { return left - right; }).map(function (weekday) {
      return copy("days")[weekday];
    });
    return copy("detailWeekly") + (labels.length ? ": " + labels.join(", ") : "");
  }

  function safeSelectorValue(value) {
    var string = String(value || "");
    return typeof window.CSS !== "undefined" && typeof window.CSS.escape === "function"
      ? window.CSS.escape(string)
      : string.replace(/[^a-z0-9_-]/gi, "");
  }

  function detailField(list, label, value, selector) {
    var group = element("div", "schedule-detail-dialog__field");
    group.appendChild(element("dt", "schedule-detail-dialog__label", label));
    var content = element("dd", "schedule-detail-dialog__value", value);
    content.setAttribute(selector, "");
    group.appendChild(content);
    list.appendChild(group);
  }

  function DetailDossier() {
    this.dialog = document.querySelector("dialog[data-schedule-detail-dialog]");
    if (!this.dialog) {
      this.dialog = element("dialog", "schedule-detail-dialog");
      this.dialog.setAttribute("data-schedule-detail-dialog", "");
      document.body.appendChild(this.dialog);
    } else {
      this.dialog.classList.add("schedule-detail-dialog");
    }
    this.dialog.id = DETAIL_DIALOG_ID;
    this.dialog.setAttribute("role", "dialog");
    this.dialog.setAttribute("aria-modal", "true");
    this.dialog.setAttribute("aria-labelledby", DETAIL_DIALOG_ID + "-title");
    this.controller = null;
    this.sessionId = "";
    this.occurrenceDate = "";
    this.opener = null;
    this.scrollLock = null;
    this.restoreFocus = true;
    this.handlers = {};
    this.bind();
  }

  DetailDossier.prototype.bind = function () {
    var self = this;
    this.handlers.click = function (event) {
      if (event.target.closest && event.target.closest("[data-schedule-detail-close]")) {
        self.close();
        return;
      }
      if (event.target === self.dialog) self.close();
    };
    this.handlers.close = function () { self.afterClose(); };
    this.handlers.cancel = function () {
      // Let the native dialog handle Escape. The close event restores the page.
      self.restoreFocus = true;
    };
    this.dialog.addEventListener("click", this.handlers.click);
    this.dialog.addEventListener("close", this.handlers.close);
    this.dialog.addEventListener("cancel", this.handlers.cancel);
  };

  DetailDossier.prototype.occurrence = function () {
    var item = this.controller && this.controller.session(this.sessionId);
    if (!item) return null;
    try {
      return dates.occurrenceForDate(item, this.occurrenceDate);
    } catch (error) {
      return null;
    }
  };

  DetailDossier.prototype.render = function () {
    var item = this.occurrence();
    if (!item) return false;

    var panel = element("div", "schedule-detail-dialog__panel");
    panel.setAttribute("data-schedule-detail-panel", "");
    var header = element("header", "schedule-detail-dialog__header");
    var heading = element("div", "schedule-detail-dialog__heading");
    heading.appendChild(element("p", "schedule-detail-dialog__eyebrow", copy("detailEyebrow")));
    var title = element("h2", "schedule-detail-dialog__title", translated(item.title));
    title.id = DETAIL_DIALOG_ID + "-title";
    title.setAttribute("data-schedule-detail-title", "");
    heading.appendChild(title);
    header.appendChild(heading);
    var close = button("schedule-detail-dialog__close", copy("detailClose"));
    close.setAttribute("data-schedule-detail-close", "");
    close.appendChild(element("span", "", "×"));
    header.appendChild(close);
    panel.appendChild(header);

    var scroll = element("div", "schedule-detail-dialog__scroll");
    scroll.setAttribute("data-schedule-detail-scroll", "");
    var summary = element("div", "schedule-detail-dialog__summary");
    var timeGroup = element("div", "schedule-detail-dialog__summary-field");
    timeGroup.appendChild(element("span", "schedule-detail-dialog__summary-label", copy("detailTime")));
    var time = element("p", "schedule-detail-dialog__primary-time", item.start + "–" + item.end);
    time.setAttribute("data-schedule-detail-time", "");
    time.setAttribute("data-start", item.start);
    time.setAttribute("data-end", item.end);
    timeGroup.appendChild(time);
    summary.appendChild(timeGroup);
    var dateGroup = element("div", "schedule-detail-dialog__summary-field");
    dateGroup.appendChild(element("span", "schedule-detail-dialog__summary-label", copy("detailDate")));
    var weekday = element("span", "schedule-detail-dialog__primary-day", formatFullWeekday(item.date));
    weekday.setAttribute("data-schedule-detail-day", "");
    dateGroup.appendChild(weekday);
    var fullDate = element("time", "schedule-detail-dialog__primary-date", formatFullDate(item.date));
    fullDate.setAttribute("datetime", item.date);
    fullDate.setAttribute("data-schedule-detail-date", "");
    dateGroup.appendChild(fullDate);
    summary.appendChild(dateGroup);
    scroll.appendChild(summary);

    var details = element("dl", "schedule-detail-dialog__details");
    detailField(details, copy("detailDuration"), durationText(Math.max(0, duration(item))), "data-schedule-detail-duration");
    detailField(details, copy("detailVenue"), venueCity(item.venue), "data-schedule-detail-venue");
    detailField(details, copy("detailAddress"), venueAddress(item.venue), "data-schedule-detail-address");
    detailField(details, copy("detailAudience"), translated(item.audience), "data-schedule-detail-audience");
    detailField(details, copy("detailRecurrence"), recurrenceText(item), "data-schedule-detail-recurrence");
    detailField(
      details,
      copy("detailStatus"),
      item.status === "cancelled" ? copy("detailPaused") : copy("detailActive"),
      "data-schedule-detail-status"
    );
    detailField(details, copy("detailTimezone"), "Europe/Tallinn", "data-schedule-detail-timezone");
    scroll.appendChild(details);
    panel.appendChild(scroll);
    this.dialog.replaceChildren(panel);
    this.dialog.setAttribute("data-session-id", item.id);
    this.dialog.setAttribute("data-occurrence-date", item.date);
    return true;
  };

  DetailDossier.prototype.lockScroll = function () {
    if (this.scrollLock) return;
    this.scrollLock = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.setAttribute("data-schedule-detail-open", "true");
    document.body.setAttribute("data-schedule-detail-open", "true");
  };

  DetailDossier.prototype.unlockScroll = function () {
    if (!this.scrollLock) return;
    document.documentElement.style.overflow = this.scrollLock.htmlOverflow;
    document.body.style.overflow = this.scrollLock.bodyOverflow;
    document.documentElement.removeAttribute("data-schedule-detail-open");
    document.body.removeAttribute("data-schedule-detail-open");
    this.scrollLock = null;
  };

  DetailDossier.prototype.open = function (controller, sessionId, occurrenceDate, opener) {
    this.controller = controller;
    this.sessionId = String(sessionId || "");
    this.occurrenceDate = String(occurrenceDate || "");
    this.opener = opener || document.activeElement;
    this.restoreFocus = true;
    if (!this.render()) return;
    if (!this.dialog.open) {
      this.lockScroll();
      try {
        this.dialog.showModal();
      } catch (error) {
        this.unlockScroll();
        return;
      }
    }
    var close = this.dialog.querySelector("[data-schedule-detail-close]");
    if (close) close.focus();
  };

  DetailDossier.prototype.refresh = function () {
    if (!this.dialog.open) return;
    var hadFocus = this.dialog.contains(document.activeElement);
    if (!this.render()) {
      this.close();
      return;
    }
    if (hadFocus) {
      var close = this.dialog.querySelector("[data-schedule-detail-close]");
      if (close) close.focus();
    }
  };

  DetailDossier.prototype.close = function () {
    if (this.dialog.open) this.dialog.close();
    else this.afterClose();
  };

  DetailDossier.prototype.afterClose = function () {
    var shouldRestore = this.restoreFocus;
    var opener = this.opener;
    var controller = this.controller;
    var id = this.sessionId;
    var occurrenceDate = this.occurrenceDate;
    this.unlockScroll();
    this.opener = null;
    if (!shouldRestore) return;
    window.requestAnimationFrame(function () {
      var target = opener && opener.isConnected ? opener : null;
      if (!target && controller) target = controller.card(id, occurrenceDate);
      if (!target) {
        target = document.querySelector(
          '[data-calendar-card][data-session-id="' + safeSelectorValue(id) + '"][data-occurrence-date="' + safeSelectorValue(occurrenceDate) + '"]'
        );
      }
      if (target && typeof target.focus === "function") target.focus();
    });
  };

  DetailDossier.prototype.destroy = function () {
    this.restoreFocus = false;
    if (this.dialog.open) this.dialog.close();
    // The native `close` event is queued in some browsers. Unlock explicitly
    // before removing the listener and dialog so a teardown can never leave
    // the page frozen behind a stale scroll lock.
    this.unlockScroll();
    this.dialog.removeEventListener("click", this.handlers.click);
    this.dialog.removeEventListener("close", this.handlers.close);
    this.dialog.removeEventListener("cancel", this.handlers.cancel);
    if (this.dialog.parentNode) this.dialog.parentNode.removeChild(this.dialog);
    this.controller = null;
    this.opener = null;
    this.sessionId = "";
    this.occurrenceDate = "";
  };

  function detailDossierController() {
    if (!detailDossier || !detailDossier.dialog.isConnected) detailDossier = new DetailDossier();
    return detailDossier;
  }

  function formatWeekRange(start) {
    var end = dates.addDays(start, 6);
    var startDate = dateObject(start);
    var endDate = dateObject(end);
    var sameMonth = startDate.getUTCFullYear() === endDate.getUTCFullYear()
      && startDate.getUTCMonth() === endDate.getUTCMonth();
    var range;
    if (sameMonth) {
      range = startDate.getUTCDate() + (language() === "et" ? ".–" : "–") + new Intl.DateTimeFormat(localeCode(), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(endDate);
    } else {
      range = new Intl.DateTimeFormat(localeCode(), {
        day: "numeric",
        month: "short",
        timeZone: "UTC"
      }).format(startDate) + " – " + new Intl.DateTimeFormat(localeCode(), {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(endDate);
    }
    return range.replace(/\s+/g, " ").trim();
  }

  function holidayForDate(iso) {
    var year = Number(String(iso).slice(0, 4));
    return dates.getEstonianPublicHolidays(year, language()).filter(function (holiday) {
      return holiday.date === iso;
    });
  }

  function activeVenue(container) {
    var explicit = container.getAttribute("data-schedule-calendar-venue");
    if (explicit === "sillamae" || explicit === "narva") return explicit;
    var view = calendarView(container);
    var inherited = view && view.getAttribute("data-schedule-active-filter");
    return inherited === "narva" ? "narva" : "sillamae";
  }

  function calendarView(container) {
    return container.closest && container.closest("[data-schedule-calendar-view], [data-schedule-section], [data-schedule-active-filter]");
  }

  function sessionsFor(container, week) {
    var filter = activeVenue(container);
    var result = [];
    store.getSessions().forEach(function (item) {
      if (item.venue !== filter) return;
      week.forEach(function (iso) {
        var occurrence = dates.occurrenceForDate(item, iso);
        if (occurrence) result.push(occurrence);
      });
    });
    return result.sort(compareSessions);
  }

  function templatesFor(container) {
    if (typeof store.getTemplates !== "function") return [];
    var filter = activeVenue(container);
    return store.getTemplates().filter(function (item) {
      return item.venue === filter;
    }).sort(function (left, right) {
      return translated(left.title).localeCompare(translated(right.title), localeCode())
        || String(left.id).localeCompare(String(right.id));
    });
  }

  function templateDuration(item) {
    var configured = Number(item && item.durationMinutes);
    if (Number.isInteger(configured) && configured > 0 && configured < 1440) return configured;
    // Defensive compatibility for locally saved schema-v3 cards. New cards
    // store only a duration and deliberately have no absolute start/end time.
    var legacy = parseTime(item && item.end) - parseTime(item && item.start);
    return legacy > 0 && legacy < 1440 ? legacy : DEFAULT_NEW_DURATION;
  }

  function calendarRange(container, sessions) {
    var step = calendarStep(container);
    var configuredStart = calendarTimeAttribute(container, "data-calendar-start", "data-day-start");
    var configuredEnd = calendarTimeAttribute(container, "data-calendar-end", "data-day-end");
    var start = configuredStart >= 0 ? configuredStart : DEFAULT_START;
    var end = configuredEnd >= 0 ? configuredEnd : DEFAULT_END;

    sessions.forEach(function (item) {
      start = Math.min(start, roundDown(parseTime(item.start), 60));
      end = Math.max(end, roundUp(parseTime(item.end), 60));
    });

    start = Math.max(0, roundDown(start, 60));
    end = Math.min(1440, roundUp(end, 60));
    if (end <= start) end = Math.min(1440, start + 60);
    return { start: start, end: end, step: step, slots: Math.max(1, Math.ceil((end - start) / step)) };
  }

  function layoutLanes(items, minimumVisualMinutes) {
    var result = [];
    var group = [];
    var groupEnd = -1;

    function flushGroup() {
      if (!group.length) return;
      var laneEnds = [];
      var entries = group.map(function (item) {
        var start = parseTime(item.start);
        var lane = laneEnds.findIndex(function (end) { return end <= start; });
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = Math.max(parseTime(item.end), start + minimumVisualMinutes);
        return { item: item, lane: lane };
      });
      var count = Math.max(1, laneEnds.length);
      entries.forEach(function (entry) {
        entry.lanes = count;
        result.push(entry);
      });
      group = [];
      groupEnd = -1;
    }

    items.slice().sort(function (left, right) {
      return parseTime(left.start) - parseTime(right.start) || left.id.localeCompare(right.id);
    }).forEach(function (item) {
      var start = parseTime(item.start);
      if (group.length && start >= groupEnd) flushGroup();
      group.push(item);
      groupEnd = Math.max(groupEnd, parseTime(item.end), start + minimumVisualMinutes);
    });
    flushGroup();
    return result;
  }

  function Calendar(container) {
    this.container = container;
    this.uid = ++calendarUid;
    this.dragId = "";
    this.dragDate = "";
    this.dragTemplateId = "";
    this.selectedTemplateId = "";
    this.activeSlotDate = "";
    this.activeSlotTime = "";
    this.dragTarget = null;
    this.pointer = null;
    this.ghost = null;
    this.suppressClickUntil = 0;
    this.observer = null;
    this.handlers = {};
    this.today = dates.getTallinnToday();
    this.weekStart = this.initialWeekStart();
    this.mount();
  }

  Calendar.prototype.isEditable = function () {
    return this.container.getAttribute("data-schedule-calendar-editable") === "true";
  };

  Calendar.prototype.isHomepage = function () {
    return this.container.hasAttribute("data-schedule-calendar-homepage");
  };

  Calendar.prototype.syncsUrl = function () {
    return this.container.hasAttribute("data-calendar-sync-url")
      || this.container.hasAttribute("data-schedule-calendar-standalone");
  };

  Calendar.prototype.initialWeekStart = function () {
    var candidate = this.container.getAttribute("data-calendar-week");
    if (!candidate && this.syncsUrl()) candidate = new URLSearchParams(window.location.search).get("week");
    try {
      return dates.startOfWeek(candidate || this.today);
    } catch (error) {
      return dates.startOfWeek(this.today);
    }
  };

  Calendar.prototype.navigate = function (weekStart, historyMode) {
    var next;
    try {
      next = dates.startOfWeek(weekStart);
    } catch (error) {
      next = dates.startOfWeek(this.today);
    }
    this.weekStart = next;
    if (this.syncsUrl() && window.history && typeof window.history.pushState === "function" && historyMode !== "none") {
      var url = new URL(window.location.href);
      url.searchParams.set("week", next);
      window.history[historyMode === "replace" ? "replaceState" : "pushState"]({ scheduleWeek: next }, "", url.pathname + url.search + url.hash);
    }
    this.render();
  };

  Calendar.prototype.mount = function () {
    var self = this;
    this.container.setAttribute("data-schedule-calendar-mounted", "true");
    this.handlers.click = function (event) { self.onClick(event); };
    this.handlers.keydown = function (event) { self.onKeydown(event); };
    this.handlers.dragstart = function (event) { self.onDragStart(event); };
    this.handlers.dragover = function (event) { self.onDragOver(event); };
    this.handlers.drop = function (event) { self.onDrop(event); };
    this.handlers.dragend = function () { self.finishDrag(); };
    this.handlers.pointerdown = function (event) { self.onPointerDown(event); };
    this.handlers.pointermove = function (event) { self.onPointerMove(event); };
    this.handlers.pointerup = function (event) { self.onPointerUp(event); };
    this.handlers.pointercancel = function (event) {
      if (self.pointer && (typeof event.pointerId !== "number" || event.pointerId === self.pointer.pointerId)) {
        self.finishPointer(false);
      }
    };
    this.handlers.popstate = function () {
      if (!self.syncsUrl()) return;
      var value = new URLSearchParams(window.location.search).get("week") || self.today;
      self.navigate(value, "none");
    };

    Object.keys(this.handlers).forEach(function (name) {
      if (name === "popstate") window.addEventListener(name, self.handlers[name]);
      else self.container.addEventListener(name, self.handlers[name]);
    });

    var view = calendarView(this.container);
    if (view && store.getUi && !this.isHomepage()) {
      syncCalendarFilter(view, store.getUi().filterVenue);
    }
    if (view && typeof MutationObserver === "function") {
      this.observer = new MutationObserver(function () { self.render(); });
      this.observer.observe(view, { attributes: true, attributeFilter: ["data-schedule-active-filter"] });
    }
    this.render();
  };

  Calendar.prototype.destroy = function () {
    var self = this;
    Object.keys(this.handlers).forEach(function (name) {
      if (name === "popstate") window.removeEventListener(name, self.handlers[name]);
      else self.container.removeEventListener(name, self.handlers[name]);
    });
    if (this.observer) this.observer.disconnect();
    this.finishPointer(false);
    this.container.removeAttribute("data-schedule-calendar-mounted");
  };

  Calendar.prototype.ensureActiveSlot = function (weekDates, range) {
    if (weekDates.indexOf(this.activeSlotDate) === -1) {
      this.activeSlotDate = weekDates.indexOf(this.today) !== -1 ? this.today : weekDates[0];
    }
    var minutes = parseTime(this.activeSlotTime);
    if (minutes < range.start || minutes >= range.end) minutes = range.start;
    minutes = Math.max(range.start, Math.min(range.end - range.step, roundDown(minutes, range.step)));
    this.activeSlotTime = formatTime(minutes);
  };

  Calendar.prototype.setActiveSlot = function (slot, shouldFocus) {
    if (!slot) return;
    var previous = this.container.querySelector('[data-calendar-slot][tabindex="0"]');
    if (previous && previous !== slot) previous.tabIndex = -1;
    slot.tabIndex = 0;
    this.activeSlotDate = slot.getAttribute("data-date") || this.activeSlotDate;
    this.activeSlotTime = slot.getAttribute("data-time") || this.activeSlotTime;
    if (shouldFocus) slot.focus();
  };

  Calendar.prototype.focusSlot = function (weekday, time) {
    var selector = '[data-calendar-day="' + weekday + '"] [data-calendar-slot][data-time="' + formatTime(time) + '"]';
    var slot = this.container.querySelector(selector);
    if (slot) this.setActiveSlot(slot, true);
    return slot;
  };

  Calendar.prototype.focusActiveSlot = function () {
    var slot = this.container.querySelector(
      '[data-calendar-slot][data-date="' + this.activeSlotDate + '"][data-time="' + this.activeSlotTime + '"]'
    );
    if (slot) this.setActiveSlot(slot, true);
  };

  Calendar.prototype.render = function () {
    var self = this;
    var focusedNode = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest("[data-calendar-card], [data-schedule-palette-card]")
      : null;
    var focusedData = focusedNode ? focusedNode.dataset : null;
    var focusedId = focusedData && focusedData.sessionId ? focusedData.sessionId : "";
    var focusedDate = focusedData && focusedData.occurrenceDate ? focusedData.occurrenceDate : "";
    var focusedTemplateId = focusedData && focusedData.templateId ? focusedData.templateId : "";
    this.today = dates.getTallinnToday();
    var weekDates = dates.weekDates(this.weekStart);
    var sessions = sessionsFor(this.container, weekDates);
    var templates = this.isEditable() ? templatesFor(this.container) : [];
    var range = calendarRange(this.container, sessions);
    if (this.isEditable()) this.ensureActiveSlot(weekDates, range);
    this.container.replaceChildren();
    this.container.setAttribute("role", "region");
    this.container.setAttribute("aria-label", copy("calendar"));
    this.container.setAttribute("data-schedule-calendar-mode", this.isEditable() ? "editable" : "readonly");
    this.container.style.setProperty("--calendar-slot-count", String(range.slots));
    this.container.style.setProperty("--calendar-step", String(range.step));
    this.container.style.setProperty("--calendar-slots-per-hour", String(60 / range.step));

    var toolbar = element("div", "schedule-calendar__toolbar");
    var descriptionId = "schedule-calendar-description-" + this.uid;
    var instructionText = this.isEditable() ? copy("instructions") : copy("calendar");
    if (!this.isHomepage() && this.isEditable()) {
      var intro = element("div", "schedule-calendar__intro");
      intro.appendChild(element("h2", "schedule-calendar__title", copy("title")));
      var recurring = element("span", "schedule-calendar__recurring", copy("recurring"));
      recurring.setAttribute("data-calendar-recurring-label", "");
      intro.appendChild(recurring);
      var instructions = element("p", "schedule-calendar__instructions", instructionText);
      instructions.id = descriptionId;
      intro.appendChild(instructions);
      toolbar.appendChild(intro);
      var create = button("schedule-calendar__create", copy("create"));
      create.setAttribute("data-calendar-create", "");
      create.setAttribute("data-schedule-calendar-create", "");
      create.appendChild(svgIcon("plus"));
      create.appendChild(element("span", "", copy("create")));
      intro.appendChild(create);
    } else {
      var accessibleDescription = element("p", "schedule-calendar__accessible-description", instructionText);
      accessibleDescription.id = descriptionId;
      accessibleDescription.setAttribute("data-calendar-public-hint", "");
      accessibleDescription.style.position = "absolute";
      accessibleDescription.style.width = "1px";
      accessibleDescription.style.height = "1px";
      accessibleDescription.style.padding = "0";
      accessibleDescription.style.margin = "-1px";
      accessibleDescription.style.overflow = "hidden";
      accessibleDescription.style.clip = "rect(0, 0, 0, 0)";
      accessibleDescription.style.whiteSpace = "nowrap";
      accessibleDescription.style.border = "0";
      this.container.appendChild(accessibleDescription);
    }

    var dateNavigation = element("div", "schedule-calendar__date-nav");
    dateNavigation.setAttribute("data-calendar-date-nav", "");
    var today = button("schedule-calendar__today", copy("today"));
    today.setAttribute("data-calendar-today-button", "");
    today.textContent = copy("today");
    dateNavigation.appendChild(today);
    var previous = button("schedule-calendar__nav-button", copy("previousWeek"));
    previous.setAttribute("data-calendar-previous-week", "");
    previous.appendChild(svgIcon("left"));
    dateNavigation.appendChild(previous);
    var next = button("schedule-calendar__nav-button", copy("nextWeek"));
    next.setAttribute("data-calendar-next-week", "");
    next.appendChild(svgIcon("right"));
    dateNavigation.appendChild(next);
    var period = element("time", "schedule-calendar__period", formatWeekRange(this.weekStart));
    period.setAttribute("datetime", this.weekStart + "/" + dates.addDays(this.weekStart, 6));
    period.setAttribute("data-calendar-period", "");
    dateNavigation.appendChild(period);
    toolbar.appendChild(dateNavigation);
    this.container.setAttribute("aria-describedby", descriptionId);

    var grid = element("div", "schedule-calendar__grid");
    grid.setAttribute("data-calendar-grid", "");
    grid.setAttribute("data-schedule-calendar-grid", "");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", copy("calendar"));
    grid.id = "schedule-calendar-grid-" + this.uid;
    var timeRail = element("div", "schedule-calendar__time-rail");
    timeRail.setAttribute("aria-hidden", "true");
    var timeHeading = element("span", "schedule-calendar__time-heading");
    timeHeading.setAttribute("title", copy("time"));
    timeHeading.appendChild(svgIcon("clock"));
    timeRail.appendChild(timeHeading);
    for (var time = range.start; time < range.end; time += 60) {
      var timeLabel = element("span", "schedule-calendar__time-label", formatTime(time));
      timeLabel.style.setProperty("--calendar-hour-index", String((time - range.start) / 60));
      timeLabel.style.setProperty("--calendar-label-slot", String(((time - range.start) + 30) / range.step));
      timeLabel.style.setProperty("--calendar-slot-index", String(((time - range.start) + 30) / range.step));
      timeRail.appendChild(timeLabel);
    }
    grid.appendChild(timeRail);

    var week = element("div", "schedule-calendar__week");
    for (var weekday = 1; weekday <= 7; weekday += 1) {
      week.appendChild(this.renderDay(weekday, weekDates[weekday - 1], sessions, range));
    }
    grid.appendChild(week);

    var live = element("p", "schedule-calendar__status");
    live.setAttribute("data-calendar-status", "");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    this.container.appendChild(toolbar);
    if (this.isEditable()) {
      var workspace = element("div", "schedule-calendar__workspace");
      workspace.setAttribute("data-schedule-calendar-workspace", "");
      workspace.appendChild(this.renderPalette(templates));
      workspace.appendChild(grid);
      this.container.appendChild(workspace);
    } else {
      this.container.appendChild(grid);
    }
    this.container.appendChild(live);

    if (focusedId || focusedTemplateId) {
      window.requestAnimationFrame(function () {
        if (focusedId) self.focusCard(focusedId, focusedDate);
        else self.focusTemplate(focusedTemplateId);
      });
    }
  };

  Calendar.prototype.renderPalette = function (templates) {
    var self = this;
    if (this.selectedTemplateId && !templates.some(function (item) { return item.id === self.selectedTemplateId; })) {
      this.selectedTemplateId = "";
    }

    var palette = element("aside", "schedule-calendar__palette");
    palette.setAttribute("data-schedule-palette", "");
    palette.setAttribute("aria-label", copy("paletteTitle"));

    var header = element("div", "schedule-calendar__palette-header");
    header.appendChild(element("h3", "schedule-calendar__palette-title", copy("paletteTitle")));
    var create = button("schedule-calendar__palette-create", copy("paletteCreate"));
    create.setAttribute("data-schedule-palette-create", "");
    create.appendChild(svgIcon("plus"));
    create.appendChild(element("span", "schedule-calendar__palette-action-label", copy("paletteCreate")));
    header.appendChild(create);
    palette.appendChild(header);

    var instructions = element(
      "p",
      "schedule-calendar__palette-instructions",
      this.selectedTemplateId ? copy("paletteSelected") : copy("paletteInstructions")
    );
    instructions.setAttribute("data-schedule-palette-instructions", "");
    instructions.id = "schedule-calendar-palette-instructions-" + this.uid;
    palette.appendChild(instructions);

    var list = element("div", "schedule-calendar__palette-list");
    list.setAttribute("data-schedule-palette-list", "");
    list.setAttribute("role", "list");
    if (!templates.length) {
      list.appendChild(element("p", "schedule-calendar__palette-empty", copy("paletteEmpty")));
    }
    templates.forEach(function (item) {
      list.appendChild(self.renderPaletteCard(item));
    });
    palette.appendChild(list);
    return palette;
  };

  Calendar.prototype.renderPaletteCard = function (item) {
    var selected = this.selectedTemplateId === item.id;
    var card = element("article", "schedule-calendar__palette-card");
    card.setAttribute("data-schedule-palette-card", "");
    card.setAttribute("data-template-id", item.id);
    card.setAttribute("data-template-venue", item.venue);
    card.setAttribute("data-template-duration", String(templateDuration(item)));
    card.setAttribute("role", "listitem");
    card.draggable = false;
    if (selected) card.setAttribute("data-schedule-palette-selected", "true");

    var main = button(
      "schedule-calendar__palette-main",
      translated(item.title) + ", " + venueLabel(item.venue) + ", " + translated(item.audience)
    );
    main.setAttribute("data-schedule-palette-select", "");
    main.setAttribute("data-template-id", item.id);
    main.setAttribute("aria-pressed", String(selected));
    main.setAttribute("aria-controls", "schedule-calendar-grid-" + this.uid);
    main.setAttribute("aria-describedby", "schedule-calendar-palette-instructions-" + this.uid);
    main.draggable = false;
    main.style.width = "100%";
    main.style.border = "0";
    main.style.color = "inherit";
    main.style.background = "transparent";
    main.style.font = "inherit";
    main.style.textAlign = "left";
    main.style.cursor = "pointer";
    main.appendChild(element("span", "schedule-calendar__palette-venue", venueLabel(item.venue)));
    main.appendChild(element("strong", "schedule-calendar__palette-card-title", translated(item.title)));
    main.appendChild(element("span", "schedule-calendar__palette-card-audience", translated(item.audience)));
    var handle = element("span", "schedule-calendar__palette-handle");
    handle.setAttribute("data-calendar-drag-handle", "");
    handle.setAttribute("data-schedule-palette-drag-handle", "");
    handle.setAttribute("data-template-id", item.id);
    handle.setAttribute("aria-hidden", "true");
    handle.draggable = false;
    handle.appendChild(svgIcon("grip"));

    var controls = element("div", "schedule-calendar__palette-card-actions");
    var edit = button("schedule-calendar__palette-edit", copy("paletteEdit") + ": " + translated(item.title));
    edit.setAttribute("data-schedule-palette-edit", "");
    edit.setAttribute("data-template-id", item.id);
    edit.setAttribute("title", copy("paletteEdit"));
    edit.draggable = false;
    edit.appendChild(svgIcon("edit"));
    controls.appendChild(edit);

    var remove = button("schedule-calendar__palette-delete", copy("paletteDelete") + ": " + translated(item.title));
    remove.setAttribute("data-schedule-palette-delete", "");
    remove.setAttribute("data-template-id", item.id);
    remove.setAttribute("title", copy("paletteDelete"));
    remove.draggable = false;
    remove.appendChild(svgIcon("trash"));
    controls.appendChild(remove);

    card.appendChild(handle);
    card.appendChild(main);
    card.appendChild(controls);
    return card;
  };

  Calendar.prototype.updatePaletteSelection = function () {
    var self = this;
    Array.prototype.forEach.call(this.container.querySelectorAll("[data-schedule-palette-card]"), function (card) {
      var selected = card.getAttribute("data-template-id") === self.selectedTemplateId;
      if (selected) card.setAttribute("data-schedule-palette-selected", "true");
      else card.removeAttribute("data-schedule-palette-selected");
      var control = card.querySelector("[data-schedule-palette-select]");
      if (control) control.setAttribute("aria-pressed", String(selected));
    });
    var instructions = this.container.querySelector("[data-schedule-palette-instructions]");
    if (instructions) instructions.textContent = this.selectedTemplateId ? copy("paletteSelected") : copy("paletteInstructions");
  };

  Calendar.prototype.renderDay = function (weekday, iso, sessions, range) {
    var day = element("section", "schedule-calendar__day");
    day.setAttribute("data-calendar-day", String(weekday));
    day.setAttribute("data-schedule-calendar-day", String(weekday));
    day.setAttribute("data-calendar-date", iso);
    day.setAttribute("aria-label", copy("days")[weekday] + ", " + formatDayDate(iso));
    if (iso === this.today) {
      day.setAttribute("data-calendar-today", "true");
      day.setAttribute("aria-current", "date");
    }
    var heading = element("h3", "schedule-calendar__day-label");
    var dayName = element("span", "schedule-calendar__day-name", copy("days")[weekday]);
    dayName.setAttribute("data-calendar-day-label", "");
    heading.appendChild(dayName);
    var dayDate = element("time", "schedule-calendar__day-date", formatDayDate(iso));
    dayDate.setAttribute("datetime", iso);
    heading.appendChild(dayDate);
    var holidays = holidayForDate(iso);
    holidays.forEach(function (holiday) {
      var badge = element("span", "schedule-calendar__holiday", holiday.name);
      badge.setAttribute("data-calendar-holiday", holiday.key);
      badge.setAttribute("title", copy("holidays") + ": " + holiday.name);
      heading.appendChild(badge);
    });
    day.appendChild(heading);

    var track = element("div", "schedule-calendar__track");
    track.setAttribute("data-calendar-track", "");
    track.style.setProperty("--calendar-slot-count", String(range.slots));
    for (var time = range.start; time < range.end; time += range.step) {
      var slot = this.isEditable()
        ? button("schedule-calendar__slot", copy("addAt") + ": " + copy("days")[weekday] + ", " + formatTime(time))
        : element("span", "schedule-calendar__slot");
      if (this.isEditable()) {
        slot.tabIndex = iso === this.activeSlotDate && formatTime(time) === this.activeSlotTime ? 0 : -1;
      }
      else slot.setAttribute("aria-hidden", "true");
      slot.setAttribute("data-calendar-slot", "");
      slot.setAttribute("data-schedule-calendar-slot", "");
      slot.setAttribute("data-weekday", String(weekday));
      slot.setAttribute("data-date", iso);
      slot.setAttribute("data-time", formatTime(time));
      var slotIndex = (time - range.start) / range.step;
      slot.setAttribute("data-slot-index", String(slotIndex));
      slot.style.setProperty("--calendar-slot-index", String(slotIndex));
      track.appendChild(slot);
    }

    var entries = layoutLanes(sessions.filter(function (item) { return item.date === iso; }), Math.max(range.step, 45));
    entries.forEach(function (entry) {
      track.appendChild(this.renderCard(entry.item, entry.lane, entry.lanes, range));
    }, this);
    day.appendChild(track);
    return day;
  };

  Calendar.prototype.renderCard = function (item, lane, lanes, range) {
    var start = parseTime(item.start);
    var card = element("article", "schedule-calendar__card");
    card.tabIndex = 0;
    card.draggable = this.isEditable();
    card.setAttribute("data-calendar-card", "");
    card.setAttribute("data-schedule-calendar-event", "");
    card.setAttribute("data-schedule-item", "");
    card.setAttribute("data-session-id", item.id);
    card.setAttribute("data-schedule-id", item.id);
    card.setAttribute("data-occurrence-date", item.date);
    card.setAttribute("data-occurrence-id", item.occurrenceId || item.id + "@" + item.date);
    card.setAttribute("data-session-status", item.status);
    card.setAttribute("data-session-venue", item.venue);
    if (duration(item) < 60) card.setAttribute("data-calendar-compact", "true");
    var ariaLabel = translated(item.title) + ", " + copy("days")[item.weekday] + ", " + formatDayDate(item.date) + ", " + item.start + "–" + item.end + ", " + venueLabel(item.venue);
    if (item.status === "cancelled") ariaLabel += ", " + copy("paused");
    if (!this.isEditable()) {
      card.setAttribute("role", "button");
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-controls", DETAIL_DIALOG_ID);
      card.setAttribute("aria-label", copy("detailOpen") + ": " + ariaLabel);
    } else {
      card.setAttribute("aria-label", ariaLabel);
    }
    card.style.setProperty("--calendar-start-slot", String((start - range.start) / range.step));
    card.style.setProperty("--calendar-duration-slots", String(Math.max(0.5, duration(item) / range.step)));
    card.style.setProperty("--calendar-lane-index", String(lane));
    card.style.setProperty("--calendar-lane-count", String(lanes));
    card.style.setProperty("--calendar-lane-left", (lane / lanes) * 100 + "%");
    card.style.setProperty("--calendar-lane-width", 100 / lanes + "%");

    var top = element("div", "schedule-calendar__card-top");
    top.appendChild(element("span", "schedule-calendar__card-venue", venueLabel(item.venue)));
    if (item.status === "cancelled") top.appendChild(element("span", "schedule-calendar__card-status", copy("paused")));
    var time = element("time", "schedule-calendar__card-time", item.start + "–" + item.end);
    var title = element("strong", "schedule-calendar__card-title", translated(item.title));
    var audience = element("span", "schedule-calendar__card-audience", translated(item.audience));
    card.appendChild(top);
    card.appendChild(time);
    card.appendChild(title);
    card.appendChild(audience);

    if (!this.isEditable()) return card;

    var actions = element("div", "schedule-calendar__card-actions");
    var drag = button("schedule-calendar__icon-button schedule-calendar__drag-handle", copy("drag") + ": " + translated(item.title));
    drag.setAttribute("data-calendar-drag-handle", "");
    drag.setAttribute("data-schedule-drag-handle", "");
    drag.setAttribute("data-session-id", item.id);
    drag.setAttribute("data-occurrence-date", item.date);
    drag.draggable = false;
    drag.style.minWidth = "44px";
    drag.style.minHeight = "44px";
    drag.style.touchAction = "none";
    drag.appendChild(svgIcon("grip"));
    actions.appendChild(drag);
    actions.appendChild(this.moveButton("day", -1, "left", "previousDay", item));
    actions.appendChild(this.moveButton("time", -range.step, "up", "earlier", item));
    actions.appendChild(this.moveButton("time", range.step, "down", "later", item));
    actions.appendChild(this.moveButton("day", 1, "right", "nextDay", item));
    var edit = button("schedule-calendar__icon-button schedule-calendar__edit", copy("edit") + ": " + translated(item.title));
    edit.setAttribute("data-calendar-edit", "");
    edit.setAttribute("data-session-id", item.id);
    edit.appendChild(svgIcon("edit"));
    actions.appendChild(edit);
    card.appendChild(actions);
    return card;
  };

  Calendar.prototype.moveButton = function (kind, amount, icon, key, item) {
    var label = copy(key).replace("30", String(Math.abs(amount)));
    var control = button("schedule-calendar__icon-button schedule-calendar__move", label + ": " + translated(item.title));
    control.setAttribute(kind === "day" ? "data-calendar-move-day" : "data-calendar-move-time", String(amount));
    control.setAttribute("data-session-id", item.id);
    control.appendChild(svgIcon(icon));
    return control;
  };

  Calendar.prototype.session = function (id) {
    return store.getSessions().find(function (item) { return item.id === id; }) || null;
  };

  Calendar.prototype.card = function (id, occurrenceDate) {
    var selector = '[data-calendar-card][data-session-id="' + safeSelectorValue(id) + '"]';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(occurrenceDate || ""))) {
      selector += '[data-occurrence-date="' + occurrenceDate + '"]';
    }
    return this.container.querySelector(selector);
  };

  Calendar.prototype.template = function (id) {
    if (typeof store.getTemplates !== "function") return null;
    return store.getTemplates().find(function (item) { return item.id === id; }) || null;
  };

  Calendar.prototype.announce = function (message) {
    var live = this.container.querySelector("[data-calendar-status]");
    if (!live) return;
    live.textContent = "";
    window.setTimeout(function () { live.textContent = message; }, 0);
  };

  Calendar.prototype.focusCard = function (id, occurrenceDate) {
    var card = this.card(id, occurrenceDate);
    if (card) card.focus();
  };

  Calendar.prototype.focusTemplate = function (id) {
    var safeId = typeof window.CSS !== "undefined" && typeof window.CSS.escape === "function" ? window.CSS.escape(id) : id.replace(/[^a-z0-9-]/gi, "");
    var card = this.container.querySelector('[data-schedule-palette-card][data-template-id="' + safeId + '"]');
    var control = card && card.querySelector("[data-schedule-palette-select]");
    if (control) control.focus();
  };

  Calendar.prototype.edit = function (id) {
    if (!this.isEditable()) return;
    emit(this.container, "dzhikaeva:scheduleedit", { id: id });
  };

  Calendar.prototype.createAt = function (weekday, date, start, end) {
    if (!this.isEditable()) return;
    emit(this.container, "dzhikaeva:schedulenew", {
      weekday: weekday,
      date: date,
      start: start,
      end: end,
      venue: activeVenue(this.container)
    });
  };

  Calendar.prototype.placeTemplate = function (templateId, targetDate, startMinutes) {
    if (!this.isEditable()) return;
    var item = this.template(templateId);
    if (!item) return;
    var length = templateDuration(item);
    var maxStart = Math.max(0, 1439 - length);
    var safeStart = Math.max(0, Math.min(maxStart, Math.round(startMinutes)));
    var weekday;
    try {
      weekday = dates.dateToWeekday(targetDate);
    } catch (error) {
      this.announce(copy("moveError"));
      return;
    }
    var detail = {
      templateId: item.id,
      weekday: weekday,
      date: targetDate,
      start: formatTime(safeStart),
      end: formatTime(safeStart + length),
      venue: item.venue,
      title: item.title,
      audience: item.audience
    };
    this.selectedTemplateId = "";
    this.updatePaletteSelection();
    this.announce(copy("templatePlaced"));
    emit(this.container, "dzhikaeva:schedulenew", detail);
  };

  Calendar.prototype.move = function (id, occurrenceDate, targetDate, startMinutes) {
    if (!this.isEditable()) return;
    var item = this.session(id);
    if (!item) return;
    var length = duration(item);
    var step = calendarStep(this.container);
    var maxStart = Math.floor((1439 - length) / step) * step;
    var safeStart = Math.max(0, Math.min(maxStart, startMinutes));
    var safeDate;
    try {
      safeDate = String(targetDate || "");
      dates.dateToWeekday(safeDate);
    } catch (error) {
      this.announce(copy("moveError"));
      return;
    }
    var sourceDay = dates.dateToWeekday(occurrenceDate);
    var safeDay = dates.dateToWeekday(safeDate);
    var nextStart = formatTime(safeStart);
    var nextEnd = formatTime(safeStart + length);
    var weekdays = Array.isArray(item.weekdays) && item.weekdays.length ? item.weekdays.slice() : [item.weekday];
    if (item.recurrence === "weekly" && sourceDay !== safeDay && weekdays.indexOf(safeDay) !== -1) {
      this.announce(copy("moveError"));
      this.focusCard(id, occurrenceDate);
      return;
    }
    if (occurrenceDate === safeDate && item.start === nextStart) {
      this.announce(copy("unchanged"));
      this.focusCard(id, occurrenceDate);
      return;
    }
    if (item.recurrence === "weekly" && sourceDay !== safeDay) {
      weekdays = weekdays.filter(function (day) { return day !== sourceDay; });
      weekdays.push(safeDay);
      weekdays.sort(function (left, right) { return left - right; });
    }
    var updated = {
      id: item.id,
      weekday: item.recurrence === "once" ? safeDay : weekdays[0],
      recurrence: item.recurrence,
      weekdays: item.recurrence === "once" ? [safeDay] : weekdays,
      date: item.recurrence === "once" ? safeDate : "",
      startsOn: item.recurrence === "weekly" && item.startsOn && safeDate < item.startsOn ? safeDate : (item.startsOn || ""),
      endsOn: item.recurrence === "weekly" && item.endsOn && safeDate > item.endsOn ? safeDate : (item.endsOn || ""),
      start: nextStart,
      end: nextEnd,
      venue: item.venue,
      title: item.title,
      audience: item.audience,
      status: item.status
    };
    try {
      store.upsert(updated);
      this.announce(copy("moved") + ": " + copy("days")[safeDay] + ", " + nextStart + "–" + nextEnd);
      emit(this.container, "dzhikaeva:schedulemove", {
        id: id,
        weekday: safeDay,
        date: safeDate,
        occurrenceDate: occurrenceDate,
        start: nextStart,
        end: nextEnd,
        before: item,
        after: updated
      });
      var self = this;
      window.requestAnimationFrame(function () { self.focusCard(id, safeDate); });
    } catch (error) {
      this.announce(copy("moveError"));
      emit(this.container, "dzhikaeva:scheduleerror", { id: id, error: error });
    }
  };

  Calendar.prototype.onClick = function (event) {
    if (event.target.closest && event.target.closest("[data-calendar-today-button]")) {
      this.navigate(this.today, "push");
      return;
    }
    if (event.target.closest && event.target.closest("[data-calendar-previous-week]")) {
      this.navigate(dates.addDays(this.weekStart, -7), "push");
      return;
    }
    if (event.target.closest && event.target.closest("[data-calendar-next-week]")) {
      this.navigate(dates.addDays(this.weekStart, 7), "push");
      return;
    }
    if (!this.isEditable()) {
      var publicCard = event.target.closest && event.target.closest("[data-calendar-card]");
      if (publicCard) {
        detailDossierController().open(
          this,
          publicCard.getAttribute("data-session-id"),
          publicCard.getAttribute("data-occurrence-date"),
          publicCard
        );
      }
      return;
    }
    if (Date.now() < this.suppressClickUntil) return;
    var createTemplate = event.target.closest && event.target.closest("[data-schedule-palette-create]");
    if (createTemplate) {
      emit(this.container, "dzhikaeva:templatecreate", { venue: activeVenue(this.container) });
      return;
    }
    var editTemplate = event.target.closest && event.target.closest("[data-schedule-palette-edit]");
    if (editTemplate) {
      emit(this.container, "dzhikaeva:templateedit", { templateId: editTemplate.getAttribute("data-template-id") });
      return;
    }
    var deleteTemplate = event.target.closest && event.target.closest("[data-schedule-palette-delete]");
    if (deleteTemplate) {
      emit(this.container, "dzhikaeva:templatedelete", { templateId: deleteTemplate.getAttribute("data-template-id") });
      return;
    }
    var target = event.target.closest && event.target.closest("[data-calendar-card], [data-calendar-create], [data-calendar-slot], [data-schedule-palette-card]");
    if (!target) return;
    var create = event.target.closest && event.target.closest("[data-calendar-create]");
    if (create) {
      this.createAt(1, this.weekStart, "17:00", "18:00");
      return;
    }
    var slot = event.target.closest && event.target.closest("[data-calendar-slot]");
    if (slot) {
      this.setActiveSlot(slot, false);
      var start = parseTime(slot.getAttribute("data-time"));
      if (this.selectedTemplateId) {
        this.placeTemplate(this.selectedTemplateId, slot.getAttribute("data-date"), start);
      } else {
        this.createAt(
          Number(slot.getAttribute("data-weekday")),
          slot.getAttribute("data-date"),
          formatTime(start),
          formatTime(Math.min(1439, start + DEFAULT_NEW_DURATION))
        );
      }
      return;
    }
    var paletteSelect = event.target.closest && event.target.closest("[data-schedule-palette-select]");
    var paletteCard = paletteSelect && paletteSelect.closest("[data-schedule-palette-card]");
    if (paletteCard) {
      var templateId = paletteCard.getAttribute("data-template-id");
      this.selectedTemplateId = this.selectedTemplateId === templateId ? "" : templateId;
      this.updatePaletteSelection();
      if (this.selectedTemplateId) this.announce(copy("paletteSelected"));
      if (this.selectedTemplateId && event.detail === 0) {
        var self = this;
        window.requestAnimationFrame(function () { self.focusActiveSlot(); });
      }
      return;
    }
    var card = event.target.closest("[data-calendar-card]");
    var id = card && card.getAttribute("data-session-id");
    var occurrenceDate = card && card.getAttribute("data-occurrence-date");
    if (!id) return;
    var moveDay = event.target.closest("[data-calendar-move-day]");
    var moveTime = event.target.closest("[data-calendar-move-time]");
    if (moveDay) {
      var dayItem = this.session(id);
      if (dayItem) this.move(id, occurrenceDate, dates.addDays(occurrenceDate, Number(moveDay.getAttribute("data-calendar-move-day"))), parseTime(dayItem.start));
      return;
    }
    if (moveTime) {
      var timeItem = this.session(id);
      if (timeItem) this.move(id, occurrenceDate, occurrenceDate, parseTime(timeItem.start) + Number(moveTime.getAttribute("data-calendar-move-time")));
      return;
    }
    if (event.target.closest("[data-calendar-drag-handle]")) return;
    this.edit(id);
  };

  Calendar.prototype.onKeydown = function (event) {
    if (!this.isEditable()) {
      var publicCard = event.target.closest && event.target.closest("[data-calendar-card]");
      if (publicCard && event.target === publicCard && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        detailDossierController().open(
          this,
          publicCard.getAttribute("data-session-id"),
          publicCard.getAttribute("data-occurrence-date"),
          publicCard
        );
      }
      return;
    }
    if (event.key === "Escape" && this.selectedTemplateId) {
      event.preventDefault();
      this.selectedTemplateId = "";
      this.updatePaletteSelection();
      return;
    }
    var slot = event.target.closest && event.target.closest("[data-calendar-slot]");
    if (slot && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].indexOf(event.key) !== -1) {
      var step = calendarStep(this.container);
      var weekday = Number(slot.getAttribute("data-weekday"));
      var time = parseTime(slot.getAttribute("data-time"));
      var targetDay = weekday;
      var targetTime = time;
      if (event.key === "ArrowLeft") targetDay = Math.max(1, weekday - 1);
      else if (event.key === "ArrowRight") targetDay = Math.min(7, weekday + 1);
      else if (event.key === "ArrowUp") targetTime -= step;
      else if (event.key === "ArrowDown") targetTime += step;
      else if (event.key === "PageUp") targetTime -= 60;
      else if (event.key === "PageDown") targetTime += 60;
      else {
        var daySlots = slot.closest("[data-calendar-day]").querySelectorAll("[data-calendar-slot]");
        var edgeSlot = event.key === "Home" ? daySlots[0] : daySlots[daySlots.length - 1];
        if (edgeSlot) {
          event.preventDefault();
          this.setActiveSlot(edgeSlot, true);
        }
        return;
      }
      event.preventDefault();
      this.focusSlot(targetDay, targetTime);
      return;
    }
    var card = event.target.closest && event.target.closest("[data-calendar-card]");
    if (!card) return;
    var id = card.getAttribute("data-session-id");
    var occurrenceDate = card.getAttribute("data-occurrence-date");
    var item = this.session(id);
    if (!item) return;
    if (event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(event.key) !== -1) {
      var step = calendarStep(this.container);
      event.preventDefault();
      if (event.key === "ArrowLeft") this.move(id, occurrenceDate, dates.addDays(occurrenceDate, -1), parseTime(item.start));
      else if (event.key === "ArrowRight") this.move(id, occurrenceDate, dates.addDays(occurrenceDate, 1), parseTime(item.start));
      else if (event.key === "ArrowUp") this.move(id, occurrenceDate, occurrenceDate, parseTime(item.start) - step);
      else this.move(id, occurrenceDate, occurrenceDate, parseTime(item.start) + step);
      return;
    }
    if (event.target === card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      this.edit(id);
    }
  };

  Calendar.prototype.dropTarget = function (target, clientY) {
    if (!this.isEditable()) return null;
    var slot = target && target.closest && target.closest("[data-calendar-slot]");
    if (slot) return slot;
    var day = target && target.closest && target.closest("[data-calendar-day]");
    if (!day) return null;
    var slots = Array.prototype.slice.call(day.querySelectorAll("[data-calendar-slot]"));
    if (!slots.length) return null;
    var best = slots[0];
    var distance = Infinity;
    slots.forEach(function (candidate) {
      var rect = candidate.getBoundingClientRect();
      var current = Math.abs(clientY - (rect.top + rect.height / 2));
      if (current < distance) {
        distance = current;
        best = candidate;
      }
    });
    return best;
  };

  Calendar.prototype.highlight = function (slot) {
    if (!this.isEditable()) return;
    if (this.dragTarget === slot) return;
    Array.prototype.forEach.call(this.container.querySelectorAll("[data-calendar-drop-active]"), function (node) {
      node.removeAttribute("data-calendar-drop-active");
    });
    this.dragTarget = slot || null;
    if (slot) slot.setAttribute("data-calendar-drop-active", "true");
  };

  Calendar.prototype.onDragStart = function (event) {
    if (!this.isEditable()) return;
    // The visible handle uses the pointer-based drag flow for both mouse and
    // touch. Cancel a native drag started by its draggable card ancestor so
    // the two mechanisms cannot compete and leave the cursor in a no-drop
    // state.
    if (this.pointer) {
      event.preventDefault();
      return;
    }
    var paletteCard = event.target.closest && event.target.closest("[data-schedule-palette-card]");
    if (paletteCard) {
      var paletteHandle = event.target.closest && event.target.closest("[data-schedule-palette-drag-handle]");
      if (!paletteHandle) {
        event.preventDefault();
        return;
      }
      this.dragTemplateId = paletteCard.getAttribute("data-template-id");
      this.dragId = "";
      this.dragDate = "";
      paletteCard.setAttribute("data-calendar-dragging", "true");
      this.suppressClickUntil = Date.now() + 500;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", "template|" + this.dragTemplateId);
      }
      return;
    }
    var card = event.target.closest && event.target.closest("[data-calendar-card]");
    if (!card) return;
    this.dragId = card.getAttribute("data-session-id");
    this.dragDate = card.getAttribute("data-occurrence-date");
    this.dragTemplateId = "";
    card.setAttribute("data-calendar-dragging", "true");
    this.suppressClickUntil = Date.now() + 500;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "session|" + this.dragId + "|" + this.dragDate);
    }
  };

  Calendar.prototype.onDragOver = function (event) {
    if (!this.isEditable()) return;
    if (!this.dragId && !this.dragTemplateId) return;
    var slot = this.dropTarget(event.target, event.clientY);
    if (!slot) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.dragTemplateId ? "copy" : "move";
    this.highlight(slot);
  };

  Calendar.prototype.onDrop = function (event) {
    if (!this.isEditable()) return;
    var transferred = event.dataTransfer && event.dataTransfer.getData("text/plain");
    var parts = String(transferred || "").split("|");
    var isTemplate = Boolean(this.dragTemplateId) || parts[0] === "template";
    var templateId = this.dragTemplateId || (isTemplate ? parts[1] : "");
    var id = this.dragId || (parts[0] === "session" ? parts[1] : parts[0]);
    var occurrenceDate = this.dragDate || (parts[0] === "session" ? parts[2] : parts[1]);
    var slot = this.dropTarget(event.target, event.clientY);
    if ((!isTemplate && (!id || !occurrenceDate)) || (isTemplate && !templateId) || !slot) return;
    event.preventDefault();
    if (isTemplate) {
      this.placeTemplate(templateId, slot.getAttribute("data-date"), parseTime(slot.getAttribute("data-time")));
    } else {
      this.move(id, occurrenceDate, slot.getAttribute("data-date"), parseTime(slot.getAttribute("data-time")));
    }
    this.finishDrag();
  };

  Calendar.prototype.finishDrag = function () {
    Array.prototype.forEach.call(this.container.querySelectorAll("[data-calendar-dragging]"), function (node) {
      node.removeAttribute("data-calendar-dragging");
    });
    this.highlight(null);
    this.dragId = "";
    this.dragDate = "";
    this.dragTemplateId = "";
  };

  Calendar.prototype.onPointerDown = function (event) {
    if (!this.isEditable()) return;
    var handle = event.target.closest && event.target.closest("[data-calendar-drag-handle]");
    if (!handle || event.button > 0) return;
    var paletteCard = handle.closest("[data-schedule-palette-card]");
    var card = handle.closest("[data-calendar-card]");
    var dragCard = paletteCard || card;
    if (!dragCard) return;
    if (event.cancelable) event.preventDefault();
    this.pointer = {
      kind: paletteCard ? "template" : "session",
      id: paletteCard ? paletteCard.getAttribute("data-template-id") : card.getAttribute("data-session-id"),
      occurrenceDate: card ? card.getAttribute("data-occurrence-date") : "",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moving: false,
      card: dragCard,
      handle: handle
    };
    if (typeof handle.setPointerCapture === "function") {
      try { handle.setPointerCapture(event.pointerId); } catch (error) { /* Pointer capture is an enhancement. */ }
    }
  };

  Calendar.prototype.createGhost = function (card, x, y) {
    var ghost = card.cloneNode(true);
    var rect = card.getBoundingClientRect();
    ghost.classList.add("schedule-calendar__drag-ghost");
    ghost.removeAttribute("data-calendar-card");
    ghost.removeAttribute("tabindex");
    ghost.draggable = false;
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.position = "fixed";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    ghost.style.width = Math.max(160, rect.width) + "px";
    ghost.style.margin = "0";
    document.body.appendChild(ghost);
    this.ghost = ghost;
    this.positionGhost(x, y);
  };

  Calendar.prototype.positionGhost = function (x, y) {
    if (!this.ghost) return;
    this.ghost.style.left = x + 14 + "px";
    this.ghost.style.top = y + 14 + "px";
  };

  Calendar.prototype.onPointerMove = function (event) {
    if (!this.isEditable()) return;
    var pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    var moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (!pointer.moving && moved < 8) return;
    if (!pointer.moving) {
      pointer.moving = true;
      pointer.card.setAttribute("data-calendar-dragging", "true");
      this.createGhost(pointer.card, event.clientX, event.clientY);
    }
    if (event.cancelable) event.preventDefault();
    this.positionGhost(event.clientX, event.clientY);
    var hit = document.elementFromPoint(event.clientX, event.clientY);
    this.highlight(this.dropTarget(hit, event.clientY));
  };

  Calendar.prototype.onPointerUp = function (event) {
    if (!this.isEditable()) return;
    var pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    var shouldMove = pointer.moving && this.dragTarget;
    var id = pointer.id;
    var kind = pointer.kind;
    var slot = this.dragTarget;
    if (pointer.moving) this.suppressClickUntil = Date.now() + 500;
    this.finishPointer(false);
    if (shouldMove && kind === "template") {
      this.placeTemplate(id, slot.getAttribute("data-date"), parseTime(slot.getAttribute("data-time")));
    } else if (shouldMove) {
      this.move(id, pointer.occurrenceDate, slot.getAttribute("data-date"), parseTime(slot.getAttribute("data-time")));
    }
  };

  Calendar.prototype.finishPointer = function () {
    if (this.pointer && this.pointer.handle && typeof this.pointer.handle.releasePointerCapture === "function") {
      try { this.pointer.handle.releasePointerCapture(this.pointer.pointerId); } catch (error) { /* It may already be released. */ }
    }
    if (this.ghost && this.ghost.parentNode) this.ghost.parentNode.removeChild(this.ghost);
    this.ghost = null;
    this.pointer = null;
    this.finishDrag();
  };

  function mountAll() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-schedule-calendar]"), function (container) {
      if (container.getAttribute("data-schedule-calendar-mounted") === "true") return;
      controllers.push(new Calendar(container));
    });
  }

  function renderAll() {
    controllers.slice().forEach(function (controller) { controller.render(); });
    if (detailDossier) detailDossier.refresh();
  }

  function destroyAll() {
    controllers.slice().forEach(function (controller) { controller.destroy(); });
    controllers = [];
    if (detailDossier) {
      detailDossier.destroy();
      detailDossier = null;
    }
  }

  function syncCalendarFilter(view, raw) {
    var filter = raw === "narva" ? "narva" : "sillamae";
    view.setAttribute("data-schedule-active-filter", filter);
    Array.prototype.forEach.call(view.querySelectorAll("[data-schedule-filter], [data-schedule-calendar-filter]"), function (candidate) {
      var value = candidate.tagName === "SELECT"
        ? candidate.value
        : (candidate.getAttribute("data-schedule-filter") || candidate.getAttribute("data-schedule-calendar-filter"));
      if (candidate.tagName === "SELECT") candidate.value = filter;
      else candidate.setAttribute("aria-pressed", String(value === filter));
    });
    return filter;
  }

  function setCalendarFilter(control) {
    var view = control.closest && control.closest("[data-schedule-calendar-view], [data-schedule-section]");
    if (!view) return false;
    var calendar = view.matches && view.matches("[data-schedule-calendar]")
      ? view
      : view.querySelector("[data-schedule-calendar]");
    if (!calendar) return false;
    var raw = control.tagName === "SELECT"
      ? control.value
      : (control.getAttribute("data-schedule-filter") || control.getAttribute("data-schedule-calendar-filter"));
    var filter = syncCalendarFilter(view, raw);
    if (store.setUi && !calendar.hasAttribute("data-schedule-calendar-homepage")) {
      store.setUi({ filterVenue: filter });
    }
    renderAll();
    return true;
  }

  store.subscribe(renderAll);
  window.addEventListener("site:languagechange", function () { window.setTimeout(renderAll, 0); });
  document.addEventListener("click", function (event) {
    var control = event.target.closest && event.target.closest("[data-schedule-filter], [data-schedule-calendar-filter]");
    if (control && control.tagName !== "SELECT") setCalendarFilter(control);
  });
  document.addEventListener("change", function (event) {
    var control = event.target.closest && event.target.closest("select[data-schedule-filter], select[data-schedule-calendar-filter]");
    if (control) setCalendarFilter(control);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll, { once: true });
  else mountAll();

  window.DzhikaevaScheduleCalendar = Object.freeze({
    mountAll: mountAll,
    renderAll: renderAll,
    destroyAll: destroyAll
  });
}());
