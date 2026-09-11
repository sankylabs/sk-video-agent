import {
  UNQUALIFIED_TAG,
  createGhlContactNote,
  isGhlCalendarEnabled,
  moveGhlOpportunityToNurturing,
  removeGhlContactTags,
  setGhlOpportunityStageField,
} from "./ghl";
import { type Lead, updateLead } from "./leads";
import type { OutreachChannel } from "./staff-outreach-mail";
import {
  detectNurture,
  extractNurtureReason,
  isNotReadyNow,
  mayaNurtureNote,
  stripNurtureMarkers,
  type NurtureHit,
  type NurtureReason,
} from "./nurture-detect";

export type { NurtureHit, NurtureReason };
export {
  detectNurture,
  extractNurtureReason,
  isNotReadyNow,
  mayaNurtureNote,
  stripNurtureMarkers,
};

function alreadyNurtured(lead: Lead | null) {
  if (!lead) return false;
  if (lead.nurturedAt) return true;
  return /^nurturing$/i.test((lead.opportunityStage || "").trim());
}

export async function commitNurtureLead(
  lead: Lead | null,
  hit: NurtureHit,
  opts: {
    channel: OutreachChannel;
  },
) {
  if (!lead?.id) {
    return { ok: false as const, error: "No lead", skipped: true };
  }
  if (alreadyNurtured(lead)) {
    return { ok: true as const, duplicate: true as const, hit };
  }

  const note = mayaNurtureNote(hit, opts.channel);
  const contactId = lead.ghlContactId || lead.id;
  const errors: string[] = [];

  if (isGhlCalendarEnabled() && contactId) {
    try {
      await moveGhlOpportunityToNurturing(contactId, lead.name);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "pipeline failed");
    }
    try {
      await setGhlOpportunityStageField(contactId, "Nurturing");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "stage field failed");
    }
    try {
      await createGhlContactNote(contactId, note);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "note failed");
    }
    try {
      await removeGhlContactTags(contactId, [UNQUALIFIED_TAG]);
    } catch {
      /* tag may not be present */
    }
  }

  const tags = (lead.tags || []).filter(
    (t) => t.trim().toLowerCase() !== UNQUALIFIED_TAG,
  );
  await updateLead(lead.id, {
    tags,
    opportunityStage: "Nurturing",
    nurturedAt: new Date().toISOString(),
    nurtureReason: hit.reason,
  }).catch(() => undefined);

  if (errors.length) {
    console.error("[nurture] GHL issues", hit, errors);
  }
  return { ok: true as const, duplicate: false as const, hit, errors };
}
