import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

const COOKIE = "events_director";

export function eventsDirectorSecret() {
  return process.env.EVENTS_DIRECTOR_SECRET?.trim() || "";
}

export function eventsDirectorAuthRequired() {
  if (eventsDirectorSecret()) return true;
  return process.env.NODE_ENV === "production";
}

function sameSecret(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isEventsDirectorAuthed() {
  const secret = eventsDirectorSecret();
  if (!secret) return !eventsDirectorAuthRequired();
  const value = (await cookies()).get(COOKIE)?.value || "";
  return sameSecret(value, secret);
}

export function eventsDirectorCookieHeader(secret: string) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(secret)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function checkEventsDirectorPassword(provided: string) {
  const secret = eventsDirectorSecret();
  if (!secret) return !eventsDirectorAuthRequired();
  return sameSecret(provided.trim(), secret);
}
