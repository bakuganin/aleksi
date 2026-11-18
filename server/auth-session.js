const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export const SESSION_COOKIE_NAME = "aleksi_schedule_admin";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const SESSION_AUDIENCE = "aleksi-schedule-editor";
const SESSION_SUBJECT = "schedule-admin";
const SESSION_VERSION = 1;
const SIGNATURE_BYTES = 32;
const MAX_TOKEN_LENGTH = 2048;
const MIN_SECRET_BYTES = 32;
const MAX_CLOCK_SKEW_SECONDS = 60;

function runtimeEnvironment() {
  return typeof process === "undefined" ? {} : process.env;
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  try {
    const paddingLength = (4 - (value.length % 4)) % 4;
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(paddingLength);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function isSafeUsername(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 100 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isScryptHashShape(value) {
  if (typeof value !== "string" || value.length > 1024) return false;
  const fields = value.split("$");
  if (fields.length !== 6 || fields[0] !== "scrypt") return false;

  const [cost, blockSize, parallelization] = fields.slice(1, 4).map(Number);
  const salt = decodeBase64Url(fields[4]);
  const derivedKey = decodeBase64Url(fields[5]);
  return (
    Number.isInteger(cost) &&
    Number.isInteger(blockSize) &&
    Number.isInteger(parallelization) &&
    cost >= 16384 &&
    cost <= 262144 &&
    (cost & (cost - 1)) === 0 &&
    blockSize >= 8 &&
    blockSize <= 16 &&
    parallelization >= 1 &&
    parallelization <= 4 &&
    salt !== null &&
    salt.byteLength >= 16 &&
    salt.byteLength <= 64 &&
    derivedKey !== null &&
    derivedKey.byteLength >= 32 &&
    derivedKey.byteLength <= 128 &&
    128 * cost * blockSize <= 255 * 1024 * 1024
  );
}

function validSecret(value) {
  return (
    typeof value === "string" &&
    value.length <= 4096 &&
    textEncoder.encode(value).byteLength >= MIN_SECRET_BYTES
  );
}

export function readAuthEnvironment(environment = runtimeEnvironment()) {
  const username = environment.SCHEDULE_ADMIN_USERNAME;
  const passwordHash = environment.SCHEDULE_ADMIN_PASSWORD_HASH;
  const sessionSecret = environment.SCHEDULE_SESSION_SECRET;

  if (
    !isSafeUsername(username) ||
    !isScryptHashShape(passwordHash) ||
    !validSecret(sessionSecret)
  ) {
    return null;
  }

  return { username, passwordHash, sessionSecret };
}

async function importSigningKey(secret, usage) {
  return globalThis.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function createSessionToken(secret, nowMilliseconds = Date.now()) {
  if (!validSecret(secret)) throw new Error("Invalid session configuration");

  const issuedAt = Math.floor(nowMilliseconds / 1000);
  const payload = {
    v: SESSION_VERSION,
    sub: SESSION_SUBJECT,
    aud: SESSION_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };
  const payloadPart = encodeBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importSigningKey(secret, "sign");
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(payloadPart),
  );
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token, secret, nowMilliseconds = Date.now()) {
  if (
    !validSecret(secret) ||
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH
  ) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const payloadBytes = decodeBase64Url(parts[0]);
  const signatureBytes = decodeBase64Url(parts[1]);
  if (!payloadBytes || !signatureBytes || signatureBytes.byteLength !== SIGNATURE_BYTES) {
    return false;
  }

  try {
    const key = await importSigningKey(secret, "verify");
    const signatureIsValid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      textEncoder.encode(parts[0]),
    );
    if (!signatureIsValid) return false;

    const payload = JSON.parse(textDecoder.decode(payloadBytes));
    const now = Math.floor(nowMilliseconds / 1000);
    return (
      payload !== null &&
      typeof payload === "object" &&
      payload.v === SESSION_VERSION &&
      payload.sub === SESSION_SUBJECT &&
      payload.aud === SESSION_AUDIENCE &&
      Number.isInteger(payload.iat) &&
      Number.isInteger(payload.exp) &&
      payload.iat <= now + MAX_CLOCK_SKEW_SECONDS &&
      payload.exp > now &&
      payload.exp - payload.iat === SESSION_TTL_SECONDS
    );
  } catch {
    return false;
  }
}

export function readCookie(cookieHeader, name = SESSION_COOKIE_NAME) {
  if (typeof cookieHeader !== "string" || cookieHeader.length > 16384) return null;

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const candidateName = part.slice(0, separatorIndex).trim();
    if (candidateName !== name) continue;
    const value = part.slice(separatorIndex + 1).trim();
    return value.length <= MAX_TOKEN_LENGTH ? value : null;
  }

  return null;
}

export function isSecureRequest(request) {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function createSessionCookie(token, secure) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearSessionCookie(secure) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function noStoreHeaders(extraHeaders = {}) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  };
}
