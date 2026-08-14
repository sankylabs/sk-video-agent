import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { buildCampsBrief, isCampQuestion } from "@/lib/camps";
import { demoReply } from "@/lib/demo-replies";
import { parseChildAge } from "@/lib/greeting";
import { buildMayaSystemPrompt } from "@/lib/maya-persona";
import { getLead, updateLead } from "@/lib/leads";
import {
  inferQualifyContext,
  isTrialQualified,
  trialQualifyGap,
} from "@/lib/qualify";
import { getOpenAIApiKey } from "@/lib/runtime-secrets";
import {
  answerAvailabilityQuestion,
  bookSlot,
  buildAvailabilityBrief,
  isAvailabilityQuestion,
} from "@/lib/schedule";

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

function stripBookMarkers(text: string) {
  return text.replace(/\s*\[BOOK:[^\]]+\]\s*/g, " ").trim();
}

function extractBookMarkers(text: string) {
  const matches = [...text.matchAll(/\[BOOK:([^\]]+)\]/g)];
  return matches.map((m) => m[1].trim());
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { messages, leadId } = parsed.data;
  const lead = leadId ? await getLead(leadId) : null;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const priorAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.content;
  const userText = lastUser?.content ?? "";
  const { brief, slots } = await buildAvailabilityBrief(14);

  const qualify = inferQualifyContext(messages, lead);
  const ageFromLatest = parseChildAge(userText);
  const effectiveAge = qualify.age ?? ageFromLatest;
  const trialReady = isTrialQualified({
    ...qualify,
    age: effectiveAge,
  });
  const wantsCalendar =
    Boolean(userText) &&
    isAvailabilityQuestion(userText, priorAssistant);
  const calendarLookup = wantsCalendar
    ? await answerAvailabilityQuestion(userText, 14)
    : null;
  const askingCamps = isCampQuestion(userText);
  const campsBrief = askingCamps
    ? await buildCampsBrief(effectiveAge)
    : null;

  const system = `${buildMayaSystemPrompt(lead ?? undefined)}

## SESSION GOAL
Qualify first (age 5–14 + Kirkland access). Keep them comfortable and clear their questions. Suggest a free trial only when trialReady=yes, then offer mixed open times (not Saturday-only).

## KNOWN QUALIFICATION SO FAR (do not re-ask these)
- Child age: ${
    effectiveAge != null
      ? `${effectiveAge}${
          askingCamps
            ? " — stated for this camp question; do NOT re-ask or confirm; suggest fitting camps now"
            : ""
        }`
      : "UNKNOWN — ask if needed"
  }
- Location / Kirkland access: ${
    qualify.locationKnown
      ? `KNOWN${qualify.locationHint ? ` (${qualify.locationHint})` : ""}`
      : "UNKNOWN — needed before suggesting a free trial"
  }
- Free-trial ready: ${trialReady ? "YES — may soft-invite trial when they're comfortable" : `NO — ${trialQualifyGap({ ...qualify, age: effectiveAge })}. Do not suggest booking a free trial yet.`}

## LIVE FREE-SESSION AVAILABILITY (source of truth — use only when trial-ready or they ask availability)
${brief}
${
  campsBrief
    ? `
## LIVE KIRKLAND CAMPS (source of truth for camp questions)
${campsBrief}
${
  effectiveAge != null
    ? `IMPORTANT: Child is ${effectiveAge}. Suggest Ages 5+/8+/10+ options they qualify for. Do not ask age again.`
    : "Age unknown — ask once, then suggest."
}
`
    : ""
}
${
  calendarLookup
    ? `
## CALENDAR LOOKUP FOR THEIR LATEST MESSAGE (prefer this)
Suggested answer from the booking calendar: ${calendarLookup.reply}
Matching slot ids: ${
        calendarLookup.matches.map((s) => `${s.label} → [BOOK:${s.start}]`).join("; ") ||
        "none"
      }
If they confirmed a time that matches, include the [BOOK:…] marker.
`
    : ""
}
`;

  const apiKey = getOpenAIApiKey();
  let content: string;
  let mode: string;

  const recentUserTexts = messages
    .filter((m) => m.role === "user")
    .slice(-6)
    .map((m) => m.content);
  const demoOpts = {
    priorAssistant,
    recentUserTexts,
    campsBrief: campsBrief ?? undefined,
  };

  if (!apiKey) {
    // Demo mode must still read the real calendar for slot questions.
    content = calendarLookup
      ? calendarLookup.reply
      : demoReply(userText, qualify, demoOpts);
    mode = "demo";
  } else {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: system,
        },
        ...messages,
      ],
    });
    content =
      completion.choices[0]?.message?.content?.trim() ||
      calendarLookup?.reply ||
      demoReply(userText, qualify, demoOpts);
    mode = "openai";

    // If the model dodged the calendar on an availability ask, use the lookup.
    if (
      calendarLookup &&
      !/\d\s*(am|pm|:)/i.test(content) &&
      !/\[BOOK:/i.test(content)
    ) {
      content = calendarLookup.reply;
    }
  }

  const toBook = extractBookMarkers(content);
  const booked: string[] = [];
  const bookMeta = {
    name: lead?.name,
    email: lead?.email,
    phone: lead?.phone,
    childName: lead?.childName,
    childAge: lead?.childAge,
    childName2: lead?.childName2,
    childAge2: lead?.childAge2,
    childName3: lead?.childName3,
    childAge3: lead?.childAge3,
    leadId: lead?.id,
    ghlContactId: lead?.ghlContactId,
  };

  async function recordBook(start: string) {
    const result = await bookSlot(start, bookMeta);
    if (result.ok) {
      booked.push(result.booking.label || start);
      if (lead?.id && result.booking.ghlContactId) {
        await updateLead(lead.id, { ghlContactId: result.booking.ghlContactId });
      }
    }
    return result;
  }

  for (const start of toBook) {
    await recordBook(start);
  }

  // Demo: if they clearly confirm a looked-up exact slot, book it.
  if (
    !toBook.length &&
    calendarLookup?.exact[0] &&
    /\b(yes|yeah|yep|book|reserve|that works|sounds good|perfect|confirm)\b/i.test(
      userText,
    )
  ) {
    const hit = calendarLookup.exact[0];
    const result = await recordBook(hit.start);
    if (result.ok && !/reserved|booked|on (our )?calendar/i.test(content)) {
      content = `${content} I've reserved ${result.booking.label || hit.start} on our calendar.`;
    }
  }

  content = stripBookMarkers(content);
  if (booked.length && !/reserved|booked|on (our )?calendar/i.test(content)) {
    content = `${content} I've reserved ${booked.join(", ")} on our calendar.`;
  }

  return NextResponse.json({
    role: "assistant",
    content,
    mode,
    booked,
    openSlotCount: slots.length,
  });
}
