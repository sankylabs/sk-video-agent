import { classifyLocation } from "./locations";
import type { QualifyContext } from "./qualify";

export type NurtureReason = "later" | "too-young";

export type NurtureHit = {
  reason: NurtureReason;
  detail: string;
};

const NURTURE_MARKER_RE = /\[NURTURE:(later|too-young)\]/gi;

export function extractNurtureReason(text: string): NurtureReason | null {
  const matches = [...text.matchAll(NURTURE_MARKER_RE)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  return last[1].toLowerCase() as NurtureReason;
}

export function stripNurtureMarkers(text: string) {
  return text.replace(/\s*\[NURTURE:(later|too-young)\]\s*/gi, " ").trim();
}

/** Later today / this week — they still want a slot, not a deferral. */
export function isSchedulingLater(text: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  if (
    /\blater (today|tonight|this (week|weekend|afternoon|morning|evening)|on|at)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/\blater (in the )?(afternoon|morning|evening|day)\b/.test(t)) {
    return true;
  }
  return false;
}

export function isNotReadyNow(text: string) {
  const t = text.toLowerCase().trim();
  if (!t || isSchedulingLater(t)) return false;
  return (
    /\bnot (right )?now\b/.test(t) ||
    /\bnot ready\b/.test(t) ||
    /\bnot interested (right )?now\b/.test(t) ||
    /\bmaybe later\b/.test(t) ||
    /\bsometime (later|in the future)\b/.test(t) ||
    /\bin the future\b/.test(t) ||
    /\bnext year\b/.test(t) ||
    /\bnot this (year|season|semester)\b/.test(t) ||
    /\b(need to |let me )?think about it\b/.test(t) ||
    /\bcheck with (my )?(husband|wife|spouse|partner)\b/.test(t) ||
    /\btoo busy (right now|at the moment|this (year|season|month))\b/.test(t) ||
    /\b(come back|revisit|reach out|follow up) (later|next year|in a few)\b/.test(
      t,
    ) ||
    /\bkeep (us|me) (in mind|on the list)\b/.test(t) ||
    /\b(in a few months|a few months)\b/.test(t) ||
    /\bwhen (he|she|they|the kids?) .{0,24}(older|turns? 5)\b/.test(t) ||
    /\btoo young (right )?now\b/.test(t)
  );
}

export function isInterestedDespiteYoung(text: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  return (
    /\b(interested|we'?d love|we would love)\b/.test(t) ||
    /\bwant to (join|enroll|try|come|do this|sign up)\b/.test(t) ||
    /\bkeep (us|me) (in mind|on the list)\b/.test(t) ||
    /\bput (us|me) on (the|your) list\b/.test(t) ||
    /\bwhen (he|she|they) turns? 5\b/.test(t) ||
    /\bwhen (he|she|they)'?s 5\b/.test(t) ||
    /\btoo young (but|right now)\b/.test(t) ||
    /\bnot old enough yet\b/.test(t) ||
    /\bwait until (he|she|they)\b/.test(t) ||
    /\bonce (he|she|they) (is|are|turns?) 5\b/.test(t)
  );
}

export function looksNurtureTooYoung(userText?: string, replicaText?: string) {
  if (extractNurtureReason(`${userText || ""}\n${replicaText || ""}`) === "too-young") {
    return true;
  }
  const user = userText || "";
  return isInterestedDespiteYoung(user) || isNotReadyNow(user);
}

export function locationFitsKirkland(qualify: QualifyContext) {
  return classifyLocation(qualify.locationHint) === "kirkland-fit";
}

export function detectNurture(input: {
  userText?: string;
  replicaText?: string;
  qualify: QualifyContext;
}): NurtureHit | null {
  const user = input.userText?.trim() || "";
  const replica = input.replicaText?.trim() || "";
  const blob = `${user}\n${replica}`;
  const marker = extractNurtureReason(blob);
  const age = input.qualify.age;

  if (age != null && age > 14) return null;

  if (age != null && age < 5 && looksNurtureTooYoung(user, replica)) {
    return {
      reason: "too-young",
      detail: `child is ${age} (under 5) and the family wants to stay in touch / come later`,
    };
  }
  if (marker === "too-young" && (age == null || age < 5)) {
    return {
      reason: "too-young",
      detail:
        age != null
          ? `child is ${age} (under 5) and the family wants to stay in touch / come later`
          : "child is under 5 and the family wants to stay in touch / come later",
    };
  }

  const notReady = marker === "later" || isNotReadyNow(user);
  if (notReady && locationFitsKirkland(input.qualify)) {
    const town = input.qualify.locationHint?.trim() || "Kirkland-area";
    return {
      reason: "later",
      detail: `location fits (${town}); not ready now — asked to revisit later`,
    };
  }

  return null;
}

export function mayaNurtureNote(hit: NurtureHit, channel: "chat" | "video") {
  return `[maya] Nurturing (${channel}): ${hit.detail}.`;
}
