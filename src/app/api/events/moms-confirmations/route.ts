import { NextResponse } from "next/server";
import { sendPendingEventConfirmations } from "@/lib/events";

export const dynamic = "force-dynamic";

/** One-time send for parents already registered. Removed after the backlog goes out. */
export async function POST() {
  const result = await sendPendingEventConfirmations();
  return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 502 : 200 });
}
