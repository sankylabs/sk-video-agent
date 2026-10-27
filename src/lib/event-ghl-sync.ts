import {
  addGhlContactTags,
  createGhlContactNote,
  createGhlOpportunity,
  findEventLeadsStage,
  getGhlConfig,
  upsertGhlContact,
} from "./ghl";
import {
  residentLabel,
  type AcademyEvent,
  type EventRegistration,
} from "./event-model";

export function eventRegistrationGhlNote(input: {
  eventTitle: string;
  registration: EventRegistration;
}) {
  const { registration } = input;
  const lines = [
    `Event: ${input.eventTitle}`,
    `Lives in Kirkland: ${residentLabel(registration.kirklandResident)}`,
  ];
  if (registration.kirklandResident === false) {
    lines.push(`Where they reside: ${registration.residence?.trim() || "—"}`);
  }
  if (registration.kids.length) {
    lines.push("Children:");
    for (const kid of registration.kids) {
      lines.push(`- ${kid.name}, age ${kid.age}`);
    }
  } else {
    lines.push("Children: none");
  }
  return lines.join("\n");
}

function ghlPhone(raw: string | undefined) {
  const trimmed = raw?.trim() || "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

export async function syncEventRegistrationToGhl(input: {
  event: Pick<AcademyEvent, "title" | "ghlSync" | "ghlTag">;
  registration: EventRegistration;
}) {
  const tag = input.event.ghlTag?.trim() || "";
  if (!input.event.ghlSync || !tag) return { synced: false as const, skipped: true as const };
  if (!getGhlConfig()) {
    console.error("[events] GHL sync skipped, GHL is not configured");
    return { synced: false as const, skipped: true as const };
  }

  const { registration, event } = input;
  const parent = `${registration.firstName} ${registration.lastName}`.trim();
  try {
    const { contactId } = await upsertGhlContact({
      firstName: registration.firstName,
      lastName: registration.lastName,
      name: parent,
      email: registration.email,
      phone: ghlPhone(registration.phone),
      requireEmail: true,
    });
    await addGhlContactTags(contactId, [tag]);
    const stage = await findEventLeadsStage();
    if (!stage) throw new Error("No Event Leads stage found in GHL");
    await createGhlOpportunity({
      contactId,
      name: `${parent} — ${event.title}`.slice(0, 120),
      pipelineId: stage.pipelineId,
      stageId: stage.stageId,
    });
    await createGhlContactNote(
      contactId,
      eventRegistrationGhlNote({ eventTitle: event.title, registration }),
    );
    return { synced: true as const };
  } catch (err) {
    console.error(
      "[events] GHL sync failed",
      err instanceof Error ? err.message : err,
    );
    return { synced: false as const };
  }
}
