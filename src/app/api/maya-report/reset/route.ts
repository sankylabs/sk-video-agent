import { NextResponse } from "next/server";
import {
  checkMayaReportPassword,
  isMayaReportAuthed,
  mayaReportAuthRequired,
  mayaReportSecret,
} from "@/lib/maya-report-auth";
import { resetMayaReport } from "@/lib/maya-track";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const headerSecret = req.headers.get("x-maya-report-secret") || "";
  const authed =
    (await isMayaReportAuthed()) || checkMayaReportPassword(headerSecret);
  if (!authed) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        setup: mayaReportAuthRequired() && !mayaReportSecret(),
      },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: "Pass confirm: true to clear the Maya report." },
      { status: 400 },
    );
  }

  const counts = await resetMayaReport();
  return NextResponse.json({ ok: true, cleared: counts });
}
