"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { pacificRangeToIso, type DirectorEventView } from "@/lib/event-model";

type Draft = {
  title: string;
  description: string;
  cost: string;
  capacity: string;
  date: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
};

function draftFrom(event: DirectorEventView | null): Draft {
  if (!event) {
    return {
      title: "",
      description: "",
      cost: "",
      capacity: "",
      date: "",
      startTime: "",
      endTime: "",
      endsNextDay: false,
    };
  }
  return {
    title: event.title,
    description: event.description,
    cost: event.costInput,
    capacity: event.capacityInput,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    endsNextDay: event.endsNextDay,
  };
}

export function EventEditor({ event }: { event: DirectorEventView | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(event));
  const [posterName, setPosterName] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState<"draft" | "publish" | null>(null);
  const [limitLocked, setLimitLocked] = useState(Boolean(event?.past));

  function updateDraft(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!event?.past) {
      setLimitLocked(false);
      return;
    }
    const range = pacificRangeToIso(next.date, next.startTime, next.endTime, next.endsNextDay);
    const ended = "endsAt" in range && new Date(range.endsAt).getTime() <= Date.now();
    setLimitLocked(ended);
  }

  async function onSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setFormError("");
    const submitter = (submitEvent.nativeEvent as SubmitEvent).submitter;
    const intent =
      submitter instanceof HTMLButtonElement && submitter.value === "publish"
        ? "publish"
        : "draft";
    const body = new FormData(submitEvent.currentTarget);
    if (draft.endsNextDay) body.set("endsNextDay", "yes");
    else body.delete("endsNextDay");
    if (limitLocked) body.set("capacity", event?.capacityInput || "");
    body.set("intent", intent);
    setPending(intent);
    const res = await fetch(event ? `/api/events/manage/${event.id}` : "/api/events/manage", {
      method: event ? "PATCH" : "POST",
      body,
    });
    const data = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) {
      setFormError(typeof data.error === "string" ? data.error : "Could not save that event.");
      return;
    }
    router.push(`/events/manage?notice=${intent === "publish" ? "published" : "draft"}`);
    router.refresh();
  }

  const spotNote = event
    ? event.capacity == null
      ? `${event.spotsTaken} ${event.spotsTaken === 1 ? "child" : "children"} registered. No spot limit yet.`
      : `${event.spotsTaken} of ${event.capacity} spots filled.`
    : "Each child takes one spot. Leave this blank for no limit.";

  return (
    <form className="event-form director-form" onSubmit={onSubmit}>
      <p className="events-back">
        <Link href="/events/manage">All director events</Link>
      </p>
      <div>
        <p className="home-kicker home-kicker-dark">Director</p>
        <h2>{event ? "Edit event" : "Add new event"}</h2>
      </div>
      <label>
        Title
        <input
          name="title"
          required
          maxLength={120}
          value={draft.title}
          onChange={(input) => updateDraft({ title: input.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          required
          maxLength={4000}
          rows={5}
          value={draft.description}
          onChange={(input) => updateDraft({ description: input.target.value })}
        />
      </label>
      <div className="event-form-grid">
        <label>
          Cost in dollars
          <input
            name="cost"
            required
            inputMode="decimal"
            placeholder="25"
            value={draft.cost}
            onChange={(input) => updateDraft({ cost: input.target.value })}
          />
        </label>
        <label>
          Spot limit
          <input
            name={limitLocked ? undefined : "capacity"}
            inputMode="numeric"
            placeholder="No limit"
            disabled={limitLocked}
            value={limitLocked ? event?.capacityInput || "" : draft.capacity}
            onChange={(input) => updateDraft({ capacity: input.target.value })}
          />
        </label>
      </div>
      {limitLocked ? <input type="hidden" name="capacity" value={event?.capacityInput || ""} /> : null}
      <p className="event-hint">
        {spotNote}{" "}
        {limitLocked
          ? "This event has ended, so the spot limit is locked."
          : "You can change the limit until the event has ended. Use 0 in cost if it is free."}
      </p>
      <div className="event-form-grid">
        <label>
          Date
          <input
            name="date"
            type="date"
            required
            value={draft.date}
            onChange={(input) => updateDraft({ date: input.target.value })}
          />
        </label>
        <label className="event-check event-check-field">
          <input
            type="checkbox"
            name="endsNextDay"
            value="yes"
            checked={draft.endsNextDay}
            onChange={(input) => updateDraft({ endsNextDay: input.target.checked })}
          />
          Ends the next day
        </label>
      </div>
      <div className="event-form-grid">
        <label>
          Start time
          <input
            name="startTime"
            type="time"
            required
            value={draft.startTime}
            onChange={(input) => updateDraft({ startTime: input.target.value })}
          />
        </label>
        <label>
          End time
          <input
            name="endTime"
            type="time"
            required
            value={draft.endTime}
            onChange={(input) => updateDraft({ endTime: input.target.value })}
          />
        </label>
      </div>
      <p className="event-hint">Times are Pacific.</p>
      <label>
        Poster
        <input
          name="poster"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required={!event}
          onChange={(input) => setPosterName(input.target.files?.[0]?.name || "")}
        />
      </label>
      <p className="event-hint">
        {event
          ? posterName
            ? `New poster: ${posterName}. Leave this empty to keep the current one.`
            : "JPG, PNG, or WebP, up to 5 MB. Leave empty to keep the current poster."
          : "JPG, PNG, or WebP, up to 5 MB. A poster is required before you can save."}
      </p>
      <p className="event-hint">
        Save draft keeps this event off the public page. Publish lets families see it and register.
      </p>
      {formError ? <p className="maya-error">{formError}</p> : null}
      <div className="director-actions">
        <button
          className="event-secondary"
          type="submit"
          name="intent"
          value="draft"
          disabled={pending != null}
        >
          {pending === "draft" ? "Saving…" : "Save draft"}
        </button>
        <button
          className="event-register"
          type="submit"
          name="intent"
          value="publish"
          disabled={pending != null}
        >
          {pending === "publish" ? "Publishing…" : "Publish"}
        </button>
      </div>
    </form>
  );
}
