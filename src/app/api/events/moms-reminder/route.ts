import { NextResponse } from "next/server";
import { sendMomsWorkshopReminders } from "@/lib/moms-reminder-send";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sendMomsWorkshopReminders();
    const status = "ok" in result && result.ok === false ? 502 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
