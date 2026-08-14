import { NextResponse } from "next/server";
import { z } from "zod";
import { mayaGreeting } from "@/lib/greeting";

const bodySchema = z.object({
  name: z.string().optional(),
  childName: z.string().optional(),
  childAge: z.string().optional(),
});

/** Returns Maya's scripted opening line (used by UI + eval harness). */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  return NextResponse.json({
    content: mayaGreeting(parsed.data),
    source: "mayaGreeting",
  });
}
