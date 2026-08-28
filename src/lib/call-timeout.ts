/** Hard cap for live video, in seconds (`max_call_duration`). */
export const CALL_MAX_DURATION_SEC = 180;

/** Elapsed time after join before the continue check-in. */
export const CALL_NUDGE_AT_MS = 120_000;

/** How long to wait after the nudge before wrapping up. */
export const CALL_WRAP_AFTER_NUDGE_MS = 40_000;

/** Let Maya finish the wrap-up line before hanging up. */
export const CALL_END_AFTER_WRAP_MS = 12_000;

export const CALL_NUDGE_LINE =
  "Just checking you're still there — would you like to keep going?";

export const CALL_WRAP_LINE =
  "I haven't heard back, so I'll end the call now. Please reconnect anytime to continue our discussion.";

export function tavusMaxCallDurationSec() {
  const fromEnv = Number(process.env.TAVUS_MAX_DURATION);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
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
