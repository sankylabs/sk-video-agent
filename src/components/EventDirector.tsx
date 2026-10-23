"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import type { DirectorEventView } from "@/lib/event-model";

type Draft = {
  title: string;
  description: string;
  cost: string;
  date: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
};

const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  cost: "",
  date: "",
  startTime: "",
  endTime: "",
  endsNextDay: false,
});

export function EventDirector({
  initialAuthed,
  initialOpenLocally,
  initialNeedsSetup,
  initialEvents,
}: {
  initialAuthed: boolean;
  initialOpenLocally: boolean;
  initialNeedsSetup: boolean;
  initialEvents: DirectorEventView[];
}) {
  const [needsAuth, setNeedsAuth] = useState(!initialAuthed);
  const [needsSetup, setNeedsSetup] = useState(initialNeedsSetup);
  const [openLocally, setOpenLocally] = useState(initialOpenLocally);
  const [secret, setSecret] = useState("");
  const [authError, setAuthError] = useState("");
  const [events, setEvents] = useState(initialEvents);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [posterName, setPosterName] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function reload() {
    const res = await fetch("/api/events/manage");
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      setNeedsSetup(Boolean(data.setup));
      setNeedsAuth(true);
      return;
    }
    const data = await res.json();
    setNeedsAuth(false);
    setOpenLocally(Boolean(data.openLocally));
    setEvents(data.events || []);
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    const res = await fetch("/api/events/director/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (!res.ok) {
      setAuthError("That password didn’t match EVENTS_DIRECTOR_SECRET.");
      return;
    }
    setSecret("");
    await reload();
  }

  function startEdit(event: DirectorEventView) {
    setEditingId(event.id);
    setDraft({
      title: event.title,
      description: event.description,
      cost: event.costInput,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      endsNextDay: event.endsNextDay,
    });
    setPosterName("");
    setFormError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft());
    setPosterName("");
    setFormError("");
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    const body = new FormData(event.currentTarget);
    if (draft.endsNextDay) body.set("endsNextDay", "yes");
    else body.delete("endsNextDay");
    setPending(true);
    const res = await fetch(
      editingId ? `/api/events/manage/${editingId}` : "/api/events/manage",
      { method: editingId ? "PATCH" : "POST", body },
    );
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setFormError(typeof data.error === "string" ? data.error : "Could not save that event.");
      return;
    }
    setNotice(editingId ? "Event updated." : "Event added. It is on the public page now.");
    resetForm();
    await reload();
  }

  async function onDelete(event: DirectorEventView) {
    if (!window.confirm(`Delete “${event.title}” and its registrations?`)) return;
    setFormError("");
    const res = await fetch(`/api/events/manage/${event.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(typeof data.error === "string" ? data.error : "Could not delete that event.");
      return;
    }
    if (editingId === event.id) resetForm();
    setNotice("Event deleted.");
    await reload();
  }

  if (needsAuth) {
    return (
      <form className="event-login" onSubmit={onLogin}>
        <p className="home-kicker home-kicker-dark">Director</p>
        <h2>Academy access</h2>
        <p>
          {needsSetup
            ? "Set EVENTS_DIRECTOR_SECRET on the server, then use that password here."
            : "Enter the director password to add events and see registrations."}
        </p>
        <label>
          Password
          <input
            type="password"
            value={secret}
            onChange={(input) => setSecret(input.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>
        {authError ? <p className="maya-error">{authError}</p> : null}
        <button className="event-register" type="submit">
          Open director console
        </button>
      </form>
    );
  }

  return (
    <div className="director">
      {openLocally ? (
        <p className="director-note">
          Local preview is open because EVENTS_DIRECTOR_SECRET is not set. Set that
          password before this page is public.
        </p>
      ) : null}

      <form className="event-form director-form" onSubmit={onSave}>
        <div>
          <p className="home-kicker home-kicker-dark">Director</p>
          <h2>{editingId ? "Edit event" : "Add an event"}</h2>
        </div>
        <label>
          Title
          <input
            name="title"
            required
            maxLength={120}
            value={draft.title}
            onChange={(input) => setDraft({ ...draft, title: input.target.value })}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            required
            maxLength={4000}
            rows={4}
            value={draft.description}
            onChange={(input) => setDraft({ ...draft, description: input.target.value })}
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
              onChange={(input) => setDraft({ ...draft, cost: input.target.value })}
            />
          </label>
          <label>
            Date
            <input
              name="date"
              type="date"
              required
              value={draft.date}
              onChange={(input) => setDraft({ ...draft, date: input.target.value })}
            />
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
              onChange={(input) => setDraft({ ...draft, startTime: input.target.value })}
            />
          </label>
          <label>
            End time
            <input
              name="endTime"
              type="time"
              required
              value={draft.endTime}
              onChange={(input) => setDraft({ ...draft, endTime: input.target.value })}
            />
          </label>
        </div>
        <label className="event-check">
          <input
            type="checkbox"
            name="endsNextDay"
            value="yes"
            checked={draft.endsNextDay}
            onChange={(input) => setDraft({ ...draft, endsNextDay: input.target.checked })}
          />
          Ends the next day
        </label>
        <p className="event-hint">Times are Pacific. Use 0 if the event is free.</p>
        <label>
          Poster
          <input
            name="poster"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required={!editingId}
            onChange={(input) => setPosterName(input.target.files?.[0]?.name || "")}
          />
        </label>
        <p className="event-hint">
          {editingId
            ? posterName
              ? `New poster: ${posterName}. Leave this empty to keep the current one.`
              : "JPG, PNG, or WebP, up to 5 MB. Leave empty to keep the current poster."
            : "JPG, PNG, or WebP, up to 5 MB."}
        </p>
        {formError ? <p className="maya-error">{formError}</p> : null}
        {notice ? <p className="event-notice" role="status">{notice}</p> : null}
        <div className="director-actions">
          <button className="event-register" type="submit" disabled={pending}>
            {pending ? "Saving…" : editingId ? "Save changes" : "Add event"}
          </button>
          {editingId ? (
            <button className="event-secondary" type="button" onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <section className="director-list" aria-labelledby="director-events-heading">
        <h2 id="director-events-heading">Events and registrations</h2>
        {events.length === 0 ? (
          <p className="events-empty">No events yet. Add one above.</p>
        ) : (
          events.map((event) => (
            <article key={event.id} className="director-event">
              <div className="director-event-head">
                <div className="director-thumb">
                  <Image
                    src={event.posterUrl}
                    alt=""
                    fill
                    sizes="140px"
                    unoptimized
                  />
                </div>
                <div>
                  <div className="event-card-top">
                    <p className="event-cost">{event.costLabel}</p>
                    <p className={event.past ? "event-closed" : "event-open"}>
                      {event.past ? "Past" : "Upcoming"}
                    </p>
                  </div>
                  <h3>{event.title}</h3>
                  <p className="event-when">
                    <span>{event.dateLabel}</span>
                    <span>{event.timeLabel}</span>
                  </p>
                  <p className="event-desc">{event.description}</p>
                  <div className="director-actions">
                    <button className="event-secondary" type="button" onClick={() => startEdit(event)}>
                      Edit
                    </button>
                    <button className="event-text-btn" type="button" onClick={() => onDelete(event)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
              <div className="director-regs">
                <h4>
                  {event.registrations.length === 1
                    ? "1 registration"
                    : `${event.registrations.length} registrations`}
                </h4>
                {event.registrations.length === 0 ? (
                  <p>No registrations yet.</p>
                ) : (
                  <ul>
                    {event.registrations.map((registration) => (
                      <li key={registration.id}>
                        <strong>
                          {registration.firstName} {registration.lastName}
                        </strong>
                        <span>{registration.email}</span>
                        <span>{registration.submittedLabel}</span>
                        <span>
                          {registration.kids
                            .map((kid) => `${kid.name}, age ${kid.age}`)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
