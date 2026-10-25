import { NextResponse } from "next/server";
import { eventsDirectorClearCookieHeader } from "@/lib/event-auth";

export async function POST() {
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: "/events/manage" },
  });
  res.headers.set("Set-Cookie", eventsDirectorClearCookieHeader());
  return res;
}
