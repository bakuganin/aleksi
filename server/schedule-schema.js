const TEXT_ENCODER = new TextEncoder();

export const SCHEDULE_SCHEMA_VERSION = 4;
export const MAX_SCHEDULE_STATE_BYTES = 100_000;

const TIME_ZONE = "Europe/Tallinn";
const MAX_REVISION = 1_000_000_000;
const MAX_SESSIONS = 80;
const MAX_TEMPLATES = 120;
const LANGUAGES = ["ru", "et", "en"];
const VENUES = new Set(["sillamae", "narva"]);
const STATUSES = new Set(["active", "cancelled"]);
const RECURRENCES = new Set(["weekly", "once"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const UNSAFE_TEXT_PATTERN = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export class ScheduleValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScheduleValidationError";
  }
}

function invalid(message) {
  throw new ScheduleValidationError(message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function requireExactObject(value, expected, label) {
  if (!isPlainObject(value) || !hasExactKeys(value, expected)) {
    invalid(`${label} contains unsupported or missing fields`);
  }
}

function requireString(value, label, maximumLength, pattern) {
  if (typeof value !== "string") invalid(`${label} must be text`);
  const result = value.trim();
  if (!result || result.length > maximumLength || (pattern && !pattern.test(result))) {
    invalid(`${label} is invalid`);
  }
  return result;
}

function requireSafeText(value, label, maximumLength) {
  const result = requireString(value, label, maximumLength);
  if (UNSAFE_TEXT_PATTERN.test(result)) invalid(`${label} contains unsupported characters`);
  return result;
}

function validateLocalized(value, label, maximumLength) {
  requireExactObject(value, LANGUAGES, label);
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      requireSafeText(value[language], `${label}.${language}`, maximumLength),
    ]),
  );
}

function minutes(value) {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) return -1;
  const [hours, minute] = value.split(":").map(Number);
  return hours * 60 + minute;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return false;

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function optionalDate(value, label) {
  if (typeof value !== "string") invalid(`${label} must be text`);
  const result = value.trim();
  if (result && !validDate(result)) invalid(`${label} is invalid`);
  return result;
}

function dateToWeekday(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  const weekday = date.getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function validateWeekdays(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) {
    invalid("weekdays must contain between 1 and 7 days");
  }

  const seen = new Set();
  const result = value.map((weekday) => {
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      invalid("weekdays must contain integers from 1 to 7");
    }
    if (seen.has(weekday)) invalid("weekdays must not contain duplicates");
    seen.add(weekday);
    return weekday;
  });
  return result.sort((left, right) => left - right);
}

function validateTemplate(candidate) {
  requireExactObject(
    candidate,
    ["id", "venue", "title", "audience", "durationMinutes"],
    "Template",
  );

  const result = {
    id: requireString(candidate.id, "template.id", 64, ID_PATTERN),
    venue: requireString(candidate.venue, "template.venue", 12),
    title: validateLocalized(candidate.title, "template.title", 80),
    audience: validateLocalized(candidate.audience, "template.audience", 120),
    durationMinutes: candidate.durationMinutes,
  };

  if (!VENUES.has(result.venue)) invalid("template.venue is invalid");
  if (
    !Number.isInteger(result.durationMinutes) ||
    result.durationMinutes < 15 ||
    result.durationMinutes > 720
  ) {
    invalid("template.durationMinutes must be an integer from 15 to 720");
  }
  return result;
}

function validateSession(candidate) {
  requireExactObject(
    candidate,
    [
      "id",
      "weekday",
      "recurrence",
      "weekdays",
      "date",
      "startsOn",
      "endsOn",
      "start",
      "end",
      "venue",
      "title",
      "audience",
      "status",
    ],
    "Session",
  );

  const recurrence = requireString(candidate.recurrence, "session.recurrence", 8);
  if (!RECURRENCES.has(recurrence)) invalid("session.recurrence is invalid");

  const weekdays = validateWeekdays(candidate.weekdays);
  const date = optionalDate(candidate.date, "session.date");
  const startsOn = optionalDate(candidate.startsOn, "session.startsOn");
  const endsOn = optionalDate(candidate.endsOn, "session.endsOn");

  let expectedWeekday;
  if (recurrence === "weekly") {
    if (date) invalid("session.date must be empty for weekly sessions");
    if (endsOn && startsOn && endsOn < startsOn) {
      invalid("session.endsOn must not be earlier than session.startsOn");
    }
    expectedWeekday = weekdays[0];
  } else {
    if (!date) invalid("session.date is required for one-time sessions");
    if (startsOn || endsOn) {
      invalid("session.startsOn and session.endsOn must be empty for one-time sessions");
    }
    expectedWeekday = dateToWeekday(date);
    if (weekdays.length !== 1 || weekdays[0] !== expectedWeekday) {
      invalid("session.weekdays must match the one-time session date");
    }
  }

  if (!Number.isInteger(candidate.weekday) || candidate.weekday !== expectedWeekday) {
    invalid("session.weekday is invalid");
  }

  const result = {
    id: requireString(candidate.id, "session.id", 64, ID_PATTERN),
    weekday: expectedWeekday,
    recurrence,
    weekdays,
    date,
    startsOn,
    endsOn,
    start: requireString(candidate.start, "session.start", 5, TIME_PATTERN),
    end: requireString(candidate.end, "session.end", 5, TIME_PATTERN),
    venue: requireString(candidate.venue, "session.venue", 12),
    title: validateLocalized(candidate.title, "session.title", 80),
    audience: validateLocalized(candidate.audience, "session.audience", 120),
    status: requireString(candidate.status, "session.status", 12),
  };

  if (!VENUES.has(result.venue)) invalid("session.venue is invalid");
  if (!STATUSES.has(result.status)) invalid("session.status is invalid");
  if (minutes(result.end) <= minutes(result.start)) {
    invalid("session.end must be later than session.start");
  }
  return result;
}

export function validateScheduleState(candidate) {
  requireExactObject(
    candidate,
    ["schemaVersion", "revision", "timeZone", "updatedAt", "templates", "sessions"],
    "Schedule",
  );

  if (candidate.schemaVersion !== SCHEDULE_SCHEMA_VERSION) {
    invalid("Unsupported schedule schema");
  }
  if (
    !Number.isInteger(candidate.revision) ||
    candidate.revision < 1 ||
    candidate.revision > MAX_REVISION
  ) {
    invalid("revision is invalid");
  }
  if (candidate.timeZone !== TIME_ZONE) invalid("timeZone must be Europe/Tallinn");
  if (
    typeof candidate.updatedAt !== "string" ||
    candidate.updatedAt.length > 40 ||
    !Number.isFinite(Date.parse(candidate.updatedAt))
  ) {
    invalid("updatedAt is invalid");
  }
  if (!Array.isArray(candidate.templates) || candidate.templates.length > MAX_TEMPLATES) {
    invalid(`templates must be an array with at most ${MAX_TEMPLATES} entries`);
  }
  if (!Array.isArray(candidate.sessions) || candidate.sessions.length > MAX_SESSIONS) {
    invalid(`sessions must be an array with at most ${MAX_SESSIONS} entries`);
  }

  const templateIds = new Set();
  const templates = candidate.templates.map((item) => {
    const validated = validateTemplate(item);
    if (templateIds.has(validated.id)) invalid("Template ids must be unique");
    templateIds.add(validated.id);
    return validated;
  });

  const sessionIds = new Set();
  const sessions = candidate.sessions.map((item) => {
    const validated = validateSession(item);
    if (sessionIds.has(validated.id)) invalid("Session ids must be unique");
    sessionIds.add(validated.id);
    return validated;
  });

  const result = {
    schemaVersion: SCHEDULE_SCHEMA_VERSION,
    revision: candidate.revision,
    timeZone: TIME_ZONE,
    updatedAt: new Date(candidate.updatedAt).toISOString(),
    templates,
    sessions,
  };

  if (TEXT_ENCODER.encode(JSON.stringify(result)).byteLength > MAX_SCHEDULE_STATE_BYTES) {
    invalid("Schedule is too large");
  }
  return result;
}
