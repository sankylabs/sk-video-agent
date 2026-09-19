/** Last-resort Tavus cap (seconds). Idle hangup is silence-based; this is only if a tab is left open. */
export const CALL_MAX_DURATION_SEC = 7_200;

/** Warn after this much silence (parent and Maya both quiet). */
export const CALL_IDLE_BEFORE_NUDGE_MS = 90_000;

/** Hang up 30s after the warning if still silent (2 minutes of no talking). */
export const CALL_WRAP_AFTER_NUDGE_MS = 30_000;

/** Let Maya finish the wrap-up line before hanging up. */
export const CALL_END_AFTER_WRAP_MS = 12_000;

/** Someone spoke this recently → do not interrupt with a check-in. */
export const CALL_ACTIVE_WINDOW_MS = 8_000;

export const CALL_NUDGE_LINE =
  "Just checking you're still there — would you like to keep going?";

export const CALL_WRAP_LINE =
  "I haven't heard back, so I'll end the call now. Please reconnect anytime to continue our discussion.";

export function tavusMaxCallDurationSec() {
  const fromEnv = Number(process.env.TAVUS_MAX_DURATION);
  if (Number.isFinite(fromEnv) && fromEnv >= CALL_MAX_DURATION_SEC) return fromEnv;
  return CALL_MAX_DURATION_SEC;
}

export function isParentStartedSpeaking(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const event = data as {
    event_type?: unknown;
    properties?: { role?: unknown };
  };
  const eventType = String(event.event_type || "");
  const role = String(event.properties?.role || "");
  if (eventType === "conversation.user.started_speaking") return true;
  if (
    eventType === "conversation.started_speaking" &&
    (role === "user" || role === "participant")
  ) {
    return true;
  }
  return false;
}
