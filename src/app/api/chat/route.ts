import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { buildCampsBrief, isCampQuestion } from "@/lib/camps";
import { demoReply } from "@/lib/demo-replies";
import { parseChildAge } from "@/lib/greeting";
import { buildMayaSystemPrompt } from "@/lib/maya-persona";
import { getLead, updateLead } from "@/lib/leads";
import {
  hydrateLeadMemory,
  mergeTranscripts,
  resolveBookingStatus,
  trimConversation,
} from "@/lib/memory";
import {
  EMAIL_NEEDED_FOR_BOOKING,
  extractEmailFromText,
  inferQualifyContext,
  isTrialQualified,
  isValidParentEmail,
  trialQualifyGap,
} from "@/lib/qualify";
import { locationSessionNote } from "@/lib/locations";
import { getOpenAIApiKey } from "@/lib/runtime-secrets";
import {
  ensureServicesImageMarker,
  isServicesQuestion,
} from "@/lib/services";
import {
  collectShownSlotStarts,
  ensureMoreSlotsMarker,
  ensureOfferReachOutMarker,
  ensureSlotMarkers,
  extractPickedStart,
  isMoreOptionsRequest,
  slotsOfferedInText,
} from "@/lib/chat-actions";
import { sendStaffOutreach } from "@/lib/staff-outreach-mail";
import {
  isStaffOutreachConfirm,
  isStaffTalkRequest,
} from "@/lib/staff-outreach";
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

function ensureAskForEmail(text: string) {
  const cleaned = stripBookMarkers(text).trim();
  if (/\b(email|e-mail)\b/i.test(cleaned)) return cleaned;
  return `${cleaned}${cleaned ? " " : ""}${EMAIL_NEEDED_FOR_BOOKING}`.trim();
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { messages: incoming, leadId } = parsed.data;
  let lead = leadId ? await getLead(leadId) : null;
  if (lead) {
    lead = await hydrateLeadMemory(lead);
  }
  const booking = lead ? await resolveBookingStatus(lead) : { state: "none" as const };
  const messages = mergeTranscripts(lead?.conversation, incoming);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const priorAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.content;
  const userText = lastUser?.content ?? "";
  const pickedStart = extractPickedStart(userText);
  const moreOptions = isMoreOptionsRequest(userText);
  const shownStarts = collectShownSlotStarts(messages);
  const calendarWindow = moreOptions ? 21 : 14;
  const { brief, slots } = await buildAvailabilityBrief(calendarWindow);

  const qualify = inferQualifyContext(messages, lead);
  const ageFromLatest = parseChildAge(userText);
  const effectiveAge = qualify.age ?? ageFromLatest;
  const trialReady = isTrialQualified({
    ...qualify,
    age: effectiveAge,
  });
  const wantsCalendar =
    Boolean(userText) &&
    !pickedStart &&
    isAvailabilityQuestion(userText, priorAssistant);
  const calendarLookup = wantsCalendar
    ? await answerAvailabilityQuestion(userText, calendarWindow, {
        excludeStarts: shownStarts,
      })
    : null;
  const askingCamps = isCampQuestion(userText);
  const campsBrief = askingCamps
    ? await buildCampsBrief(effectiveAge)
    : null;

  // Capture email from this turn / history and persist on the lead.
  const emailFromLatest = extractEmailFromText(userText);
  const parentEmail = isValidParentEmail(qualify.email)
    ? qualify.email
    : emailFromLatest;
  if (lead?.id && parentEmail && parentEmail !== lead.email) {
    lead = (await updateLead(lead.id, { email: parentEmail })) ?? lead;
  }

  const emailKnown = isValidParentEmail(parentEmail);

  const system = `${buildMayaSystemPrompt(
    {
      ...(lead ?? {}),
      email: parentEmail,
      conversation: messages,
      ghlStatus: booking.ghlStatus,
      bookedStart: booking.start || lead?.bookedStart,
      bookedLabel: booking.label || lead?.bookedLabel,
      ghlAppointmentId: booking.ghlAppointmentId || lead?.ghlAppointmentId,
    },
    { returning: Boolean(lead?.conversation?.length || lead?.bookedStart) },
  )}

## SESSION GOAL
Stay on Steamoji Kirkland / kids STEM education — if they go off-topic, steer back. ${
    lead?.conversation?.length || lead?.bookedStart
      ? `This is a returning chat on the same link — continue prior context; do not restart. Honor booking status (upcoming vs past). ${
          booking.state === "past"
            ? `Past trial GHL status=${booking.ghlStatus || "unknown"} — respond from that (showed → next steps; noshow/cancelled → reschedule; unknown → ask if they made it).`
            : ""
        }`
      : "Qualify first (age 5–14 + where they live). If they name a city with another Steamoji, mention that academy once and let them choose Kirkland or the closer site."
  } Keep them comfortable and clear their questions. Suggest a free trial only when trialReady=yes, then offer mixed open times (not Saturday-only).

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
${locationSessionNote(qualify.locationHint, qualify.locationKnown)}
- Parent email: ${
    emailKnown
      ? `KNOWN (${parentEmail}) — do not re-ask`
      : "UNKNOWN — required before booking. When they confirm a slot, ask for their email first; do NOT emit [BOOK:…] until you have it."
  }
- Free-trial ready: ${trialReady ? "YES — may soft-invite trial when they're comfortable" : `NO — ${trialQualifyGap({ ...qualify, age: effectiveAge })}. Do not suggest booking a free trial yet.`}
${
  lead?.pendingBookStart && emailKnown
    ? `- Pending confirmed slot: ${lead.pendingBookStart} — email is now known; include [BOOK:${lead.pendingBookStart}] to finish booking.`
    : lead?.pendingBookStart && !emailKnown
      ? `- Pending confirmed slot: ${lead.pendingBookStart} — still waiting on parent email before booking.`
      : ""
}
${
  pickedStart
    ? `- They just tapped slot ${pickedStart}. Treat that as a confirmed choice — do not list more times. ${
        emailKnown
          ? `Include [BOOK:${pickedStart}] if not already booked.`
          : "Ask for their email for the calendar invite; do not emit [BOOK:…] yet."
      }`
    : moreOptions
      ? `- They asked for more time options. Offer the NEXT unused times from the calendar lookup — do not repeat times already listed.`
      : isStaffTalkRequest(userText)
        ? `- They asked to talk to a person. Offer that someone from the Steamoji Kirkland team can reach out. In this text reply include [OFFER_REACH_OUT] once. Do not invent a staff name.`
        : isStaffOutreachConfirm(userText, priorAssistant)
          ? `- They accepted a team callback. Confirm someone from the academy will reach out. Include [REACH_OUT] if you haven't.`
          : ""
}

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
If they confirmed a time that matches${
        emailKnown
          ? ", include the [BOOK:…] marker."
          : ", do NOT include [BOOK:…] yet — ask for their email first, then book once you have it."
      }
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
    emailKnown,
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

  if (isServicesQuestion(userText)) {
    content = ensureServicesImageMarker(content);
  }

  if (isStaffOutreachConfirm(userText, priorAssistant)) {
    const outreach = await sendStaffOutreach({
      lead,
      channel: "chat",
      userText,
      recentMessages: messages,
    });
    content = outreach.parentReply;
  } else if (isStaffTalkRequest(userText)) {
    content = ensureOfferReachOutMarker(content);
  }

  const toBook = extractBookMarkers(content);
  const booked: string[] = [];
  const bookErrors: string[] = [];
  const bookMeta = {
    name: lead?.name,
    email: parentEmail,
    phone: lead?.phone,
    childName: lead?.childName,
    childAge: lead?.childAge,
    childName2: lead?.childName2,
    childAge2: lead?.childAge2,
    childName3: lead?.childName3,
    childAge3: lead?.childAge3,
    leadId: lead?.ghlContactId || lead?.id,
    ghlContactId: lead?.ghlContactId || lead?.id,
    previousAppointmentId: lead?.ghlAppointmentId,
  };

  async function recordBook(start: string) {
    if (!isValidParentEmail(parentEmail)) {
      if (lead?.id) {
        lead =
          (await updateLead(lead.id, { pendingBookStart: start })) ?? lead;
      }
      bookErrors.push(EMAIL_NEEDED_FOR_BOOKING);
      return {
        ok: false as const,
        error: EMAIL_NEEDED_FOR_BOOKING,
      };
    }

    const result = await bookSlot(start, bookMeta);
    if (result.ok) {
      booked.push(result.booking.label || start);
      if (lead?.id) {
        const patch: {
          ghlContactId?: string;
          pendingBookStart?: string;
          bookedStart?: string;
          bookedLabel?: string;
          ghlAppointmentId?: string;
        } = {
          pendingBookStart: undefined,
          bookedStart: result.booking.start,
          bookedLabel: result.booking.label,
        };
        if (result.booking.ghlContactId) {
          patch.ghlContactId = result.booking.ghlContactId;
        }
        if (result.booking.ghlAppointmentId) {
          patch.ghlAppointmentId = result.booking.ghlAppointmentId;
        }
        lead = (await updateLead(lead.id, patch)) ?? lead;
      }
    } else {
      bookErrors.push(result.error);
    }
    return result;
  }

  for (const start of toBook) {
    await recordBook(start);
  }

  if (pickedStart && !toBook.includes(pickedStart)) {
    await recordBook(pickedStart);
  }

  // After email arrives, finish a slot we held pending.
  if (
    !toBook.length &&
    !pickedStart &&
    emailKnown &&
    lead?.pendingBookStart &&
    (emailFromLatest ||
      /\b(email|e-mail|@)\b/i.test(userText) ||
      /\b(yes|yeah|yep|book|reserve|that works|sounds good|perfect|confirm)\b/i.test(
        userText,
      ))
  ) {
    await recordBook(lead.pendingBookStart);
  }

  // Demo / confirm path: if they clearly confirm a looked-up exact slot, book it.
  if (
    !toBook.length &&
    !booked.length &&
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

  const offeredSlots = (() => {
    if (booked.length || pickedStart) return [];
    if (isStaffTalkRequest(userText) || isStaffOutreachConfirm(userText, priorAssistant)) {
      return [];
    }
    if (moreOptions) return calendarLookup?.matches ?? [];
    const pool = calendarLookup?.matches?.length
      ? calendarLookup.matches
      : slots;
    const mentioned = slotsOfferedInText(content, pool);
    if (mentioned.length) return mentioned;
    return calendarLookup?.matches ?? [];
  })();
  if (offeredSlots.length) {
    content = ensureSlotMarkers(content, offeredSlots);
  }
  const shownNow = new Set([...shownStarts, ...offeredSlots.map((s) => s.start)]);
  const hasMoreTimes =
    Boolean(offeredSlots.length) &&
    (calendarLookup?.hasMore || slots.some((s) => !shownNow.has(s.start)));
  content = ensureMoreSlotsMarker(content, hasMoreTimes);

  if (bookErrors.some((e) => /email/i.test(e)) && !booked.length) {
    content = ensureAskForEmail(content);
  }

  if (booked.length && !/reserved|booked|on (our )?calendar/i.test(content)) {
    content = `${content} I've reserved ${booked.join(", ")} on our calendar.`;
  }

  if (lead?.id) {
    await updateLead(lead.id, {
      conversation: trimConversation([
        ...messages,
        { role: "assistant", content },
      ]),
    });
  }

  return NextResponse.json({
    role: "assistant",
    content,
    mode,
    booked,
    bookErrors: bookErrors.length ? bookErrors : undefined,
    openSlotCount: slots.length,
  });
}
