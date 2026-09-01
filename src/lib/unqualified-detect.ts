import { classifyLocation } from "./locations";
import type { QualifyContext } from "./qualify";

export type UnqualifiedReason = "age" | "distance";

export type UnqualifiedHit = {
  reason: UnqualifiedReason;
  detail: string;
};

const UNQUALIFIED_MARKER_RE = /\[UNQUALIFIED:(age|distance)\]/gi;

export function extractUnqualifiedReason(text: string): UnqualifiedReason | null {
  const matches = [...text.matchAll(UNQUALIFIED_MARKER_RE)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  return last[1].toLowerCase() as UnqualifiedReason;
}

export function stripUnqualifiedMarkers(text: string) {
  return text.replace(/\s*\[UNQUALIFIED:(age|distance)\]\s*/gi, " ").trim();
}

export function isDistanceDecline(text: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  if (
    /^(how far|is (it|kirkland) (too )?far|is that too far)\b/.test(t) ||
    (t.includes("?") && /\b(how far|too far\?)\b/.test(t) && t.length < 80)
  ) {
    return false;
  }
  return (
    /\b(too far|pretty far|quite far|really far|so far|kind of far)\b/.test(t) ||
    /\b(closer (for us|to (us|me|home))|other (one|location|steamoji|academy) is closer|that'?s closer)\b/.test(
      t,
    ) ||
    /\b(prefer (the )?(other|bothell|bellevue|lynnwood|klahanie|newcastle|closer)( (one|academy|location))?)\b/.test(
      t,
    ) ||
    /\b(we'?ll (just )?(go|use|try) (there|bothell|bellevue|lynnwood|klahanie|newcastle))\b/.test(
      t,
    ) ||
    /\b(not (going to |do )?kirkland|kirkland (won'?t|doesn'?t|does not|isn'?t) work)\b/.test(
      t,
    ) ||
    /\b(drive|commute) is too (long|far)\b/.test(t)
  );
}

export function detectUnqualified(input: {
  userText?: string;
  replicaText?: string;
  qualify: QualifyContext;
}): UnqualifiedHit | null {
  const user = input.userText?.trim() || "";
  const replica = input.replicaText?.trim() || "";
  const marker = extractUnqualifiedReason(`${user}\n${replica}`);
  const age = input.qualify.age;

  if (age != null && (age < 5 || age > 14)) {
    return {
      reason: "age",
      detail: `child's age is ${age} (outside 5–14)`,
    };
  }
  if (marker === "age") {
    return {
      reason: "age",
      detail: "child's age is outside 5–14",
    };
  }

  const lane = classifyLocation(input.qualify.locationHint);
  const notKirkland =
    Boolean(input.qualify.locationHint?.trim()) && lane !== "kirkland-fit";
  const declined = isDistanceDecline(user) || marker === "distance";
  if (marker === "distance" || (notKirkland && declined)) {
    if (!notKirkland && marker !== "distance") return null;
    const town = input.qualify.locationHint?.trim() || "outside Kirkland";
    return {
      reason: "distance",
      detail: `family is in ${town} and said Kirkland is too far / a closer Steamoji is a better fit`,
    };
  }

  return null;
}

export function mayaUnqualifiedNote(
  hit: UnqualifiedHit,
  channel: "chat" | "video",
) {
  return `[maya] Unqualified (${channel}): ${hit.detail}.`;
}
