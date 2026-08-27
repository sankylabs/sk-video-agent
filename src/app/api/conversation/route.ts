import { NextResponse } from "next/server";
import { z } from "zod";
import { hydrateLeadMemory } from "@/lib/memory";
import { getLead } from "@/lib/leads";
import { hasLivingVideo } from "@/lib/runtime-secrets";
import {
  createLivingConversation,
  endLivingConversation,
} from "@/lib/tavus";

const bodySchema = z.object({
  leadId: z.string().optional(),
});

export async function POST(req: Request) {
  if (!hasLivingVideo()) {
    return NextResponse.json(
      {
        error: "Video chat isn’t available right now",
        needsSetup: true,
        hint: "Maya’s video chat isn’t available at the moment. You can message her instead, or book a free session online.",
      },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const leadId = parsed.success ? parsed.data.leadId : undefined;
  let lead = leadId ? await getLead(leadId) : null;
  if (lead) {
    lead = await hydrateLeadMemory(lead);
  }

  try {
    const conversation = await createLivingConversation(lead);
    return NextResponse.json({
      conversationId: conversation.conversationId,
      conversationUrl: conversation.conversationUrl,
      provider: "tavus",
      livingVideo: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to start living video conversation";
    console.error("[tavus conversation]", message);
    const lower = message.toLowerCase();
    const outOfMinutes =
      lower.includes("minute") ||
      lower.includes("credit") ||
      lower.includes("quota") ||
      lower.includes("concurrency") ||
      lower.includes("limit") ||
      lower.includes("payment") ||
      lower.includes("402") ||
      lower.includes("insufficient");
    return NextResponse.json(
      {
        error: message,
        outOfMinutes,
        suggestRehearsal: true,
        needsSetup: false,
        hint: outOfMinutes
          ? "Maya’s video chat is busy right now. You can message her instead, or book a free session and we’ll see you soon."
          : "We couldn’t start the video chat. Please try again, message Maya, or book a free session.",
      },
      { status: 502 },
    );
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });
  }
  await endLivingConversation(conversationId);
  return NextResponse.json({ ok: true });
}
