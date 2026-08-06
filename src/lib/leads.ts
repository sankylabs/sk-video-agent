import { nanoid } from "nanoid";
import { promises as fs } from "fs";
import path from "path";

export type Lead = {
  id: string;
  name?: string;
  phone?: string;
  childName?: string;
  childAge?: string;
  notes?: string;
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
  await fs.writeFile(leadsFile, JSON.stringify(leads, null, 2), "utf8");
}

export async function createLead(
  input: Omit<Lead, "id" | "createdAt">,
): Promise<Lead> {
  const leads = await readAll();
  const lead: Lead = {
    id: nanoid(10),
    ...input,
    createdAt: new Date().toISOString(),
  };
  leads.push(lead);
  await writeAll(leads);
  return lead;
}

export async function getLead(id: string): Promise<Lead | null> {
  const leads = await readAll();
  return leads.find((l) => l.id === id) ?? null;
}
