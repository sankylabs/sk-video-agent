import { siteConfig } from "./config";
import { buildCampsBrief } from "./camps";
import { buildMayaSystemPrompt } from "./maya-persona";
import { mayaGreeting, mayaReturningGreeting } from "./greeting";
import { resolveBookingStatus } from "./memory";
import { buildAvailabilityBrief } from "./schedule";
import {
  inferQualifyContext,
  isTrialQualified,
  isValidParentEmail,
  trialQualifyGap,
} from "./qualify";
import { locationSessionNote } from "./locations";
import { isGoodbye, isTrialMonthQuestion } from "./chat-actions";
import { detectNurture } from "./nurture-detect";
import { isBirthdayInquiry, isStaffTalkRequest } from "./staff-outreach";

export type VideoLeadLike = {
  name?: string;
  email?: string;
  childName?: string;
  childAge?: string;
  childName2?: string;
  childAge2?: string;
  childName3?: string;
  childAge3?: string;
  childSchool?: string;
  childGrade?: string;
  location?: string;
  resideKirkland?: string;
  city?: string;
  tags?: string[];
  opportunityStage?: string;
  interestedInTrial?: string;
  crmNotes?: string;
  notes?: string;
  bookedStart?: string;
  bookedLabel?: string;
  ghlAppointmentId?: string;
  ghlContactId?: string;
  ghlStatus?: string;
  conversation?: { role: "user" | "assistant"; content: string }[];
};

/** Exact conversational context Tavus gets for a live Maya call. */
export async function buildVideoSessionContext(lead?: VideoLeadLike | null) {
  const booking = await resolveBookingStatus(lead ?? {});
  const returning =
    Boolean(lead?.conversation?.length) || booking.state !== "none";
  const greeting = returning
    ? mayaReturningGreeting(lead ?? undefined, booking)
    : mayaGreeting(lead ?? undefined);
  const { brief } = await buildAvailabilityBrief(10);
  const qualify = inferQualifyContext(lead?.conversation ?? [], lead ?? null);
  const campsBrief = await buildCampsBrief(qualify.age);
  const emailKnown = isValidParentEmail(qualify.email || lead?.email);
  const lastUser =
    [...(lead?.conversation || [])]
      .reverse()
      .find((m) => m.role === "user")?.content || "";
  const nurtureNow = detectNurture({
    userText: lastUser,
    qualify,
  });
  const askedForPerson = isStaffTalkRequest(lastUser);
  const askedBirthday = isBirthdayInquiry(lastUser);
  const sayingBye = isGoodbye(lastUser);
  const context = `${buildMayaSystemPrompt(
    {
      ...(lead ?? {}),
      ghlStatus: booking.ghlStatus,
      bookedStart: booking.start || lead?.bookedStart,
      bookedLabel: booking.label || lead?.bookedLabel,
      ghlAppointmentId: booking.ghlAppointmentId || lead?.ghlAppointmentId,
    },
    { returning },
  )}

## SESSION GOAL
Stay on Steamoji Kirkland / kids STEM education — if they go off-topic, steer back without answering it. ${
    returning
      ? "Continue the prior conversation on this chat link. Do not restart qualification. Honor booking status (upcoming vs past / reschedule)."
      : "Qualify (age 5–14 + where they live) before suggesting a free trial. If they name a city with another Steamoji, mention that academy once and let them choose Kirkland or the closer site."
  } Keep them comfortable; make the value proposition clear; answer what they ask. Go easy on the free trial session — do not invite it unless they ask to visit. Never volunteer a trial month. When they want to book a trial session, they must acknowledge a specific time before [BOOK:].

## CALL LENGTH
There is no time limit while they are talking. Stay with them as long as they are engaged. Do not announce a time limit unless they ask. If a still-there check-in is spoken for you after a long quiet stretch, wait for them — if they reply, continue normally. Do not invent your own "are you still there?" while you are already talking.

## KNOWN QUALIFICATION SO FAR
- Child age: ${qualify.age != null ? String(qualify.age) : "UNKNOWN"}
${locationSessionNote(qualify.locationHint, qualify.locationKnown)}
- Parent email: ${
    emailKnown
      ? `KNOWN (${qualify.email || lead?.email}) — do not re-ask, do not speak it unless they just gave it and you are confirming once`
      : "UNKNOWN — required before booking; ask when they confirm a slot. When they give it, repeat once in natural speech — never spell, never twice"
  }
- Free-trial ready: ${isTrialQualified(qualify) ? "YES" : `NO — ${trialQualifyGap(qualify)}`}
${
  nurtureNow
    ? `- They should go to NURTURING (${nurtureNow.reason}: ${nurtureNow.detail}). Be warm, do not push a trial, and include [NURTURE:${nurtureNow.reason}] once (do not pronounce it).`
    : ""
}
${
  sayingBye
    ? `- They are saying goodbye. One short warm line. Do not recap, and do not give phone, email, address, website, or hours.`
    : askedForPerson
    ? `- They asked to talk to a person. Say yes — our academy can reach out, or they can call ${siteConfig.phone} right away. Do not invent a staff name. Say "our academy", not "the Kirkland team". Do not emit [OFFER_REACH_OUT] or [REACH_OUT].`
    : askedBirthday
      ? `- They asked about a birthday party. Saturdays 4–6pm; gather age, headcount, and preferred Saturday. Say our academy will follow up with options. Do not invent pricing. Do not emit [OFFER_REACH_OUT] or [REACH_OUT]. Guest/birthday-child ages are for the party only — do not treat them as the enrolled child's age, and do not emit [UNQUALIFIED:age] or [NURTURE:too-young].`
      : isTrialMonthQuestion(lastUser)
        ? `- They asked about a trial month (different from the one free trial session). Explain only because they asked. If they asked how to book sessions during it: parent app, multiple sessions based on the package. Do not [BOOK:] a trial-session slot.`
        : ""
}

## Talking to a person
If they want a human / staff / "who can I talk to": say yes — our academy can reach out, or they can call ${siteConfig.phone} right away. Do not invent a staff name. Say "our academy", never "the Kirkland team". Never say [OFFER_REACH_OUT] or [REACH_OUT] out loud. Leave them in Conversation.

## LIVE FREE-SESSION AVAILABILITY (use only when they asked to visit / see times)
Do not list times or [BOOK:] until they asked. They must acknowledge a specific day/time first. When they confirm an open slot and parent email is known, end your reply with [BOOK:YYYY-MM-DDTHH:mm] (do not pronounce BOOK or the brackets). The app uses that tag to write the GHL appointment — spoken confirmation alone does not book.
If they just said their email: repeat it once in natural speech, then book. Do not spell it. Do not say the address more than once.
If they already have an upcoming trial and want a different time, [BOOK:] the NEW slot (that replaces the old one). If they want to cancel without a new time, end with [CANCEL:] (do not pronounce CANCEL or the brackets).
If the child is over 14, say we do not have a program appropriate for their age right now but we can reach out in the future, and end with [NURTURE:too-old]. If the child is under 5 and they want to come later / stay in touch, end with [NURTURE:too-young] instead. If they are a Kirkland-area fit and not ready now, end with [NURTURE:later]. If they are outside Kirkland and say it is too far / they will use a closer Steamoji, end with [UNQUALIFIED:distance]. Do not pronounce those tags.
${brief}

## LIVE KIRKLAND CAMPS (use when they ask about camps)
${campsBrief}
`;

  return { context, greeting, returning, qualify };
}
