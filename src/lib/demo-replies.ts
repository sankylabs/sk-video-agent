import { siteConfig } from "./config";
import { fallbackCampsBrief } from "./camps";
import { ageAffirmation, parseChildAge } from "./greeting";
import { demoLocationReply, PLACE_RE } from "./locations";
import {
  isServicesQuestion,
  servicesOverviewReply,
} from "./services";
import {
  childAgeRecallReply,
  EMAIL_NEEDED_FOR_BOOKING,
  isChildAgeQuestion,
  isKnownAboutQuestion,
  isTrialQualified,
  knownAboutReply,
  membershipCostReply,
  type QualifyContext,
} from "./qualify";

const PARENT_AT_TRIAL_REPLY =
  `Yes — a parent or guardian should come to the free trial. While your child enjoys a project, we walk you through the whole program with a tour of the academy.`;

const ON_TOPIC =
  /\b(steamoji|makerspace|maker|stem|camp|membership|trial|session|tour|academy|kirkland|enroll|booking|book|slot|schedule|hours|tuition|price|cost|robotics|coding|3d|engineering|child|kid|son|daughter|age|email|commute|program|service|vex|birthday)\b/i;

const OFF_TOPIC =
  /\b(weather|forecast|stock|crypto|bitcoin|election|politic|trump|biden|recipe|cook|homework|math problem|solve this|movie|netflix|sports? score|nfl|nba|mlb|soccer|who won|capital of|tell me a joke|write (a |me )?(poem|essay|code)|medical|diagnos|lawsuit|legal advice)\b/i;

function isOffTopicQuestion(text: string) {
  if (ON_TOPIC.test(text)) return false;
  if (/@/.test(text)) return false;
  if (/^(1[0-8]|[1-9]|yes|yeah|yep|ok|okay|sure|thanks|thank you|hi|hello|hey)$/i.test(text.trim())) {
    return false;
  }
  return OFF_TOPIC.test(text);
}

function steerBackToSteamoji(ctx: QualifyContext) {
  if (ctx.age == null) {
    return `I'm here for Steamoji Kirkland — kids STEM makerspace for ages 5–14. How old is your child?`;
  }
  return `I'm here for Steamoji Kirkland — programs, camps, and free trials at our makerspace. What would you like to know about that?`;
}

function isParentAttendanceQuestion(
  text: string,
  priorAssistant?: string,
  recentUserTexts: string[] = [],
) {
  const t = text.toLowerCase().trim();
  const mentionsTrial =
    /\b(trial|session|visit|tour|academy)\b/.test(t) ||
    /\b(free trial|parent or guardian should come|walk you through the whole program)\b/i.test(
      priorAssistant || "",
    ) ||
    recentUserTexts.some((u) =>
      /\b(trial|session|visit|tour|drop)\b/i.test(u),
    );

  const asksAttendance =
    /\b(do (we|i|parents?|guardians?) (need|have) to (be|come|attend|stay)|need to be (there|present|at)|parents? (need|required|present|attend)|do parents (come|stay|attend)|be there|stay there|come (too|along|with)|have to (be|come|stay))\b/.test(
      t,
    ) || /\bdrop\b/.test(t);

  return asksAttendance && mentionsTrial;
}

function campsReply(userText: string, ctx: QualifyContext, campsBrief?: string) {
  const brief = campsBrief || fallbackCampsBrief(ctx.age);
  if (ctx.age == null) {
    return `We have week-long Kirkland camps (~$499–$599) listed at ${siteConfig.campsUrl}. How old is your child so I can suggest age-fitting options?`;
  }
  // Pull first few bullet lines from the brief for a short spoken answer
  const bullets = brief
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .slice(0, 3)
    .map((l) => l.replace(/^- /, ""))
    .join("; ");
  if (!bullets) {
    return `For a ${ctx.age}-year-old, check upcoming Kirkland camps here: ${siteConfig.campsUrl}. Happy to help pick a week.`;
  }
  return `For a ${ctx.age}-year-old, good Kirkland fits include: ${bullets}. Full list: ${siteConfig.campsUrl}. Want help picking a week?`;
}

/** Lightweight fallback when OPENAI_API_KEY is not set (text helpers only). */
export function demoReply(
  userText: string,
  qualify?: QualifyContext,
  opts?: {
    priorAssistant?: string;
    recentUserTexts?: string[];
    campsBrief?: string;
    emailKnown?: boolean;
  },
): string {
  const t = userText.toLowerCase();
  const age = parseChildAge(userText);
  const ctx: QualifyContext = qualify ?? {
    age: null,
    locationKnown: false,
  };
  const trialReady = isTrialQualified(ctx);
  const emailKnown = opts?.emailKnown ?? Boolean(ctx.email);

  if (isOffTopicQuestion(userText)) {
    return steerBackToSteamoji(ctx);
  }

  if (isChildAgeQuestion(userText)) {
    return childAgeRecallReply(ctx);
  }

  if (isKnownAboutQuestion(userText)) {
    return knownAboutReply(ctx);
  }

  // Parent confirming a slot while email is still missing
  if (
    !emailKnown &&
    /\b(yes|yeah|yep|book|reserve|that works|sounds good|perfect|confirm)\b/i.test(
      userText,
    ) &&
    /\b(open|hold|reserve|calendar|trial|slot|available)\b/i.test(
      opts?.priorAssistant || "",
    )
  ) {
    return EMAIL_NEEDED_FOR_BOOKING;
  }

  // Parent just shared an email after we asked
  if (
    /@/.test(userText) &&
    /\b(email|e-mail|invite|calendar)\b/i.test(opts?.priorAssistant || "")
  ) {
    return `Thanks — I've got your email. I'll get that free session on the calendar for you.`;
  }

  // Parent stating an age (e.g. "she's 5", "9", "he's twelve")
  if (
    age != null &&
    !/\b(how old|what age|do you know)\b/.test(t) &&
    (/\b(years?\s*old|yr\.?\s*old|age|he'?s|she'?s|they'?re|he is|she is|they are|my (son|daughter|kid|child)|turning)\b/.test(
      t,
    ) ||
      /^(1[0-8]|[1-9]|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)$/.test(
        t.trim(),
      ))
  ) {
    if (age === 5) {
      return ctx.locationKnown
        ? ageAffirmation(5)
        : `${ageAffirmation(5)} Are you able to get to our Kirkland academy fairly easily?`;
    }
    if (age >= 5 && age <= 14) {
      return ctx.locationKnown
        ? ageAffirmation(age)
        : `${ageAffirmation(age)} Are you able to get to our Kirkland academy fairly easily?`;
    }
    return `${ageAffirmation(age)} Is there another child in the family who is 5–14?`;
  }

  if (
    isParentAttendanceQuestion(
      userText,
      opts?.priorAssistant,
      opts?.recentUserTexts,
    )
  ) {
    return trialReady
      ? `${PARENT_AT_TRIAL_REPLY} Happy to find a day when you're ready.`
      : PARENT_AT_TRIAL_REPLY;
  }

  if (
    /\b(what (do you|happens|is it like)|what'?s it like|tell me about|walk me through|during|in a)\b/.test(
      t,
    ) &&
    /\b(free )?(trial|session|visit|tour)\b/.test(t)
  ) {
    return `A free trial is about 30 minutes: while your child enjoys an age-appropriate project, we walk you through the whole program with a tour of our academy.`;
  }

  if (isServicesQuestion(userText)) {
    return servicesOverviewReply;
  }

  if (
    /\b(how (does|do)?\s*steamoji work|how (it|steamoji) works|what is steamoji|what's steamoji|what'?s steamoji about|why steamoji|tell me about steamoji|walk me through how)\b/.test(
      t,
    ) ||
    (/\b(walk me through|how does (it|this) work)\b/.test(t) &&
      !/\b(free )?(trial|session|visit|tour)\b/.test(t))
  ) {
    return `Steamoji is a makerspace for kids 5–14 in Kirkland. We mentor a Maker Mindset — hands-on STEM plus creativity, adaptability, and resilience. Kids work on age-appropriate projects with facilitators; parents see the progress.`;
  }

  if (/\b(birthday|party|group event|private (party|event))\b/.test(t)) {
    return `Birthday parties are Saturdays 4–6pm — fun STEM activities and hands-on projects. How old are the kids, roughly how many, and which Saturday were you thinking?`;
  }

  if (
    /\b(before 2|morning visit|am visit|earlier than 2)\b/.test(t) ||
    (/\b(morning)\b/.test(t) && /\b(visit|tour|come|session|trial)\b/.test(t))
  ) {
    return `Weekday academy time usually starts around 2pm. We can look at weekday afternoons or a weekend slot if that helps.`;
  }

  if (
    /\b(camp or membership|membership or camp|after.?school or camp|camps? vs|more camps? or|camps? or membership)\b/.test(
      t,
    ) ||
    (/\bcamp/.test(t) && /\b(membership|after.?school)\b/.test(t))
  ) {
    return `Camps are week-long when school is off; membership is the ongoing after-school makerspace. No need to decide now — what would you like to know more about?`;
  }

  if (/(price|cost|how much|tuition|fee|membership|package)/.test(t)) {
    return membershipCostReply({
      ...ctx,
      age: ctx.age ?? age,
    });
  }

  if (/(camp|summer|spring|winter break|school.?s off)/.test(t)) {
    return campsReply(userText, { ...ctx, age: ctx.age ?? age }, opts?.campsBrief);
  }

  if (
    /\b(robotics?|coding|3d print|beginner|never coded|new to)\b/.test(t) &&
    !/\b(code ninjas|icode)\b/.test(t)
  ) {
    return `Perfect — robotics and coding are part of our makerspace, alongside engineering, 3D work, and more. Projects are leveled for beginners through more experienced makers. Any other questions?`;
  }

  if (
    /(code ninjas|icode|i code|robotics (academy|school|class)|coding school|competitor|vs\.|compared to|other (academy|school)s?)/.test(
      t,
    )
  ) {
    return `We’re focused on a makerspace — building holistic skills that matter as your child grows into entrepreneurship, not just coding or robotics alone. What else can I clear up?`;
  }

  if (/(year.?old|years? old|program.*for)/.test(t)) {
    if (age === 5) {
      return ageAffirmation(5);
    }
    if (age != null && age >= 5 && age <= 14) {
      return `Absolutely — ${age} is a perfect fit, and we have age-appropriate projects. What would you like to know?`;
    }
    if (age != null) {
      return ageAffirmation(age);
    }
    if (ctx.age != null && ctx.age >= 5 && ctx.age <= 14) {
      return `Absolutely — for a ${ctx.age}-year-old we have age-appropriate projects.`;
    }
    return `Absolutely — we have age-appropriate projects. How old is your child?`;
  }

  if (PLACE_RE.test(t) || /(far|distance|commute)/.test(t)) {
    const fromTown = t.match(PLACE_RE)?.[0] || ctx.locationHint;
    const routed = demoLocationReply(fromTown, { ageUnknown: ctx.age == null });
    if (routed) return routed;
    return `Kirkland and Woodinville are a great fit for our Kirkland academy. If you're closer to another Steamoji we can mention it — or Kirkland is still welcome if that's easier.${ctx.age == null ? " How old is your child?" : ""}`;
  }

  // Availability / day-slot questions are answered by /api/chat via the live calendar.
  if (
    /\b(busy|twice a week|once a week|commit|commitment|too much)\b/.test(t) &&
    !/\b(available|availability|open|slot|book|times?)\b/.test(t)
  ) {
    return `Schedules are flexible — that’s why many families like seeing the space first. Can you usually make it to Kirkland once or twice a week if your child loves it?`;
  }

  if (ctx.age == null) {
    return `I'm Maya at Steamoji Kirkland — a makerspace for kids ${siteConfig.ages}. How old is your child?`;
  }

  if (!ctx.locationKnown) {
    return `${ageAffirmation(ctx.age)} Where are you located?`;
  }

  if (trialReady) {
    return `Happy to help with Steamoji Kirkland — and when you're ready, we can look at a free trial day that works for you.`;
  }

  return `Happy to help with Steamoji Kirkland.`;
}
