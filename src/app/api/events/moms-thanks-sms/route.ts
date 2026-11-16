import { NextResponse } from "next/server";
import { sendMomsThanksTexts } from "@/lib/moms-thanks-sms";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sendMomsThanksTexts();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ ok: false, reason: reason.slice(0, 300) }, { status: 502 });
  }
}
