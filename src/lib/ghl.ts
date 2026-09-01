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
  /** Booking must have email; lead-link creation may use phone only. */
  requireEmail?: boolean;
}): Promise<{ contactId: string }> {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");

  const email = input.email?.trim();
  const phone = input.phone?.trim();
  const requireEmail = input.requireEmail !== false;
  if (requireEmail && !email) {
    throw new Error("GHL booking needs a parent email on the lead");
  }
  if (!email && !phone) {
    throw new Error("GHL contact needs an email or phone");
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

export async function createGhlContactNote(contactId: string, body: string) {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");
  return ghlJson(config, `/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function sendGhlEmail(input: {
  contactId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");
  return ghlJson(config, "/conversations/messages", {
    method: "POST",
    body: JSON.stringify({
      type: "Email",
      contactId: input.contactId,
      subject: input.subject,
      html: input.html,
      message: input.text,
      emailTo: input.to,
    }),
  });
}

export type GhlContactProfile = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  tags?: string[];
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
  opportunityStage?: string;
  interestedInTrial?: string;
  crmNotes?: string;
};

export async function getGhlContact(
  contactId: string,
): Promise<GhlContactProfile | null> {
  const config = getGhlConfig();
  if (!config || !contactId.trim()) return null;
  try {
    const [raw, defs, noteBodies] = await Promise.all([
      ghlJson<Record<string, unknown>>(
        config,
        `/contacts/${contactId.trim()}`,
      ),
      listCustomFieldDefs(config),
      listContactNoteBodies(config, contactId.trim()),
    ]);
    const contact =
      raw.contact && typeof raw.contact === "object"
        ? (raw.contact as Record<string, unknown>)
        : raw;
    const id =
      (typeof contact.id === "string" && contact.id) || contactId.trim();
    const first = typeof contact.firstName === "string" ? contact.firstName : "";
    const last = typeof contact.lastName === "string" ? contact.lastName : "";
    const name =
      (typeof contact.name === "string" && contact.name.trim()) ||
      [first, last].filter(Boolean).join(" ").trim() ||
      undefined;
    const email =
      typeof contact.email === "string" && contact.email.trim()
        ? contact.email.trim()
        : undefined;
    const phone =
      typeof contact.phone === "string" && contact.phone.trim()
        ? contact.phone.trim()
        : undefined;
    const city =
      typeof contact.city === "string" && contact.city.trim()
        ? contact.city.trim()
        : undefined;
    const tags = Array.isArray(contact.tags)
      ? contact.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : undefined;
    const crm = pickCrmFields(contact.customFields, defs);
    const crmNotes = noteBodies.length
      ? noteBodies.slice(0, 8).join("\n---\n").slice(0, 2000)
      : undefined;
    return { id, name, email, phone, city, tags, crmNotes, ...crm };
  } catch (err) {
    console.error("[ghl] get contact failed", contactId, err);
    return null;
  }
}

const KNOWN_FIELDS = {
  childName: process.env.GHL_CHILD_NAME_FIELD_ID || "YSjpyfW9xm77APzYjITK",
  childAge: process.env.GHL_CHILD_AGE_FIELD_ID || "YxAQfvzJ3IxJsZURBgeB",
  childAgeOption:
    process.env.GHL_CHILD_AGE_OPTION_FIELD_ID || "ojHAFq1FNL3893RuzUgJ",
  childGrade: process.env.GHL_CHILD_GRADE_FIELD_ID || "3GAXJRumyNSPMcjnOgQv",
  childSchool: process.env.GHL_CHILD_SCHOOL_FIELD_ID || "uisiNe0TOI1CpjROMMHN",
  resideWhere: process.env.GHL_RESIDE_WHERE_FIELD_ID || "IrX54oEXgKPvjaC9lI6A",
  resideKirkland:
    process.env.GHL_RESIDE_KIRKLAND_FIELD_ID || "iWpHUu2NiMSFvAMAuTtv",
  opportunityStage:
    process.env.GHL_OPPORTUNITY_STAGE_FIELD_ID || "p1tJpZhV6ewESEojYM3J",
  interestedInTrial:
    process.env.GHL_FREE_SESSION_FIELD_ID || "70e0YTRiNid7aeZEoHr7",
};

type FieldDef = { id: string; name: string };

let fieldDefCache: FieldDef[] | null = null;

async function listCustomFieldDefs(config: GhlConfig): Promise<FieldDef[]> {
  if (fieldDefCache) return fieldDefCache;
  try {
    const raw = await ghlJson<{ customFields?: { id?: string; name?: string }[] }>(
      config,
      `/locations/${config.locationId}/customFields`,
    );
    fieldDefCache = (raw.customFields || [])
      .filter((f): f is { id: string; name: string } =>
        Boolean(f.id && f.name),
      )
      .map((f) => ({ id: f.id, name: f.name }));
  } catch (err) {
    console.error("[ghl] custom fields list failed", err);
    fieldDefCache = [];
  }
  return fieldDefCache;
}

async function listContactNoteBodies(
  config: GhlConfig,
  contactId: string,
): Promise<string[]> {
  try {
    const raw = await ghlJson<{ notes?: { body?: string; bodyText?: string }[] }>(
      config,
      `/contacts/${contactId}/notes`,
    );
    return (raw.notes || [])
      .map((n) => (n.bodyText || n.body || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function customFieldValue(fields: unknown, fieldId: string): string | undefined {
  if (!fieldId || !Array.isArray(fields)) return undefined;
  const hit = fields.find(
    (f) => f && typeof f === "object" && (f as { id?: string }).id === fieldId,
  ) as { value?: unknown } | undefined;
  if (hit?.value == null) return undefined;
  if (typeof hit.value === "string" && hit.value.trim()) return hit.value.trim();
  if (typeof hit.value === "number" && Number.isFinite(hit.value)) {
    return String(hit.value);
  }
  if (Array.isArray(hit.value)) {
    const joined = hit.value.map(String).filter(Boolean).join(", ");
    return joined || undefined;
  }
  return undefined;
}

function firstValue(fields: unknown, ids: string[]): string | undefined {
  for (const id of ids) {
    const v = customFieldValue(fields, id);
    if (v) return v;
  }
  return undefined;
}

function idsNamed(defs: FieldDef[], re: RegExp): string[] {
  return defs.filter((d) => re.test(d.name)).map((d) => d.id);
}

function pickCrmFields(
  customFields: unknown,
  defs: FieldDef[],
): Omit<GhlContactProfile, "id" | "name" | "email" | "phone" | "city" | "tags" | "crmNotes"> {
  return {
    childName: firstValue(customFields, [
      KNOWN_FIELDS.childName,
      ...idsNamed(defs, /^child name$/i),
    ]),
    childAge: firstValue(customFields, [
      KNOWN_FIELDS.childAge,
      KNOWN_FIELDS.childAgeOption,
      ...idsNamed(defs, /^child age( option)?$/i),
    ]),
    childGrade: firstValue(customFields, [
      KNOWN_FIELDS.childGrade,
      ...idsNamed(defs, /child grade/i),
    ]),
    childSchool: firstValue(customFields, [
      KNOWN_FIELDS.childSchool,
      ...idsNamed(defs, /child school/i),
    ]),
    location: firstValue(customFields, [
      KNOWN_FIELDS.resideWhere,
      ...idsNamed(defs, /reside where|where do you (live|reside)|city of residence/i),
    ]),
    resideKirkland: firstValue(customFields, [
      KNOWN_FIELDS.resideKirkland,
      ...idsNamed(defs, /kirkland/i),
    ]),
    opportunityStage: firstValue(customFields, [
      KNOWN_FIELDS.opportunityStage,
      ...idsNamed(defs, /opportunity stage/i),
    ]),
    interestedInTrial: firstValue(customFields, [
      KNOWN_FIELDS.interestedInTrial,
      ...idsNamed(defs, /interested in a free session/i),
    ]),
    childName2: firstValue(customFields, [
      ...idsNamed(defs, /child (name\s*)?2|second child|sibling( name)?$/i),
    ]),
    childAge2: firstValue(customFields, [
      ...idsNamed(defs, /child (age\s*)?2|sibling age/i),
    ]),
    childName3: firstValue(customFields, [
      ...idsNamed(defs, /child (name\s*)?3|third child/i),
    ]),
    childAge3: firstValue(customFields, [
      ...idsNamed(defs, /child (age\s*)?3/i),
    ]),
  };
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
    startTime?: string;
    endTime?: string;
  },
): Promise<unknown> {
  const config = getGhlConfig();
  if (!config) throw new Error("GHL is not configured");

  return ghlJson(config, `/calendars/events/appointments/${appointmentId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function cancelGhlAppointment(appointmentId: string) {
  return updateGhlAppointment(appointmentId, {
    appointmentStatus: "cancelled",
    toNotify: true,
  });
}

export type GhlAppointmentStatus =
  | "new"
  | "confirmed"
  | "cancelled"
  | "canceled"
  | "showed"
  | "noshow"
  | "no_show"
  | "invalid"
  | "completed"
  | "active";

export type GhlAppointment = {
  id?: string;
  appointmentStatus?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  contactId?: string;
};

function pickAppointment(raw: unknown): GhlAppointment | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const event =
    rec.event && typeof rec.event === "object"
      ? (rec.event as Record<string, unknown>)
      : rec.appointment && typeof rec.appointment === "object"
        ? (rec.appointment as Record<string, unknown>)
        : rec;
  const id =
    (typeof event.id === "string" && event.id) ||
    (typeof event.appointmentId === "string" && event.appointmentId) ||
    undefined;
  const appointmentStatus =
    typeof event.appointmentStatus === "string"
      ? event.appointmentStatus
      : typeof rec.appointmentStatus === "string"
        ? rec.appointmentStatus
        : undefined;
  const startTime =
    typeof event.startTime === "string"
      ? event.startTime
      : typeof rec.startTime === "string"
        ? rec.startTime
        : undefined;
  return {
    id,
    appointmentStatus,
    startTime,
    endTime: typeof event.endTime === "string" ? event.endTime : undefined,
    title: typeof event.title === "string" ? event.title : undefined,
    contactId:
      typeof event.contactId === "string" ? event.contactId : undefined,
  };
}

export async function getGhlAppointment(
  appointmentId: string,
): Promise<GhlAppointment | null> {
  const config = getGhlConfig();
  if (!config || !appointmentId.trim()) return null;
  try {
    const raw = await ghlJson<unknown>(
      config,
      `/calendars/events/appointments/${appointmentId.trim()}`,
    );
    return pickAppointment(raw);
  } catch (err) {
    console.error("[ghl] get appointment failed", appointmentId, err);
    return null;
  }
}

/** Fallback when the lead has a contact id but no stored appointment id. */
export async function listGhlAppointmentsForContact(
  contactId: string,
): Promise<GhlAppointment[]> {
  const config = getGhlConfig();
  if (!config || !contactId.trim()) return [];
  try {
    const raw = await ghlJson<unknown>(
      config,
      `/contacts/${contactId.trim()}/appointments`,
    );
    const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(rec.events)
        ? rec.events
        : Array.isArray(rec.appointments)
          ? rec.appointments
          : [];
    return list
      .map((item) => pickAppointment(item))
      .filter((a): a is GhlAppointment => Boolean(a?.id || a?.appointmentStatus));
  } catch (err) {
    console.error("[ghl] list contact appointments failed", contactId, err);
    return [];
  }
}

export function normalizeGhlAppointmentStatus(
  status?: string | null,
): GhlAppointmentStatus | undefined {
  if (!status?.trim()) return undefined;
  const s = status.trim().toLowerCase().replace(/[\s-]+/g, "");
  if (s === "canceled") return "cancelled";
  if (s === "noshow" || s === "no_show") return "noshow";
  if (
    s === "new" ||
    s === "confirmed" ||
    s === "cancelled" ||
    s === "showed" ||
    s === "invalid" ||
    s === "completed" ||
    s === "active"
  ) {
    return s as GhlAppointmentStatus;
  }
  return undefined;
}

export function ghlEndIso(startIso: string, sessionMinutes = 30) {
  return addMinutesToIso(startIso, sessionMinutes);
}
