import { NextResponse } from "next/server";
import { z } from "zod";
import { getLead } from "@/lib/leads";
import { hydrateLeadMemory } from "@/lib/memory";
import { inferQualifyContext } from "@/lib/qualify";
import { commitNurtureLead, detectNurture } from "@/lib/nurture";
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
  const nurtureHit = detectNurture({
    userText,
    replicaText,
    qualify,
  });
  const unqualHit = nurtureHit
    ? null
    : detectUnqualified({
        userText,
        replicaText,
        qualify,
      });
  if (!nurtureHit && !unqualHit) {
    return NextResponse.json({ ok: false, skipped: true });
  }

  const result = nurtureHit
    ? await commitNurtureLead(lead, nurtureHit, { channel: "video" })
    : await commitUnqualifiedLead(lead, unqualHit!, {
        channel: "video",
        userText,
        recentMessages: [
          ...(userText ? [{ role: "user" as const, content: userText }] : []),
          ...(replicaText
            ? [{ role: "assistant" as const, content: replicaText }]
            : []),
        ],
      });
  const reason = nurtureHit?.reason || unqualHit?.reason;
  console.info("[video-qualify]", {
    kind: nurtureHit ? "nurture" : "unqualified",
    reason,
    duplicate: "duplicate" in result ? result.duplicate : false,
    userText: userText.slice(0, 180),
  });
  return NextResponse.json({
    ok: result.ok,
    skipped: "skipped" in result ? result.skipped : false,
    duplicate: "duplicate" in result ? result.duplicate : false,
    kind: nurtureHit ? "nurture" : "unqualified",
    reason,
    error: "error" in result ? result.error : undefined,
  });
}
