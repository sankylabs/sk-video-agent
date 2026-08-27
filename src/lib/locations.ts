/**
 * Kirkland is this agent's academy. Sister sites are mentioned so parents
 * who live nearer another Steamoji can choose — we never shut Kirkland's door.
 */

export const PLACE_RE =
  /\b(kirkland|woodinville|clyde\s*hill|redmond|bellevue|seattle|bothell|kenmore|juanita|totem\s*lake|sammamish|issaquah|lynnwood|lynwood|newcastle|newport(?:\s+hills)?|klahanie)\b/i;

export type LocationLane =
  | "kirkland-fit"
  | "sister-bothell"
  | "sister-bellevue"
  | "sister-klahanie"
  | "sister-lynnwood"
  | "other";

const ACADEMIES = {
  kirkland: {
    name: "Steamoji Kirkland",
    url: "https://www.steamoji.com/wa-kirkland",
  },
  bothell: {
    name: "Steamoji Bothell",
    url: "https://www.steamoji.com/wa-bothell",
  },
  bellevue: {
    name: "Steamoji Bellevue",
    url: "https://www.steamoji.com/wa-bellevue",
  },
  newcastle: {
    name: "Steamoji Newcastle (Newport Hills area)",
    url: "https://www.steamoji.com/wa-newcastle",
  },
  klahanie: {
    name: "Steamoji Klahanie",
    url: "https://www.steamoji.com/wa-klahanie",
  },
  lynnwood: {
    name: "Steamoji Lynnwood",
    url: "https://www.steamoji.com/wa-lynnwood",
  },
} as const;

const LANE_MATCHES: { lane: Exclude<LocationLane, "other">; match: RegExp }[] = [
  {
    lane: "kirkland-fit",
    match: /\b(kirkland|woodinville|clyde\s*hill|juanita|totem\s*lake)\b/i,
  },
  { lane: "sister-bothell", match: /\bbothell\b/i },
  {
    lane: "sister-bellevue",
    match: /\b(bellevue|newcastle|newport(?:\s+hills)?)\b/i,
  },
  {
    lane: "sister-klahanie",
    match: /\b(sammamish|issaquah|klahanie)\b/i,
  },
  { lane: "sister-lynnwood", match: /\b(lynnwood|lynwood)\b/i },
];

export function classifyLocation(hint?: string): LocationLane {
  const text = hint?.trim();
  if (!text) return "other";
  for (const row of LANE_MATCHES) {
    if (row.match.test(text)) return row.lane;
  }
  return "other";
}

/** Static rules baked into Maya's system prompt (text + video PAL). */
export const locationRoutingKnowledge = `
## Location / other Steamoji academies (critical)
You represent **Steamoji Kirkland** (${ACADEMIES.kirkland.url}) at 355 Kirkland Avenue. Kirkland is a great home academy — especially Kirkland and Woodinville families, and anyone on the border who finds Kirkland easier. Always let the parent decide. Do not refuse a Kirkland visit or trial just because another academy is closer.

When they name a city that has (or is nearer) another Steamoji, mention that sister academy **in the same reply**, briefly, so they are aware — even if you still need to ask age. Then continue (ask age if unknown, or answer what they asked). Do not dump every location. Do not book another academy's calendar (you only book Kirkland). If they prefer the closer academy, share its page and stay helpful.

City → what to say:
- **Kirkland or Woodinville** (also Clyde Hill / Juanita / Totem Lake): good fit for Kirkland. No sister-location pitch needed.
- **Bothell**: there is already ${ACADEMIES.bothell.name} — ${ACADEMIES.bothell.url}. Kirkland is still welcome if they prefer it.
- **Bellevue** (and Newcastle / Newport Hills): there is already ${ACADEMIES.bellevue.name} (${ACADEMIES.bellevue.url}) and ${ACADEMIES.newcastle.name} (${ACADEMIES.newcastle.url}). Mention both so they know. Kirkland is still welcome — parent decides, especially on the border.
- **Sammamish or Issaquah**: there is already ${ACADEMIES.klahanie.name} in Sammamish — ${ACADEMIES.klahanie.url}. Kirkland is still welcome if they prefer it.
- **Lynnwood** (incl. "Lynwood"): there is already ${ACADEMIES.lynnwood.name} — ${ACADEMIES.lynnwood.url}. Kirkland is still welcome if they prefer it.
- Other / unclear town: ask if Kirkland is workable; do not invent academies.

If they ask "are there other locations?" share only the relevant nearby ones above, not a full franchise list.
`.trim();

/** Per-session hint so the model applies the right city this turn. */
export function locationSessionNote(hint?: string, locationKnown = false): string {
  const lane = classifyLocation(hint);
  const town = hint?.trim();
  if (!town) {
    if (locationKnown) {
      return `- Location: KNOWN (no specific town). Kirkland is welcome — parent decides. Do not re-ask unless clarifying.`;
    }
    return `- Location: UNKNOWN — ask where they live before suggesting a free trial.`;
  }

  const prefix = `- Location: KNOWN (${town}). Lane: ${lane}.`;
  switch (lane) {
    case "kirkland-fit":
      return `${prefix} Good fit for Steamoji Kirkland. Do not re-ask location. Do not mention sister academies unless they ask.`;
    case "sister-bothell":
      return `${prefix} In THIS reply mention ${ACADEMIES.bothell.name} once (${ACADEMIES.bothell.url}) so they know it exists — even if you still need to ask age. Kirkland is still an option — parent decides. Do not refuse Kirkland. Do not book Bothell.`;
    case "sister-bellevue":
      return `${prefix} In THIS reply mention ${ACADEMIES.bellevue.name} (${ACADEMIES.bellevue.url}) and ${ACADEMIES.newcastle.name} (${ACADEMIES.newcastle.url}) so they know both exist — even if you still need to ask age. Kirkland is still an option — parent decides (border families often pick whichever is easier). Do not refuse Kirkland. Do not book Bellevue/Newcastle.`;
    case "sister-klahanie":
      return `${prefix} In THIS reply mention ${ACADEMIES.klahanie.name} once (${ACADEMIES.klahanie.url}) so they know it exists — even if you still need to ask age. Kirkland is still an option — parent decides. Do not refuse Kirkland. Do not book Klahanie.`;
    case "sister-lynnwood":
      return `${prefix} In THIS reply mention ${ACADEMIES.lynnwood.name} once (${ACADEMIES.lynnwood.url}) so they know it exists — even if you still need to ask age. Kirkland is still an option — parent decides. Do not refuse Kirkland. Do not book Lynnwood.`;
    default:
      return `${prefix} Let them decide if Kirkland works. Do not invent another academy.`;
  }
}

/** Demo-mode (no OpenAI) reply when the parent names a town. */
export function demoLocationReply(
  hint: string | undefined,
  opts: { ageUnknown: boolean },
): string | null {
  const lane = classifyLocation(hint);
  if (!hint?.trim() || lane === "other") return null;
  const next = opts.ageUnknown ? " How old is your child?" : "";

  switch (lane) {
    case "kirkland-fit":
      return `Kirkland and Woodinville are a great fit for our Kirkland academy.${next}`;
    case "sister-bothell":
      return `Bothell already has ${ACADEMIES.bothell.name} (${ACADEMIES.bothell.url}) — Kirkland can still work if that's easier for you, totally your call.${next}`;
    case "sister-bellevue":
      return `Bellevue already has ${ACADEMIES.bellevue.name} (${ACADEMIES.bellevue.url}) and ${ACADEMIES.newcastle.name} (${ACADEMIES.newcastle.url}). Kirkland is still a great option if that's easier — especially if you're on the border. Totally your call.${next}`;
    case "sister-klahanie":
      return `Sammamish / Issaquah families often use ${ACADEMIES.klahanie.name} (${ACADEMIES.klahanie.url}). Kirkland can still work if that's easier for you — your call.${next}`;
    case "sister-lynnwood":
      return `Lynnwood already has ${ACADEMIES.lynnwood.name} (${ACADEMIES.lynnwood.url}). Kirkland can still work if that's easier for you — your call.${next}`;
    default:
      return null;
  }
}
