import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 32_768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEY_LENGTH = 64;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: PARAMS.maxmem },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const saltRaw = parts[4];
  const hashRaw = parts[5];
  if (!saltRaw || !hashRaw) return false;
  try {
    const salt = Buffer.from(saltRaw, 'base64url');
    const expected = Buffer.from(hashRaw, 'base64url');
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password.normalize('NFKC'),
        salt,
        expected.length,
        { N: n, r, p, maxmem: PARAMS.maxmem },
        (error, key) => {
          if (error) reject(error);
          else resolve(key);
        },
      );
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

/** Verify against an equivalent-cost hash when the account does not exist. */
export async function verifyPasswordAgainstDummy(password: string): Promise<false> {
  dummyHashPromise ??= hashPassword('not-a-real-account-password');
  const hash = await dummyHashPromise;
  await verifyPassword(password, hash);
  return false;
}
