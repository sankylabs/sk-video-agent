import { NextResponse } from "next/server";
import { sendEventSmsPreview } from "@/lib/event-sms-preview";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await sendEventSmsPreview();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
