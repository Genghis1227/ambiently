export const PIN_PBKDF2_ITERATIONS = 120_000;
const PIN_SALT_BYTES = 16;
const PIN_HASH_BYTES = 32;
const LOCKOUT_STORAGE_KEY = 'ambiently_pin_lockout_v1';
const LOCKOUT_WINDOW_RESET_MS = 15 * 60 * 1000;

export interface PinLockoutStatus {
  isLockedOut: boolean;
  remainingSeconds: number;
  failedAttempts: number;
}

interface StoredPinLockout {
  failedAttempts: number;
  lastFailedAtMs: number;
  lockoutUntilMs: number;
}

let memoryLockoutState: StoredPinLockout = {
  failedAttempts: 0,
  lastFailedAtMs: 0,
  lockoutUntilMs: 0,
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const normA = a.toLowerCase();
  const normB = b.toLowerCase();
  const len = Math.max(normA.length, normB.length);
  let diff = normA.length ^ normB.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (normA.charCodeAt(i) || 0) ^ (normB.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    return globalThis.crypto.getRandomValues(out);
  }
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

// Compact FIPS 180-4 SHA-256 fallback used only when crypto.subtle is unavailable (e.g. plain HTTP LAN origin)
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Sync(message: Uint8Array): Uint8Array {
  const bitLen = message.length * 8;
  const paddedLen = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x1_0000_0000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const outView = new DataView(digest.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return digest;
}

function hmacSha256Sync(key: Uint8Array, data: Uint8Array): Uint8Array {
  const k = key.length > 64 ? sha256Sync(key) : key;
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  ipad.fill(0x36);
  opad.fill(0x5c);
  for (let i = 0; i < k.length; i += 1) {
    ipad[i] ^= k[i];
    opad[i] ^= k[i];
  }

  const innerInput = new Uint8Array(64 + data.length);
  innerInput.set(ipad);
  innerInput.set(data, 64);
  const innerHash = sha256Sync(innerInput);

  const outerInput = new Uint8Array(64 + innerHash.length);
  outerInput.set(opad);
  outerInput.set(innerHash, 64);
  return sha256Sync(outerInput);
}

function pbkdf2Sha256Sync(password: Uint8Array, salt: Uint8Array, iterations: number): Uint8Array {
  const blockInput = new Uint8Array(salt.length + 4);
  blockInput.set(salt);
  blockInput[salt.length + 3] = 1;

  let u = hmacSha256Sync(password, blockInput);
  const derived = new Uint8Array(u);
  for (let i = 1; i < iterations; i += 1) {
    u = hmacSha256Sync(password, u);
    for (let j = 0; j < PIN_HASH_BYTES; j += 1) {
      derived[j] ^= u[j];
    }
  }
  return derived;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const copy = new Uint8Array(data);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
    return new Uint8Array(digest);
  }
  return sha256Sync(data);
}

async function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  if (
    typeof globalThis.crypto?.subtle?.importKey === 'function' &&
    typeof globalThis.crypto?.subtle?.deriveBits === 'function'
  ) {
    const baseKey = await globalThis.crypto.subtle.importKey(
      'raw',
      new Uint8Array(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(salt),
        iterations,
        hash: 'SHA-256',
      },
      baseKey,
      PIN_HASH_BYTES * 8
    );
    return new Uint8Array(bits);
  }
  return pbkdf2Sha256Sync(password, salt, iterations);
}

/**
 * Hashes a kiosk Parent PIN with salted PBKDF2-SHA-256 (`pbkdf2$iterations$saltHex$hashHex`).
 */
export async function hashPinSecure(
  pin: string,
  saltOverride?: Uint8Array
): Promise<string> {
  const salt = saltOverride ? new Uint8Array(saltOverride) : randomBytes(PIN_SALT_BYTES);
  const passwordBytes = new TextEncoder().encode(pin);
  const derived = await pbkdf2Sha256(passwordBytes, salt, PIN_PBKDF2_ITERATIONS);
  return `pbkdf2$${PIN_PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

/**
 * Verifies an entered PIN against either salted PBKDF2 or legacy unsalted SHA-256 hashes,
 * signaling `needsUpgrade` when a legacy hash matches so callers can transparently re-hash.
 */
export async function verifyPinSecure(
  enteredPin: string,
  storedHash: string
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!enteredPin || !storedHash) {
    return { valid: false, needsUpgrade: false };
  }

  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(enteredPin);

  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) {
      return { valid: false, needsUpgrade: false };
    }
    const iterations = Number(parts[1]);
    const saltHex = parts[2];
    const expectedHex = parts[3];
    if (
      !Number.isInteger(iterations) ||
      iterations < 10_000 ||
      iterations > 1_000_000 ||
      !/^[0-9a-f]{32,64}$/i.test(saltHex) ||
      !/^[0-9a-f]{64}$/i.test(expectedHex)
    ) {
      return { valid: false, needsUpgrade: false };
    }
    const derived = await pbkdf2Sha256(pinBytes, hexToBytes(saltHex), iterations);
    return {
      valid: timingSafeEqualHex(bytesToHex(derived), expectedHex),
      needsUpgrade: false,
    };
  }

  if (/^[0-9a-f]{64}$/i.test(storedHash)) {
    const legacyDigest = await sha256Bytes(pinBytes);
    const valid = timingSafeEqualHex(bytesToHex(legacyDigest), storedHash);
    return { valid, needsUpgrade: valid };
  }

  return { valid: false, needsUpgrade: false };
}

function readStoredLockout(): StoredPinLockout {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCKOUT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredPinLockout>;
        if (
          typeof parsed.failedAttempts === 'number' &&
          typeof parsed.lastFailedAtMs === 'number' &&
          typeof parsed.lockoutUntilMs === 'number'
        ) {
          memoryLockoutState = {
            failedAttempts: Math.max(0, Math.trunc(parsed.failedAttempts)),
            lastFailedAtMs: parsed.lastFailedAtMs,
            lockoutUntilMs: parsed.lockoutUntilMs,
          };
          return memoryLockoutState;
        }
      }
    } catch {
      // Fall back to in-memory lockout state
    }
  }
  return memoryLockoutState;
}

function writeStoredLockout(next: StoredPinLockout): void {
  memoryLockoutState = next;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage restrictions
    }
  }
}

function computeLockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  if (failedAttempts === 5) return 30_000;
  if (failedAttempts === 6) return 60_000;
  if (failedAttempts === 7) return 120_000;
  return 300_000;
}

/** Returns whether PIN entry is currently locked out and the remaining cooldown seconds. */
export function getPinLockoutStatus(nowMs: number = Date.now()): PinLockoutStatus {
  const current = readStoredLockout();
  if (current.lockoutUntilMs > nowMs) {
    return {
      isLockedOut: true,
      remainingSeconds: Math.max(1, Math.ceil((current.lockoutUntilMs - nowMs) / 1000)),
      failedAttempts: current.failedAttempts,
    };
  }
  if (current.lastFailedAtMs > 0 && nowMs - current.lastFailedAtMs > LOCKOUT_WINDOW_RESET_MS) {
    return { isLockedOut: false, remainingSeconds: 0, failedAttempts: 0 };
  }
  return {
    isLockedOut: false,
    remainingSeconds: 0,
    failedAttempts: current.failedAttempts,
  };
}

/** Records a failed PIN attempt and applies exponential cooldown starting on attempt 5. */
export function recordFailedPinAttempt(nowMs: number = Date.now()): PinLockoutStatus {
  const current = readStoredLockout();
  const shouldReset =
    current.lastFailedAtMs > 0 &&
    nowMs - current.lastFailedAtMs > LOCKOUT_WINDOW_RESET_MS &&
    nowMs >= current.lockoutUntilMs;
  const failedAttempts = (shouldReset ? 0 : current.failedAttempts) + 1;
  const durationMs = computeLockoutDurationMs(failedAttempts);
  const lockoutUntilMs =
    durationMs > 0 ? Math.max(current.lockoutUntilMs, nowMs + durationMs) : current.lockoutUntilMs;

  writeStoredLockout({
    failedAttempts,
    lastFailedAtMs: nowMs,
    lockoutUntilMs: lockoutUntilMs > nowMs ? lockoutUntilMs : 0,
  });

  return getPinLockoutStatus(nowMs);
}

/** Clears all persisted failed PIN attempts and active lockouts. */
export function resetPinLockout(): void {
  memoryLockoutState = { failedAttempts: 0, lastFailedAtMs: 0, lockoutUntilMs: 0 };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LOCKOUT_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
}
