import { siteConfig } from "./config";

export type CampOffering = {
  name: string;
  agesLabel: string;
  /** Minimum age for this camp (Ages 5+ → 5, Ages 8+ → 8, etc.). */
  minAge: number;
  dates: string;
  hours?: string;
  spotsLeft?: number;
};

const CAMPS_PAGE_URL = siteConfig.campsUrl;

/** Snapshot from steamoji.com/camps/wa-kirkland (Aug 2026) — used if live fetch fails. */
const FALLBACK_CAMPS: CampOffering[] = [
  {
    name: "Arduino in Action: Build, Code, Move!",
    agesLabel: "Ages 10+",
    minAge: 10,
    dates: "Aug 17 – Aug 21",
    hours: "9:00 AM – 3:00 PM",
  },
  {
    name: "RoboCity Builders: Lights, Bots & Big Ideas",
    agesLabel: "Ages 5+",
    minAge: 5,
    dates: "Aug 17 – Aug 21",
    hours: "9:00 AM – 3:00 PM",
  },
  {
    name: "LEGO® Robotics",
    agesLabel: "Ages 5+",
    minAge: 5,
    dates: "Aug 17 – Aug 21",
    hours: "9:00 AM – 3:00 PM",
  },
  {
    name: "Junior Robotics & Coding Madness Camp",
    agesLabel: "Ages 5+",
    minAge: 5,
    dates: "Aug 24 – Aug 28",
    hours: "9:00 AM – 3:00 PM",
  },
  {
    name: "Battle Bots: Engineer, Code, Compete!",
    agesLabel: "Ages 8+",
    minAge: 8,
    dates: "Aug 24 – Aug 28",
    hours: "9:00 AM – 3:00 PM",
  },
];

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseMinAge(label: string): number | null {
  const m = label.match(/Ages?\s*(\d+)\s*\+/i);
  if (m) return Number(m[1]);
  const range = label.match(/Ages?\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (range) return Number(range[1]);
  return null;
}

/** Parse the public Kirkland camps page HTML into structured offerings. */
export function parseCampsHtml(html: string): CampOffering[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const text = decodeHtml(cleaned);

  const camps: CampOffering[] = [];
  const re =
    /([A-Z][^|]{8,90}?)\s+Ages?\s*(\d+)\+\s+([A-Z][a-z]{2}\s+\d{1,2}\s*[-–]\s*[A-Z][a-z]{2}\s+\d{1,2})\s*\|\s*(\d{1,2}:\d{2}\s*[AP]M\s*[-–]\s*\d{1,2}:\d{2}\s*[AP]M)(?:\s*Camp Info\s*Register(?:\s*(\d+)\s*spots?\s*left)?)?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const rawName = m[1].trim();
    const cleanName =
      rawName.match(
        /((?:Arduino|RoboCity|LEGO®?|Junior|Battle)[^]*)$/i,
      )?.[1]?.trim() || rawName;
    const minAge = Number(m[2]);
    camps.push({
      name: cleanName,
      agesLabel: `Ages ${minAge}+`,
      minAge,
      dates: m[3].replace(/\s+/g, " ").trim(),
      hours: m[4].replace(/\s+/g, " ").trim(),
      spotsLeft: m[5] ? Number(m[5]) : undefined,
    });
  }

  // Dedupe by name+dates
  const seen = new Set<string>();
  const unique = camps.filter((c) => {
    const key = `${c.name}|${c.dates}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.length ? unique : FALLBACK_CAMPS;
}

export function campsForAge(
  camps: CampOffering[],
  age: number | null | undefined,
): CampOffering[] {
  if (age == null) return camps;
  return camps.filter((c) => age >= c.minAge);
}

export function formatCampsBrief(
  camps: CampOffering[],
  age?: number | null,
): string {
  const filtered = campsForAge(camps, age);
  if (!filtered.length) {
    return age != null
      ? `No listed Kirkland camps currently match age ${age}. Share ${CAMPS_PAGE_URL} and offer to help with another week/age.`
      : `No camp listings available right now. Point them to ${CAMPS_PAGE_URL}.`;
  }

  const ageNote =
    age != null
      ? `Filtered for a ${age}-year-old (Ages X+ means age ${age} qualifies if ${age} ≥ X).`
      : "Age unknown — ask age to filter, or show a short sample of upcoming weeks.";

  const lines = filtered.slice(0, 8).map((c) => {
    const spots =
      c.spotsLeft != null ? `; ~${c.spotsLeft} spots left` : "";
    const hours = c.hours ? `; ${c.hours}` : "";
    return `- ${c.name} (${c.agesLabel}) — ${c.dates}${hours}${spots}`;
  });

  return `Kirkland camps source: ${CAMPS_PAGE_URL}
${ageNote}
Typical week price ~$499–$599 depending on camp/age.
Upcoming:
${lines.join("\n")}
Suggest 1–3 age-fitting options from this list; link ${CAMPS_PAGE_URL} for register/info. Do not invent camps not listed.
${age != null ? `Do NOT re-ask or confirm age — they already said ${age}.` : ""}`;
}

let cached: { at: number; camps: CampOffering[] } | null = null;
const CACHE_MS = 15 * 60 * 1000;

export async function fetchKirklandCamps(): Promise<CampOffering[]> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.camps;

  try {
    const res = await fetch(CAMPS_PAGE_URL, {
      headers: { "User-Agent": "SteamojiMayaBot/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`camps http ${res.status}`);
    const html = await res.text();
    const camps = parseCampsHtml(html);
    cached = { at: now, camps };
    return camps;
  } catch {
    cached = { at: now, camps: FALLBACK_CAMPS };
    return FALLBACK_CAMPS;
  }
}

export async function buildCampsBrief(age?: number | null): Promise<string> {
  const camps = await fetchKirklandCamps();
  return formatCampsBrief(camps, age);
}

export function isCampQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bcamps?\b/.test(t) ||
    /\b(summer|spring|winter)\s*(break|camp)/.test(t) ||
    /\bschool'?s?\s*off\b/.test(t)
  );
}

/** Sync fallback brief for demo mode without awaiting network. */
export function fallbackCampsBrief(age?: number | null): string {
  return formatCampsBrief(FALLBACK_CAMPS, age);
}

export function parseCampMinAgeLabel(label: string) {
  return parseMinAge(label);
}
