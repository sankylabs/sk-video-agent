import { siteConfig } from "./config";
import { fallbackCampsBrief } from "./camps";
import { ageAffirmation, parseChildAge } from "./greeting";
import {
  childAgeRecallReply,
  isChildAgeQuestion,
  isKnownAboutQuestion,
  isTrialQualified,
  knownAboutReply,
  membershipCostReply,
  type QualifyContext,
} from "./qualify";

const PARENT_AT_TRIAL_REPLY =
  `Yes — a parent or guardian should come to the free trial. While your child enjoys a project, we walk you through the whole program with a tour of the academy.`;

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
  },
): string {
  const t = userText.toLowerCase();
  const age = parseChildAge(userText);
  const ctx: QualifyContext = qualify ?? {
    age: null,
    locationKnown: false,
  };
  const trialReady = isTrialQualified(ctx);

  if (isChildAgeQuestion(userText)) {
    return childAgeRecallReply(ctx);
  }

  if (isKnownAboutQuestion(userText)) {
    return knownAboutReply(ctx);
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
        ? `${ageAffirmation(5)} What questions can I help with?`
        : `${ageAffirmation(5)} Are you able to get to our Kirkland academy fairly easily?`;
    }
    if (age >= 5 && age <= 14) {
      return ctx.locationKnown
        ? `${ageAffirmation(age)} What questions can I help with?`
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

  if (
    /\b(how (does|do)?\s*steamoji work|how (it|steamoji) works|what is steamoji|why steamoji|tell me about steamoji|walk me through how)\b/.test(
      t,
    ) ||
    (/\b(walk me through|how does (it|this) work)\b/.test(t) &&
      !/\b(free )?(trial|session|visit|tour)\b/.test(t))
  ) {
    return `Steamoji is a makerspace for kids 5–14 in Kirkland. We mentor a Maker Mindset — hands-on STEM plus creativity, adaptability, and resilience. Kids work on age-appropriate projects with facilitators; parents see the progress. What questions can I help with?`;
  }

  if (/\b(birthday|party|group event|private (party|event))\b/.test(t)) {
    return `We can talk through birthday or group maker experiences. How old are the kids, roughly how many, and what timing were you thinking?`;
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
      return `Absolutely — for a ${ctx.age}-year-old we have age-appropriate projects. What questions can I help with?`;
    }
    return `Absolutely — we have age-appropriate projects. How old is your child?`;
  }

  if (/(far|distance|commute|woodinville|clyde|redmond|bellevue|kirkland)/.test(t)) {
    return `Kirkland families are the easiest fit. Clyde Hill or Woodinville can work if you can come about 1–2x/week. What else are you wondering about?`;
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
    return `${ageAffirmation(ctx.age)} Are you able to get to our Kirkland academy fairly easily?`;
  }

  if (trialReady) {
    return `Happy to help — what questions can I clear up about Steamoji? When you're ready, we can also look at a free trial day that works for you.`;
  }

  return `What questions can I help with about Steamoji Kirkland?`;
}
