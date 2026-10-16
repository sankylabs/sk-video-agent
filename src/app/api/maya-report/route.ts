import { NextResponse } from "next/server";
import {
  isMayaReportAuthed,
  mayaReportAuthRequired,
  mayaReportSecret,
} from "@/lib/maya-report-auth";
import { buildMayaReport, getMayaLeadReport } from "@/lib/maya-track";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isMayaReportAuthed())) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        setup: mayaReportAuthRequired() && !mayaReportSecret(),
      },
      { status: 401 },
    );
  }
  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId")?.trim();
  if (contactId) {
    const detail = await getMayaLeadReport(contactId);
    return NextResponse.json(detail);
  }
  const days = Number(url.searchParams.get("days") || 30);
  const report = await buildMayaReport(
    Number.isFinite(days) ? Math.min(Math.max(days, 1), 180) : 30,
  );
  return NextResponse.json(report);
}
