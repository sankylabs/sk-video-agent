import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { demoReply } from "@/lib/demo-replies";
import { buildMayaSystemPrompt } from "@/lib/maya-persona";
import { getLead } from "@/lib/leads";
import { getOpenAIApiKey } from "@/lib/runtime-secrets";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(40),
  leadId: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { messages, leadId } = parsed.data;
  const lead = leadId ? await getLead(leadId) : null;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return NextResponse.json({
      role: "assistant",
      content: demoReply(lastUser?.content ?? ""),
      mode: "demo",
    });
  }

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: buildMayaSystemPrompt(lead ?? undefined),
      },
      ...messages,
    ],
  });

  const content =
    completion.choices[0]?.message?.content?.trim() ||
    demoReply(lastUser?.content ?? "");

  return NextResponse.json({
    role: "assistant",
    content,
    mode: "openai",
  });
}
