import { NextResponse } from "next/server";
import { z } from "zod";
import { appendMayaTurn, endMayaSession } from "@/lib/maya-track";

const bodySchema = z.object({
  sessionId: z.string().trim().min(4).max(40),
  type: z.enum(["turn", "end"]),
  role: z.enum(["user", "assistant"]).optional(),
  content: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { sessionId, type, role, content } = parsed.data;
  try {
    if (type === "end") {
      await endMayaSession(sessionId);
      return NextResponse.json({ ok: true });
    }
    if (!role || !content?.trim()) {
      return NextResponse.json({ error: "Missing turn" }, { status: 400 });
    }
    await appendMayaTurn({ sessionId, role, content });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[maya-track]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
