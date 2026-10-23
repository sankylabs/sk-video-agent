import { NextResponse } from "next/server";
import {
  checkEventsDirectorPassword,
  eventsDirectorCookieHeader,
  eventsDirectorSecret,
} from "@/lib/event-auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { secret?: string };
  const provided = String(body.secret || "");
  if (!checkEventsDirectorPassword(provided)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const secret = eventsDirectorSecret() || provided;
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", eventsDirectorCookieHeader(secret));
  return res;
}
