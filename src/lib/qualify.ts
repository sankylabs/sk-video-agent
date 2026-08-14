import { parseChildAge } from "./greeting";

export type ChatTurn = { role: string; content: string };

export type QualifyContext = {
  age: number | null;
  locationKnown: boolean;
  locationHint?: string;
  name?: string;
  childName?: string;
};

const PLACE_RE =
  /\b(kirkland|woodinville|clyde\s*hill|redmond|bellevue|seattle|bothell|kenmore|juanita|totem\s*lake|sammamish|issaquah)\b/i;

const LOCATION_SOFT_RE =
  /\b(near(by)?|local|live in|we'?re in|commute|close by|in the area)\b/i;

const AGE_STATEMENT_RE =
  /\b(years?\s*old|yr\.?\s*old|age|he'?s|she'?s|they'?re|he is|she is|they are|my (son|daughter|kid|child)|turning)\b/i;

/** "6 year old", "6-year-old", "for my 6 year old", etc. */
const YEAR_OLD_RE = /\b(\d{1,2})\s*-?\s*years?\s*old\b/i;

/** Pull age + location already shared in lead fields or earlier turns. */
export function inferQualifyContext(
  messages: ChatTurn[] = [],
  lead?: {
    childAge?: string;
    notes?: string;
    name?: string;
    childName?: string;
  } | null,
): QualifyContext {
  let age = parseChildAge(lead?.childAge) ?? null;
  let locationHint: string | undefined;
  let locationKnown =
    PLACE_RE.test(lead?.notes || "") || LOCATION_SOFT_RE.test(lead?.notes || "");
  const leadPlace = lead?.notes?.match(PLACE_RE)?.[0];
  if (leadPlace) locationHint = leadPlace;

  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const text = msg.content || "";

    // Skip questions about age — those aren't statements
    const askingAge =
      /\b(how old|what age|do you know)\b/i.test(text) &&
      (text.includes("?") ||
        /\b(how old is|what age is)\b/i.test(text));

    if (!askingAge) {
      const yearOld = text.match(YEAR_OLD_RE);
      if (yearOld) {
        age = Number(yearOld[1]);
      } else {
        const foundAge = parseChildAge(text);
        if (
          foundAge != null &&
          (AGE_STATEMENT_RE.test(text) ||
            /^(1[0-8]|[1-9]|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)$/i.test(
              text.trim(),
            ))
        ) {
          age = foundAge;
        }
      }
    }

    const place = text.match(PLACE_RE);
    if (place) {
      locationKnown = true;
      locationHint = place[0];
    } else if (LOCATION_SOFT_RE.test(text)) {
      locationKnown = true;
    }
  }

  // Also trust assistant affirmations like "8 is a perfect fit"
  if (age == null) {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const m = msg.content.match(
        /\b(\d{1,2})\s+is a perfect fit\b/i,
      );
      if (m) {
        age = Number(m[1]);
        break;
      }
      const j = msg.content.match(
        /\bFive is a perfect fit\b/i,
      );
      if (j) {
        age = 5;
        break;
      }
    }
  }

  return {
    age,
    locationKnown,
    locationHint,
    name: lead?.name?.trim() || undefined,
    childName: lead?.childName?.trim() || undefined,
  };
}

/** Age 5–14 + can get to Kirkland — required before suggesting a free trial. */
export function isTrialQualified(ctx: QualifyContext): boolean {
  return (
    ctx.age != null &&
    ctx.age >= 5 &&
    ctx.age <= 14 &&
    ctx.locationKnown
  );
}

export function trialQualifyGap(ctx: QualifyContext): string {
  const ageOut = ctx.age != null && (ctx.age < 5 || ctx.age > 14);
  if (ageOut) {
    return "age out of 5–14 — do not suggest a free trial";
  }
  if (ctx.age == null && !ctx.locationKnown) {
    return "missing age and Kirkland access";
  }
  if (ctx.age == null) return "missing age";
  if (!ctx.locationKnown) return "missing Kirkland access / location";
  return "qualified";
}

/** Cost/membership reply that only asks for missing age or location. */
export function membershipCostReply(ctx: QualifyContext): string {
  const ageOk = ctx.age != null && ctx.age >= 5 && ctx.age <= 14;
  const ageOut = ctx.age != null && (ctx.age < 5 || ctx.age > 14);

  if (ageOut) {
    return `Thanks for asking — we currently cater to ages 5–14, so membership may not be the right fit just yet. Happy to help if you have another child in that range.`;
  }

  if (ctx.age == null && !ctx.locationKnown) {
    return `Before packages, two quick checks: how old is your child, and can you get to our Kirkland academy regularly?`;
  }

  if (ctx.age == null) {
    return `Before packages — how old is your child?`;
  }

  if (!ctx.locationKnown) {
    return `Before packages — where are you located / can you get to our Kirkland academy about once or twice a week?`;
  }

  if (ageOk) {
    const article = ctx.age === 8 || ctx.age === 11 || ctx.age === 18 ? "an" : "a";
    return `With ${article} ${ctx.age}-year-old near Kirkland, you're a strong fit. We skip membership dollars up front — happy to clear any questions first. What would you like to know?`;
  }

  return `Once we know you're a fit, we can talk packages — what questions can I clear up for you?`;
}

/** Answer "what do you know about me?" / "how old is my child?" from remembered context. */
export function knownAboutReply(ctx: QualifyContext): string {
  const bits: string[] = [];
  if (ctx.name) bits.push(`you're ${ctx.name}`);
  if (ctx.childName) bits.push(`your child is ${ctx.childName}`);
  if (ctx.age != null) bits.push(`they're ${ctx.age}`);
  if (ctx.locationKnown) {
    bits.push(
      ctx.locationHint
        ? `you're in/near ${ctx.locationHint}`
        : `you can get to the Kirkland area`,
    );
  }

  if (!bits.length) {
    return `So far I don't have your details yet — how old is your child, and are you able to get to our Kirkland academy?`;
  }

  return `From what you've shared: ${bits.join(", ")}. Anything else you're curious about?`;
}

export function isKnownAboutQuestion(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    /\b(what do you know about me|what do you know|do you remember|what have i (told|shared)|who am i)\b/.test(
      t,
    ) ||
    /\b(how old is (my|our) (child|kid|son|daughter)|what age is (my|our) (child|kid|son|daughter)|do you know (my|our) (child|kid).*(age|old))\b/.test(
      t,
    )
  );
}

export function childAgeRecallReply(ctx: QualifyContext): string {
  if (ctx.age != null) {
    const who = ctx.childName ? `${ctx.childName} is` : "Your child is";
    return `${who} ${ctx.age}, from what you've shared. ${
      ctx.age >= 5 && ctx.age <= 14
        ? "That's a great fit for Steamoji."
        : "We currently cater to ages 5–14."
    }`;
  }
  return `I don't have their age yet — how old is your child?`;
}

export function isChildAgeQuestion(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /\b(how old is (my|our) (child|kid|son|daughter)|what age is (my|our) (child|kid|son|daughter)|do you know how old)\b/.test(
    t,
  );
}
