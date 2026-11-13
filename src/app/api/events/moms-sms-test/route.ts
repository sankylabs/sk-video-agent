import { NextResponse } from "next/server";
import { sendMomsSmsTest } from "@/lib/moms-sms-test";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await sendMomsSmsTest();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
