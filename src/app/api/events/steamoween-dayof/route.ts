import { NextResponse } from "next/server";
import { sendSteamOWeenDayOfReminders } from "@/lib/steamoween-dayof";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sendSteamOWeenDayOfReminders();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
