import { nanoid } from "nanoid";
import { promises as fs } from "fs";
import path from "path";
import {
  conversationKey,
  loadConversation,
  saveConversation,
} from "./conversations";
import { getGhlContact, isGhlCalendarEnabled, upsertGhlContact, type GhlContactProfile } from "./ghl";

export type LeadMessage = { role: "user" | "assistant"; content: string };

export type Lead = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  childName?: string;
  childAge?: string;
  childName2?: string;
  childAge2?: string;
  childName3?: string;
  childAge3?: string;
  childSchool?: string;
  childGrade?: string;
  /** Town / "where do you reside" from GHL. */
  location?: string;
  resideKirkland?: string;
  city?: string;
  tags?: string[];
  opportunityStage?: string;
  interestedInTrial?: string;
  /** GHL contact notes (CRM), not the Maya chat transcript. */
  crmNotes?: string;
  notes?: string;
  ghlContactId?: string;
  /** Slot the parent confirmed while we still needed their email. */
  pendingBookStart?: string;
  /** Confirmed trial start as YYYY-MM-DDTHH:mm Pacific. */
  bookedStart?: string;
  bookedLabel?: string;
  ghlAppointmentId?: string;
  /** Last time Maya asked Kirkland staff to reach out to this parent. */
  staffOutreachAt?: string;
  /** Loaded from Postgres (not written to leads.json). */
  conversation?: LeadMessage[];
  lastOpenedAt?: string;
  createdAt: string;
};

const dataDir = path.join(process.cwd(), ".data");
const leadsFile = path.join(dataDir, "leads.json");

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(leadsFile);
  } catch {
    await fs.writeFile(leadsFile, "[]", "utf8");
  }
}

function stripConversation(lead: Lead): Lead {
  const { conversation: _c, ...rest } = lead;
  return rest;
}

async function readAll(): Promise<Lead[]> {
  await ensureStore();
  const raw = await fs.readFile(leadsFile, "utf8");
  try {
    return JSON.parse(raw) as Lead[];
  } catch {
    return [];
  }
}

async function writeAll(leads: Lead[]) {
  await ensureStore();
  await fs.writeFile(
    leadsFile,
    JSON.stringify(leads.map(stripConversation), null, 2),
    "utf8",
  );
}

function findInStore(leads: Lead[], id: string): Lead | undefined {
  return (
    leads.find((l) => l.id === id) ||
    leads.find((l) => l.ghlContactId === id)
  );
}

async function attachConversation(lead: Lead): Promise<Lead> {
  const stored = await loadConversation(conversationKey(lead));
  if (stored.length) {
    return { ...lead, conversation: stored };
  }
  // One-time migrate off leads.json if an old record still had transcript inline.
  if (lead.conversation?.length) {
    await saveConversation(conversationKey(lead), lead.conversation);
    return lead;
  }
  return { ...lead, conversation: [] };
}

async function resolveContactId(input: Partial<Lead>): Promise<string> {
  const provided = (input.ghlContactId || input.id || "").trim();
  if (provided) return provided;

  if (isGhlCalendarEnabled() && (input.email?.trim() || input.phone?.trim())) {
    const { contactId } = await upsertGhlContact({
      name: input.name,
      email: input.email,
      phone: input.phone,
      requireEmail: false,
    });
    return contactId;
  }

  return nanoid(10);
}

export async function createLead(
  input: Omit<Lead, "id" | "createdAt"> & { id?: string },
): Promise<Lead> {
  const leads = await readAll();
  const id = await resolveContactId(input);
  const existing = findInStore(leads, id);
  const next: Lead = {
    ...(existing ?? {}),
    ...input,
    id: existing?.id || id,
    ghlContactId: existing?.ghlContactId || id,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  if (existing) {
    const idx = leads.findIndex((l) => l.id === existing.id || l.ghlContactId === id);
    leads[idx] = stripConversation({ ...leads[idx], ...next });
  } else {
    leads.push(stripConversation(next));
  }
  await writeAll(leads);

  if (input.conversation?.length) {
    await saveConversation(conversationKey(next), input.conversation);
  }
  return attachConversation(next);
}

function firstFilled(...vals: (string | undefined)[]) {
  return vals.find((v) => v?.trim())?.trim();
}

function mergeGhlIntoLead(lead: Lead, ghl: GhlContactProfile): Partial<Lead> {
  return {
    name: firstFilled(lead.name, ghl.name),
    email: firstFilled(lead.email, ghl.email),
    phone: firstFilled(lead.phone, ghl.phone),
    childName: firstFilled(lead.childName, ghl.childName),
    childAge: firstFilled(lead.childAge, ghl.childAge),
    childName2: firstFilled(lead.childName2, ghl.childName2),
    childAge2: firstFilled(lead.childAge2, ghl.childAge2),
    childName3: firstFilled(lead.childName3, ghl.childName3),
    childAge3: firstFilled(lead.childAge3, ghl.childAge3),
    childSchool: firstFilled(lead.childSchool, ghl.childSchool),
    childGrade: firstFilled(lead.childGrade, ghl.childGrade),
    location: firstFilled(lead.location, ghl.location, ghl.city),
    resideKirkland: firstFilled(lead.resideKirkland, ghl.resideKirkland),
    city: firstFilled(lead.city, ghl.city),
    opportunityStage: firstFilled(lead.opportunityStage, ghl.opportunityStage),
    interestedInTrial: firstFilled(lead.interestedInTrial, ghl.interestedInTrial),
    crmNotes: firstFilled(lead.crmNotes, ghl.crmNotes),
    tags: lead.tags?.length ? lead.tags : ghl.tags,
  };
}

export async function getLead(id: string): Promise<Lead | null> {
  const key = id.trim();
  if (!key) return null;
  const leads = await readAll();
  const found = findInStore(leads, key);
  if (found) {
    const lead = await attachConversation(found);
    return mergeLatestGhlProfile(lead);
  }

  const ghl = await getGhlContact(key);
  if (!ghl) return null;

  return createLead({
    id: ghl.id,
    ghlContactId: ghl.id,
    ...mergeGhlIntoLead({ id: ghl.id, createdAt: new Date().toISOString() }, ghl),
    notes: "Opened from GHL contact link",
  });
}

async function mergeLatestGhlProfile(lead: Lead): Promise<Lead> {
  const ghl = await getGhlContact(lead.ghlContactId || lead.id);
  if (!ghl) return lead;
  const patch = mergeGhlIntoLead(lead, ghl);
  const changed = Object.entries(patch).some(([k, v]) => {
    const cur = lead[k as keyof Lead];
    if (Array.isArray(v)) return JSON.stringify(cur) !== JSON.stringify(v);
    return (cur || "") !== (v || "");
  });
  if (!changed) return lead;
  return (await updateLead(lead.id, patch)) ?? { ...lead, ...patch };
}

export async function updateLead(
  id: string,
  patch: Partial<Omit<Lead, "id" | "createdAt">>,
): Promise<Lead | null> {
  const leads = await readAll();
  const idx = leads.findIndex((l) => l.id === id || l.ghlContactId === id);
  if (idx < 0) return null;
  const { conversation, ...rest } = patch;
  leads[idx] = stripConversation({ ...leads[idx], ...rest });
  if (rest.ghlContactId) {
    leads[idx].ghlContactId = rest.ghlContactId;
  }
  await writeAll(leads);
  if (conversation) {
    await saveConversation(conversationKey(leads[idx]), conversation);
  }
  return attachConversation(leads[idx]);
}
