import { Pool, type PoolClient } from "pg";
import type { LeadMessage } from "./leads";

const TABLE = `
CREATE TABLE IF NOT EXISTS maya_conversations (
  contact_id TEXT PRIMARY KEY,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`;

let pool: Pool | null | undefined;
let tableReady: Promise<void> | null = null;

function databaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.POSTGRES_URL ||
    ""
  ).trim();
}

export function isConversationDbEnabled() {
  return Boolean(databaseUrl());
}

function getPool(): Pool | null {
  const url = databaseUrl();
  if (!url) return null;
  if (pool === undefined) {
    const useSsl = !/localhost|127\.0\.0\.1/.test(url);
    pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T | null> {
  const p = getPool();
  if (!p) return null;
  const client = await p.connect();
  try {
    if (!tableReady) {
      tableReady = client.query(TABLE).then(() => undefined);
    }
    await tableReady;
    return await fn(client);
  } catch (err) {
    console.error("[conversations] postgres error", err);
    tableReady = null;
    throw err;
  } finally {
    client.release();
  }
}

const fileFallback = new Map<string, LeadMessage[]>();

function validMessages(raw: unknown): LeadMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is LeadMessage =>
        !!m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content }));
}

export async function loadConversation(
  contactId: string,
): Promise<LeadMessage[]> {
  const id = contactId.trim();
  if (!id) return [];
  if (!getPool()) return fileFallback.get(id) ?? [];
  try {
    const rows = await withClient(async (client) => {
      const res = await client.query<{ messages: unknown }>(
        `SELECT messages FROM maya_conversations WHERE contact_id = $1`,
        [id],
      );
      return res.rows;
    });
    return validMessages(rows?.[0]?.messages);
  } catch {
    return fileFallback.get(id) ?? [];
  }
}

export async function saveConversation(
  contactId: string,
  messages: LeadMessage[],
): Promise<void> {
  const id = contactId.trim();
  if (!id) return;
  const payload = validMessages(messages);
  if (!getPool()) {
    fileFallback.set(id, payload);
    return;
  }
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO maya_conversations (contact_id, messages, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (contact_id)
       DO UPDATE SET messages = EXCLUDED.messages, updated_at = NOW()`,
      [id, JSON.stringify(payload)],
    );
  });
}

export function conversationKey(lead: { id: string; ghlContactId?: string }) {
  return (lead.ghlContactId || lead.id).trim();
}
