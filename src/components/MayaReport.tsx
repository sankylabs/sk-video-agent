"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

function formatPacific(isoStamp: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoStamp));
  } catch {
    return isoStamp;
  }
}

type DateRow = { date: string; launches: number; uniqueLeads: number };
type LeadRow = {
  contactId: string;
  name?: string;
  childName?: string;
  childAge?: string;
  launches: number;
  lastAt: string;
  channels: string[];
};
type ActionRow = {
  id: string;
  kind: string;
  status: string;
  detail: string;
  createdAt: string;
};
type LeadDetail = {
  contactId: string;
  lead: {
    name?: string;
    email?: string;
    phone?: string;
    childName?: string;
    childAge?: string;
    stage?: string;
  };
  summary: string;
  sessions: { id: string; channel: string; startedAt: string; endedAt?: string }[];
  transcript: { role: "user" | "assistant"; content: string; at?: string }[];
  actions: { done: ActionRow[]; todo: ActionRow[] };
};

function labelKind(kind: string) {
  if (
    kind === "birthday" ||
    kind === "staff-outreach" ||
    kind.endsWith("-fallback")
  ) {
    return "Emailed academy";
  }
  return kind.replace(/-/g, " ");
}

function cleanLine(text: string) {
  return text
    .replace(/\[[A-Z0-9_:-]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function MayaReport() {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [secret, setSecret] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [dates, setDates] = useState<DateRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [totals, setTotals] = useState({ launches: 0, uniqueLeads: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  const [needsSetup, setNeedsSetup] = useState(false);

  async function loadReport(range = days) {
    setLoading(true);
    const res = await fetch(`/api/maya-report?days=${range}`);
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      setNeedsSetup(Boolean(data.setup));
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setNeedsAuth(false);
    setDates(data.dates || []);
    setLeads(data.leads || []);
    setTotals({
      launches: data.totalLaunches || 0,
      uniqueLeads: data.uniqueLeads || 0,
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setAuthError("");
    const res = await fetch("/api/maya-report/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (!res.ok) {
      setAuthError("That password didn’t match MAYA_REPORT_SECRET.");
      return;
    }
    setSecret("");
    await loadReport();
  }

  async function openLead(contactId: string) {
    setOpenId(contactId);
    setTab("summary");
    setDetail(null);
    setDetailLoading(true);
    const res = await fetch(
      `/api/maya-report?contactId=${encodeURIComponent(contactId)}`,
    );
    const data = await res.json();
    setDetail(data);
    setDetailLoading(false);
  }

  const maxLaunches = Math.max(1, ...dates.map((d) => d.launches));
  const chartDates = useMemo(() => [...dates].reverse().slice(-21), [dates]);

  if (needsAuth) {
    return (
      <form className="maya-login" onSubmit={onLogin}>
        <p className="eyebrow">Maya report</p>
        <h1>Academy access</h1>
        <p>
          {needsSetup
            ? "Set MAYA_REPORT_SECRET on the Railway service, then use that password here."
            : "Enter the Maya report password to see launches, transcripts, and actions."}
        </p>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="MAYA_REPORT_SECRET"
          autoFocus
        />
        {authError ? <p className="maya-error">{authError}</p> : null}
        <button type="submit">Open report</button>
      </form>
    );
  }

  return (
    <>
      <header className="maya-head">
        <p className="eyebrow">Maya performance</p>
        <h1>How Maya is doing</h1>
        <p className="lede">
          Live video and text chats, by Pacific date. Open a lead for the
          transcript, a short summary, and what Maya already did — or still
          needs the academy to do.
        </p>
      </header>

      <section className="maya-stats">
        <div className="maya-stat">
          <strong>{loading ? "—" : totals.uniqueLeads}</strong>
          <span>leads launched Maya</span>
        </div>
        <div className="maya-stat">
          <strong>{loading ? "—" : totals.launches}</strong>
          <span>Maya sessions</span>
        </div>
        <label className="maya-range">
          Range
          <select
            value={days}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDays(next);
              void loadReport(next);
            }}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </section>

      <section className="maya-chart-card">
        <h2>Launches by date</h2>
        {!chartDates.length ? (
          <p className="maya-empty">No Maya launches in this range yet.</p>
        ) : (
          <div className="maya-chart">
            {chartDates.map((row) => (
              <div key={row.date} className="maya-bar-col">
                <div
                  className="maya-bar"
                  style={{ height: `${(row.launches / maxLaunches) * 100}%` }}
                  title={`${row.date}: ${row.uniqueLeads} leads, ${row.launches} sessions`}
                />
                <span>{row.date.slice(5)}</span>
                <em>{row.uniqueLeads}</em>
              </div>
            ))}
          </div>
        )}
        {dates.length ? (
          <ul className="maya-date-list">
            {dates.map((row) => (
              <li key={row.date}>
                <strong>{row.date}</strong>
                <span>
                  {row.uniqueLeads} lead{row.uniqueLeads === 1 ? "" : "s"} ·{" "}
                  {row.launches} session{row.launches === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="maya-leads-card">
        <h2>Leads who launched Maya</h2>
        {!leads.length ? (
          <p className="maya-empty">
            After a parent starts video or texts Maya, they show up here.
          </p>
        ) : (
          <div className="maya-table-wrap">
            <table className="maya-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Child</th>
                  <th>Sessions</th>
                  <th>Last launch</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((row) => (
                  <tr
                    key={row.contactId}
                    tabIndex={0}
                    role="button"
                    onClick={() => void openLead(row.contactId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openLead(row.contactId);
                      }
                    }}
                  >
                    <td>
                      <strong>{row.name || "Unknown parent"}</strong>
                      <span className="maya-id">{row.contactId}</span>
                    </td>
                    <td>
                      {row.childName || "—"}
                      {row.childAge ? ` · ${row.childAge}` : ""}
                    </td>
                    <td>
                      {row.launches} · {row.channels.join(", ")}
                    </td>
                    <td>{formatPacific(row.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openId ? (
        <div
          className="maya-overlay"
          onClick={() => setOpenId(null)}
          role="presentation"
        >
          <div
            className="maya-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              className="maya-close"
              type="button"
              onClick={() => setOpenId(null)}
            >
              Close
            </button>
            {detailLoading || !detail ? (
              <p className="maya-empty">Loading this lead…</p>
            ) : (
              <>
                <p className="eyebrow">Lead</p>
                <h2>{detail.lead.name || "Unknown parent"}</h2>
                <p className="maya-lead-meta">
                  {[
                    detail.lead.childName
                      ? `${detail.lead.childName}${
                          detail.lead.childAge ? `, ${detail.lead.childAge}` : ""
                        }`
                      : null,
                    detail.lead.email,
                    detail.lead.phone,
                    detail.lead.stage,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                <div className="maya-tabs">
                  <button
                    type="button"
                    className={tab === "summary" ? "is-on" : ""}
                    onClick={() => setTab("summary")}
                  >
                    Summary & actions
                  </button>
                  <button
                    type="button"
                    className={tab === "transcript" ? "is-on" : ""}
                    onClick={() => setTab("transcript")}
                  >
                    Transcript
                  </button>
                </div>

                {tab === "summary" ? (
                  <div className="maya-summary-grid">
                    <section>
                      <h3>Conversation</h3>
                      <pre className="maya-summary">{detail.summary}</pre>
                      <ul className="maya-session-list">
                        {detail.sessions.map((s) => (
                          <li key={s.id}>
                            {s.channel} · {formatPacific(s.startedAt)}
                            {s.endedAt ? " (ended)" : " (open)"}
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h3>Actions done</h3>
                      {detail.actions.done.length ? (
                        <ul className="maya-actions">
                          {detail.actions.done.map((a) => (
                            <li key={a.id}>
                              <strong>{labelKind(a.kind)}</strong>
                              <span>{a.detail}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="maya-empty">No Maya actions recorded yet.</p>
                      )}
                      <h3>To do</h3>
                      {detail.actions.todo.length ? (
                        <ul className="maya-actions is-todo">
                          {detail.actions.todo.map((a) => (
                            <li key={a.id}>
                              <strong>{labelKind(a.kind)}</strong>
                              <span>{a.detail}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="maya-empty">Nothing waiting on the academy.</p>
                      )}
                    </section>
                  </div>
                ) : (
                  <ol className="maya-transcript">
                    {detail.transcript.length ? (
                      detail.transcript.map((m, i) => {
                        const body = cleanLine(m.content);
                        if (!body) return null;
                        return (
                          <li
                            key={`${m.role}-${i}`}
                            className={m.role === "user" ? "is-parent" : "is-maya"}
                          >
                            <span>{m.role === "user" ? "Parent" : "Maya"}</span>
                            {body}
                          </li>
                        );
                      })
                    ) : (
                      <p className="maya-empty">No transcript stored for this lead yet.</p>
                    )}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
