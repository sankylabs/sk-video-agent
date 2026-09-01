"use client";

import DailyIframe, {
  type DailyCall,
  type DailyEventObjectAppMessage,
  type DailyEventObjectFatalError,
  type DailyEventObjectLocalAudioLevel,
  type DailyEventObjectTrack,
} from "@daily-co/daily-js";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CALL_END_AFTER_WRAP_MS,
  CALL_NUDGE_AT_MS,
  CALL_NUDGE_LINE,
  CALL_WRAP_AFTER_NUDGE_MS,
  CALL_WRAP_LINE,
  isParentStartedSpeaking,
} from "@/lib/call-timeout";
import { siteConfig, trialUrl } from "@/lib/config";
import { mayaGreeting } from "@/lib/greeting";
import {
  claimsCalendarBooking,
  claimsCalendarCancel,
  encodeReachOutPick,
  encodeSlotPick,
  extractBookMarkers,
  extractCancelMarkers,
  extractPickedStart,
  extractSlotOptions,
  isCancelRequest,
  isSlotConfirmation,
  isExistingBookingRecap,
  MORE_OPTIONS_TEXT,
  MORE_SLOTS_MARKER,
  nextQuickQuestions,
  OFFER_REACH_OUT_MARKER,
  REACH_OUT_BUTTON,
  stripChatMarkers,
} from "@/lib/chat-actions";
import {
  extractReplicaSpeech,
  extractUserSpeech,
  isStaffOutreachConfirm,
  isStaffTalkRequest,
  replicaOfferedStaffOutreach,
} from "@/lib/staff-outreach";
import {
  SERVICES_IMAGE_MARKER,
  SERVICES_IMAGE_SRC,
} from "@/lib/services";

const MAYA_FACE_SRC = "/maya-r9d30b0e55ac.jpg";

type Phase = "lobby" | "connecting" | "live" | "rehearsal" | "error";
type Msg = { role: "user" | "assistant"; content: string };

type LeadInfo = {
  id?: string;
  name?: string;
  email?: string;
  childName?: string;
  childAge?: string;
  notes?: string;
  bookedStart?: string;
  bookedLabel?: string;
};

type Props = {
  lead?: LeadInfo | null;
  embedded?: boolean;
  initialMessages?: Msg[];
};

function ChatMessageBody({
  content,
  onMediaLoad,
  onPickSlot,
  onMoreOptions,
  onReachOut,
  pickedStarts,
  busy,
  showMoreOptions,
  showReachOut,
}: {
  content: string;
  onMediaLoad?: () => void;
  onPickSlot?: (start: string, label: string) => void;
  onMoreOptions?: () => void;
  onReachOut?: () => void;
  pickedStarts?: Set<string>;
  busy?: boolean;
  showMoreOptions?: boolean;
  showReachOut?: boolean;
}) {
  const showServices = content.includes(SERVICES_IMAGE_MARKER);
  const slots = extractSlotOptions(content);
  const openSlots = onPickSlot
    ? slots.filter((slot) => !pickedStarts?.has(slot.start))
    : [];
  const more =
    Boolean(showMoreOptions && onMoreOptions) &&
    content.includes(MORE_SLOTS_MARKER);
  const reachOut =
    Boolean(showReachOut && onReachOut) &&
    content.includes(OFFER_REACH_OUT_MARKER);
  const text = stripChatMarkers(content);
  if (!text && !showServices && !openSlots.length && !more && !reachOut) {
    return null;
  }
  return (
    <>
      {text ? <p>{text}</p> : null}
      {showServices ? (
        <Image
          src={SERVICES_IMAGE_SRC}
          alt="Steamoji Kirkland services: memberships, camps, VEX Robotics Club, and birthday parties"
          width={1024}
          height={682}
          className="services-card-image"
          onLoad={onMediaLoad}
        />
      ) : null}
      {openSlots.length || more || reachOut ? (
        <div className="slot-chips">
          {openSlots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              disabled={busy}
              onClick={() => onPickSlot?.(slot.start, slot.label)}
            >
              {slot.label}
            </button>
          ))}
          {more ? (
            <button
              type="button"
              className="slot-more"
              disabled={busy}
              onClick={() => onMoreOptions?.()}
            >
              {MORE_OPTIONS_TEXT}
            </button>
          ) : null}
          {reachOut ? (
            <button
              type="button"
              className="slot-more"
              disabled={busy}
              onClick={() => onReachOut?.()}
            >
              {REACH_OUT_BUTTON}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

const JOIN_TIMEOUT_MS = 45_000;
const PARENT_AUDIO_LEVEL_THRESHOLD = 0.12;
const PARENT_AUDIO_STREAK_NEEDED = 3;
const PARENT_STILL_TALKING_MS = 2_500;

export function LiveMaya({ lead, embedded = false, initialMessages }: Props) {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [videoReady, setVideoReady] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>(() =>
    initialMessages?.length
      ? initialMessages
      : [
          {
            role: "assistant",
            content: mayaGreeting({
              name: lead?.name,
              childName: lead?.childName,
              childAge: lead?.childAge,
            }),
          },
        ],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [offerStaffOutreach, setOfferStaffOutreach] = useState(false);
  const [staffOutreachSent, setStaffOutreachSent] = useState(false);
  const [staffOutreachBusy, setStaffOutreachBusy] = useState(false);
  const offerStaffOutreachRef = useRef(false);
  const staffOutreachSentRef = useRef(false);
  const lastUserSpeechRef = useRef("");
  const replicaSpeechRef = useRef("");
  const videoBookedStartsRef = useRef(new Set<string>());
  const videoBookBusyRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const joiningRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>("lobby");
  const callWatchStartedRef = useRef(false);
  const lastParentSpeechAtRef = useRef(0);
  const parentAudioStreakRef = useRef(0);
  const heardAfterNudgeRef = useRef(false);
  const callTimerRefs = useRef<{
    nudge: ReturnType<typeof setTimeout> | null;
    wrap: ReturnType<typeof setTimeout> | null;
    end: ReturnType<typeof setTimeout> | null;
    echo: ReturnType<typeof setTimeout> | null;
  }>({ nudge: null, wrap: null, end: null, echo: null });
  const bookUrl = useMemo(() => trialUrl(lead?.id), [lead?.id]);

  // Stable Daily listeners so leave/destroy can off() the same function refs.
  const dailyHandlersRef = useRef<{
    onLeftMeeting: () => void;
    onCallError: (ev: DailyEventObjectFatalError) => void;
    onJoinedMeeting: () => void;
    onTrackStarted: (ev: DailyEventObjectTrack) => void;
    onAppMessage: (ev: DailyEventObjectAppMessage) => void;
    onLocalAudioLevel: (ev: DailyEventObjectLocalAudioLevel) => void;
  }>({
    onLeftMeeting: () => undefined,
    onCallError: () => undefined,
    onJoinedMeeting: () => undefined,
    onTrackStarted: () => undefined,
    onAppMessage: () => undefined,
    onLocalAudioLevel: () => undefined,
  });

  const stableLeftMeeting = useRef(() => {
    dailyHandlersRef.current.onLeftMeeting();
  }).current;
  const stableCallError = useRef((ev: DailyEventObjectFatalError) => {
    dailyHandlersRef.current.onCallError(ev);
  }).current;
  const stableJoinedMeeting = useRef(() => {
    dailyHandlersRef.current.onJoinedMeeting();
  }).current;
  const stableTrackStarted = useRef((ev: DailyEventObjectTrack) => {
    dailyHandlersRef.current.onTrackStarted(ev);
  }).current;
  const stableAppMessage = useRef((ev: DailyEventObjectAppMessage) => {
    dailyHandlersRef.current.onAppMessage(ev);
  }).current;
  const stableLocalAudioLevel = useRef(
    (ev: DailyEventObjectLocalAudioLevel) => {
      dailyHandlersRef.current.onLocalAudioLevel(ev);
    },
  ).current;

  function setActiveConversation(id: string | null) {
    conversationIdRef.current = id;
    setConversationId(id);
  }

  function clearJoinTimeout() {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }

  function clearCallTimers() {
    const timers = callTimerRefs.current;
    for (const key of ["nudge", "wrap", "end", "echo"] as const) {
      if (timers[key]) {
        clearTimeout(timers[key]);
        timers[key] = null;
      }
    }
  }

  function clearCallWatch() {
    clearCallTimers();
    callWatchStartedRef.current = false;
    heardAfterNudgeRef.current = false;
    parentAudioStreakRef.current = 0;
    lastParentSpeechAtRef.current = 0;
  }

  function setOfferReachOut(next: boolean) {
    offerStaffOutreachRef.current = next;
    setOfferStaffOutreach(next);
  }

  async function requestVideoOutreach() {
    if (staffOutreachSentRef.current || staffOutreachBusy) return;
    staffOutreachSentRef.current = true;
    setStaffOutreachBusy(true);
    setOfferReachOut(false);
    try {
      const res = await fetch("/api/staff-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead?.id,
          channel: "video",
          userText: REACH_OUT_BUTTON,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setStaffOutreachSent(true);
      speakMayaLine(
        typeof data.content === "string" && data.content
          ? data.content
          : `I'll have someone from the Steamoji Kirkland team reach out to you. You can also call us now at ${siteConfig.phone}.`,
      );
    } catch {
      staffOutreachSentRef.current = false;
      setOfferReachOut(true);
      speakMayaLine(
        `I wasn't able to notify the team just now — please call us at ${siteConfig.phone}.`,
      );
    } finally {
      setStaffOutreachBusy(false);
    }
  }

  async function requestVideoBook(
    replicaText: string,
    opts?: { cancel?: boolean },
  ) {
    if (videoBookBusyRef.current) return;
    videoBookBusyRef.current = true;
    try {
      const res = await fetch("/api/video-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead?.id,
          userText: lastUserSpeechRef.current,
          replicaText,
          cancel: opts?.cancel || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.skipped || data.alreadyBooked) return;
      if (data.cancelled) {
        videoBookedStartsRef.current = new Set();
        return;
      }
      if (data.ok && typeof data.booking?.start === "string") {
        videoBookedStartsRef.current.add(data.booking.start);
        return;
      }
      speakMayaLine(
        data.pending
          ? "I need a parent email to send the calendar invite — what's the best address?"
          : typeof data.parentReply === "string" && data.parentReply
            ? data.parentReply
            : opts?.cancel
              ? "I wasn't able to cancel that on the calendar just now. You can also call us and we'll take care of it."
              : "I wasn't able to put that on the calendar just now. Let's pick another open time, or you can book online.",
      );
    } catch {
      speakMayaLine(
        opts?.cancel
          ? "I wasn't able to cancel that on the calendar just now. You can also call us and we'll take care of it."
          : "I wasn't able to put that on the calendar just now. Let's pick another open time, or you can book online.",
      );
    } finally {
      videoBookBusyRef.current = false;
    }
  }

  function speakMayaLine(text: string) {
    const call = callRef.current;
    const conversationId = conversationIdRef.current;
    if (!call || !conversationId) return;
    call.sendAppMessage(
      {
        message_type: "conversation",
        event_type: "conversation.interrupt",
        conversation_id: conversationId,
      },
      "*",
    );
    if (callTimerRefs.current.echo) {
      clearTimeout(callTimerRefs.current.echo);
    }
    callTimerRefs.current.echo = setTimeout(() => {
      callTimerRefs.current.echo = null;
      if (callRef.current !== call || conversationIdRef.current !== conversationId) {
        return;
      }
      call.sendAppMessage(
        {
          message_type: "conversation",
          event_type: "conversation.echo",
          conversation_id: conversationId,
          properties: { modality: "text", text, done: true },
        },
        "*",
      );
    }, 150);
  }

  function cancelWrapUp() {
    heardAfterNudgeRef.current = true;
    if (callTimerRefs.current.wrap) {
      clearTimeout(callTimerRefs.current.wrap);
      callTimerRefs.current.wrap = null;
    }
    if (callTimerRefs.current.end) {
      clearTimeout(callTimerRefs.current.end);
      callTimerRefs.current.end = null;
    }
  }

  function noteParentSpeech() {
    lastParentSpeechAtRef.current = Date.now();
    // After the 2-minute check-in has fired (or been skipped), speech keeps the call.
    if (callWatchStartedRef.current && callTimerRefs.current.nudge === null) {
      cancelWrapUp();
    }
  }

  function startCallWatch() {
    if (callWatchStartedRef.current) return;
    callWatchStartedRef.current = true;
    heardAfterNudgeRef.current = false;
    lastParentSpeechAtRef.current = 0;
    callRef.current?.startLocalAudioLevelObserver(200).catch(() => undefined);

    const giveNudge = () => {
      if (phaseRef.current !== "live" || !callRef.current) return;
      const recentlyHeard =
        Date.now() - lastParentSpeechAtRef.current < PARENT_STILL_TALKING_MS;
      if (recentlyHeard) {
        heardAfterNudgeRef.current = true;
        return;
      }
      heardAfterNudgeRef.current = false;
      speakMayaLine(CALL_NUDGE_LINE);
      callTimerRefs.current.wrap = setTimeout(() => {
        callTimerRefs.current.wrap = null;
        if (phaseRef.current !== "live" || heardAfterNudgeRef.current) return;
        speakMayaLine(CALL_WRAP_LINE);
        callTimerRefs.current.end = setTimeout(() => {
          callTimerRefs.current.end = null;
          if (phaseRef.current !== "live" || heardAfterNudgeRef.current) return;
          void leaveCall();
        }, CALL_END_AFTER_WRAP_MS);
      }, CALL_WRAP_AFTER_NUDGE_MS);
    };

    const waitForParentPause = (attempt: number) => {
      if (phaseRef.current !== "live" || !callRef.current) return;
      const parentIsTalking =
        Date.now() - lastParentSpeechAtRef.current < PARENT_STILL_TALKING_MS;
      if (parentIsTalking && attempt < 4) {
        callTimerRefs.current.nudge = setTimeout(
          () => waitForParentPause(attempt + 1),
          2000,
        );
        return;
      }
      callTimerRefs.current.nudge = null;
      giveNudge();
    };

    callTimerRefs.current.nudge = setTimeout(() => {
      waitForParentPause(0);
    }, CALL_NUDGE_AT_MS);
  }

  function clearMediaElements() {
    for (const el of [remoteVideoRef.current, remoteAudioRef.current]) {
      if (el) el.srcObject = null;
    }
  }

  function attachTrack(ev: DailyEventObjectTrack) {
    const { participant, track, type } = ev;
    if (!participant || !track || participant.local) return;

    if (type === "video" && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = new MediaStream([track]);
    }
    if (type === "audio" && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = new MediaStream([track]);
    }
  }

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (initialMessages?.length) {
      setMessages(initialMessages);
      return;
    }
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
    // Hydrate once per chat URL; transcript is owned by this lead after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

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

  async function destroyCall() {
    clearJoinTimeout();
    clearCallWatch();
    const call = callRef.current;
    callRef.current = null;
    if (!call) {
      clearMediaElements();
      return;
    }
    try {
      call.off("left-meeting", stableLeftMeeting);
      call.off("joined-meeting", stableJoinedMeeting);
      call.off("error", stableCallError);
      call.off("track-started", stableTrackStarted);
      call.off("app-message", stableAppMessage);
      call.off("local-audio-level", stableLocalAudioLevel);
      if (call.isLocalAudioLevelObserverRunning()) {
        call.stopLocalAudioLevelObserver();
      }
      await call.leave().catch(() => undefined);
      await call.destroy().catch(() => undefined);
    } catch {
      /* ignore cleanup errors */
    }
    clearMediaElements();
  }

  dailyHandlersRef.current.onLeftMeeting = () => {
    void (async () => {
      const id = conversationIdRef.current;
      await destroyCall();
      if (id) {
        await fetch(
          `/api/conversation?conversationId=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        ).catch(() => undefined);
      }
      setActiveConversation(null);
      setPhase((p) => (p === "live" || p === "connecting" ? "lobby" : p));
    })();
  };

  dailyHandlersRef.current.onCallError = (ev) => {
    clearJoinTimeout();
    setError(
      ev.errorMsg ||
        "We couldn’t start the video chat. Please try again, message Maya, or book a free session.",
    );
    setPhase("error");
    void destroyCall();
  };

  dailyHandlersRef.current.onJoinedMeeting = () => {
    clearJoinTimeout();
    setPhase("live");
    setVideoReady(true);
    startCallWatch();
  };

  dailyHandlersRef.current.onTrackStarted = attachTrack;

  dailyHandlersRef.current.onAppMessage = (ev) => {
    if (isParentStartedSpeaking(ev.data)) {
      noteParentSpeech();
    }
    const userSpeech = extractUserSpeech(ev.data);
    if (userSpeech) {
      lastUserSpeechRef.current = userSpeech;
      if (isCancelRequest(userSpeech) && !isSlotConfirmation(userSpeech)) {
        void requestVideoBook(replicaSpeechRef.current, { cancel: true });
      } else if (isSlotConfirmation(userSpeech)) {
        void requestVideoBook(replicaSpeechRef.current);
      }
    }
    const replicaSpeech = extractReplicaSpeech(ev.data);
    if (replicaSpeech) {
      replicaSpeechRef.current =
        `${replicaSpeechRef.current} ${replicaSpeech}`.trim().slice(-2000);
    }
    if (
      replicaSpeech &&
      !isExistingBookingRecap(replicaSpeech)
    ) {
      if (
        extractCancelMarkers(replicaSpeech).length > 0 ||
        claimsCalendarCancel(replicaSpeech)
      ) {
        void requestVideoBook(replicaSpeech, { cancel: true });
      } else if (
        extractBookMarkers(replicaSpeech).length > 0 ||
        claimsCalendarBooking(replicaSpeech)
      ) {
        const tagged = extractBookMarkers(replicaSpeech)[0];
        if (!tagged || !videoBookedStartsRef.current.has(tagged)) {
          void requestVideoBook(replicaSpeech);
        }
      }
    }
    if (staffOutreachSentRef.current) return;
    if (userSpeech) {
      if (isStaffTalkRequest(userSpeech)) {
        setOfferReachOut(true);
      } else if (
        offerStaffOutreachRef.current &&
        (isStaffOutreachConfirm(userSpeech) ||
          /^(yes|yeah|yep|please|sure|ok|okay)\b/i.test(userSpeech.trim()) &&
            userSpeech.trim().length < 40)
      ) {
        void requestVideoOutreach();
      }
    }
    if (replicaSpeech && replicaOfferedStaffOutreach(replicaSpeech)) {
      setOfferReachOut(true);
    }
  };

  dailyHandlersRef.current.onLocalAudioLevel = (ev) => {
    if (ev.audioLevel >= PARENT_AUDIO_LEVEL_THRESHOLD) {
      parentAudioStreakRef.current += 1;
      if (parentAudioStreakRef.current >= PARENT_AUDIO_STREAK_NEEDED) {
        parentAudioStreakRef.current = 0;
        noteParentSpeech();
      }
      return;
    }
    parentAudioStreakRef.current = 0;
  };

  async function joinCall() {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setError(null);
    setPhase("connecting");

    try {
      await destroyCall();

      joinTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current !== "connecting") return;
        void (async () => {
          await destroyCall();
          setPhase("error");
          setError(
            "Video chat is taking too long to connect. Please try again, message Maya, or book a free session.",
          );
          joiningRef.current = false;
        })();
      }, JOIN_TIMEOUT_MS);

      // Headless Daily call object — no Prebuilt lobby / second Join button.
      // Tavus CVI rooms often leave enable_prejoin_ui on; createFrame would
      // hang in that lobby while our host stayed hidden (pointer-events: none).
      const call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
      });
      callRef.current = call;
      call.on("left-meeting", stableLeftMeeting);
      call.on("joined-meeting", stableJoinedMeeting);
      call.on("error", stableCallError);
      call.on("track-started", stableTrackStarted);
      call.on("app-message", stableAppMessage);
      call.on("local-audio-level", stableLocalAudioLevel);

      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead?.id }),
      });
      const data = await res.json();

      if (
        res.status === 503 ||
        data.needsSetup ||
        !res.ok ||
        !data.conversationUrl
      ) {
        await destroyCall();
        setPhase("error");
        setError(
          data.hint ||
            data.error ||
            "Maya’s video chat isn’t available right now. You can message her instead, or book a free session.",
        );
        setVideoReady(false);
        return;
      }

      // If a newer join started or we cleaned up, don't join on a stale call.
      if (callRef.current !== call) return;

      setActiveConversation(data.conversationId || null);
      await call.join({
        url: data.conversationUrl as string,
        userName: lead?.name || "Parent",
        startVideoOff: true,
      });
      call.setLocalVideo(false);

      if (callRef.current !== call) return;

      clearJoinTimeout();
      setPhase("live");
      setVideoReady(true);
      startCallWatch();

      // Attach any tracks that started before our listener (or during join).
      const participants = call.participants();
      for (const [id, participant] of Object.entries(participants)) {
        if (id === "local") continue;
        const videoTrack = participant.tracks?.video?.persistentTrack;
        const audioTrack = participant.tracks?.audio?.persistentTrack;
        if (
          videoTrack &&
          participant.tracks?.video?.state === "playable" &&
          remoteVideoRef.current
        ) {
          remoteVideoRef.current.srcObject = new MediaStream([videoTrack]);
        }
        if (
          audioTrack &&
          participant.tracks?.audio?.state === "playable" &&
          remoteAudioRef.current
        ) {
          remoteAudioRef.current.srcObject = new MediaStream([audioTrack]);
        }
      }
    } catch (err) {
      await destroyCall();
      setPhase("error");
      const detail =
        err instanceof Error && err.message.trim() ? err.message.trim() : null;
      setError(
        detail ||
          "We couldn’t start the video chat. Please try again, message Maya, or book a free session.",
      );
    } finally {
      joiningRef.current = false;
    }
  }

  async function startRehearsal() {
    void destroyCall();
    setError(null);
    setActiveConversation(null);
    if (lead?.id) {
      try {
        const res = await fetch(
          `/api/session?leadId=${encodeURIComponent(lead.id)}`,
        );
        const data = await res.json();
        if (Array.isArray(data.messages) && data.messages.length) {
          setMessages(data.messages);
          setPhase("rehearsal");
          return;
        }
      } catch {
        /* fall through to local messages */
      }
    }
    setMessages((prev) =>
      prev.length
        ? prev
        : [
            {
              role: "assistant",
              content: mayaGreeting({
                name: lead?.name,
                childName: lead?.childName,
                childAge: lead?.childAge,
              }),
            },
          ],
    );
    setPhase("rehearsal");
  }

  async function leaveCall() {
    const id = conversationIdRef.current;
    await destroyCall();
    if (id) {
      await fetch(
        `/api/conversation?conversationId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ).catch(() => undefined);
    }
    setActiveConversation(null);
    setOfferReachOut(false);
    staffOutreachSentRef.current = false;
    setStaffOutreachSent(false);
    lastUserSpeechRef.current = "";
    replicaSpeechRef.current = "";
    videoBookedStartsRef.current = new Set();
    videoBookBusyRef.current = false;
    setPhase("lobby");
  }

  useEffect(() => {
    return () => {
      void destroyCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, []);

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

  const statusLine =
    phase === "live"
      ? "You’re live with Maya"
      : phase === "rehearsal"
        ? "Text chat with Maya"
        : phase === "connecting"
          ? "Connecting…"
          : phase === "error"
            ? "Video unavailable"
            : `${siteConfig.personaTitle} · ${siteConfig.brand}`;

  const showAvatar = phase !== "live" && phase !== "rehearsal";
  const remainingChips = nextQuickQuestions(
    messages.filter((m) => m.role === "user").map((m) => m.content),
  );
  const pickedStarts = new Set(
    messages
      .filter((m) => m.role === "user")
      .map((m) => extractPickedStart(m.content))
      .filter((start): start is string => Boolean(start)),
  );
  const latestSlotIndex = messages.reduce((acc, m, i) => {
    if (m.role !== "assistant") return acc;
    if (
      extractSlotOptions(m.content).length ||
      m.content.includes(MORE_SLOTS_MARKER)
    ) {
      return i;
    }
    return acc;
  }, -1);
  const alreadyRequestedOutreach = messages.some(
    (m) => m.role === "user" && isStaffOutreachConfirm(m.content),
  );
  const latestReachOutIndex = messages.reduce((acc, m, i) => {
    if (m.role === "assistant" && m.content.includes(OFFER_REACH_OUT_MARKER)) {
      return i;
    }
    return acc;
  }, -1);

  return (
    <div className={`live-maya ${embedded ? "is-embedded" : ""} ${phase}`}>
      <header className="maya-brand">
        <div className="maya-brand-top">
          <div className="maya-brand-lockup">
            <Image
              src="/steamoji-kirkland-logo.png"
              alt=""
              width={88}
              height={88}
              priority
              className="maya-brand-logo"
            />
            <h1 className="maya-brand-name">{siteConfig.brand}</h1>
          </div>
          <div className="maya-brand-copy">
            <p className="maya-brand-mission">
              <span className="maya-brand-mission-label">Our Mission:</span>{" "}
              {siteConfig.mission}
            </p>
            <p className="maya-brand-location">
              <span>Kirkland</span>
              {siteConfig.address}
            </p>
          </div>
        </div>
      </header>

      <div className="live-frame">
        <div className="live-badge">
          <span className="pulse" />
          {phase === "live"
            ? "LIVE"
            : phase === "rehearsal"
              ? "CHAT"
              : phase === "connecting"
                ? "CONNECTING"
                : "MAYA"}
        </div>

        <div
          className={`presence ${phase === "live" ? "is-live" : ""} ${phase === "rehearsal" ? "is-rehearsal" : ""} ${phase === "connecting" ? "is-connecting" : ""}`}
        >
          {showAvatar ? (
            <>
              <div className="presence-glow" />
              <div className="presence-ring" />
              <Image
                src={MAYA_FACE_SRC}
                alt={`${siteConfig.personaName} — ${siteConfig.personaTitle}`}
                width={960}
                height={960}
                priority
                className="presence-face"
              />
            </>
          ) : null}
          <div
            className={`daily-host ${phase === "live" ? "is-active" : ""}`}
            aria-hidden={phase !== "live"}
          >
            <video
              ref={remoteVideoRef}
              className="maya-remote-video"
              autoPlay
              playsInline
            />
            <audio ref={remoteAudioRef} autoPlay playsInline />
          </div>
        </div>

        <div className="live-overlay">
          <div className="identity">
            <strong>
              {siteConfig.personaName}
              <em> · {siteConfig.personaTitle}</em>
            </strong>
            <span>{statusLine}</span>
          </div>

          {phase === "rehearsal" ? (
            <button
              type="button"
              className="dock-btn danger chat-end-btn"
              onClick={() => void leaveCall()}
            >
              End chat
            </button>
          ) : null}

          {phase === "lobby" ? (
            <div className="lobby-copy">
              <h2>Meet {siteConfig.personaName}</h2>
              <p>
                Ask about programs, schedules, and free trials for your child —
                talk with our Steamoji Kirkland AI enrollment advisor.
              </p>
              <div className="lobby-actions">
                <button
                  type="button"
                  className="join-btn"
                  onClick={() => void joinCall()}
                >
                  Talk with {siteConfig.personaName}
                </button>
                <span className="lobby-or">OR</span>
                <button
                  type="button"
                  className="dock-btn"
                  onClick={startRehearsal}
                >
                  Chat with {siteConfig.personaName}
                </button>
              </div>
              <p className="lobby-note">
                Allow microphone when prompted so Maya can hear you. You don’t
                need a camera — you’ll see and hear her.
              </p>
            </div>
          ) : null}

          {phase === "connecting" ? (
            <div className="lobby-copy">
              <h2>Connecting you with {siteConfig.personaName}…</h2>
              <p>Just a moment — Maya will appear automatically.</p>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="lobby-copy">
              <h2>Video chat isn’t available</h2>
              <p>
                {error ||
                  "Please try again in a moment, message Maya, or book a free session online."}
              </p>
              <div className="lobby-actions">
                <button
                  type="button"
                  className="join-btn"
                  onClick={() => void joinCall()}
                >
                  Try video again
                </button>
                <button
                  type="button"
                  className="dock-btn"
                  onClick={startRehearsal}
                >
                  Message Maya
                </button>
                <a
                  className="dock-btn"
                  href={bookUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Book free session
                </a>
              </div>
              <button
                type="button"
                className="dock-btn"
                onClick={() => {
                  setError(null);
                  setPhase("lobby");
                }}
              >
                Back
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="call-dock">
        <a className="dock-cta" href={bookUrl} target="_blank" rel="noreferrer">
          Book free session
        </a>
        {phase === "live" && offerStaffOutreach && !staffOutreachSent ? (
          <button
            type="button"
            className="dock-btn"
            disabled={staffOutreachBusy}
            onClick={() => void requestVideoOutreach()}
          >
            {REACH_OUT_BUTTON}
          </button>
        ) : null}
        {phase === "live" ? (
          <button
            type="button"
            className="dock-btn danger"
            onClick={() => void leaveCall()}
          >
            Leave
          </button>
        ) : null}
      </div>

      {error && phase !== "error" ? <p className="banner warn">{error}</p> : null}

      {phase === "rehearsal" ? (
        <>
          <p className="living-note">
            Chat with {siteConfig.personaName} about Steamoji Kirkland — programs,
            schedules, and free trials. Prefer video? End chat and choose{" "}
            <strong>Talk with {siteConfig.personaName}</strong>.
          </p>
          <section className="transcript-panel rehearsal-chat">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.role === "assistant" ? (
                  <Image
                    src={MAYA_FACE_SRC}
                    alt=""
                    width={40}
                    height={40}
                    className="bubble-avatar"
                  />
                ) : null}
                <div className="bubble-body">
                  <span>
                    {m.role === "assistant" ? siteConfig.personaName : "You"}
                  </span>
                  <ChatMessageBody
                    content={m.content}
                    busy={busy}
                    pickedStarts={pickedStarts}
                    showMoreOptions={i === latestSlotIndex}
                    showReachOut={
                      i === latestReachOutIndex && !alreadyRequestedOutreach
                    }
                    onPickSlot={
                      m.role === "assistant"
                        ? (start, label) =>
                            void sendMessage(encodeSlotPick(start, label))
                        : undefined
                    }
                    onMoreOptions={
                      m.role === "assistant"
                        ? () => void sendMessage(MORE_OPTIONS_TEXT)
                        : undefined
                    }
                    onReachOut={
                      m.role === "assistant"
                        ? () => void sendMessage(encodeReachOutPick())
                        : undefined
                    }
                    onMediaLoad={() =>
                      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
                    }
                  />
                </div>
              </div>
            ))}
            {busy ? (
              <div className="bubble assistant">
                <Image
                  src={MAYA_FACE_SRC}
                  alt=""
                  width={40}
                  height={40}
                  className="bubble-avatar"
                />
                <div className="bubble-body">
                  <span>{siteConfig.personaName}</span>
                  <p>…</p>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </section>
          <form className="live-composer" onSubmit={onRehearsalSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about programs, schedule, free trials…"
              aria-label={`Message ${siteConfig.personaName}`}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
          {remainingChips.length ? (
            <div className="starter-chips">
              {remainingChips.map((chip) => (
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
          ) : null}
        </>
      ) : null}
    </div>
  );
}
