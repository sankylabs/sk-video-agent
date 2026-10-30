import { NextResponse } from "next/server";
import { calendarInviteTestFile } from "@/lib/event-calendar-test";

export const dynamic = "force-dynamic";

export async function GET() {
  const invite = await calendarInviteTestFile();
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(invite.ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=REQUEST",
      "Content-Disposition": 'attachment; filename="just-for-moms.ics"',
      "Cache-Control": "no-store",
    },
  });
}
