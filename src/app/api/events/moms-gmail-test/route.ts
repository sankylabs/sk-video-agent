import { NextResponse } from "next/server";
import { sendMomsGmailTest } from "@/lib/moms-gmail-test";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await sendMomsGmailTest();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
