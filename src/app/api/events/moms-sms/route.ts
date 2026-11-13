import { NextResponse } from "next/server";
import { sendMomsWorkshopTexts } from "@/lib/moms-sms-send";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sendMomsWorkshopTexts();
    const ok = "ok" in result ? result.ok : false;
    return NextResponse.json(result, { status: ok ? 200 : 502 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ ok: false, reason: reason.slice(0, 300) }, { status: 502 });
  }
}
