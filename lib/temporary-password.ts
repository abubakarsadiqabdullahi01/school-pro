import { randomInt } from "node:crypto"

const LOWER = "abcdefghijkmnopqrstuvwxyz"
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const DIGITS = "23456789"
const SYMBOLS = "!@#$%*-_"
const ALL = LOWER + UPPER + DIGITS + SYMBOLS

function pick(source: string): string {
  return source[randomInt(0, source.length)]!
}

/** Generates a human-shareable, non-predictable temporary password. */
export function generateTemporaryPassword(length = 14): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < Math.max(12, length)) chars.push(pick(ALL))
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = randomInt(0, index + 1)
    ;[chars[index], chars[swap]] = [chars[swap]!, chars[index]!]
  }
  return chars.join("")
}
