"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { siteConfig, trialUrl } from "@/lib/config";
import { mayaGreeting } from "@/lib/greeting";

type Phase = "lobby" | "setup" | "connecting" | "live" | "rehearsal" | "error";
type Msg = { role: "user" | "assistant"; content: string };

type LeadInfo = {
  id?: string;
  name?: string;
  email?: string;
  childName?: string;
  childAge?: string;
  notes?: string;
};

type Props = {
  lead?: LeadInfo | null;
  embedded?: boolean;
};

export function LiveMaya({ lead, embedded = false }: Props) {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [videoReady, setVideoReady] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bookUrl = useMemo(() => trialUrl(lead?.id), [lead?.id]);

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: mayaGreeting({
          name: lead?.name,
          childName: lead?.childName,
          childAge: lead?.childAge,
        }),
      },
    ]);
  }, [lead?.name, lead?.childName, lead?.childAge]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function refreshStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setVideoReady(Boolean(data.livingVideo || data.videoReady));
    } catch {
      setVideoReady(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function saveTavusKey(e?: FormEvent) {
    e?.preventDefault();
    setSetupBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/tavus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          [data.error, data.hint].filter(Boolean).join(" — ") ||
            "Could not save Tavus key",
        );
        return;
      }
      setVideoReady(true);
      if (data.warning) setError(data.warning);
      await joinCall();
    } catch {
      setError("Could not reach setup API");
    } finally {
      setSetupBusy(false);
    }
  }

  async function joinCall() {
    setError(null);
    setPhase("connecting");

    try {
      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead?.id }),
      });
      const data = await res.json();

      if (res.status === 503 || data.needsSetup) {
        setPhase("setup");
        setError(
          data.hint ||
            "Living video requires a Tavus API key for human-like speech and motion.",
        );
        return;
      }

      if (!res.ok || !data.conversationUrl) {
        setPhase("error");
        setError(
          data.hint ||
            data.error ||
            "Could not start Maya’s living video. Check your Tavus account/credits.",
        );
        return;
      }

      setConversationId(data.conversationId || null);
      setVideoUrl(data.conversationUrl);
      setPhase("live");
    } catch {
      setPhase("error");
      setError("Network error starting the living video call.");
    }
  }

  function startRehearsal() {
    setError(null);
    setVideoUrl(null);
    setConversationId(null);
    setMessages([
      {
        role: "assistant",
        content: mayaGreeting({
          name: lead?.name,
          childName: lead?.childName,
          childAge: lead?.childAge,
        }),
      },
    ]);
    setPhase("rehearsal");
  }

  async function leaveCall() {
    if (conversationId) {
      await fetch(
        `/api/conversation?conversationId=${encodeURIComponent(conversationId)}`,
        { method: "DELETE" },
      ).catch(() => undefined);
    }
    setConversationId(null);
    setVideoUrl(null);
    setPhase("lobby");
  }

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, leadId: lead?.id }),
      });
      const data = await res.json();
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.content || "Sorry — say that again?",
        },
      ]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: `Having trouble connecting. You can still book here: ${bookUrl}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onRehearsalSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className={`live-maya ${embedded ? "is-embedded" : ""} ${phase}`}>
      <header className="maya-brand">
        <div className="maya-brand-top">
          <Image
            src="/steamoji-kirkland-logo.png"
            alt="Steamoji Kirkland"
            width={88}
            height={88}
            priority
            className="maya-brand-logo"
          />
          <div className="maya-brand-copy">
            <p className="maya-brand-mission">{siteConfig.mission}</p>
            <p className="maya-brand-location">
              <span>Kirkland</span>
              {siteConfig.address}
            </p>
          </div>
        </div>
        <div className="maya-brand-title">
          <p className="eyebrow">Talk with {siteConfig.personaName}</p>
          <h1>{siteConfig.personaTitle}</h1>
        </div>
      </header>

      <div className="live-frame">
        <div className="live-badge">
          <span className="pulse" />
          {phase === "live"
            ? "LIVE VIDEO"
            : phase === "rehearsal"
              ? "SCRIPT REHEARSAL · FREE"
              : "LIVE ON THIS PAGE"}
        </div>

        <div
          className={`presence ${phase === "live" ? "is-live" : ""} ${phase === "rehearsal" ? "is-rehearsal" : ""}`}
        >
          {phase === "live" && videoUrl ? (
            <iframe
              title="Maya living video conversation"
              src={videoUrl}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="tavus-frame"
            />
          ) : (
            <>
              <div className="presence-glow" />
              <div className="presence-ring" />
              <Image
                src="/maya-avatar.jpg"
                alt={`${siteConfig.personaName} — ${siteConfig.personaTitle}`}
                width={960}
                height={960}
                priority
                className="presence-face"
              />
            </>
          )}
        </div>

        <div className="live-overlay">
          <div className="identity">
            <strong>
              {siteConfig.personaName}
              <em> · {siteConfig.personaTitle}</em>
            </strong>
            <span>
              {phase === "live"
                ? "Photoreal talking avatar"
                : phase === "rehearsal"
                  ? "Free script rehearsal (no Tavus minutes)"
                  : phase === "connecting"
                    ? "Starting living video…"
                    : videoReady
                      ? "Ready for living video"
                      : "Needs living video setup"}
            </span>
          </div>

          {phase === "lobby" ? (
            <div className="lobby-copy">
              <h2>Ask {siteConfig.personaName}.</h2>
              <p>
                Living video uses Tavus minutes. Out of minutes? Rehearse the
                sales script for free, then turn video back on when credits
                refresh.
              </p>
              <div className="lobby-actions">
                <button
                  type="button"
                  className="join-btn"
                  onClick={() => {
                    if (videoReady) void joinCall();
                    else setPhase("setup");
                  }}
                >
                  {videoReady ? "Start living video" : "Enable living video"}
                </button>
                <button
                  type="button"
                  className="dock-btn"
                  onClick={startRehearsal}
                >
                  Script rehearsal (free)
                </button>
              </div>
              <p className="lobby-note">
                Tavus test_mode only checks the API — the avatar does not join.
                Rehearsal uses Maya’s real sales brain without CVI minutes.
              </p>
            </div>
          ) : null}

          {phase === "setup" ? (
            <div className="lobby-copy setup-copy">
              <h2>Enable living Maya</h2>
              <p>
                Paste a Tavus API key for photoreal video. Or skip and use free
                script rehearsal while you wait for more minutes.
              </p>
              <form className="setup-form" onSubmit={(e) => void saveTavusKey(e)}>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste full Tavus API key"
                  autoComplete="off"
                  required
                />
                <button type="submit" className="join-btn" disabled={setupBusy}>
                  {setupBusy ? "Connecting…" : "Save & start video"}
                </button>
              </form>
              <div className="lobby-actions">
                <button
                  type="button"
                  className="dock-btn"
                  onClick={startRehearsal}
                >
                  Script rehearsal instead
                </button>
                <button
                  type="button"
                  className="dock-btn"
                  onClick={() => setPhase("lobby")}
                >
                  Back
                </button>
              </div>
            </div>
          ) : null}

          {phase === "connecting" ? (
            <div className="lobby-copy">
              <h2>Bringing Maya into the room…</h2>
              <p>Loading photoreal face and conversation brain.</p>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="lobby-copy">
              <h2>Couldn’t start living video</h2>
              <p>{error}</p>
              <div className="lobby-actions">
                <button type="button" className="join-btn" onClick={startRehearsal}>
                  Continue in script rehearsal
                </button>
                <button
                  type="button"
                  className="dock-btn"
                  onClick={() => setPhase("setup")}
                >
                  Tavus settings
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="call-dock">
        <a className="dock-cta" href={bookUrl} target="_blank" rel="noreferrer">
          Book free session
        </a>
        {phase === "live" || phase === "rehearsal" ? (
          <button
            type="button"
            className="dock-btn danger"
            onClick={() => void leaveCall()}
          >
            Leave
          </button>
        ) : null}
        {phase === "lobby" && videoReady ? (
          <button
            type="button"
            className="dock-btn"
            onClick={() => setPhase("setup")}
          >
            API settings
          </button>
        ) : null}
      </div>

      {error && phase !== "error" ? <p className="banner warn">{error}</p> : null}

      {phase === "rehearsal" ? (
        <>
          <p className="living-note">
            Free rehearsal — same sales script, objections, and schedule logic.
            No Tavus minutes used. Add OpenAI key in `.env.local` for smarter
            replies; otherwise built-in demo replies are used.
          </p>
          <section className="transcript-panel rehearsal-chat">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                <span>
                  {m.role === "assistant" ? siteConfig.personaName : "You"}
                </span>
                <p>{m.content}</p>
              </div>
            ))}
            {busy ? (
              <div className="bubble assistant">
                <span>{siteConfig.personaName}</span>
                <p>…</p>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </section>
          <form className="live-composer" onSubmit={onRehearsalSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about memberships, schedule, objections…"
              aria-label="Message Maya"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
          <div className="starter-chips">
            {[
              "Walk me through how Steamoji works",
              "What does membership cost?",
              "Any free session times this Saturday?",
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => void sendMessage(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {phase === "lobby" ? (
        <p className="living-note">
          Out of Tavus conversational minutes? Use <strong>Script rehearsal</strong>{" "}
          to keep polishing the pitch. Living video needs available CVI minutes
          on your Tavus plan.
        </p>
      ) : null}
    </div>
  );
}
