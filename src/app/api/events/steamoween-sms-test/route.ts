import { NextResponse } from "next/server";
import { sendSteamoweenSmsTest } from "@/lib/steamoween-sms-test";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sendSteamoweenSmsTest();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
