import { NextResponse } from "next/server";
import { openLeadSession } from "@/lib/memory";

export async function GET(req: Request) {
  const leadId = new URL(req.url).searchParams.get("leadId") || undefined;
  const session = await openLeadSession(leadId);
  return NextResponse.json({
    messages: session.messages,
    booking: session.booking,
    returning: session.returning,
  });
}
