/**
 * @fileoverview Base62 encode/decode for turning a `links.id` (a
 * BIGSERIAL, i.e. a plain incrementing integer) into a short, URL-safe
 * code and back. This is what makes short codes collision-free *by
 * construction*: the id is already unique because Postgres guarantees it,
 * so encoding it can never produce a duplicate — no "generate, check if
 * taken, retry" loop required. See docs/system-design.md.
 * @author Mohit Sharma
 */

import { randomInt } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = BigInt(ALPHABET.length);
const CHAR_TO_VALUE = new Map([...ALPHABET].map((char, index) => [char, index]));

/**
 * Encodes a non-negative integer id as a Base62 string.
 *
 * @param {number | bigint} id - The database id to encode. Must be a
 *   non-negative integer (`links.id` from Postgres, which arrives as a
 *   string from `pg` for bigint columns — pass it through `BigInt(...)`
 *   first if so).
 * @returns {string} The Base62-encoded short code, e.g. `14776336` → `"aX9q2"`.
 * @throws {RangeError} If `id` is negative or not an integer.
 */
export function encodeBase62(id) {
  let value = BigInt(id);
  if (value < 0n) {
    throw new RangeError(`encodeBase62: id must be non-negative, got ${id}`);
  }

  if (value === 0n) return ALPHABET[0];

  let out = "";
  while (value > 0n) {
    const remainder = value % BASE;
    out = ALPHABET[Number(remainder)] + out;
    value /= BASE;
  }
  return out;
}

/**
 * Decodes a Base62 short code back into its original numeric id.
 *
 * Used to validate a path segment looks like one of *our* generated codes
 * before hitting the database, and by admin/debug tooling that needs to go
 * from a short code back to a row id.
 *
 * @param {string} code - The short code to decode, e.g. `"aX9q2"`.
 * @returns {bigint} The decoded id.
 * @throws {TypeError} If `code` contains characters outside the Base62 alphabet.
 */
export function decodeBase62(code) {
  let value = 0n;
  for (const char of code) {
    const digit = CHAR_TO_VALUE.get(char);
    if (digit === undefined) {
      throw new TypeError(`decodeBase62: "${code}" contains a non-Base62 character: "${char}"`);
    }
    value = value * BASE + BigInt(digit);
  }
  return value;
}

/**
 * Checks whether a string is well-formed Base62 (every character in the
 * alphabet) without throwing. Useful as a cheap pre-filter — e.g. reject a
 * redirect lookup for `/foo.bar` before it ever reaches Postgres, since it
 * can't possibly be a code we generated.
 *
 * @param {string} code
 * @returns {boolean}
 */
export function isValidBase62(code) {
  return typeof code === "string" && code.length > 0 && [...code].every((c) => CHAR_TO_VALUE.has(c));
}

/**
 * Generates a cryptographically random Base62 string, independent of any
 * database id. Used for `?mode=random` link creation, where the point is an
 * *unguessable* code (unlike the default mode, where the code is a
 * deterministic, sequential id encoding). `crypto.randomInt` is used
 * per-character instead of `randomBytes` + modulo so there is no modulo
 * bias to reason about.
 *
 * @param {number} [length=8] - Number of characters to generate.
 * @returns {string} A random Base62 string, e.g. `"k3F0pQz9"`.
 */
export function generateRandomBase62(length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}
