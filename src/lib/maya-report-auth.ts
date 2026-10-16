import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

const COOKIE = "maya_report";

export function mayaReportSecret() {
  return process.env.MAYA_REPORT_SECRET?.trim() || "";
}

export function mayaReportAuthRequired() {
  if (mayaReportSecret()) return true;
  return process.env.NODE_ENV === "production";
}

function sameSecret(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isMayaReportAuthed() {
  const secret = mayaReportSecret();
  if (!secret) return !mayaReportAuthRequired();
  const value = (await cookies()).get(COOKIE)?.value || "";
  return sameSecret(value, secret);
}

export function mayaReportCookieHeader(secret: string) {
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

export function checkMayaReportPassword(provided: string) {
  const secret = mayaReportSecret();
  if (!secret) return !mayaReportAuthRequired();
  return sameSecret(provided.trim(), secret);
}
