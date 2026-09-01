import {
  OFFER_REACH_OUT_MARKER,
  REACH_OUT_BUTTON,
  REACH_OUT_MARKER,
} from "./chat-actions";

export {
  OFFER_REACH_OUT_MARKER,
  REACH_OUT_BUTTON,
  REACH_OUT_MARKER,
};

/** Parent wants a human / staff member rather than (or in addition to) Maya. */
export function isStaffTalkRequest(text: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  if (/\b(talk|speak) (to|with) (you|maya)\b/.test(t)) return false;
  return (
    /\b(talk|speak) (to|with) (a |an |someone|somebody|a person|a human|a real person|the team|staff|an advisor|a human being)\b/.test(
      t,
    ) ||
    /\bwho (can|do) i (talk|speak) (to|with)\b/.test(t) ||
    /\b(real person|human being|actual person|live person)\b/.test(t) ||
    /\b(connect me|transfer me|hand ?off)\b/.test(t) ||
    /\b(call me|have someone (call|reach out|contact))\b/.test(t) ||
    /\b(someone from (the )?(academy|team|staff))\b/.test(t)
  );
}

export function isStaffOutreachConfirm(text: string, priorAssistant?: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  if (text.includes(REACH_OUT_MARKER)) return true;
  if (t === REACH_OUT_BUTTON.toLowerCase()) return true;
  if (/\bhave someone reach out\b/.test(t)) return true;
  if (
    priorAssistant?.includes(OFFER_REACH_OUT_MARKER) &&
    /^(yes|yeah|yep|please|sure|ok|okay|that works|sounds good|please do)\b/.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

export function replicaOfferedStaffOutreach(text: string) {
  const t = text.toLowerCase();
  return (
    /\breach out\b/.test(t) &&
    /\b(someone|team|staff|academy|human|person)\b/.test(t)
  );
}

/** Pull parent speech from a Tavus / Daily app-message payload. */
export function extractUserSpeech(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const event = data as {
    event_type?: unknown;
    properties?: {
      role?: unknown;
      speech?: unknown;
      text?: unknown;
      transcript?: unknown;
    };
  };
  const eventType = String(event.event_type || "");
  const props = event.properties || {};
  const role = String(props.role || "").toLowerCase();
  const text = String(
    props.speech || props.text || props.transcript || "",
  ).trim();
  if (!text) return null;
  if (role === "replica" || role === "assistant" || role === "ai") return null;
  if (
    role === "user" ||
    role === "participant" ||
    eventType.includes("user") ||
    eventType === "conversation.utterance"
  ) {
    return text;
  }
  return null;
}

export function extractReplicaSpeech(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const event = data as {
    event_type?: unknown;
    properties?: {
      role?: unknown;
      speech?: unknown;
      text?: unknown;
      transcript?: unknown;
    };
  };
  const props = event.properties || {};
  const role = String(props.role || "").toLowerCase();
  const text = String(
    props.speech || props.text || props.transcript || "",
  ).trim();
  if (!text) return null;
  if (role === "replica" || role === "assistant" || role === "ai") return text;
  return null;
}
