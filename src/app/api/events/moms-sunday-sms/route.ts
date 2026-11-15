import { NextResponse } from "next/server";
import { readMomsSundaySmsStatus } from "@/lib/moms-sunday-sms";

export const dynamic = "force-dynamic";

/** Counts only. This does not send the reminder. */
export async function GET() {
  const status = await readMomsSundaySmsStatus();
  return NextResponse.json(status);
}
