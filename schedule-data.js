(function () {
  "use strict";

  var STORAGE_KEY = "aleksi.schedule.v1";
  var BACKUP_KEY = "aleksi.schedule.backup.v1";
  var UI_KEY = "aleksi.schedule.ui.v1";
  var SYNC_KEY = "aleksi.schedule.sync.v1";
  var MIGRATION_KEY = "aleksi.schedule.migration.v1";
  var REMOTE_URL = "/api/schedule/state/";
  var REMOTE_TIMEOUT_MS = 12000;
  var SCHEMA_VERSION = 4;
  var TIME_ZONE = "Europe/Tallinn";
  var MAX_SESSIONS = 80;
  var MAX_TEMPLATES = 120;
  var MAX_IMPORT_BYTES = 100000;
  var LANGUAGES = ["ru", "et", "en"];
  var VENUES = { sillamae: true, narva: true };
  var STATUSES = { active: true, cancelled: true };
  var listeners = [];
  var syncListeners = [];
  var storageAvailable = true;

  var DEFAULT_SESSIONS = [
    session("sillamae-children-mon", 1, "17:00", "18:00", "sillamae", childrenTitle(), childrenAudience()),
    session("sillamae-children-wed", 3, "17:00", "18:00", "sillamae", childrenTitle(), childrenAudience()),
    session("sillamae-children-fri", 5, "17:00", "18:00", "sillamae", childrenTitle(), childrenAudience()),
    session("sillamae-toddlers-sat", 6, "10:00", "10:45", "sillamae", toddlersTitle(), toddlersAudience()),
    session("narva-children-tue", 2, "18:00", "19:00", "narva", narvaChildrenTitle(), narvaChildrenAudience()),
    session("narva-children-thu", 4, "18:00", "19:00", "narva", narvaChildrenTitle(), narvaChildrenAudience()),
    session("narva-children-sat", 6, "11:00", "12:00", "narva", narvaChildrenTitle(), narvaChildrenAudience())
  ];
  var DEFAULT_TEMPLATES = templatesFromSessions(DEFAULT_SESSIONS);

  var storedStateAtStartup = readStored(STORAGE_KEY);
  var hadStoredScheduleAtStartup = storedStateAtStartup !== null;
  var state = storedStateAtStartup || loadInitialState();
  var stateAtStartup = clone(state);
  var syncMeta = readSyncMeta();
  var migrationBackupState = readStored(MIGRATION_KEY);
  var primaryLegacyCandidate = (
    (!syncMeta.known || syncMeta.migration)
    && hadStoredScheduleAtStartup
    && !sameScheduleContent(stateAtStartup, defaultState())
  );
  if (!migrationBackupState && primaryLegacyCandidate) {
    migrationBackupState = clone(stateAtStartup);
    writeStored(MIGRATION_KEY, migrationBackupState);
  }
  var protectedEditorAtStartup = isProtectedEditorLocation();
  var legacyMigrationPending = protectedEditorAtStartup && migrationBackupState !== null;
  if (legacyMigrationPending) state = clone(migrationBackupState);
  var remoteRevision = syncMeta.remoteRevision;
  var pendingSync = legacyMigrationPending || (syncMeta.pending && !syncMeta.migration);
  var lastSyncedAt = syncMeta.lastSyncedAt;
  var syncStatus = "loading";
  var lastSyncError = null;
  var conflictSnapshot = pendingSync && (syncMeta.conflict || legacyMigrationPending)
    ? { state: null, revision: remoteRevision }
    : null;
  var localGeneration = 0;
  var initialRemoteComplete = false;
  var syncInFlight = null;
  var unconfirmedAttempt = null;
  var readyPromise = null;

  function childrenTitle() {
    return {
      ru: "Дети и подростки",
      et: "Lapsed ja noored",
      en: "Children and teenagers"
    };
  }

  function childrenAudience() {
    return {
      ru: "6–16 лет",
      et: "6–16-aastased",
      en: "Ages 6–16"
    };
  }

  function toddlersTitle() {
    return {
      ru: "Первое знакомство",
      et: "Esimene tutvus",
      en: "First introduction"
    };
  }

  function toddlersAudience() {
    return {
      ru: "Малыши до 4 лет",
      et: "Väikelapsed kuni 4 aastat",
      en: "Toddlers up to age 4"
    };
  }

  function narvaChildrenTitle() {
    return {
      ru: "Детская группа",
      et: "Lasterühm",
      en: "Children’s group"
    };
  }

  function narvaChildrenAudience() {
    return {
      ru: "От 5–6 лет",
      et: "Alates 5.–6. eluaastast",
      en: "Ages 5–6 and up"
    };
  }

  function session(id, weekday, start, end, venue, title, audience) {
    return {
      id: id,
      weekday: weekday,
      recurrence: "weekly",
      weekdays: [weekday],
      date: "",
      startsOn: "",
      endsOn: "",
      start: start,
      end: end,
      venue: venue,
      title: title,
      audience: audience,
      status: "active"
    };
  }

  function hashTemplateKey(value, seed) {
    var hash = seed >>> 0;
    var index;
    for (index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function templateIdentityKey(item) {
    return [
      item.venue,
      item.title.ru,
      item.title.et,
      item.title.en,
      item.audience.ru,
      item.audience.et,
      item.audience.en
    ].join("\u001f");
  }

  function templateIdForSession(item) {
    var key = templateIdentityKey(item);
    return "template-" + hashTemplateKey(key, 2166136261) + "-" + hashTemplateKey(key, 3339675911);
  }

  function legacyTemplateIdForSession(item) {
    var key = [
      item.venue,
      item.start,
      item.end,
      item.title.ru,
      item.title.et,
      item.title.en,
      item.audience.ru,
      item.audience.et,
      item.audience.en
    ].join("\u001f");
    return "template-" + hashTemplateKey(key, 2166136261) + "-" + hashTemplateKey(key, 3339675911);
  }

  function templateFromSession(item) {
    return {
      id: templateIdForSession(item),
      venue: item.venue,
      title: clone(item.title),
      audience: clone(item.audience),
      durationMinutes: boundedTemplateDuration(item.start, item.end)
    };
  }

  function templatesFromSessions(sessions) {
    var indexes = Object.create(null);
    return sessions.reduce(function (templates, item) {
      var reusable = templateFromSession(item);
      if (typeof indexes[reusable.id] === "number") {
        templates[indexes[reusable.id]] = reusable;
      } else {
        indexes[reusable.id] = templates.length;
        templates.push(reusable);
      }
      return templates;
    }, []);
  }

  function mergeTemplates(first, second) {
    var indexes = Object.create(null);
    return first.concat(second).reduce(function (templates, item) {
      if (typeof indexes[item.id] === "number") {
        templates[indexes[item.id]] = clone(item);
      } else {
        indexes[item.id] = templates.length;
        templates.push(clone(item));
      }
      return templates;
    }, []);
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function defaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: 1,
      timeZone: TIME_ZONE,
      updatedAt: nowIso(),
      templates: clone(DEFAULT_TEMPLATES),
      sessions: clone(DEFAULT_SESSIONS)
    };
  }

  function hasOnlyKeys(value, allowed) {
    return Object.keys(value).every(function (key) {
      return allowed.indexOf(key) !== -1;
    });
  }

  function hasExactKeys(value, expected) {
    var keys = Object.keys(value);
    return keys.length === expected.length && expected.every(function (key) {
      return Object.prototype.hasOwnProperty.call(value, key);
    });
  }

  function requireString(value, label, maxLength, pattern) {
    if (typeof value !== "string") throw new Error(label + " must be text");
    var result = value.trim();
    if (!result || result.length > maxLength || (pattern && !pattern.test(result))) {
      throw new Error(label + " is invalid");
    }
    return result;
  }

  function requireSafeText(value, label, maxLength) {
    var result = requireString(value, label, maxLength);
    if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result)) {
      throw new Error(label + " contains unsupported characters");
    }
    return result;
  }

  function validateLocalized(value, label, maxLength) {
    if (!isObject(value) || !hasOnlyKeys(value, LANGUAGES)) {
      throw new Error(label + " must contain only ru, et and en");
    }

    var result = {};
    LANGUAGES.forEach(function (language) {
      result[language] = requireSafeText(value[language], label + "." + language, maxLength);
    });
    return result;
  }

  function minutes(time) {
    var match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(time);
    if (!match) return -1;
    var parts = time.split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function boundedTemplateDuration(start, end) {
    return Math.max(15, Math.min(720, minutes(end) - minutes(start)));
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split("-").map(Number);
    if (parts[0] < 1) return false;
    var date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
  }

  function optionalDate(value, label) {
    if (typeof value !== "string") throw new Error(label + " must be text");
    var result = value.trim();
    if (result && !validDate(result)) throw new Error(label + " is invalid");
    return result;
  }

  function dateToWeekday(value) {
    var datesApi = window.DzhikaevaScheduleDates;
    if (datesApi && typeof datesApi.dateToWeekday === "function") {
      try {
        var externalResult = Number(datesApi.dateToWeekday(value));
        if (Number.isInteger(externalResult) && externalResult >= 1 && externalResult <= 7) return externalResult;
      } catch (error) {
        // Fall through to deterministic UTC conversion when the optional dates helper rejects the input.
      }
    }

    var parts = value.split("-").map(Number);
    var date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    var day = date.getUTCDay();
    return day === 0 ? 7 : day;
  }

  function validateWeekdays(value, allowEmpty) {
    if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > 7) {
      throw new Error("weekdays must contain " + (allowEmpty ? "at most" : "between 1 and") + " 7 days");
    }

    var seen = Object.create(null);
    var result = value.map(function (day) {
      if (!Number.isInteger(day) || day < 1 || day > 7) {
        throw new Error("weekdays must contain integers from 1 to 7");
      }
      if (seen[day]) throw new Error("weekdays must not contain duplicates");
      seen[day] = true;
      return day;
    });

    return result.sort(function (left, right) { return left - right; });
  }

  function validateLegacySession(candidate) {
    if (!isObject(candidate)) throw new Error("Session must be an object");
    if (!hasOnlyKeys(candidate, ["id", "weekday", "start", "end", "venue", "title", "audience", "status"])) {
      throw new Error("Session contains unsupported fields");
    }

    var result = {
      id: requireString(candidate.id, "id", 64, /^[a-z0-9][a-z0-9-]*$/),
      weekday: Number(candidate.weekday),
      start: requireString(candidate.start, "start", 5, /^(?:[01]\d|2[0-3]):[0-5]\d$/),
      end: requireString(candidate.end, "end", 5, /^(?:[01]\d|2[0-3]):[0-5]\d$/),
      venue: requireString(candidate.venue, "venue", 12),
      title: validateLocalized(candidate.title, "title", 80),
      audience: validateLocalized(candidate.audience, "audience", 120),
      status: requireString(candidate.status, "status", 12)
    };

    if (!Number.isInteger(result.weekday) || result.weekday < 1 || result.weekday > 7) {
      throw new Error("weekday must be an integer from 1 to 7");
    }
    if (!VENUES[result.venue]) throw new Error("venue is invalid");
    if (!STATUSES[result.status]) throw new Error("status is invalid");
    if (minutes(result.end) <= minutes(result.start)) throw new Error("end must be later than start");
    return {
      id: result.id,
      weekday: result.weekday,
      recurrence: "weekly",
      weekdays: [result.weekday],
      date: "",
      startsOn: "",
      endsOn: "",
      start: result.start,
      end: result.end,
      venue: result.venue,
      title: result.title,
      audience: result.audience,
      status: result.status
    };
  }

  function validateSession(candidate) {
    if (!isObject(candidate)) throw new Error("Session must be an object");
    if (!hasOnlyKeys(candidate, [
      "id", "weekday", "recurrence", "weekdays", "date", "startsOn", "endsOn",
      "start", "end", "venue", "title", "audience", "status"
    ])) {
      throw new Error("Session contains unsupported fields");
    }

    var recurrence = requireString(candidate.recurrence, "recurrence", 8);
    if (recurrence !== "weekly" && recurrence !== "once") throw new Error("recurrence is invalid");

    var weekdays = validateWeekdays(candidate.weekdays, recurrence === "once");
    var date = optionalDate(candidate.date, "date");
    var startsOn = optionalDate(candidate.startsOn, "startsOn");
    var endsOn = optionalDate(candidate.endsOn, "endsOn");
    var suppliedWeekday;

    if (recurrence === "weekly") {
      if (date) throw new Error("date must be empty for weekly sessions");
      if (endsOn && startsOn && endsOn < startsOn) throw new Error("endsOn must not be earlier than startsOn");
      suppliedWeekday = weekdays[0];
    } else {
      if (!date) throw new Error("date is required for one-time sessions");
      if (startsOn || endsOn) throw new Error("startsOn and endsOn must be empty for one-time sessions");
      suppliedWeekday = dateToWeekday(date);
      weekdays = [suppliedWeekday];
    }

    var result = {
      id: requireString(candidate.id, "id", 64, /^[a-z0-9][a-z0-9-]*$/),
      weekday: suppliedWeekday,
      recurrence: recurrence,
      weekdays: weekdays,
      date: date,
      startsOn: startsOn,
      endsOn: endsOn,
      start: requireString(candidate.start, "start", 5, /^(?:[01]\d|2[0-3]):[0-5]\d$/),
      end: requireString(candidate.end, "end", 5, /^(?:[01]\d|2[0-3]):[0-5]\d$/),
      venue: requireString(candidate.venue, "venue", 12),
      title: validateLocalized(candidate.title, "title", 80),
      audience: validateLocalized(candidate.audience, "audience", 120),
      status: requireString(candidate.status, "status", 12)
    };

    if (!VENUES[result.venue]) throw new Error("venue is invalid");
    if (!STATUSES[result.status]) throw new Error("status is invalid");
    if (minutes(result.end) <= minutes(result.start)) throw new Error("end must be later than start");
    return result;
  }

  function validateTemplate(candidate) {
    if (!isObject(candidate)) throw new Error("Template must be an object");
    if (!hasExactKeys(candidate, ["id", "venue", "title", "audience", "durationMinutes"])) {
      throw new Error("Template contains unsupported or missing fields");
    }

    var result = {
      id: requireString(candidate.id, "id", 64, /^[a-z0-9][a-z0-9-]*$/),
      venue: requireString(candidate.venue, "venue", 12),
      title: validateLocalized(candidate.title, "title", 80),
      audience: validateLocalized(candidate.audience, "audience", 120),
      durationMinutes: candidate.durationMinutes
    };

    if (!VENUES[result.venue]) throw new Error("venue is invalid");
    if (!Number.isInteger(result.durationMinutes) || result.durationMinutes < 15 || result.durationMinutes > 720) {
      throw new Error("durationMinutes must be an integer from 15 to 720");
    }
    return result;
  }

  function validateLegacyTemplate(candidate) {
    if (!isObject(candidate)) throw new Error("Template must be an object");
    if (!hasExactKeys(candidate, ["id", "venue", "title", "audience", "start", "end"])) {
      throw new Error("Template contains unsupported or missing fields");
    }

    var result = {
      id: requireString(candidate.id, "id", 64, /^[a-z0-9][a-z0-9-]*$/),
      venue: requireString(candidate.venue, "venue", 12),
      title: validateLocalized(candidate.title, "title", 80),
      audience: validateLocalized(candidate.audience, "audience", 120),
      start: requireString(candidate.start, "start", 5, /^(?:[01]\d|2[0-3]):[0-5]\d$/),
      end: requireString(candidate.end, "end", 5, /^(?:[01]\d|2[0-3]):[0-5]\d$/)
    };

    if (!VENUES[result.venue]) throw new Error("venue is invalid");
    if (minutes(result.end) <= minutes(result.start)) throw new Error("end must be later than start");
    return result;
  }

  function migrateLegacyTemplate(candidate) {
    return {
      id: candidate.id,
      venue: candidate.venue,
      title: clone(candidate.title),
      audience: clone(candidate.audience),
      durationMinutes: boundedTemplateDuration(candidate.start, candidate.end)
    };
  }

  function normalizeTemplates(candidates, legacyShape) {
    var rawIds = Object.create(null);
    var indexes = Object.create(null);
    var automatic = Object.create(null);
    var templates = [];

    candidates.forEach(function (candidate) {
      var legacy = legacyShape ? validateLegacyTemplate(candidate) : null;
      var validated = legacy ? migrateLegacyTemplate(legacy) : validateTemplate(candidate);
      var rawId = validated.id;
      if (rawIds[rawId]) throw new Error("Template ids must be unique");
      rawIds[rawId] = true;

      var stableId = templateIdForSession(validated);
      var isAutomatic = rawId === stableId || (legacy && rawId === legacyTemplateIdForSession(legacy));
      if (isAutomatic) validated.id = stableId;

      if (typeof indexes[validated.id] === "number") {
        if (!isAutomatic || !automatic[validated.id]) throw new Error("Template ids must be unique");
        templates[indexes[validated.id]] = validated;
      } else {
        indexes[validated.id] = templates.length;
        automatic[validated.id] = isAutomatic;
        templates.push(validated);
      }
    });

    return templates;
  }

  function validateState(candidate) {
    if (!isObject(candidate)) throw new Error("Schedule must be an object");
    if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2 && candidate.schemaVersion !== 3 && candidate.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("Unsupported schedule schema");
    }
    var expectedKeys = candidate.schemaVersion >= 3
      ? ["schemaVersion", "revision", "timeZone", "updatedAt", "templates", "sessions"]
      : ["schemaVersion", "revision", "timeZone", "updatedAt", "sessions"];
    if (!hasExactKeys(candidate, expectedKeys)) {
      throw new Error("Schedule contains unsupported or missing fields");
    }
    if (!Number.isInteger(candidate.revision) || candidate.revision < 1 || candidate.revision > 1000000000) {
      throw new Error("revision is invalid");
    }
    if (candidate.timeZone !== TIME_ZONE) throw new Error("timeZone must be Europe/Tallinn");
    if (typeof candidate.updatedAt !== "string" || candidate.updatedAt.length > 40 || !Number.isFinite(Date.parse(candidate.updatedAt))) {
      throw new Error("updatedAt is invalid");
    }
    if (!Array.isArray(candidate.sessions) || candidate.sessions.length > MAX_SESSIONS) {
      throw new Error("sessions must be an array with at most " + MAX_SESSIONS + " entries");
    }

    var ids = Object.create(null);
    var legacy = candidate.schemaVersion === 1;
    var sessions = candidate.sessions.map(function (item) {
      var validated = legacy ? validateLegacySession(item) : validateSession(item);
      if (ids[validated.id]) throw new Error("Session ids must be unique");
      ids[validated.id] = true;
      return validated;
    });

    var templateCandidates;
    if (candidate.schemaVersion >= 3) {
      if (!Array.isArray(candidate.templates) || candidate.templates.length > MAX_TEMPLATES) {
        throw new Error("templates must be an array with at most " + MAX_TEMPLATES + " entries");
      }
      templateCandidates = candidate.templates;
    } else {
      templateCandidates = mergeTemplates(DEFAULT_TEMPLATES, templatesFromSessions(sessions));
    }
    var templates = normalizeTemplates(templateCandidates, candidate.schemaVersion === 3);

    return {
      schemaVersion: SCHEMA_VERSION,
      revision: candidate.revision,
      timeZone: TIME_ZONE,
      updatedAt: new Date(candidate.updatedAt).toISOString(),
      templates: templates,
      sessions: sessions
    };
  }

  function validRemoteRevision(value) {
    return Number.isInteger(value) && value >= 0 && value <= 9007199254740991;
  }

  function emptySyncMeta() {
    return {
      known: false,
      remoteRevision: null,
      pending: false,
      conflict: false,
      migration: false,
      lastSyncedAt: ""
    };
  }

  function readSyncMeta() {
    var raw;
    try {
      raw = window.localStorage.getItem(SYNC_KEY);
    } catch (error) {
      storageAvailable = false;
      return emptySyncMeta();
    }
    if (!raw) return emptySyncMeta();

    try {
      var parsed = JSON.parse(raw);
      if (!isObject(parsed)) return emptySyncMeta();
      return {
        known: true,
        remoteRevision: validRemoteRevision(parsed.remoteRevision) ? parsed.remoteRevision : null,
        pending: parsed.pending === true,
        conflict: parsed.pending === true && parsed.conflict === true,
        migration: parsed.pending === true && parsed.migration === true,
        lastSyncedAt: typeof parsed.lastSyncedAt === "string" && parsed.lastSyncedAt.length <= 40
          ? parsed.lastSyncedAt
          : ""
      };
    } catch (error) {
      return emptySyncMeta();
    }
  }

  function writeSyncMeta() {
    try {
      window.localStorage.setItem(SYNC_KEY, JSON.stringify({
        remoteRevision: remoteRevision,
        pending: pendingSync,
        conflict: pendingSync && conflictSnapshot !== null,
        migration: pendingSync && legacyMigrationPending,
        lastSyncedAt: lastSyncedAt
      }));
      storageAvailable = true;
      return true;
    } catch (error) {
      storageAvailable = false;
      return false;
    }
  }

  function syncErrorDetail(error) {
    if (!error) return null;
    return {
      code: typeof error.code === "string" ? error.code : "SCHEDULE_SYNC_FAILED",
      message: typeof error.message === "string" ? error.message : "Schedule sync failed",
      status: Number.isInteger(error.status) ? error.status : 0
    };
  }

  function getSyncState() {
    return {
      status: syncStatus,
      pending: pendingSync,
      remoteRevision: remoteRevision,
      lastSyncedAt: lastSyncedAt,
      error: syncErrorDetail(lastSyncError),
      conflict: conflictSnapshot !== null,
      migration: legacyMigrationPending
    };
  }

  function dispatchSync() {
    var snapshot = getSyncState();
    syncListeners.slice().forEach(function (listener) {
      try {
        listener(clone(snapshot));
      } catch (error) {
        window.setTimeout(function () {
          throw error;
        }, 0);
      }
    });

    var event;
    if (typeof window.CustomEvent === "function") {
      event = new CustomEvent("dzhikaeva:schedulesync", { detail: snapshot });
    } else if (typeof document !== "undefined" && typeof document.createEvent === "function") {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent("dzhikaeva:schedulesync", false, false, snapshot);
    }
    if (event) window.dispatchEvent(event);
  }

  function setSyncStatus(status, error) {
    syncStatus = status;
    lastSyncError = error || null;
    writeSyncMeta();
    dispatchSync();
  }

  function createRemoteError(message, code, status, payload) {
    var error = new Error(message);
    error.code = code || "SCHEDULE_SYNC_FAILED";
    error.status = Number.isInteger(status) ? status : 0;
    error.payload = payload || null;
    return error;
  }

  function responseMessage(payload, fallback) {
    if (isObject(payload)) {
      if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
      if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
    }
    return fallback;
  }

  function readResponsePayload(response) {
    if (typeof response.text === "function") {
      return response.text().then(function (text) {
        if (!text) return {};
        try {
          return JSON.parse(text);
        } catch (error) {
          throw createRemoteError("Schedule service returned invalid JSON", "SCHEDULE_SYNC_INVALID_RESPONSE", response.status);
        }
      });
    }
    if (typeof response.json === "function") return response.json();
    return Promise.resolve({});
  }

  function requestRemote(method, body) {
    if (typeof window.fetch !== "function") {
      return Promise.reject(createRemoteError("Schedule service is unavailable", "SCHEDULE_SYNC_UNAVAILABLE", 0));
    }

    var controller = typeof window.AbortController === "function" ? new window.AbortController() : null;
    var timer = null;
    var options = {
      method: method,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    };
    if (controller) options.signal = controller.signal;
    if (typeof body !== "undefined") {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    if (controller) {
      timer = window.setTimeout(function () {
        controller.abort();
      }, REMOTE_TIMEOUT_MS);
    }

    return Promise.resolve().then(function () {
      return window.fetch(REMOTE_URL, options);
    }).then(function (response) {
      return readResponsePayload(response).then(function (payload) {
        if (timer !== null && typeof window.clearTimeout === "function") window.clearTimeout(timer);
        if (response.ok) return payload;
        var code = response.status === 409
          ? "SCHEDULE_SYNC_CONFLICT"
          : response.status === 401 || response.status === 403
            ? "SCHEDULE_SYNC_UNAUTHORIZED"
            : "SCHEDULE_SYNC_HTTP_ERROR";
        throw createRemoteError(
          responseMessage(payload, "Schedule service returned HTTP " + response.status),
          code,
          response.status,
          payload
        );
      }, function (error) {
        if (timer !== null && typeof window.clearTimeout === "function") window.clearTimeout(timer);
        if (error && error.name === "AbortError") {
          throw createRemoteError("Schedule service timed out", "SCHEDULE_SYNC_TIMEOUT", 0);
        }
        throw error;
      });
    }, function (error) {
      if (timer !== null && typeof window.clearTimeout === "function") window.clearTimeout(timer);
      if (error && error.name === "AbortError") {
        throw createRemoteError("Schedule service timed out", "SCHEDULE_SYNC_TIMEOUT", 0);
      }
      if (error && error.code) throw error;
      throw createRemoteError(
        error && error.message ? error.message : "Schedule service is unreachable",
        "SCHEDULE_SYNC_NETWORK_ERROR",
        0
      );
    });
  }

  function parseRemotePayload(payload) {
    if (!isObject(payload)) {
      throw createRemoteError("Schedule service returned an invalid payload", "SCHEDULE_SYNC_INVALID_RESPONSE", 0);
    }
    var wrapped = isObject(payload.state);
    var candidate = wrapped ? payload.state : payload;
    var revision = wrapped ? payload.revision : payload.remoteRevision;
    if (!validRemoteRevision(revision) && !wrapped) revision = candidate.revision;
    if (!validRemoteRevision(revision)) {
      throw createRemoteError("Schedule service returned an invalid revision", "SCHEDULE_SYNC_INVALID_RESPONSE", 0);
    }
    return {
      state: validateState(candidate),
      revision: revision
    };
  }

  function sameState(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function sameScheduleContent(left, right) {
    return left.timeZone === right.timeZone
      && JSON.stringify(left.templates) === JSON.stringify(right.templates)
      && JSON.stringify(left.sessions) === JSON.stringify(right.sessions);
  }

  function isProtectedEditorLocation() {
    var pathname = window.location && typeof window.location.pathname === "string"
      ? window.location.pathname
      : "";
    return /^\/schedule(?:\/(?:ru|et|en))?(?:\/index\.html)?\/?$/.test(pathname);
  }

  function readStored(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var validated = validateState(parsed);
      if (parsed.schemaVersion !== SCHEMA_VERSION || JSON.stringify(parsed) !== JSON.stringify(validated)) {
        writeStored(key, validated);
      }
      return validated;
    } catch (error) {
      storageAvailable = false;
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      storageAvailable = true;
      return true;
    } catch (error) {
      storageAvailable = false;
      return false;
    }
  }

  function clearMigrationBackup() {
    migrationBackupState = null;
    legacyMigrationPending = false;
    try {
      if (typeof window.localStorage.removeItem === "function") {
        window.localStorage.removeItem(MIGRATION_KEY);
      }
      return true;
    } catch (error) {
      storageAvailable = false;
      return false;
    }
  }

  function loadInitialState() {
    var stored = readStored(STORAGE_KEY);
    if (stored) return stored;

    var backup = readStored(BACKUP_KEY);
    var initial = backup || defaultState();
    writeStored(STORAGE_KEY, initial);
    return initial;
  }

  function backupCurrentState() {
    return writeStored(BACKUP_KEY, state);
  }

  function createStorageError() {
    var error = new Error("Schedule storage is unavailable");
    error.code = "SCHEDULE_STORAGE_UNAVAILABLE";
    return error;
  }

  function dispatchChange(source) {
    var snapshot = clone(state);
    listeners.slice().forEach(function (listener) {
      try {
        listener(snapshot, source);
      } catch (error) {
        window.setTimeout(function () {
          throw error;
        }, 0);
      }
    });

    var event;
    var detail = { state: snapshot, source: source, revision: snapshot.revision };
    if (typeof window.CustomEvent === "function") {
      event = new CustomEvent("dzhikaeva:schedulechange", { detail: detail });
    } else {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent("dzhikaeva:schedulechange", false, false, detail);
    }
    window.dispatchEvent(event);
  }

  function applyRemoteState(remote, source) {
    var changed = !sameState(state, remote);
    state = remote;
    writeStored(STORAGE_KEY, state);
    if (changed) dispatchChange(source || "remote");
  }

  function syncFailureStatus(error) {
    if (error && error.code === "SCHEDULE_SYNC_CONFLICT") return "conflict";
    if (error && (
      error.code === "SCHEDULE_SYNC_NETWORK_ERROR"
      || error.code === "SCHEDULE_SYNC_TIMEOUT"
      || error.code === "SCHEDULE_SYNC_UNAVAILABLE"
    )) return "offline";
    return "error";
  }

  function rememberConflict(error) {
    var remote = null;
    try {
      remote = parseRemotePayload(error.payload);
    } catch (parseError) {
      // A conflict without a usable server snapshot still must not overwrite remote data.
    }
    if (remote) {
      remoteRevision = remote.revision;
      conflictSnapshot = remote;
    } else {
      conflictSnapshot = { state: null, revision: remoteRevision };
    }
  }

  function handleSyncFailure(error) {
    if (error && error.code === "SCHEDULE_SYNC_CONFLICT") rememberConflict(error);
    setSyncStatus(syncFailureStatus(error), error);
    return error;
  }

  function acceptRemoteAsSynced(remote, source) {
    remoteRevision = remote.revision;
    pendingSync = false;
    conflictSnapshot = null;
    legacyMigrationPending = false;
    unconfirmedAttempt = null;
    lastSyncedAt = nowIso();
    applyRemoteState(remote.state, source);
    setSyncStatus("synced", null);
    return clone(state);
  }

  function setRemoteConflict(remote, payload, preserveMigration) {
    remoteRevision = remote.revision;
    pendingSync = true;
    conflictSnapshot = remote;
    if (!preserveMigration) legacyMigrationPending = false;
    setSyncStatus("conflict", createRemoteError(
      "Schedule changed on another device",
      "SCHEDULE_SYNC_CONFLICT",
      409,
      payload || { state: remote.state, revision: remote.revision }
    ));
  }

  function acceptMatchingConflict(error) {
    if (!error || error.code !== "SCHEDULE_SYNC_CONFLICT") return false;
    var remote;
    try {
      remote = parseRemotePayload(error.payload);
    } catch (parseError) {
      return false;
    }
    if (!sameScheduleContent(state, remote.state)) return false;
    var clearMigration = migrationBackupState !== null;
    acceptRemoteAsSynced(remote, "remote-confirmed");
    if (clearMigration) {
      clearMigrationBackup();
      writeSyncMeta();
    }
    return true;
  }

  function shouldMigrateLocalState(remote) {
    return legacyMigrationPending && !sameScheduleContent(state, remote);
  }

  function loadRemoteState() {
    var baseRevision = remoteRevision;
    var pendingBeforeLoad = pendingSync;
    var conflictBeforeLoad = conflictSnapshot !== null;
    if (typeof window.fetch !== "function") {
      initialRemoteComplete = true;
      setSyncStatus(
        "offline",
        createRemoteError("Schedule service is unavailable", "SCHEDULE_SYNC_UNAVAILABLE", 0)
      );
      return Promise.resolve(clone(state));
    }

    setSyncStatus("loading", null);
    return requestRemote("GET").then(function (payload) {
      var remote = parseRemotePayload(payload);
      var legacyMigration = shouldMigrateLocalState(remote.state);
      var keepLocal = pendingBeforeLoad || pendingSync || localGeneration > 0 || legacyMigration;
      initialRemoteComplete = true;

      if (legacyMigrationPending) {
        if (sameScheduleContent(state, remote.state)) {
          var confirmed = acceptRemoteAsSynced(remote, "migration-confirmed");
          clearMigrationBackup();
          writeSyncMeta();
          return confirmed;
        }
        setRemoteConflict(remote, payload, true);
        return clone(state);
      }

      if (!keepLocal || sameScheduleContent(state, remote.state)) {
        return acceptRemoteAsSynced(remote, keepLocal ? "remote-confirmed" : "remote-load");
      }

      if (conflictBeforeLoad) {
        setRemoteConflict(remote, payload);
        return clone(state);
      }

      if (validRemoteRevision(baseRevision) && remote.revision === baseRevision) {
        remoteRevision = baseRevision;
        conflictSnapshot = null;
        legacyMigrationPending = false;
        pendingSync = true;
        setSyncStatus("saving", null);
        queueAutomaticSync();
        return clone(state);
      }

      setRemoteConflict(remote, payload);
      return clone(state);
    }).catch(function (error) {
      initialRemoteComplete = true;
      handleSyncFailure(error);
      return clone(state);
    });
  }

  function loadRemoteRevisionForSave() {
    setSyncStatus("loading", null);
    return requestRemote("GET").then(function (payload) {
      var remote = parseRemotePayload(payload);
      if (sameScheduleContent(state, remote.state)) {
        acceptRemoteAsSynced(remote, "remote-confirmed");
        return remote;
      }
      throw createRemoteError(
        "Schedule changed while the local base was unknown",
        "SCHEDULE_SYNC_CONFLICT",
        409,
        payload
      );
    });
  }

  function savePendingState() {
    if (!pendingSync) return Promise.resolve(clone(state));
    if (conflictSnapshot) {
      return Promise.reject(createRemoteError(
        "Schedule changed on another device",
        "SCHEDULE_SYNC_CONFLICT",
        409,
        conflictSnapshot
      ));
    }

    var generation = localGeneration;
    var snapshot = clone(state);
    var expectedRevision = remoteRevision;
    setSyncStatus("saving", null);

    return requestRemote("PUT", {
      state: snapshot,
      expectedRevision: expectedRevision
    }).then(function (payload) {
      var remote = parseRemotePayload(payload);
      remoteRevision = remote.revision;
      lastSyncedAt = nowIso();
      unconfirmedAttempt = null;

      if (generation !== localGeneration) {
        pendingSync = true;
        writeSyncMeta();
        return savePendingState();
      }

      pendingSync = false;
      conflictSnapshot = null;
      legacyMigrationPending = false;
      applyRemoteState(remote.state, "remote-save");
      setSyncStatus("synced", null);
      return clone(state);
    }, function (error) {
      if (error && (
        error.code === "SCHEDULE_SYNC_NETWORK_ERROR"
        || error.code === "SCHEDULE_SYNC_TIMEOUT"
        || error.code === "SCHEDULE_SYNC_UNAVAILABLE"
      )) {
        unconfirmedAttempt = { state: snapshot, generation: generation };
        throw error;
      }

      if (error && error.code === "SCHEDULE_SYNC_CONFLICT") {
        var remote = null;
        try {
          remote = parseRemotePayload(error.payload);
        } catch (parseError) {
          // Keep the regular conflict path when the response has no valid server snapshot.
        }
        if (remote && sameScheduleContent(state, remote.state)) {
          unconfirmedAttempt = null;
          return acceptRemoteAsSynced(remote, "remote-confirmed");
        }
        if (remote && unconfirmedAttempt && sameScheduleContent(unconfirmedAttempt.state, remote.state)) {
          remoteRevision = remote.revision;
          unconfirmedAttempt = null;
          conflictSnapshot = null;
          pendingSync = true;
          writeSyncMeta();
          return savePendingState();
        }
      }
      throw error;
    });
  }

  function beginSync() {
    if (!pendingSync) return Promise.resolve(clone(state));
    if (conflictSnapshot) {
      return Promise.reject(createRemoteError(
        "Schedule changed on another device",
        "SCHEDULE_SYNC_CONFLICT",
        409,
        conflictSnapshot
      ));
    }
    if (syncInFlight) return syncInFlight;

    var operation = (remoteRevision === null
      ? loadRemoteRevisionForSave()
      : Promise.resolve(null)
    ).then(function () {
      return savePendingState();
    });

    syncInFlight = operation.then(function (result) {
      syncInFlight = null;
      return result;
    }, function (error) {
      syncInFlight = null;
      if (acceptMatchingConflict(error)) return clone(state);
      handleSyncFailure(error);
      throw error;
    });
    return syncInFlight;
  }

  function queueAutomaticSync() {
    if (!initialRemoteComplete || !pendingSync || conflictSnapshot || typeof window.fetch !== "function") return;
    Promise.resolve().then(function () {
      return beginSync();
    }).catch(function () {
      // The local cache remains pending. A later edit, online event or explicit flush can retry it.
    });
  }

  function markPendingSync() {
    pendingSync = true;
    if (legacyMigrationPending && migrationBackupState) {
      migrationBackupState = clone(state);
      writeStored(MIGRATION_KEY, migrationBackupState);
    }
    if (conflictSnapshot) {
      setSyncStatus("conflict", lastSyncError);
    } else {
      setSyncStatus("saving", null);
      queueAutomaticSync();
    }
  }

  function flushSync() {
    var ready = readyPromise || Promise.resolve(clone(state));
    return ready.then(function () {
      if (!pendingSync) return clone(state);
      return beginSync();
    });
  }

  function refreshRemote() {
    if (pendingSync) return flushSync();
    if (syncInFlight) return syncInFlight;

    var generation = localGeneration;
    setSyncStatus("loading", null);
    var operation = requestRemote("GET").then(function (payload) {
      var remote = parseRemotePayload(payload);
      if (generation !== localGeneration || pendingSync) {
        if (sameScheduleContent(state, remote.state)) {
          return acceptRemoteAsSynced(remote, "remote-confirmed");
        }
        setRemoteConflict(remote, payload);
        return clone(state);
      }
      return acceptRemoteAsSynced(remote, "remote-refresh");
    });
    syncInFlight = operation.then(function (result) {
      syncInFlight = null;
      return result;
    }, function (error) {
      syncInFlight = null;
      handleSyncFailure(error);
      throw error;
    });
    return syncInFlight;
  }

  function retrySync() {
    if (pendingSync && conflictSnapshot && !conflictSnapshot.state) {
      return loadConflictSnapshot().then(function () {
        return clone(state);
      });
    }
    return pendingSync ? flushSync() : refreshRemote();
  }

  function loadConflictSnapshot() {
    if (!conflictSnapshot) return Promise.resolve(null);
    if (syncInFlight) return syncInFlight;

    setSyncStatus("loading", null);
    var operation = requestRemote("GET").then(function (payload) {
      var remote = parseRemotePayload(payload);
      remoteRevision = remote.revision;
      conflictSnapshot = remote;
      setSyncStatus("conflict", createRemoteError(
        "Schedule changed on another device",
        "SCHEDULE_SYNC_CONFLICT",
        409,
        payload
      ));
      return remote;
    });
    syncInFlight = operation.then(function (result) {
      syncInFlight = null;
      return result;
    }, function (error) {
      syncInFlight = null;
      handleSyncFailure(error);
      throw error;
    });
    return syncInFlight;
  }

  function resolveConflict(strategy) {
    if (!conflictSnapshot) return Promise.resolve(clone(state));
    if (strategy !== "remote" && strategy !== "local") {
      return Promise.reject(new Error("Conflict strategy must be remote or local"));
    }
    if (!conflictSnapshot.state) {
      return loadConflictSnapshot().then(function () {
        return resolveConflict(strategy);
      });
    }
    if (strategy === "remote") {
      var discardMigration = migrationBackupState !== null;
      remoteRevision = conflictSnapshot.revision;
      pendingSync = false;
      legacyMigrationPending = false;
      lastSyncedAt = nowIso();
      var remote = conflictSnapshot.state;
      conflictSnapshot = null;
      applyRemoteState(remote, "conflict-remote");
      setSyncStatus("synced", null);
      if (discardMigration) {
        clearMigrationBackup();
        writeSyncMeta();
      }
      return Promise.resolve(clone(state));
    }
    if (strategy === "local") {
      if (!validRemoteRevision(conflictSnapshot.revision)) {
        return Promise.reject(createRemoteError(
          "The latest remote revision is unavailable",
          "SCHEDULE_SYNC_INVALID_RESPONSE",
          0
        ));
      }
      var saveMigration = migrationBackupState !== null;
      remoteRevision = conflictSnapshot.revision;
      conflictSnapshot = null;
      pendingSync = true;
      legacyMigrationPending = saveMigration;
      setSyncStatus("saving", null);
      return beginSync().then(function (result) {
        if (saveMigration) {
          clearMigrationBackup();
          writeSyncMeta();
        }
        return result;
      });
    }
  }

  function subscribeSync(listener) {
    if (typeof listener !== "function") throw new Error("Listener must be a function");
    syncListeners.push(listener);
    return function () {
      syncListeners = syncListeners.filter(function (candidate) {
        return candidate !== listener;
      });
    };
  }

  function commit(candidate, source, createBackup) {
    var validated = validateState(candidate);
    if (state.revision >= 1000000000) throw new Error("Schedule revision limit reached");
    if (createBackup && !backupCurrentState()) throw createStorageError();

    validated.revision = state.revision + 1;
    validated.updatedAt = nowIso();
    if (!writeStored(STORAGE_KEY, validated)) throw createStorageError();
    state = validated;
    localGeneration += 1;
    markPendingSync();
    dispatchChange(source || "save");
    return clone(state);
  }

  function upsert(candidate) {
    var item = isObject(candidate) && typeof candidate.recurrence === "undefined"
      ? validateLegacySession(candidate)
      : validateSession(candidate);
    var sessions = clone(state.sessions);
    var found = false;

    sessions = sessions.map(function (existing) {
      if (existing.id !== item.id) return existing;
      found = true;
      return item;
    });
    if (!found) {
      if (sessions.length >= MAX_SESSIONS) throw new Error("Schedule is full");
      sessions.push(item);
    }

    return commit({
      schemaVersion: SCHEMA_VERSION,
      revision: state.revision,
      timeZone: TIME_ZONE,
      updatedAt: state.updatedAt,
      templates: clone(state.templates),
      sessions: sessions
    }, found ? "update" : "create", false);
  }

  function remove(id) {
    var safeId = requireString(id, "id", 64, /^[a-z0-9][a-z0-9-]*$/);
    var sessions = state.sessions.filter(function (item) {
      return item.id !== safeId;
    });
    if (sessions.length === state.sessions.length) return clone(state);

    return commit({
      schemaVersion: SCHEMA_VERSION,
      revision: state.revision,
      timeZone: TIME_ZONE,
      updatedAt: state.updatedAt,
      templates: clone(state.templates),
      sessions: sessions
    }, "delete", false);
  }

  function upsertTemplate(candidate) {
    var item = validateTemplate(candidate);
    var templates = clone(state.templates);
    var found = false;

    templates = templates.map(function (existing) {
      if (existing.id !== item.id) return existing;
      found = true;
      return item;
    });
    if (!found) {
      if (templates.length >= MAX_TEMPLATES) throw new Error("Template library is full");
      templates.push(item);
    }

    return commit({
      schemaVersion: SCHEMA_VERSION,
      revision: state.revision,
      timeZone: TIME_ZONE,
      updatedAt: state.updatedAt,
      templates: templates,
      sessions: clone(state.sessions)
    }, found ? "template-update" : "template-create", false);
  }

  function removeTemplate(id) {
    var safeId = requireString(id, "id", 64, /^[a-z0-9][a-z0-9-]*$/);
    var templates = state.templates.filter(function (item) {
      return item.id !== safeId;
    });
    if (templates.length === state.templates.length) return clone(state);

    return commit({
      schemaVersion: SCHEMA_VERSION,
      revision: state.revision,
      timeZone: TIME_ZONE,
      updatedAt: state.updatedAt,
      templates: templates,
      sessions: clone(state.sessions)
    }, "template-delete", false);
  }

  function importJSON(input) {
    var candidate = input;
    if (typeof input === "string") {
      if (!input.trim() || input.length > MAX_IMPORT_BYTES) throw new Error("Import file is empty or too large");
      candidate = JSON.parse(input);
    }
    return commit(candidate, "import", true);
  }

  function reset() {
    var candidate = defaultState();
    candidate.revision = state.revision;
    return commit(candidate, "reset", true);
  }

  function restoreBackup() {
    var backup = readStored(BACKUP_KEY);
    if (!backup) throw new Error("No valid backup is available");
    return commit(backup, "restore", false);
  }

  function exportJSON() {
    return JSON.stringify(state, null, 2) + "\n";
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new Error("Listener must be a function");
    listeners.push(listener);
    return function () {
      listeners = listeners.filter(function (candidate) {
        return candidate !== listener;
      });
    };
  }

  function readUi() {
    var fallback = { mode: "schedule", filterVenue: "sillamae", language: "ru" };
    try {
      var parsed = JSON.parse(window.localStorage.getItem(UI_KEY) || "null");
      if (!isObject(parsed)) return fallback;
      return {
        mode: parsed.mode === "editor" ? "editor" : "schedule",
        filterVenue: parsed.filterVenue === "narva" ? "narva" : "sillamae",
        language: LANGUAGES.indexOf(parsed.language) !== -1 ? parsed.language : "ru"
      };
    } catch (error) {
      return fallback;
    }
  }

  function writeUi(patch) {
    var next = readUi();
    if (isObject(patch)) {
      if (patch.mode === "schedule" || patch.mode === "editor") next.mode = patch.mode;
      if (patch.filterVenue === "sillamae" || patch.filterVenue === "narva") {
        next.filterVenue = patch.filterVenue;
      }
      if (LANGUAGES.indexOf(patch.language) !== -1) next.language = patch.language;
    }
    try {
      window.localStorage.setItem(UI_KEY, JSON.stringify(next));
    } catch (error) {
      storageAvailable = false;
    }
    return next;
  }

  // Deliberately do not import localStorage events. Each live tab keeps its own
  // base revision and lets the server CAS detect concurrent edits safely.
  window.addEventListener("online", function () {
    if (pendingSync && conflictSnapshot && !conflictSnapshot.state) {
      loadConflictSnapshot().catch(function () {
        // Keep the persisted conflict until the server can provide its current version.
      });
    } else if (pendingSync && !conflictSnapshot) {
      queueAutomaticSync();
    }
  });

  function whenReady(callback) {
    var ready = readyPromise || Promise.resolve(clone(state));
    return ready.then(function () {
      var snapshot = clone(state);
      return typeof callback === "function" ? callback(snapshot) : snapshot;
    });
  }

  readyPromise = loadRemoteState();

  var api = {
    schemaVersion: SCHEMA_VERSION,
    timeZone: TIME_ZONE,
    storageKey: STORAGE_KEY,
    backupKey: BACKUP_KEY,
    uiKey: UI_KEY,
    syncKey: SYNC_KEY,
    migrationKey: MIGRATION_KEY,
    remoteUrl: REMOTE_URL,
    ready: readyPromise,
    whenReady: whenReady,
    getState: function () { return clone(state); },
    getSessions: function () { return clone(state.sessions); },
    getTemplates: function () { return clone(state.templates); },
    getDefaults: defaultState,
    defaults: defaultState,
    validateState: validateState,
    validateSession: validateSession,
    validateTemplate: validateTemplate,
    replace: function (candidate) { return commit(candidate, "replace", false); },
    save: function (candidate) {
      return isObject(candidate) && Array.isArray(candidate.sessions) ? commit(candidate, "replace", false) : upsert(candidate);
    },
    upsert: upsert,
    remove: remove,
    upsertTemplate: upsertTemplate,
    removeTemplate: removeTemplate,
    importJSON: importJSON,
    exportJSON: exportJSON,
    reset: reset,
    restoreBackup: restoreBackup,
    subscribe: subscribe,
    getSyncState: getSyncState,
    subscribeSync: subscribeSync,
    flush: flushSync,
    retrySync: retrySync,
    refresh: refreshRemote,
    resolveConflict: resolveConflict,
    getUi: readUi,
    setUi: writeUi,
    isPersistent: function () { return storageAvailable; },
    isSynced: function () { return syncStatus === "synced" && !pendingSync; }
  };

  api.get = api.getState;
  api.load = api.getState;
  window.DzhikaevaSchedule = Object.freeze(api);
}());
