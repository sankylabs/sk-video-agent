"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function EventPoster({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="event-poster event-poster-frame"
        aria-label={`Enlarge ${alt}`}
        onClick={() => setOpen(true)}
      >
        {/* The poster’s own size should decide the frame. next/image fill crops it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" fetchPriority="high" />
        <span className="event-poster-hint">Click to enlarge</span>
      </button>
      {open
        ? createPortal(
            <div
              className="poster-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={() => setOpen(false)}
            >
              <p id={titleId} className="poster-overlay-title">
                {alt}
              </p>
              <button
                ref={closeRef}
                type="button"
                className="poster-overlay-close"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="poster-overlay-image"
                src={src}
                alt={alt}
                onClick={(event) => event.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
