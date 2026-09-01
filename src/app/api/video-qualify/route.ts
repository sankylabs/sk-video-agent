import { NextResponse } from "next/server";
import { z } from "zod";
import { getLead } from "@/lib/leads";
import { hydrateLeadMemory } from "@/lib/memory";
import { inferQualifyContext } from "@/lib/qualify";
import {
  commitUnqualifiedLead,
  detectUnqualified,
} from "@/lib/unqualified";

const bodySchema = z.object({
  leadId: z.string().optional(),
  userText: z.string().max(2000).optional(),
  replicaText: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userText = parsed.data.userText?.trim() || "";
  const replicaText = parsed.data.replicaText?.trim() || "";
  if (!userText && !replicaText) {
    return NextResponse.json({ ok: false, skipped: true });
  }

  let lead = parsed.data.leadId ? await getLead(parsed.data.leadId) : null;
  if (lead) {
    lead = await hydrateLeadMemory(lead);
  }

  const qualify = inferQualifyContext(
    [
      ...(lead?.conversation || []),
      ...(userText ? [{ role: "user" as const, content: userText }] : []),
      ...(replicaText
        ? [{ role: "assistant" as const, content: replicaText }]
        : []),
    ],
    lead,
  );
  const hit = detectUnqualified({
    userText,
    replicaText,
    qualify,
  });
  if (!hit) {
    return NextResponse.json({ ok: false, skipped: true });
  }

  const result = await commitUnqualifiedLead(lead, hit, {
    channel: "video",
    userText,
    recentMessages: [
      ...(userText ? [{ role: "user" as const, content: userText }] : []),
      ...(replicaText
        ? [{ role: "assistant" as const, content: replicaText }]
        : []),
    ],
  });
  console.info("[video-qualify]", {
    reason: hit.reason,
    duplicate: "duplicate" in result ? result.duplicate : false,
    userText: userText.slice(0, 180),
  });
  return NextResponse.json({
    ok: result.ok,
    skipped: "skipped" in result ? result.skipped : false,
    duplicate: "duplicate" in result ? result.duplicate : false,
    reason: hit.reason,
    error: "error" in result ? result.error : undefined,
  });
}
