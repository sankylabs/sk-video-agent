/** Parse a child age from lead field or free text ("5", "he's 9", "five years old"). */
export function parseChildAge(text?: string | null): number | null {
  if (!text?.trim()) return null;
  const t = text.trim().toLowerCase();

  const wordMap: Record<string, number> = {
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
    four: 4,
    three: 3,
  };

  for (const [word, n] of Object.entries(wordMap)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return n;
  }

  const m = t.match(/\b(1[0-8]|[1-9])\b/);
  if (m) return Number(m[1]);
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
  const who = lead?.name ? `Hi ${lead.name}!` : "Hi there!";
  const age = parseChildAge(lead?.childAge);

  if (age != null && age >= 5 && age <= 14) {
    const explore = lead?.childName?.trim()
      ? `we're excited you're exploring Steamoji for ${lead.childName.trim()}, your ${age}-year-old`
      : `we're excited you're exploring Steamoji for your ${age}-year-old`;
    return `${who} I'm Maya, an AI enrollment advisor at Steamoji Kirkland — ${explore}. What questions can I help with?`;
  }

  if (age != null) {
    return `${who} I'm Maya at Steamoji Kirkland. ${ageAffirmation(age)} Is there another child in the 5–14 range?`;
  }

  return `${who} I'm Maya, an AI enrollment advisor at Steamoji Kirkland. To start with, let me understand how old your child is?`;
};
