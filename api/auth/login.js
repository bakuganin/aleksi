import { ipAddress } from "@vercel/functions";

import {
  createSessionCookie,
  createSessionToken,
  isSecureRequest,
  noStoreHeaders,
  readAuthEnvironment,
} from "../../server/auth-session.js";
import {
  constantTimeEqualStrings,
  isPasswordHashValid,
  verifyPassword,
} from "../../server/password.js";

const MAX_BODY_BYTES = 2048;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_TRACKED_CLIENTS = 1000;

const attempts = new Map();

function json(body, status, headers = {}) {
  return Response.json(body, {
    status,
    headers: noStoreHeaders(headers),
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

async function readLimitedJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return null;

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_BODY_BYTES) {
      return null;
    }
  }
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function validCredentialsShape(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("username") || !keys.includes("password")) {
    return false;
  }
  return (
    typeof body.username === "string" &&
    body.username.length >= 1 &&
    body.username.length <= 100 &&
    typeof body.password === "string" &&
    body.password.length >= 8 &&
    body.password.length <= 256
  );
}

function clientKey(request) {
  const address = ipAddress(request);
  if (typeof address === "string" && address.length <= 128) return address;

  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded && forwarded.length <= 128 ? forwarded : "unknown";
}

function pruneAttempts(now) {
  for (const [key, state] of attempts) {
    if (state.lockedUntil <= now && state.failures.every((time) => now - time > FAILURE_WINDOW_MS)) {
      attempts.delete(key);
    }
  }
  while (attempts.size >= MAX_TRACKED_CLIENTS) {
    attempts.delete(attempts.keys().next().value);
  }
}

function limitState(key, now) {
  pruneAttempts(now);
  const state = attempts.get(key);
  if (!state) return { limited: false, retryAfterSeconds: 0 };
  if (state.lockedUntil > now) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)),
    };
  }
  state.failures = state.failures.filter((time) => now - time <= FAILURE_WINDOW_MS);
  return { limited: false, retryAfterSeconds: 0 };
}

function recordFailure(key, now) {
  const state = attempts.get(key) || { failures: [], lockedUntil: 0 };
  state.failures = state.failures.filter((time) => now - time <= FAILURE_WINDOW_MS);
  state.failures.push(now);
  if (state.failures.length >= MAX_FAILURES) state.lockedUntil = now + LOCK_DURATION_MS;
  attempts.set(key, state);
}

export async function POST(request) {
  if (!requestIsSameOrigin(request)) {
    return json({ ok: false, error: "Authentication failed" }, 403);
  }

  const environment = readAuthEnvironment();
  if (!environment || !isPasswordHashValid(environment.passwordHash)) {
    return json({ ok: false, error: "Authentication unavailable" }, 503);
  }

  const key = clientKey(request);
  const now = Date.now();
  const currentLimit = limitState(key, now);
  if (currentLimit.limited) {
    return json(
      { ok: false, error: "Authentication failed" },
      429,
      { "Retry-After": String(currentLimit.retryAfterSeconds) },
    );
  }

  const body = await readLimitedJson(request);
  if (!validCredentialsShape(body)) {
    recordFailure(key, now);
    return json({ ok: false, error: "Authentication failed" }, 400);
  }

  const usernameMatches = constantTimeEqualStrings(body.username, environment.username);
  const passwordMatches = await verifyPassword(body.password, environment.passwordHash);
  if (!usernameMatches || !passwordMatches) {
    recordFailure(key, now);
    return json({ ok: false, error: "Authentication failed" }, 401);
  }

  attempts.delete(key);
  const token = await createSessionToken(environment.sessionSecret, now);
  return json(
    { ok: true },
    200,
    { "Set-Cookie": createSessionCookie(token, isSecureRequest(request)) },
  );
}
