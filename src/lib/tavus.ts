import { promises as fs } from "fs";
import path from "path";
import { siteConfig } from "./config";
import { buildCampsBrief } from "./camps";
import { buildMayaSystemPrompt } from "./maya-persona";
import { mayaGreeting, mayaReturningGreeting } from "./greeting";
import { resolveBookingStatus } from "./memory";
import { getTavusApiKey } from "./runtime-secrets";
import { buildAvailabilityBrief } from "./schedule";
import { inferQualifyContext, isTrialQualified, isValidParentEmail, trialQualifyGap } from "./qualify";
import { locationSessionNote } from "./locations";
import { tavusMaxCallDurationSec } from "./call-timeout";

/** Default Maya face (Tavus face / replica id). */
export const STOCK_FEMALE_FACE_ID = "r9d30b0e55ac";
/** Tavus stock Sales Development Rep PAL — reliable on most accounts. */
export const STOCK_SALES_PAL_ID = "pcb7a34da5fe";

/** Bump when PAL layers / face / interrupt settings change so we refresh cached PAL. */
const PAL_CONFIG_VERSION = 28;

type LeadLike = {
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
  conversation?: { role: "user" | "assistant"; content: string }[];
};

type CachedPal = {
  palId: string;
  faceId: string;
  createdAt: string;
  version?: number;
};

const cacheFile = path.join(process.cwd(), ".data", "tavus-pal.json");

const conversationalFlowLayer = {
  /** Sparrow-2 becomes Tavus default on Sept 4, 2026 — opt in now. */
  turn_detection_model: "sparrow-2",
  turn_taking_patience: "medium",
  /** Stop talking when the parent starts speaking. */
  pal_interruptibility: "high",
  replica_interruptibility: "high",
  /** Unused by sparrow-2; kept if a fallback PAL still runs sparrow-1. */
  voice_isolation: "near",
  idle_engagement: "eager",
};

export function normalizeApiKey(key: string) {
  return key.trim().replace(/^["']|["']$/g, "");
}

function apiKeyOrThrow() {
  const key = getTavusApiKey();
  if (!key) throw new Error("Missing TAVUS_API_KEY");
  return key;
}

function extractError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string" && d.message) return d.message;
  if (typeof d.error === "string" && d.error) return d.error;
  if (d.error && typeof d.error === "object") {
    const inner = d.error as Record<string, unknown>;
    if (typeof inner.message === "string") return inner.message;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return fallback;
  }
}

async function readCachedPal(): Promise<CachedPal | null> {
  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    return JSON.parse(raw) as CachedPal;
  } catch {
    return null;
  }
}

async function writeCachedPal(pal: CachedPal) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(pal, null, 2), "utf8");
}

export async function clearCachedPal() {
  await fs.unlink(cacheFile).catch(() => undefined);
}

async function tavusFetch(pathname: string, init?: RequestInit) {
  const key = apiKeyOrThrow();
  const res = await fetch(`https://tavusapi.com${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function palBody(faceId: string, systemPrompt: string) {
  return {
    pal_name: `${siteConfig.personaName} — ${siteConfig.brand}`,
    system_prompt: systemPrompt,
    pipeline_mode: "full",
    default_face_id: faceId,
    layers: {
      conversational_flow: conversationalFlowLayer,
    },
  };
}

/** Best-effort custom Maya PAL; falls back to stock sales PAL. */
export async function ensureMayaPal(): Promise<CachedPal> {
  const envPal = process.env.TAVUS_PAL_ID;
  const faceId =
    process.env.TAVUS_FACE_ID ||
    process.env.TAVUS_REPLICA_ID ||
    STOCK_FEMALE_FACE_ID;

  if (envPal) {
    return {
      palId: envPal,
      faceId,
      createdAt: new Date().toISOString(),
      version: PAL_CONFIG_VERSION,
    };
  }

  const cached = await readCachedPal();
  const systemPrompt = buildMayaSystemPrompt();

  if (cached?.palId && cached.version === PAL_CONFIG_VERSION) {
    return cached;
  }

  // Refresh interrupt settings / prompt on an existing PAL when possible.
  if (cached?.palId) {
    const patched = await tavusFetch(`/v2/pals/${cached.palId}`, {
      method: "PATCH",
      body: JSON.stringify(palBody(faceId, systemPrompt)),
    });
    if (patched.res.ok) {
      const saved = {
        palId: cached.palId,
        faceId,
        createdAt: new Date().toISOString(),
        version: PAL_CONFIG_VERSION,
      };
      await writeCachedPal(saved);
      return saved;
    }
  }

  const palResult = await tavusFetch("/v2/pals", {
    method: "POST",
    body: JSON.stringify(palBody(faceId, systemPrompt)),
  });

  if (palResult.res.ok) {
    const palId = palResult.data.pal_id || palResult.data.persona_id;
    if (palId) {
      const saved = {
        palId,
        faceId,
        createdAt: new Date().toISOString(),
        version: PAL_CONFIG_VERSION,
      };
      await writeCachedPal(saved);
      return saved;
    }
  }

  const personaResult = await tavusFetch("/v2/personas", {
    method: "POST",
    body: JSON.stringify({
      persona_name: `${siteConfig.personaName} — ${siteConfig.brand}`,
      system_prompt: systemPrompt,
      pipeline_mode: "full",
      default_replica_id: faceId,
      layers: {
        conversational_flow: conversationalFlowLayer,
      },
    }),
  });

  if (personaResult.res.ok) {
    const palId =
      personaResult.data.persona_id || personaResult.data.pal_id;
    if (palId) {
      const saved = {
        palId,
        faceId,
        createdAt: new Date().toISOString(),
        version: PAL_CONFIG_VERSION,
      };
      await writeCachedPal(saved);
      return saved;
    }
  }

  return {
    palId: STOCK_SALES_PAL_ID,
    faceId,
    createdAt: new Date().toISOString(),
    version: PAL_CONFIG_VERSION,
  };
}

async function tryCreateConversation(payload: Record<string, unknown>) {
  return tavusFetch("/v2/conversations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createLivingConversation(lead?: LeadLike | null) {
  const { palId, faceId } = await ensureMayaPal();
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
  } Keep them comfortable; answer what they ask without repeatedly inviting more questions; only then soft-invite trial and offer mixed open times from the availability list (not Saturday-only).

## CALL LENGTH
Live video lasts at most 3 minutes. Around 2 minutes, a check-in may be spoken for you if they have gone quiet. If they stay silent, a wrap-up will be spoken and the call will end — they can reconnect to continue. If they reply, keep helping until the 3-minute limit. Do not announce the time limit unless they ask.

## KNOWN QUALIFICATION SO FAR
- Child age: ${qualify.age != null ? String(qualify.age) : "UNKNOWN"}
${locationSessionNote(qualify.locationHint, qualify.locationKnown)}
- Parent email: ${
    emailKnown
      ? `KNOWN (${qualify.email || lead?.email}) — do not re-ask`
      : "UNKNOWN — required before booking; ask when they confirm a slot"
  }
- Free-trial ready: ${isTrialQualified(qualify) ? "YES" : `NO — ${trialQualifyGap(qualify)}`}

## Talking to a person
If they want a human / staff / "who can I talk to": offer that someone from the Steamoji Kirkland team can reach out. Say they can also call ${siteConfig.phone}. Do not invent a staff name. Never say [OFFER_REACH_OUT] or [REACH_OUT] out loud.

## LIVE FREE-SESSION AVAILABILITY (use for booking only when trial-ready)
When they confirm an open slot and parent email is known, end your reply with [BOOK:YYYY-MM-DDTHH:mm] (do not pronounce BOOK or the brackets). The app uses that tag to write the GHL appointment — spoken confirmation alone does not book.
If they already have an upcoming trial and want a different time, [BOOK:] the NEW slot (that replaces the old one). If they want to cancel without a new time, end with [CANCEL:] (do not pronounce CANCEL or the brackets).
If the child is outside ages 5–14, end with [UNQUALIFIED:age]. If they are outside Kirkland and say it is too far / they will use a closer Steamoji, end with [UNQUALIFIED:distance]. Do not pronounce those tags.
${brief}

## LIVE KIRKLAND CAMPS (use when they ask about camps)
${campsBrief}
`;

  const shared = {
    conversation_name: `${siteConfig.brand} — ${siteConfig.personaName}`,
    conversational_context: context,
    custom_greeting: greeting,
    properties: {
      max_call_duration: tavusMaxCallDurationSec(),
      participant_left_timeout: 45,
      participant_absent_timeout: 90,
      language: "english",
    },
  };

  const attempts: Record<string, unknown>[] = [
    { ...shared, pal_id: palId, face_id: faceId },
    { ...shared, persona_id: palId, replica_id: faceId },
    {
      ...shared,
      pal_id: STOCK_SALES_PAL_ID,
      face_id: STOCK_FEMALE_FACE_ID,
    },
    {
      ...shared,
      persona_id: STOCK_SALES_PAL_ID,
      replica_id: STOCK_FEMALE_FACE_ID,
    },
    { ...shared, face_id: STOCK_FEMALE_FACE_ID },
    { ...shared, replica_id: STOCK_FEMALE_FACE_ID },
  ];

  const errors: string[] = [];

  for (const payload of attempts) {
    const { res, data } = await tryCreateConversation(payload);
    if (res.ok && data.conversation_url) {
      return {
        conversationId: data.conversation_id as string,
        conversationUrl: data.conversation_url as string,
        faceId,
        palId,
      };
    }
    errors.push(`${res.status}: ${extractError(data, "unknown error")}`);
  }

  await clearCachedPal();

  throw new Error(
    `Tavus could not start a living video call. ${errors[0] || "Unknown error"}${
      errors[1] ? ` | Also tried: ${errors[1]}` : ""
    }. Check that your key has Conversational Video access and available credits at https://maker.tavus.io`,
  );
}

export async function endLivingConversation(conversationId: string) {
  const key = getTavusApiKey();
  if (!key || !conversationId) return;
  await fetch(`https://tavusapi.com/v2/conversations/${conversationId}/end`, {
    method: "POST",
    headers: { "x-api-key": key },
  }).catch(() => undefined);
}

export async function verifyTavusKey(key: string) {
  const normalized = normalizeApiKey(key);
  const attempts = [
    "/v2/faces?face_type=system&limit=1",
    "/v2/replicas?replica_type=system&limit=1",
    "/v2/pals?limit=1",
  ];

  let lastStatus = 0;
  let lastBody: unknown = null;

  for (const pathName of attempts) {
    const res = await fetch(`https://tavusapi.com${pathName}`, {
      headers: { "x-api-key": normalized },
    });
    lastStatus = res.status;
    lastBody = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true as const, key: normalized };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false as const,
        status: res.status,
        error: extractError(
          lastBody,
          "API key rejected. Copy the full key again from PAL Maker → API Key.",
        ),
      };
    }
  }

  return {
    ok: false as const,
    status: lastStatus,
    error: extractError(
      lastBody,
      `Could not verify key (HTTP ${lastStatus || "?"} ). Use the key from https://maker.tavus.io/dev/api-keys`,
    ),
  };
}
