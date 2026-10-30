import { NextResponse } from "next/server";
import { sendSteamOWeenReminders } from "@/lib/event-reminder-send";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sendSteamOWeenReminders();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
