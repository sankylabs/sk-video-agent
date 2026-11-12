import { NextResponse } from "next/server";
import { sendMomsReminderToKalyani } from "@/lib/moms-reminder-kalyani";

export const dynamic = "force-dynamic";

/** One-time resend of the Just for Moms reminder test to the corrected address. */

export async function POST() {
  try {
    const result = await sendMomsReminderToKalyani();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ ok: false, error: message.replaceAll("kalyani.ar23@gmail.com", "recipient") }, { status: 502 });
  }
}
