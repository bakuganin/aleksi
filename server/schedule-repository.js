import { validateScheduleState } from "./schedule-schema.js";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ERROR_RESPONSE_BYTES = 16_384;

export class ScheduleRepositoryError extends Error {
  constructor(message, code = "storage_unavailable", cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "ScheduleRepositoryError";
    this.code = code;
  }
}

function runtimeEnvironment() {
  return typeof process === "undefined" ? {} : process.env;
}

function decodeBase64UrlJson(value) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(normalized + padding, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function isServiceKey(value) {
  if (
    typeof value !== "string" ||
    value.length < 20 ||
    value.length > 4096 ||
    value.trim() !== value ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    return false;
  }
  if (/^sb_secret_[A-Za-z0-9._-]+$/.test(value)) return true;

  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = decodeBase64UrlJson(parts[1]);
  return payload !== null && payload.role === "service_role";
}

export function readSupabaseEnvironment(environment = runtimeEnvironment()) {
  const rawUrl = environment.SUPABASE_URL;
  const secretKey = environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof rawUrl !== "string" || !isServiceKey(secretKey)) return null;

  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.hostname.endsWith(".supabase.co")
    ) {
      return null;
    }
    return { url: url.origin, secretKey };
  } catch {
    return null;
  }
}

function serviceHeaders(secretKey, extra = {}) {
  const headers = {
    Accept: "application/json",
    apikey: secretKey,
    ...extra,
  };
  if (!secretKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_ERROR_RESPONSE_BYTES && !response.ok) {
    throw new ScheduleRepositoryError("Schedule storage returned an oversized error");
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ScheduleRepositoryError("Schedule storage returned invalid JSON", "storage_unavailable", error);
  }
}

function repositoryOptions(options = {}) {
  const environment = readSupabaseEnvironment(options.environment || runtimeEnvironment());
  if (!environment) {
    throw new ScheduleRepositoryError("Schedule storage is not configured", "storage_not_configured");
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ScheduleRepositoryError("Schedule storage transport is unavailable");
  }
  return { environment, fetchImpl };
}

async function request(path, init, options) {
  const { environment, fetchImpl } = repositoryOptions(options);
  let response;
  try {
    response = await fetchImpl(`${environment.url}${path}`, {
      ...init,
      headers: serviceHeaders(environment.secretKey, init.headers),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ScheduleRepositoryError("Schedule storage request failed", "storage_unavailable", error);
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new ScheduleRepositoryError(
      `Schedule storage rejected the request (${response.status})`,
      "storage_unavailable",
    );
  }
  return body;
}

function validateStoredState(state, revision) {
  if (!Number.isInteger(revision) || revision < 1 || revision > 1_000_000_000) {
    throw new ScheduleRepositoryError("Schedule storage contains an invalid revision");
  }
  let validated;
  try {
    validated = validateScheduleState(state);
  } catch (error) {
    throw new ScheduleRepositoryError(
      "Schedule storage contains invalid data",
      "storage_unavailable",
      error,
    );
  }
  if (validated.revision !== revision) {
    throw new ScheduleRepositoryError("Schedule storage revision is inconsistent");
  }
  return validated;
}

export async function readScheduleState(options = {}) {
  const body = await request(
    "/rest/v1/schedule_state?select=state%2Crevision&id=eq.primary&limit=1",
    { method: "GET" },
    options,
  );

  if (!Array.isArray(body)) {
    throw new ScheduleRepositoryError("Schedule storage returned an invalid result");
  }
  if (body.length === 0) return { state: null, revision: 0 };
  if (body.length !== 1 || body[0] === null || typeof body[0] !== "object") {
    throw new ScheduleRepositoryError("Schedule storage returned an invalid result");
  }

  const revision = Number(body[0].revision);
  return { state: validateStoredState(body[0].state, revision), revision };
}

export async function compareAndSetScheduleState(expectedRevision, state, options = {}) {
  const body = await request(
    "/rest/v1/rpc/compare_and_set_schedule_state",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_expected_revision: expectedRevision,
        p_state: state,
      }),
    },
    options,
  );

  if (!Array.isArray(body) || body.length !== 1 || !body[0] || typeof body[0] !== "object") {
    throw new ScheduleRepositoryError("Schedule storage returned an invalid CAS result");
  }

  const row = body[0];
  const applied = row.applied === true;
  const revision = Number(row.current_revision);
  if (!Number.isInteger(revision) || revision < 0 || revision > 1_000_000_000) {
    throw new ScheduleRepositoryError("Schedule storage returned an invalid CAS revision");
  }
  if (revision === 0) {
    if (applied || row.current_state !== null) {
      throw new ScheduleRepositoryError("Schedule storage returned an inconsistent empty CAS result");
    }
    return { applied: false, state: null, revision: 0 };
  }

  return {
    applied,
    state: validateStoredState(row.current_state, revision),
    revision,
  };
}
