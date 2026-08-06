/** In-memory secrets for local setup without restarting the Next server. */
let tavusApiKey: string | undefined;
let openaiApiKey: string | undefined;

export function getTavusApiKey() {
  return tavusApiKey || process.env.TAVUS_API_KEY || undefined;
}

export function setTavusApiKey(key: string) {
  tavusApiKey = key.trim();
}

export function getOpenAIApiKey() {
  return openaiApiKey || process.env.OPENAI_API_KEY || undefined;
}

export function setOpenAIApiKey(key: string) {
  openaiApiKey = key.trim();
}

export function hasLivingVideo() {
  return Boolean(getTavusApiKey());
}
