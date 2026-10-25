"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { PublicEvent } from "@/lib/event-model";

export function EventsBrowser({
  upcoming,
  past,
}: {
  upcoming: PublicEvent[];
  past: PublicEvent[];
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const events = tab === "upcoming" ? upcoming : past;

  return (
    <div className="events-browser">
      <div className="events-tabs" role="tablist" aria-label="Event timing">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "upcoming"}
          onClick={() => setTab("upcoming")}
        >
          Upcoming
          <span>{upcoming.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "past"}
          onClick={() => setTab("past")}
        >
          Past
          <span>{past.length}</span>
        </button>
      </div>

      {events.length === 0 ? (
        <p className="events-empty">
          {tab === "upcoming"
            ? "No upcoming events right now. Check past events, or ask the academy what’s next."
            : "Past events will show up here after they end."}
        </p>
      ) : (
        <div className="events-list">
          {events.map((event) => (
            <article key={event.id} className="event-card">
              <Link className="event-poster" href={`/events/${event.id}`}>
                <Image
                  src={event.posterUrl}
                  alt=""
                  fill
                  sizes="(max-width: 800px) 100vw, 220px"
                  unoptimized
                />
              </Link>
              <div className="event-card-body">
                <div className="event-card-top">
                  <p className="event-cost">{event.costLabel}</p>
                  {event.past ? <p className="event-closed">Registration closed</p> : null}
                  {event.soldOut && !event.past ? <p className="event-soldout">Sold out</p> : null}
                </div>
                <h2>
                  <Link href={`/events/${event.id}`}>{event.title}</Link>
                </h2>
                <p className="event-when">
                  <span>{event.dateLabel}</span>
                  <span>{event.timeLabel}</span>
                </p>
                {event.capacity != null ? (
                  <p className="event-spots">
                    {event.spotsTaken} of {event.capacity} spots filled
                  </p>
                ) : null}
                <p className="event-desc">{event.description}</p>
                {event.past || event.soldOut ? (
                  <Link className="event-secondary" href={`/events/${event.id}`}>
                    View event
                  </Link>
                ) : (
                  <Link className="event-register" href={`/events/${event.id}`}>
                    Register
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
