import { NextResponse } from "next/server";
import { sendParentEmailPreview } from "@/lib/event-parent-email-preview";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await sendParentEmailPreview();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
