"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DIRECTOR_PAGE_SIZE,
  residentLabel,
  type DirectorEventView,
  type RegistrationView,
} from "@/lib/event-model";

type Slice = {
  items: DirectorEventView[];
  page: number;
  pages: number;
  total: number;
  param: "page" | "drafts" | "past";
};

export function DirectorBoard({
  published,
  drafts,
  completed,
  query,
  notice,
}: {
  published: Slice;
  drafts: Slice;
  completed: Slice;
  query: { page?: string; drafts?: string; past?: string };
  notice?: string;
}) {
  const message =
    notice === "published"
      ? "Published. Families can see this event."
      : notice === "draft"
        ? "Saved as a draft. Only this director page can see it."
        : "";

  return (
    <div className="director">
      <div className="director-toolbar">
        <div>
          <h2>Current events</h2>
          <p>Published events are on the public page. Drafts stay internal.</p>
        </div>
        <Link className="event-register director-add" href="/events/manage/new">
          Add new event
        </Link>
      </div>
      {message ? (
        <p className="event-notice" role="status">
          {message}
        </p>
      ) : null}

      <EventSection
        id="published-events"
        title="Published"
        lede="Families can see these events and register until a spot limit is reached."
        slice={published}
        query={query}
        empty="No published events coming up. Publish a draft when it is ready."
        emphasized
      />
      <EventSection
        id="draft-events"
        title="Drafts"
        lede="Internal only. These stay off the public events page until you publish them."
        slice={drafts}
        query={query}
        empty="No drafts."
      />
      <EventSection
        id="completed-events"
        title="Completed"
        lede="These published events have ended. Spot limits stay locked."
        slice={completed}
        query={query}
        empty="No completed events yet."
      />
    </div>
  );
}

function EventSection({
  id,
  title,
  lede,
  slice,
  query,
  empty,
  emphasized,
}: {
  id: string;
  title: string;
  lede: string;
  slice: Slice;
  query: { page?: string; drafts?: string; past?: string };
  empty: string;
  emphasized?: boolean;
}) {
  return (
    <section
      className={emphasized ? "director-section" : "director-section is-quiet"}
      aria-labelledby={id}
    >
      <div className="director-section-head">
        <h2 id={id}>{title}</h2>
        <p>{lede}</p>
      </div>
      {slice.total === 0 ? (
        <p className="events-empty">{empty}</p>
      ) : (
        <div className="director-list">
          {slice.items.map((event) => (
            <DirectorEventCard key={event.id} event={event} />
          ))}
        </div>
      )}
      <Pager slice={slice} query={query} />
    </section>
  );
}

function DirectorEventCard({ event }: { event: DirectorEventView }) {
  const spots =
    event.capacity == null
      ? `${event.spotsTaken} ${event.spotsTaken === 1 ? "spot" : "spots"} filled`
      : `${event.spotsTaken} of ${event.capacity} spots`;

  return (
    <article className="director-event">
      <div className="director-event-head">
        <div className="director-thumb">
          <Image src={event.posterUrl} alt="" fill sizes="140px" unoptimized />
        </div>
        <div>
          <div className="event-card-top">
            <p className="event-cost">{event.costLabel}</p>
            <p className={event.status === "published" ? "event-open" : "event-draft"}>
              {event.status === "published" ? "Published" : "Draft"}
            </p>
            {event.past ? <p className="event-closed">Ended</p> : null}
            {event.soldOut && !event.past ? <p className="event-soldout">Sold out</p> : null}
          </div>
          <h3>{event.title}</h3>
          <p className="event-when">
            <span>{event.dateLabel}</span>
            <span>{event.timeLabel}</span>
          </p>
          <p className="event-spots">{spots}</p>
          {event.ghlSync ? (
            <p className="event-spots">Syncs to GHL · {event.ghlTag}</p>
          ) : null}
          <p className="event-desc">{event.description}</p>
          <div className="director-actions">
            <Link className="event-secondary" href={`/events/manage/${event.id}`}>
              Edit
            </Link>
            <DeleteEventButton id={event.id} title={event.title} />
          </div>
        </div>
      </div>
      <RegistrationList
        title={event.title}
        registrations={event.registrations}
        showGhl={event.ghlSync}
      />
    </article>
  );
}

function csvCell(value: string) {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function registrationsCsv(registrations: RegistrationView[], showGhl: boolean) {
  const header = [
    "First name",
    "Last name",
    "Email",
    "Phone",
    "Kirkland resident",
    "Where they reside",
    "Children",
    "Submitted",
    ...(showGhl ? ["GHL"] : []),
  ];
  const lines = registrations.map((registration) =>
    [
      registration.firstName,
      registration.lastName,
      registration.email,
      registration.phone || "—",
      residentLabel(registration.kirklandResident),
      registration.residence || "—",
      registration.kids.length
        ? registration.kids.map((kid) => `${kid.name} (age ${kid.age})`).join("; ")
        : "—",
      registration.submittedLabel,
      ...(showGhl ? [registration.ghlStatus || "—"] : []),
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${[header.join(","), ...lines].join("\r\n")}`;
}

function csvFilename(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "event"}-registrations.csv`;
}

function RegistrationList({
  title,
  registrations,
  showGhl,
}: {
  title: string;
  registrations: RegistrationView[];
  showGhl: boolean;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(registrations.length / DIRECTOR_PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = registrations.slice(
    (safePage - 1) * DIRECTOR_PAGE_SIZE,
    safePage * DIRECTOR_PAGE_SIZE,
  );

  function exportCsv() {
    const blob = new Blob([registrationsCsv(registrations, showGhl)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(title);
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="director-regs">
      <div className="regs-head">
        <h4>
          {registrations.length === 1
            ? "1 registration"
            : `${registrations.length} registrations`}
        </h4>
        {registrations.length > 0 ? (
          <button className="event-secondary" type="button" onClick={exportCsv}>
            Export CSV
          </button>
        ) : null}
      </div>
      {registrations.length === 0 ? (
        <p>No registrations yet.</p>
      ) : (
        <div className="regs-scroll">
          <table className="regs-table">
            <thead>
              <tr>
                <th scope="col">First name</th>
                <th scope="col">Last name</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">Kirkland resident</th>
                <th scope="col">Where they reside</th>
                <th scope="col">Children</th>
                <th scope="col">Submitted</th>
                {showGhl ? <th scope="col">GHL</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((registration) => (
                <tr key={registration.id}>
                  <td>{registration.firstName}</td>
                  <td>{registration.lastName}</td>
                  <td>{registration.email}</td>
                  <td>{registration.phone || "—"}</td>
                  <td>{residentLabel(registration.kirklandResident)}</td>
                  <td>{registration.residence || "—"}</td>
                  <td>
                    {registration.kids.length
                      ? registration.kids.map((kid) => `${kid.name}, age ${kid.age}`).join(" · ")
                      : "—"}
                  </td>
                  <td>{registration.submittedLabel}</td>
                  {showGhl ? <td>{registration.ghlStatus || "Pending"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <div className="pager">
          <button
            type="button"
            className="event-secondary"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </button>
          <span>
            Page {safePage} of {pages}
          </span>
          <button
            type="button"
            className="event-secondary"
            disabled={safePage >= pages}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DeleteEventButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Delete “${title}” and its registrations?`)) return;
    setPending(true);
    const res = await fetch(`/api/events/manage/${id}`, { method: "DELETE" });
    setPending(false);
    if (!res.ok) {
      window.alert("Could not delete that event.");
      return;
    }
    router.refresh();
  }

  return (
    <button className="event-text-btn" type="button" onClick={onDelete} disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

function Pager({
  slice,
  query,
}: {
  slice: Slice;
  query: { page?: string; drafts?: string; past?: string };
}) {
  if (slice.pages <= 1) return null;

  function href(page: number) {
    const next = new URLSearchParams();
    const values = { ...query, [slice.param]: page > 1 ? String(page) : undefined };
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
    }
    const search = next.toString();
    return search ? `/events/manage?${search}` : "/events/manage";
  }

  return (
    <div className="pager">
      {slice.page > 1 ? (
        <Link className="event-secondary" href={href(slice.page - 1)}>
          Previous
        </Link>
      ) : (
        <span className="event-secondary is-disabled">Previous</span>
      )}
      <span>
        Page {slice.page} of {slice.pages}
      </span>
      {slice.page < slice.pages ? (
        <Link className="event-secondary" href={href(slice.page + 1)}>
          Next
        </Link>
      ) : (
        <span className="event-secondary is-disabled">Next</span>
      )}
    </div>
  );
}
