import { NextResponse } from "next/server";
import { sendMomsReminderTest } from "@/lib/moms-reminder-test";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sendMomsReminderTest();
    const status = result.ok ? 200 : 502;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
