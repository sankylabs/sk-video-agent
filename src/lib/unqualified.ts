import {
  UNQUALIFIED_TAG,
  addGhlContactTags,
  createGhlContactNote,
  isGhlCalendarEnabled,
  moveGhlOpportunityToUnqualified,
  setGhlOpportunityStageField,
} from "./ghl";
import { type Lead, updateLead } from "./leads";
import {
  sendUnqualifiedNotice,
  type OutreachChannel,
} from "./staff-outreach-mail";
import {
  detectUnqualified,
  extractUnqualifiedReason,
  isDistanceDecline,
  mayaUnqualifiedNote,
  stripUnqualifiedMarkers,
  type UnqualifiedHit,
  type UnqualifiedReason,
} from "./unqualified-detect";

export type { UnqualifiedHit, UnqualifiedReason };
export {
  detectUnqualified,
  extractUnqualifiedReason,
  isDistanceDecline,
  mayaUnqualifiedNote,
  stripUnqualifiedMarkers,
};

function alreadyUnqualified(lead: Lead | null) {
  if (!lead) return false;
  if (lead.unqualifiedAt) return true;
  return (lead.tags || []).some((t) => t.trim().toLowerCase() === UNQUALIFIED_TAG);
}

export async function commitUnqualifiedLead(
  lead: Lead | null,
  hit: UnqualifiedHit,
  opts: {
    channel: OutreachChannel;
    userText?: string;
    recentMessages?: { role: string; content: string }[];
  },
) {
  if (!lead?.id) {
    return { ok: false as const, error: "No lead", skipped: true };
  }
  if (alreadyUnqualified(lead)) {
    return { ok: true as const, duplicate: true as const, hit };
  }

  const note = mayaUnqualifiedNote(hit, opts.channel);
  const contactId = lead.ghlContactId || lead.id;
  const errors: string[] = [];

  if (isGhlCalendarEnabled() && contactId) {
    try {
      await addGhlContactTags(contactId, [UNQUALIFIED_TAG]);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "tag failed");
    }
    try {
      await moveGhlOpportunityToUnqualified(contactId, lead.name);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "pipeline failed");
    }
    try {
      await setGhlOpportunityStageField(contactId, "Unqualified");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "stage field failed");
    }
    try {
      await createGhlContactNote(contactId, note);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "note failed");
    }
  }

  const mail = await sendUnqualifiedNotice({
    lead,
    channel: opts.channel,
    hit,
    note,
    userText: opts.userText,
    recentMessages: opts.recentMessages,
  });
  if (!mail.ok) {
    errors.push(...(mail.errors || ["email failed"]));
  }

  const tags = [...new Set([...(lead.tags || []), UNQUALIFIED_TAG])];
  await updateLead(lead.id, {
    tags,
    opportunityStage: "Unqualified",
    unqualifiedAt: new Date().toISOString(),
    unqualifiedReason: hit.reason,
  }).catch(() => undefined);

  if (errors.length) {
    console.error("[unqualified] GHL/email issues", hit, errors);
  }
  return { ok: true as const, duplicate: false as const, hit, errors };
}
