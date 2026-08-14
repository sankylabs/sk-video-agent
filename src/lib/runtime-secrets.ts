import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

/** In-memory + disk secrets so Tavus key survives restarts. */
let tavusApiKey: string | undefined;
let openaiApiKey: string | undefined;

const dataDir = path.join(process.cwd(), ".data");
const secretsPath = path.join(dataDir, "secrets.json");
const envLocalPath = path.join(process.cwd(), ".env.local");

type StoredSecrets = {
  tavusApiKey?: string;
  openaiApiKey?: string;
};

function readStoredSecrets(): StoredSecrets {
  try {
    if (!existsSync(secretsPath)) return {};
    return JSON.parse(readFileSync(secretsPath, "utf8")) as StoredSecrets;
  } catch {
    return {};
  }
}

function writeStoredSecrets(partial: StoredSecrets) {
  mkdirSync(dataDir, { recursive: true });
  const next = { ...readStoredSecrets(), ...partial };
  writeFileSync(secretsPath, JSON.stringify(next, null, 2), "utf8");
}

function upsertEnvLocal(key: string, value: string) {
  try {
    const line = `${key}=${value}`;
    let contents = "";
    if (existsSync(envLocalPath)) {
      contents = readFileSync(envLocalPath, "utf8");
    }
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(contents)) {
      contents = contents.replace(pattern, line);
    } else {
      contents = `${contents.trimEnd()}${contents.trim() ? "\n" : ""}${line}\n`;
    }
    writeFileSync(envLocalPath, contents, "utf8");
  } catch {
    // Disk secrets file is enough if .env.local write fails
  }
}

export function getTavusApiKey() {
  if (tavusApiKey) return tavusApiKey;
  if (process.env.TAVUS_API_KEY) {
    tavusApiKey = process.env.TAVUS_API_KEY;
    return tavusApiKey;
  }
  const stored = readStoredSecrets().tavusApiKey;
  if (stored) {
    tavusApiKey = stored;
    return stored;
  }
  return undefined;
}

export function setTavusApiKey(key: string) {
  const trimmed = key.trim();
  tavusApiKey = trimmed;
  writeStoredSecrets({ tavusApiKey: trimmed });
  upsertEnvLocal("TAVUS_API_KEY", trimmed);
}

export function getOpenAIApiKey() {
  if (openaiApiKey) return openaiApiKey;
  if (process.env.OPENAI_API_KEY) {
    openaiApiKey = process.env.OPENAI_API_KEY;
    return openaiApiKey;
  }
  const stored = readStoredSecrets().openaiApiKey;
  if (stored) {
    openaiApiKey = stored;
    return stored;
  }
  return undefined;
}

export function setOpenAIApiKey(key: string) {
  const trimmed = key.trim();
  openaiApiKey = trimmed;
  writeStoredSecrets({ openaiApiKey: trimmed });
  upsertEnvLocal("OPENAI_API_KEY", trimmed);
}

export function hasLivingVideo() {
  return Boolean(getTavusApiKey());
}

export function tavusKeySource(): "env" | "file" | "runtime" | null {
  if (!getTavusApiKey()) return null;
  if (process.env.TAVUS_API_KEY && getTavusApiKey() === process.env.TAVUS_API_KEY) {
    return "env";
  }
  if (readStoredSecrets().tavusApiKey) return "file";
  return "runtime";
}
