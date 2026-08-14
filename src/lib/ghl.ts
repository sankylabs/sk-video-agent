/**
 * GoHighLevel (LeadConnector) calendar + contacts client.
 * Availability and booking use GHL_CALENDAR_ID (default: Kirkland free-session calendar).
 */

const BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";
const DEFAULT_CALENDAR_ID = "m4L3dVKB7UyCfPFjQpK1";
const TIMEZONE = "America/Los_Angeles";

export type GhlConfig = {
  apiKey: string;
  locationId: string;
  calendarId: string;
};

export function getGhlConfig(): GhlConfig | null {
  const apiKey = (
    process.env.GHL_API_KEY ||
    process.env.GHL_PRIVATE_TOKEN ||
    process.env.GHL_PIT ||
    ""
  ).trim();
  const locationId = (process.env.GHL_LOCATION_ID || "").trim();
  const calendarId = (
    process.env.GHL_CALENDAR_ID ||
    DEFAULT_CALENDAR_ID
  ).trim();
  if (!apiKey || !locationId) return null;
  return { apiKey, locationId, calendarId };
}

export function isGhlCalendarEnabled() {
  return getGhlConfig() != null;
}

async function ghlFetch(
  config: GhlConfig,
  pathname: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> },
) {
  const url = new URL(pathname, BASE_URL);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const { query: _q, ...rest } = init || {};
  return fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Version: API_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(rest.headers || {}),
    },
  });
}

async function ghlJson<T = unknown>(
  config: GhlConfig,
  pathname: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> },
): Promise<T> {
  const res = await ghlFetch(config, pathname, init);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : text.slice(0, 300) || res.statusText;
    throw new Error(`GHL ${res.status}: ${msg}`);
  }
  return data as T;
}

/** Wall-clock BOOK id from a GHL ISO slot, e.g. 2026-08-15T10:00:00-07:00 → 2026-08-15T10:00 */
export function ghlIsoToLocalStart(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso.slice(0, 16);
  return `${m[1]}T${m[2]}:${m[3]}`;
}

function addMinutesToIso(iso: string, minutes: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Date(d.getTime() + minutes * 60_000).toISOString();
}

/**
 * Free slots from GHL, chunked (API max ~31 days per request).
 * Returns ISO start times with Pacific offset as returned by GHL.
 */
export async function fetchGhlFreeSlotIsos(
  daysAhead = 14,
  timezone = TIMEZONE,
): Promise<string[]> {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");

  const now = Date.now();
  const endMs = now + Math.max(1, daysAhead) * 24 * 60 * 60 * 1000;
  const chunkMs = 30 * 24 * 60 * 60 * 1000;
  const isos: string[] = [];

  for (let start = now; start < endMs; start += chunkMs) {
    const end = Math.min(start + chunkMs, endMs);
    const raw = await ghlJson<Record<string, unknown>>(
      config,
      `/calendars/${config.calendarId}/free-slots`,
      {
        query: {
          startDate: start,
          endDate: end,
          timezone,
        },
      },
    );

    for (const [key, value] of Object.entries(raw)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const list = Array.isArray(value)
        ? value
        : value &&
            typeof value === "object" &&
            Array.isArray((value as { slots?: unknown }).slots)
          ? (value as { slots: unknown[] }).slots
          : [];
      for (const item of list) {
        if (typeof item === "string") isos.push(item);
        else if (
          item &&
          typeof item === "object" &&
          typeof (item as { startTime?: unknown }).startTime === "string"
        ) {
          isos.push((item as { startTime: string }).startTime);
        }
      }
    }
  }

  return [...new Set(isos)].sort();
}

export async function upsertGhlContact(input: {
  name?: string;
  email?: string;
  phone?: string;
}): Promise<{ contactId: string }> {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");

  const email = input.email?.trim();
  const phone = input.phone?.trim();
  if (!email && !phone) {
    throw new Error("GHL booking needs a parent email or phone on the lead");
  }

  const body: Record<string, string> = {
    locationId: config.locationId,
  };
  if (input.name?.trim()) body.name = input.name.trim();
  if (email) body.email = email;
  if (phone) body.phone = phone;

  const data = await ghlJson<{
    contact?: { id?: string };
    id?: string;
  }>(config, "/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const contactId = data.contact?.id || data.id;
  if (!contactId) throw new Error("GHL upsert did not return a contact id");
  return { contactId };
}

export async function createGhlAppointment(input: {
  contactId: string;
  startTime: string;
  title?: string;
  /** Public calendar/invite description — keep empty for parent-facing invites. */
  description?: string;
  toNotify?: boolean;
}): Promise<{ appointmentId?: string; raw: unknown }> {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");

  const payload: Record<string, unknown> = {
    calendarId: config.calendarId,
    locationId: config.locationId,
    contactId: input.contactId,
    startTime: input.startTime,
    title: input.title || "Steamoji Free Session",
    appointmentStatus: "confirmed",
    toNotify: input.toNotify !== false,
  };
  // Only set description when explicitly provided (never put private notes here).
  if (typeof input.description === "string") {
    payload.description = input.description;
  }

  const raw = await ghlJson<Record<string, unknown>>(
    config,
    "/calendars/events/appointments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  const appointmentId =
    (typeof raw.id === "string" && raw.id) ||
    (typeof raw.appointmentId === "string" && raw.appointmentId) ||
    (raw.appointment &&
    typeof raw.appointment === "object" &&
    typeof (raw.appointment as { id?: unknown }).id === "string"
      ? (raw.appointment as { id: string }).id
      : undefined);

  return { appointmentId, raw };
}

/** Internal HighLevel note — not shown on external calendar invites. */
export async function createGhlAppointmentNote(
  appointmentId: string,
  body: string,
): Promise<unknown> {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");

  return ghlJson(config, `/calendars/appointments/${appointmentId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function updateGhlAppointment(
  appointmentId: string,
  patch: {
    title?: string;
    description?: string;
    appointmentStatus?: string;
    toNotify?: boolean;
  },
): Promise<unknown> {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");

  return ghlJson(config, `/calendars/events/appointments/${appointmentId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function ghlEndIso(startIso: string, sessionMinutes = 30) {
  return addMinutesToIso(startIso, sessionMinutes);
}
