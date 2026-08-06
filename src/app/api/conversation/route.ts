import { NextResponse } from "next/server";
import { z } from "zod";
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
        error: "Living video not configured",
        needsSetup: true,
        hint: "Paste your Tavus API key first (it does not need to start with tvsk_).",
      },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const leadId = parsed.success ? parsed.data.leadId : undefined;
  const lead = leadId ? await getLead(leadId) : null;

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
    return NextResponse.json(
      {
        error: message,
        needsSetup: message.toLowerCase().includes("api key"),
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
