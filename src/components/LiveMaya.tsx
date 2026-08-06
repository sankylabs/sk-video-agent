"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { siteConfig, trialUrl } from "@/lib/config";

type Phase = "lobby" | "setup" | "connecting" | "live" | "error";

type LeadInfo = {
  id?: string;
  name?: string;
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
  const bookUrl = useMemo(() => trialUrl(lead?.id), [lead?.id]);

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

  return (
    <div className={`live-maya ${embedded ? "is-embedded" : ""} ${phase}`}>
      <div className="live-frame">
        <div className="live-badge">
          <span className="pulse" />
          {phase === "live" ? "LIVE VIDEO" : "LIVE ON THIS PAGE"}
        </div>

        <div className={`presence ${phase === "live" ? "is-live" : ""}`}>
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
                src="/maya-avatar.png"
                alt={`${siteConfig.personaName} — ${siteConfig.personaTitle}`}
                width={720}
                height={720}
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
              <em> · {siteConfig.brand}</em>
            </strong>
            <span>
              {phase === "live"
                ? "Photoreal talking avatar"
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
                Real face-to-face video — natural speech, lip-sync, and body
                movement. Not a still photo with robot voice.
              </p>
              <button
                type="button"
                className="join-btn"
                onClick={() => {
                  if (videoReady) void joinCall();
                  else setPhase("setup");
                }}
              >
                {videoReady ? "Start living video call" : "Enable living video"}
              </button>
              <p className="lobby-note">
                Powered by Tavus conversational video (same category as 1mind’s
                talking Superhumans).
              </p>
            </div>
          ) : null}

          {phase === "setup" ? (
            <div className="lobby-copy setup-copy">
              <h2>Enable living Maya</h2>
              <p>
                Browser text-to-speech can’t do human motion. Paste a{" "}
                <a
                  href="https://platform.tavus.io"
                  target="_blank"
                  rel="noreferrer"
                >
                  Tavus
                </a>{" "}
                API key to unlock a photoreal female avatar that talks and moves
                in real time.
              </p>
              <ol className="setup-steps">
                <li>
                  Create a free/paid account at{" "}
                  <a
                    href="https://platform.tavus.io"
                    target="_blank"
                    rel="noreferrer"
                  >
                    platform.tavus.io
                  </a>
                </li>
                <li>Copy an API key from the dashboard / PAL Maker</li>
                <li>Paste it below — we’ll create Maya’s sales brain automatically</li>
              </ol>
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
              <p className="lobby-note">
                Keys often do <strong>not</strong> start with tvsk_. Copy from{" "}
                <a
                  href="https://maker.tavus.io/dev/api-keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  maker.tavus.io/dev/api-keys
                </a>{" "}
                right after creating it (many keys are shown only once).
              </p>
              <button
                type="button"
                className="dock-btn"
                onClick={() => setPhase("lobby")}
              >
                Back
              </button>
            </div>
          ) : null}

          {phase === "connecting" ? (
            <div className="lobby-copy">
              <h2>Bringing Maya into the room…</h2>
              <p>
                Loading photoreal face, natural voice, and conversation brain.
              </p>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="lobby-copy">
              <h2>Couldn’t start living video</h2>
              <p>{error}</p>
              <button
                type="button"
                className="join-btn"
                onClick={() => setPhase("setup")}
              >
                Check Tavus setup
              </button>
            </div>
          ) : null}
        </div>

        <div className="call-dock">
          <a className="dock-cta" href={bookUrl} target="_blank" rel="noreferrer">
            Book free session
          </a>
          {phase === "live" ? (
            <button type="button" className="dock-btn danger" onClick={() => void leaveCall()}>
              Leave call
            </button>
          ) : null}
          {phase === "lobby" && videoReady ? (
            <button type="button" className="dock-btn" onClick={() => setPhase("setup")}>
              API settings
            </button>
          ) : null}
        </div>
      </div>

      {error && phase !== "error" ? <p className="banner warn">{error}</p> : null}

      {phase === "lobby" ? (
        <p className="living-note">
          {videoReady
            ? "Living video is configured. When you join, Maya appears as a moving, speaking avatar — not a static image."
            : "Until Tavus is connected, we won’t fall back to robotic browser speech. Living video only."}
        </p>
      ) : null}
    </div>
  );
}
