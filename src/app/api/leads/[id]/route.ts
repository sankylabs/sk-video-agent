import { NextResponse } from "next/server";
import { getLead } from "@/lib/leads";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const lead = await getLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json({
    lead: { ...lead, conversation: undefined },
  });
}
