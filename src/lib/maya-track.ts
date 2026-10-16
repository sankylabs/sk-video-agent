import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import {
  isConversationDbEnabled,
  listStoredConversations,
  loadConversation,
  saveConversation,
  withDb,
} from "./conversations";
import { getOpenAIApiKey } from "./runtime-secrets";
import type { Lead, LeadMessage } from "./leads";
import { listLeadProfiles } from "./leads";

export type MayaChannel = "video" | "chat";

export type MayaActionKind =
  | "book"
  | "reschedule"
  | "cancel"
  | "nurture"
  | "unqualified"
  | "staff-outreach"
  | "birthday"
  | "book-fallback"
  | "reschedule-fallback"
  | "cancel-fallback";

export type MayaActionStatus = "done" | "todo";

export type MayaSession = {
  id: string;
  contactId: string;
  leadName?: string;
  childName?: string;
  childAge?: string;
  channel: MayaChannel;
  startedAt: string;
  endedAt?: string;
  tavusConversationId?: string;
  summary?: string;
};

export type MayaTurn = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type MayaAction = {
  id: string;
  sessionId?: string;
  contactId: string;
  kind: MayaActionKind;
  status: MayaActionStatus;
  detail: string;
  createdAt: string;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS maya_sessions (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  lead_name TEXT,
  child_name TEXT,
  child_age TEXT,
  channel TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  tavus_conversation_id TEXT,
  summary TEXT,
  summary_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS maya_sessions_started_idx ON maya_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS maya_sessions_contact_idx ON maya_sessions (contact_id);

CREATE TABLE IF NOT EXISTS maya_session_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS maya_session_turns_session_idx ON maya_session_turns (session_id, created_at);

CREATE TABLE IF NOT EXISTS maya_session_actions (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  contact_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS maya_session_actions_contact_idx ON maya_session_actions (contact_id, created_at DESC);
`;

const REUSE_MS = 2 * 60 * 60 * 1000;
const EMAIL_DONE_DETAIL: Partial<Record<MayaActionKind, string>> = {
  birthday: "Emailed the academy about a birthday party",
  "staff-outreach": "Emailed the academy — parent asked to talk with a person",
  "book-fallback": "Emailed the academy to book the trial after the calendar write failed",
  "reschedule-fallback":
    "Emailed the academy to move the trial after the calendar write failed",
  "cancel-fallback":
    "Emailed the academy to cancel the trial after the calendar write failed",
};

const dataDir = path.join(process.cwd(), ".data");
const filePath = path.join(dataDir, "maya-report.json");

type FileStore = {
  sessions: MayaSession[];
  turns: MayaTurn[];
  actions: MayaAction[];
  backfilled?: boolean;
};

let tableReady: Promise<void> | null = null;

function actionStatus(kind: MayaActionKind, status?: MayaActionStatus) {
  if (kind in EMAIL_DONE_DETAIL) return "done";
  if (status) return status;
  return "done";
}

function actionDetail(kind: MayaActionKind, detail: string) {
  return EMAIL_DONE_DETAIL[kind] || detail;
}

async function ensureTables() {
  if (!isConversationDbEnabled()) return;
  if (!tableReady) {
    tableReady = withDb(async (client) => {
      await client.query(SCHEMA);
    }).then(() => undefined);
  }
  try {
    await tableReady;
  } catch (err) {
    tableReady = null;
    throw err;
  }
}

async function readFileStore(): Promise<FileStore> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const store = JSON.parse(raw) as FileStore;
    return {
      sessions: store.sessions || [],
      turns: store.turns || [],
      actions: store.actions || [],
      backfilled: store.backfilled,
    };
  } catch {
    return { sessions: [], turns: [], actions: [] };
  }
}

async function writeFileStore(store: FileStore) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

function iso(value?: Date | string | null) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.toISOString();
}

export function pacificDateKey(isoStamp: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoStamp));
}

export function formatPacific(isoStamp: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoStamp));
  } catch {
    return isoStamp;
  }
}

export async function startMayaSession(input: {
  contactId: string;
  channel: MayaChannel;
  lead?: Pick<Lead, "name" | "childName" | "childAge"> | null;
  tavusConversationId?: string;
  reuseOpen?: boolean;
}): Promise<MayaSession> {
  const contactId = input.contactId.trim();
  if (!contactId) {
    throw new Error("contactId required");
  }
  if (input.reuseOpen) {
    const open = await latestOpenSession(contactId, input.channel);
    if (open) return open;
  }

  const session: MayaSession = {
    id: nanoid(12),
    contactId,
    leadName: input.lead?.name?.trim() || undefined,
    childName: input.lead?.childName?.trim() || undefined,
    childAge: input.lead?.childAge?.trim() || undefined,
    channel: input.channel,
    startedAt: new Date().toISOString(),
    tavusConversationId: input.tavusConversationId,
  };

  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    store.sessions.unshift(session);
    await writeFileStore(store);
    return session;
  }

  await ensureTables();
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO maya_sessions
        (id, contact_id, lead_name, child_name, child_age, channel, started_at, tavus_conversation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        session.id,
        session.contactId,
        session.leadName || null,
        session.childName || null,
        session.childAge || null,
        session.channel,
        session.startedAt,
        session.tavusConversationId || null,
      ],
    );
  });
  return session;
}

async function latestOpenSession(contactId: string, channel: MayaChannel) {
  const cutoff = Date.now() - REUSE_MS;
  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    return (
      store.sessions.find(
        (s) =>
          s.contactId === contactId &&
          s.channel === channel &&
          !s.endedAt &&
          Date.parse(s.startedAt) >= cutoff,
      ) || null
    );
  }
  await ensureTables();
  const rows = await withDb(async (client) => {
    const res = await client.query<{
      id: string;
      contact_id: string;
      lead_name: string | null;
      child_name: string | null;
      child_age: string | null;
      channel: MayaChannel;
      started_at: Date;
      ended_at: Date | null;
      tavus_conversation_id: string | null;
      summary: string | null;
    }>(
      `SELECT * FROM maya_sessions
       WHERE contact_id = $1 AND channel = $2 AND ended_at IS NULL
         AND started_at >= NOW() - INTERVAL '2 hours'
       ORDER BY started_at DESC LIMIT 1`,
      [contactId, channel],
    );
    return res.rows;
  });
  const row = rows?.[0];
  return row ? mapSession(row) : null;
}

function mapSession(row: {
  id: string;
  contact_id: string;
  lead_name?: string | null;
  child_name?: string | null;
  child_age?: string | null;
  channel: string;
  started_at: Date | string;
  ended_at?: Date | string | null;
  tavus_conversation_id?: string | null;
  summary?: string | null;
}): MayaSession {
  return {
    id: row.id,
    contactId: row.contact_id,
    leadName: row.lead_name || undefined,
    childName: row.child_name || undefined,
    childAge: row.child_age || undefined,
    channel: row.channel === "video" ? "video" : "chat",
    startedAt: iso(row.started_at)!,
    endedAt: iso(row.ended_at || undefined),
    tavusConversationId: row.tavus_conversation_id || undefined,
    summary: row.summary || undefined,
  };
}

export async function appendMayaTurn(input: {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
}) {
  const content = input.content.replace(/\s+/g, " ").trim();
  if (!content || !input.sessionId) return;
  const turn: MayaTurn = {
    id: nanoid(12),
    sessionId: input.sessionId,
    role: input.role,
    content: content.slice(0, 4000),
    createdAt: new Date().toISOString(),
  };

  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    store.turns.push(turn);
    await writeFileStore(store);
    return;
  }

  await ensureTables();
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO maya_session_turns (id, session_id, role, content, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [turn.id, turn.sessionId, turn.role, turn.content, turn.createdAt],
    );
  });
}

export async function endMayaSession(sessionId: string) {
  if (!sessionId) return;
  const endedAt = new Date().toISOString();
  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (session && !session.endedAt) session.endedAt = endedAt;
    await writeFileStore(store);
    if (session) await persistSessionTranscript(session, store.turns);
    return;
  }

  await ensureTables();
  await withDb(async (client) => {
    await client.query(
      `UPDATE maya_sessions SET ended_at = COALESCE(ended_at, $2) WHERE id = $1`,
      [sessionId, endedAt],
    );
  });
  const detail = await getMayaSessionDetail(sessionId);
  if (detail) {
    await persistSessionTranscript(detail.session, detail.turns);
  }
}

async function persistSessionTranscript(session: MayaSession, turns: MayaTurn[]) {
  if (!turns.length) return;
  const messages: LeadMessage[] = turns.map((t) => ({
    role: t.role,
    content: t.content,
  }));
  await saveConversation(session.contactId, messages).catch(() => undefined);
}

export async function recordMayaAction(input: {
  contactId?: string | null;
  sessionId?: string;
  kind: MayaActionKind;
  detail: string;
  status?: MayaActionStatus;
}) {
  const contactId = input.contactId?.trim();
  if (!contactId) return;
  const action: MayaAction = {
    id: nanoid(12),
    sessionId: input.sessionId,
    contactId,
    kind: input.kind,
    status: actionStatus(input.kind, input.status),
    detail: actionDetail(input.kind, input.detail.trim()).slice(0, 500),
    createdAt: new Date().toISOString(),
  };

  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    store.actions.unshift(action);
    await writeFileStore(store);
    return;
  }

  await ensureTables();
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO maya_session_actions
        (id, session_id, contact_id, kind, status, detail, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        action.id,
        action.sessionId || null,
        action.contactId,
        action.kind,
        action.status,
        action.detail,
        action.createdAt,
      ],
    );
  });
}

export async function listMayaSessions(opts?: { since?: string }) {
  await backfillFromConversations();
  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    const since = opts?.since ? Date.parse(opts.since) : 0;
    return store.sessions
      .filter((s) => Date.parse(s.startedAt) >= since)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  await ensureTables();
  const rows = await withDb(async (client) => {
    const res = await client.query(
      opts?.since
        ? `SELECT * FROM maya_sessions WHERE started_at >= $1 ORDER BY started_at DESC`
        : `SELECT * FROM maya_sessions ORDER BY started_at DESC LIMIT 500`,
      opts?.since ? [opts.since] : [],
    );
    return res.rows;
  });
  return (rows || []).map(mapSession);
}

export async function getMayaSessionDetail(sessionId: string) {
  const sessions = await sessionsById([sessionId]);
  const session = sessions[0];
  if (!session) return null;
  const turns = await turnsForSessions([sessionId]);
  return { session, turns };
}

async function sessionsById(ids: string[]) {
  if (!ids.length) return [];
  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    return store.sessions.filter((s) => ids.includes(s.id));
  }
  await ensureTables();
  const rows = await withDb(async (client) => {
    const res = await client.query(
      `SELECT * FROM maya_sessions WHERE id = ANY($1::text[])`,
      [ids],
    );
    return res.rows;
  });
  return (rows || []).map(mapSession);
}

async function turnsForSessions(sessionIds: string[]) {
  if (!sessionIds.length) return [] as MayaTurn[];
  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    return store.turns
      .filter((t) => sessionIds.includes(t.sessionId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  await ensureTables();
  const rows = await withDb(async (client) => {
    const res = await client.query<{
      id: string;
      session_id: string;
      role: "user" | "assistant";
      content: string;
      created_at: Date;
    }>(
      `SELECT * FROM maya_session_turns WHERE session_id = ANY($1::text[]) ORDER BY created_at ASC`,
      [sessionIds],
    );
    return res.rows;
  });
  return (rows || []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: iso(row.created_at)!,
  }));
}

async function actionsForContact(contactId: string) {
  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    return store.actions
      .filter((a) => a.contactId === contactId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  await ensureTables();
  const rows = await withDb(async (client) => {
    const res = await client.query<{
      id: string;
      session_id: string | null;
      contact_id: string;
      kind: MayaActionKind;
      status: MayaActionStatus;
      detail: string;
      created_at: Date;
    }>(
      `SELECT * FROM maya_session_actions WHERE contact_id = $1 ORDER BY created_at DESC`,
      [contactId],
    );
    return res.rows;
  });
  return (rows || []).map((row) => ({
    id: row.id,
    sessionId: row.session_id || undefined,
    contactId: row.contact_id,
    kind: row.kind,
    status: row.status,
    detail: row.detail,
    createdAt: iso(row.created_at)!,
  }));
}

function splitMayaActions(actions: MayaAction[]) {
  const normalized = actions.map((a) => ({
    ...a,
    status: actionStatus(a.kind, a.status),
    detail: actionDetail(a.kind, a.detail),
  }));
  return {
    done: normalized.filter((a) => a.status === "done"),
    todo: normalized.filter((a) => a.status === "todo"),
  };
}

function inferredActions(lead: Lead | null): MayaAction[] {
  if (!lead) return [];
  const out: MayaAction[] = [];
  const contactId = lead.ghlContactId || lead.id;
  if (lead.bookedStart) {
    out.push({
      id: `inferred-book-${contactId}`,
      contactId,
      kind: "book",
      status: "done",
      detail: lead.bookedLabel || lead.bookedStart,
      createdAt: lead.bookedStart,
    });
  }
  if (lead.unqualifiedAt) {
    out.push({
      id: `inferred-unqual-${contactId}`,
      contactId,
      kind: "unqualified",
      status: "done",
      detail: lead.unqualifiedReason || "unqualified",
      createdAt: lead.unqualifiedAt,
    });
  }
  if (lead.nurturedAt) {
    out.push({
      id: `inferred-nurture-${contactId}`,
      contactId,
      kind: "nurture",
      status: "done",
      detail: lead.nurtureReason || "nurturing",
      createdAt: lead.nurturedAt,
    });
  }
  if (lead.staffOutreachAt) {
    out.push({
      id: `inferred-staff-${contactId}`,
      contactId,
      kind: "staff-outreach",
      status: "done",
      detail: EMAIL_DONE_DETAIL["staff-outreach"]!,
      createdAt: lead.staffOutreachAt,
    });
  }
  if (lead.bookingFallbackAt) {
    out.push({
      id: `inferred-fallback-${contactId}`,
      contactId,
      kind: "book-fallback",
      status: "done",
      detail:
        EMAIL_DONE_DETAIL["book-fallback"] ||
        lead.bookingFallbackStart ||
        "Emailed the academy",
      createdAt: lead.bookingFallbackAt,
    });
  }
  return out;
}

export async function getMayaLeadReport(contactId: string) {
  await backfillFromConversations();
  const id = contactId.trim();
  const sessions = (await listMayaSessions()).filter((s) => s.contactId === id);
  const turns = await turnsForSessions(sessions.map((s) => s.id));
  let actions = await actionsForContact(id);
  const leads = await listLeadProfiles();
  const lead =
    leads.find((l) => l.id === id || l.ghlContactId === id) || null;
  if (!actions.length) actions = inferredActions(lead);

  const stored = turns.length ? [] : await loadConversation(id);
  const messages: { role: "user" | "assistant"; content: string; at?: string }[] =
    turns.length
      ? turns.map((t) => ({
          role: t.role,
          content: t.content,
          at: t.createdAt,
        }))
      : stored.map((m) => ({
          role: m.role,
          content: m.content,
        }));

  let summary = sessions.find((s) => s.summary)?.summary;
  if (!summary && messages.length >= 2) {
    summary = await summarizeMayaConversation(messages, lead);
    const latest = sessions[0];
    if (latest && summary) await saveSessionSummary(latest.id, summary);
  }

  return {
    contactId: id,
    lead: lead
      ? {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          childName: lead.childName,
          childAge: lead.childAge,
          stage: lead.opportunityStage,
        }
      : {
          name: sessions[0]?.leadName,
          childName: sessions[0]?.childName,
          childAge: sessions[0]?.childAge,
        },
    summary: summary || "Not enough conversation yet to summarize.",
    sessions,
    transcript: messages,
    actions: splitMayaActions(actions),
  };
}

async function saveSessionSummary(sessionId: string, summary: string) {
  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (session) session.summary = summary;
    await writeFileStore(store);
    return;
  }
  await ensureTables();
  await withDb(async (client) => {
    await client.query(
      `UPDATE maya_sessions SET summary = $2, summary_at = NOW() WHERE id = $1 AND summary IS NULL`,
      [sessionId, summary],
    );
  });
}

export async function buildMayaReport(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sessions = await listMayaSessions({ since });
  const leads = await listLeadProfiles();
  const leadById = new Map<string, Lead>();
  for (const lead of leads) {
    leadById.set(lead.id, lead);
    if (lead.ghlContactId) leadById.set(lead.ghlContactId, lead);
  }

  const byDate = new Map<string, { launches: number; leads: Set<string> }>();
  const byLead = new Map<
    string,
    {
      contactId: string;
      name?: string;
      childName?: string;
      childAge?: string;
      launches: number;
      lastAt: string;
      channels: Set<string>;
    }
  >();

  for (const session of sessions) {
    const day = pacificDateKey(session.startedAt);
    const bucket = byDate.get(day) || { launches: 0, leads: new Set<string>() };
    bucket.launches += 1;
    bucket.leads.add(session.contactId);
    byDate.set(day, bucket);

    const lead = leadById.get(session.contactId);
    const row = byLead.get(session.contactId) || {
      contactId: session.contactId,
      name: session.leadName || lead?.name,
      childName: session.childName || lead?.childName,
      childAge: session.childAge || lead?.childAge,
      launches: 0,
      lastAt: session.startedAt,
      channels: new Set<string>(),
    };
    row.launches += 1;
    row.channels.add(session.channel);
    if (session.startedAt > row.lastAt) row.lastAt = session.startedAt;
    byLead.set(session.contactId, row);
  }

  const dates = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, v]) => ({
      date,
      launches: v.launches,
      uniqueLeads: v.leads.size,
    }));

  return {
    since,
    totalLaunches: sessions.length,
    uniqueLeads: byLead.size,
    dates,
    leads: [...byLead.values()]
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
      .map((row) => ({
        ...row,
        channels: [...row.channels],
      })),
  };
}

async function backfillFromConversations() {
  if (!isConversationDbEnabled()) {
    const store = await readFileStore();
    if (store.backfilled || store.sessions.length) return;
    const convos = await listStoredConversations();
    for (const conv of convos) {
      if (!conv.messages.length) continue;
      const id = `bf-${conv.contactId}`.slice(0, 24);
      store.sessions.push({
        id,
        contactId: conv.contactId,
        channel: "chat",
        startedAt: conv.updatedAt,
      });
      for (const msg of conv.messages) {
        store.turns.push({
          id: nanoid(10),
          sessionId: id,
          role: msg.role,
          content: msg.content,
          createdAt: conv.updatedAt,
        });
      }
    }
    store.backfilled = true;
    await writeFileStore(store);
    return;
  }

  await ensureTables();
  await withDb(async (client) => {
    const existing = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM maya_sessions`,
    );
    if (Number(existing.rows[0]?.n || 0) > 0) return;
    const convos = await listStoredConversations();
    for (const conv of convos) {
      if (!conv.messages.length) continue;
      const id = `bf-${conv.contactId}`.slice(0, 24);
      await client.query(
        `INSERT INTO maya_sessions (id, contact_id, channel, started_at)
         VALUES ($1,$2,'chat',$3)
         ON CONFLICT (id) DO NOTHING`,
        [id, conv.contactId, conv.updatedAt],
      );
      for (const msg of conv.messages) {
        await client.query(
          `INSERT INTO maya_session_turns (id, session_id, role, content, created_at)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO NOTHING`,
          [nanoid(12), id, msg.role, msg.content.slice(0, 4000), conv.updatedAt],
        );
      }
    }
  });
}

export async function summarizeMayaConversation(
  messages: { role: string; content: string }[],
  lead?: Pick<Lead, "name" | "childName" | "childAge"> | null,
) {
  const key = getOpenAIApiKey();
  const lines = messages
    .slice(-30)
    .map((m) => {
      const who = m.role === "user" ? "Parent" : "Maya";
      const body = m.content
        .replace(/\[[A-Z0-9_:-]+\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return body ? `${who}: ${body}` : "";
    })
    .filter(Boolean)
    .join("\n");
  if (!lines) return "";
  if (!key) {
    const parentBits = lines
      .split("\n")
      .filter((l) => l.startsWith("Parent:"))
      .slice(0, 4)
      .map((l) => l.replace(/^Parent:\s*/, ""));
    return parentBits.length
      ? `Parent talked about: ${parentBits.join(" · ")}`
      : "Conversation captured; OpenAI is not configured for a full summary.";
  }

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content:
            "Summarize a Steamoji Kirkland Maya enrollment conversation for academy staff. 4 short bullets: what they wanted, child age/name if known, outcome (booked / nurture / unqualified / party follow-up / still talking), and the next action. No fluff.",
        },
        {
          role: "user",
          content: `${lead?.name ? `Parent: ${lead.name}\n` : ""}${
            lead?.childName ? `Child: ${lead.childName} ${lead.childAge || ""}\n` : ""
          }${lines}`,
        },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("[maya-report] summary failed", err);
    return "";
  }
}
