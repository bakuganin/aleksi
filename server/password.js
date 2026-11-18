import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const DEFAULT_COST = 65536;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 1;
const DERIVED_KEY_LENGTH = 64;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

function scrypt(password, salt, keyLength, options) {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : null;
  } catch {
    return null;
  }
}

function parsePasswordHash(encodedHash) {
  if (typeof encodedHash !== "string" || encodedHash.length > 1024) return null;
  const fields = encodedHash.split("$");
  if (fields.length !== 6 || fields[0] !== "scrypt") return null;

  const cost = Number(fields[1]);
  const blockSize = Number(fields[2]);
  const parallelization = Number(fields[3]);
  if (
    !Number.isInteger(cost) ||
    cost < 16384 ||
    cost > 262144 ||
    (cost & (cost - 1)) !== 0 ||
    !Number.isInteger(blockSize) ||
    blockSize < 8 ||
    blockSize > 16 ||
    !Number.isInteger(parallelization) ||
    parallelization < 1 ||
    parallelization > 4
  ) {
    return null;
  }

  const salt = decodeBase64Url(fields[4]);
  const expected = decodeBase64Url(fields[5]);
  if (
    !salt ||
    salt.byteLength < 16 ||
    salt.byteLength > 64 ||
    !expected ||
    expected.byteLength < 32 ||
    expected.byteLength > 128 ||
    128 * cost * blockSize > MAX_MEMORY_BYTES - 1024 * 1024
  ) {
    return null;
  }

  return { cost, blockSize, parallelization, salt, expected };
}

export function isPasswordHashValid(encodedHash) {
  return parsePasswordHash(encodedHash) !== null;
}

export function constantTimeEqualStrings(left, right) {
  const leftDigest = createHash("sha256").update(String(left), "utf8").digest();
  const rightDigest = createHash("sha256").update(String(right), "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export async function verifyPassword(password, encodedHash) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 256 ||
    Buffer.byteLength(password, "utf8") > 1024
  ) {
    return false;
  }

  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  try {
    const derivedKey = await scrypt(password, parsed.salt, parsed.expected.byteLength, {
      N: parsed.cost,
      r: parsed.blockSize,
      p: parsed.parallelization,
      maxmem: MAX_MEMORY_BYTES,
    });
    return timingSafeEqual(derivedKey, parsed.expected);
  } catch {
    return false;
  }
}

export async function createPasswordHash(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256 ||
    Buffer.byteLength(password, "utf8") > 1024
  ) {
    throw new Error("Password must contain between 12 and 256 characters");
  }

  const salt = randomBytes(24);
  const derivedKey = await scrypt(password, salt, DERIVED_KEY_LENGTH, {
    N: DEFAULT_COST,
    r: DEFAULT_BLOCK_SIZE,
    p: DEFAULT_PARALLELIZATION,
    maxmem: MAX_MEMORY_BYTES,
  });
  return [
    "scrypt",
    DEFAULT_COST,
    DEFAULT_BLOCK_SIZE,
    DEFAULT_PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}
