import {
  noStoreHeaders,
  readAuthEnvironment,
  readCookie,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "../../server/auth-session.js";
import {
  compareAndSetScheduleState,
  readScheduleState,
  ScheduleRepositoryError,
} from "../../server/schedule-repository.js";
import {
  MAX_SCHEDULE_STATE_BYTES,
  ScheduleValidationError,
  validateScheduleState,
} from "../../server/schedule-schema.js";

const MAX_REQUEST_BODY_BYTES = MAX_SCHEDULE_STATE_BYTES + 4_096;
const MAX_EXPECTED_REVISION = 999_999_999;

function json(body, status) {
  return Response.json(body, {
    status,
    headers: noStoreHeaders({ Vary: "Cookie" }),
  });
}

function requestIsSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function requestIsAuthenticated(request) {
  const environment = readAuthEnvironment();
  if (!environment) return null;
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  return Boolean(token && (await verifySessionToken(token, environment.sessionSecret)));
}

async function readLimitedJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return { error: "unsupported_media_type" };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isInteger(parsedLength) || parsedLength < 0) return { error: "invalid_body" };
    if (parsedLength > MAX_REQUEST_BODY_BYTES) return { error: "payload_too_large" };
  }
  if (!request.body) return { error: "invalid_body" };

  const reader = request.body.getReader();
  const chunks = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { error: "payload_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { error: "invalid_body" };
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    };
  } catch {
    return { error: "invalid_body" };
  }
}

function parseUpdateBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ScheduleValidationError("Request body must be an object");
  }
  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !Object.prototype.hasOwnProperty.call(body, "state") ||
    !Object.prototype.hasOwnProperty.call(body, "expectedRevision")
  ) {
    throw new ScheduleValidationError("Request body contains unsupported or missing fields");
  }
  if (
    !Number.isInteger(body.expectedRevision) ||
    body.expectedRevision < 0 ||
    body.expectedRevision > MAX_EXPECTED_REVISION
  ) {
    throw new ScheduleValidationError("expectedRevision is invalid");
  }

  const state = validateScheduleState(body.state);
  // The database revision is authoritative. Local caches can legitimately have
  // a different counter after several offline edits, so canonicalize it here.
  state.revision = body.expectedRevision + 1;
  return { state, expectedRevision: body.expectedRevision };
}

function repositoryFailure(error) {
  const status =
    error instanceof ScheduleRepositoryError && error.code === "storage_not_configured"
      ? 503
      : 502;
  return json({ error: "schedule_unavailable" }, status);
}

export async function GET() {
  try {
    const current = await readScheduleState();
    return json(current, 200);
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function PUT(request) {
  if (!requestIsSameOrigin(request)) return json({ error: "request_rejected" }, 403);

  const authenticated = await requestIsAuthenticated(request);
  if (authenticated === null) return json({ error: "authentication_unavailable" }, 503);
  if (!authenticated) return json({ error: "authentication_required" }, 401);

  const parsed = await readLimitedJson(request);
  if (parsed.error === "unsupported_media_type") {
    return json({ error: parsed.error }, 415);
  }
  if (parsed.error === "payload_too_large") return json({ error: parsed.error }, 413);
  if (parsed.error) return json({ error: parsed.error }, 400);

  let update;
  try {
    update = parseUpdateBody(parsed.value);
  } catch (error) {
    if (error instanceof ScheduleValidationError) {
      return json({ error: "invalid_schedule" }, 400);
    }
    return json({ error: "invalid_schedule" }, 400);
  }

  try {
    const result = await compareAndSetScheduleState(
      update.expectedRevision,
      update.state,
    );
    if (!result.applied) {
      return json(
        { error: "revision_conflict", state: result.state, revision: result.revision },
        409,
      );
    }
    return json({ state: result.state, revision: result.revision }, 200);
  } catch (error) {
    return repositoryFailure(error);
  }
}
