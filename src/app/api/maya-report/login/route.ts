import { NextResponse } from "next/server";
import {
  checkMayaReportPassword,
  mayaReportCookieHeader,
  mayaReportSecret,
} from "@/lib/maya-report-auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { secret?: string };
  const provided = String(body.secret || "");
  if (!checkMayaReportPassword(provided)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const secret = mayaReportSecret() || provided;
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", mayaReportCookieHeader(secret));
  return res;
}
