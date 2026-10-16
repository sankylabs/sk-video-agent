const AGE_WORD: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
};

function ageFromToken(raw: string): number | null {
  const word = AGE_WORD[raw.toLowerCase()];
  if (word != null) return word;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 18) return n;
  return null;
}

/** Parse a child age from lead field or free text ("5", "he's 9", "five years old"). */
export function parseChildAge(text?: string | null): number | null {
  if (!text?.trim()) return null;
  const t = text.trim().toLowerCase();

  const yearOld = t.match(
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)\s*-?\s*(years?\s*old|yr\.?\s*old)\b/,
  );
  if (yearOld) return ageFromToken(yearOld[1]);

  if (/\b(he'?s|she'?s|they'?re|he is|she is|they are)\s+one\b/.test(t)) {
    return 1;
  }

  for (const word of [
    "sixteen",
    "fifteen",
    "fourteen",
    "thirteen",
    "twelve",
    "eleven",
    "ten",
    "nine",
    "eight",
    "seven",
    "six",
    "five",
    "four",
    "three",
    "two",
  ] as const) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return AGE_WORD[word];
  }

  // Never treat a lone "1" as age 1 — live captions often hear "ten" as "1".
  const m = t.match(/\b(1[0-8]|[2-9])\b/);
  if (m) return Number(m[1]);
  if (/^\s*1\s*$/.test(t)) return 1;
  return null;
}

/** Short spoken line after a parent shares (or we already know) the child's age. */
export function ageAffirmation(age: number): string {
  if (age === 5) {
    return `Five is a perfect fit — we start with our junior program, then move into the main program as they progress.`;
  }
  if (age >= 5 && age <= 14) {
    return `${age} is a perfect fit for Steamoji Kirkland.`;
  }
  return `Thanks for sharing — we currently cater to ages 5–14, so that might not be the best match right now.`;
}

/** Keep the spoken opening short — details come after they engage. */
export const mayaGreeting = (lead?: {
  name?: string;
  childName?: string;
  childAge?: string;
}) => {
  const who = lead?.name?.trim() ? `Hi ${lead.name.trim()}!` : "Hi there!";
  const age = parseChildAge(lead?.childAge);
  const child = lead?.childName?.trim();

  if (age != null && age >= 5 && age <= 14) {
    if (child) {
      return `${who} I'm Maya, an AI enrollment advisor here at Steamoji Kirkland. So glad you're looking at us for ${child} — ${age} is a great age for the makerspace and we have several kids similar to ${child}'s age enjoying building and learning. Would you like to explore further?`;
    }
    return `${who} I'm Maya, an AI enrollment advisor here at Steamoji Kirkland. So glad you're looking at us for your ${age}-year-old — ${age} is a great age for the makerspace and we have several kids that age enjoying building and learning. Would you like to explore further?`;
  }

  if (age != null) {
    return `${who} I'm Maya at Steamoji Kirkland. ${ageAffirmation(age)} Is there another child in the 5–14 range?`;
  }

  return `${who} I'm Maya, an AI enrollment advisor at Steamoji Kirkland. To start with, let me understand how old your child is?`;
};

export type GreetingBooking = {
  state: "none" | "upcoming" | "past";
  spoken?: string;
  ghlStatus?: string;
};

/** Spoken when the same chat URL is opened again. */
export function mayaReturningGreeting(
  lead?: { name?: string; childName?: string; childAge?: string },
  booking?: GreetingBooking,
) {
  const who = lead?.name?.trim()
    ? `Hi ${lead.name.trim()} — nice to see you again!`
    : "Nice to see you again!";

  if (booking?.state === "upcoming" && booking.spoken) {
    return `${who} I'm Maya. You're all set for the free trial on ${booking.spoken}. Anything you'd like to go over before then?`;
  }

  if (booking?.state === "past" && booking.spoken) {
    const status = (booking.ghlStatus || "").toLowerCase();
    if (status === "showed" || status === "completed") {
      return `${who} I'm Maya. Hope the trial on ${booking.spoken} was a good visit. How did it go — any questions about next steps?`;
    }
    if (status === "noshow") {
      return `${who} I'm Maya. Looks like the trial on ${booking.spoken} didn't work out — totally fine. Want to pick a new time?`;
    }
    if (status === "cancelled" || status === "canceled" || status === "invalid") {
      return `${who} I'm Maya. I see the trial on ${booking.spoken} was cancelled. Happy to find a new time, or answer anything else.`;
    }
    return `${who} I'm Maya. Your last trial was ${booking.spoken} — that one's passed. Did you make it in, or would you like a new time?`;
  }

  const child = lead?.childName?.trim();
  if (child) {
    return `${who} I'm Maya. We can pick up on ${child} whenever you're ready — what would you like to talk about?`;
  }
  return `${who} I'm Maya. We can pick up where we left off — what would you like to talk about?`;
}
