import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowsClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CaretUpIcon,
  DotsSixVerticalIcon,
  EyeSlashIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MinusIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from "@phosphor-icons/react";
import { useVoiceChat } from "./VoiceChatContext.jsx";
import "./VideoStage.css";

// Floating "table" of camera tiles for the party call. Lives beside the voice
// widget (App.jsx), shows only while someone's video is actually on screen,
// and parks in a screen corner the player chooses: drag and flick it, or use
// the grip button to step it round the corners from the keyboard. Expanded,
// it becomes the theater: the table fills the screen for roleplay, with its
// own mic and camera buttons since it covers the voice widget.

const CORNERS = ["tl", "tr", "br", "bl"]; // clockwise, for keyboard stepping
const LAYOUT_KEY = "videoStageLayout";
const DRAG_THRESHOLD_PX = 4;
const MAX_RELEASE_VELOCITY = 3000; // px/s; a hard flick, still lands on screen
// Apple's PiP spring: critically damped (no overshoot), 0.4s response.
const SPRING_RESPONSE = 0.4;
const SPRING_STIFFNESS = (2 * Math.PI / SPRING_RESPONSE) ** 2;
const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS);

function loadLayout() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAYOUT_KEY)) || {};
    return {
      corner: CORNERS.includes(saved.corner) ? saved.corner : "bl",
      large: Boolean(saved.large),
      collapsed: Boolean(saved.collapsed),
    };
  } catch {
    return { corner: "bl", large: false, collapsed: false };
  }
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

// Where a flick is headed, not where it was let go (scroll-style decay).
function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// Past the screen edge the stage follows less and less instead of stopping dead.
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// Largest 16:9 tiles that fit `count` of them in a width x height box. Near
// ties go to the wider layout: two faces side by side read as a conversation,
// stacked they read as a list.
function fitTiles(count, width, height, gap) {
  const options = [];
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const byWidth = (width - gap * (cols - 1)) / cols;
    const byHeight = ((height - gap * (rows - 1)) / rows) * (16 / 9);
    options.push({ cols, tileW: Math.max(0, Math.floor(Math.min(byWidth, byHeight))) });
  }
  const biggest = Math.max(...options.map((o) => o.tileW));
  return options.filter((o) => o.tileW >= biggest * 0.95).at(-1);
}

const THEATER_GAP = 10;

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function VideoTile({ name, stream, wantVideo, mirrored, speaking, muted, reconnecting, note }) {
  const videoRef = useRef(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream ?? null;
    if (stream) el.play().catch(() => {});
  }, [stream]);

  // A remote track exists (muted) from the moment the call connects; it only
  // unmutes once frames actually arrive. Showing the <video> before that
  // would flash a black box, so the avatar holds until then.
  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    if (!track) {
      setLive(false);
      return undefined;
    }
    const update = () => setLive(!track.muted && track.readyState === "live");
    update();
    track.addEventListener("mute", update);
    track.addEventListener("unmute", update);
    track.addEventListener("ended", update);
    return () => {
      track.removeEventListener("mute", update);
      track.removeEventListener("unmute", update);
      track.removeEventListener("ended", update);
    };
  }, [stream]);

  const showVideo = wantVideo && live;
  const classes = ["video-tile", speaking && "video-tile--speaking", showVideo && "video-tile--live"].filter(Boolean).join(" ");

  return (
    <figure className={classes}>
      <div className="video-tile-fallback" aria-hidden={showVideo}>
        <span className="video-tile-avatar">{initial(name)}</span>
        {note && <span className="video-tile-note">{note}</span>}
      </div>
      {stream && (
        <video
          ref={videoRef}
          className={`video-tile-video${mirrored ? " video-tile-video--mirrored" : ""}`}
          autoPlay
          playsInline
          muted
        />
      )}
      <figcaption className="video-tile-plate">
        {muted && <MicrophoneSlashIcon weight="bold" className="video-tile-plate-icon video-tile-plate-icon--muted" aria-label="muted" />}
        {reconnecting && <ArrowsClockwiseIcon weight="bold" className="video-tile-plate-icon" aria-label="reconnecting" />}
        <span className="video-tile-name">{name}</span>
      </figcaption>
    </figure>
  );
}

export default function VideoStage() {
  const {
    inCall,
    participants,
    selfName,
    selfMuted,
    selfSpeaking,
    voiceInputMode,
    pttHeld,
    cameraOn,
    cameraStarting,
    localVideoStream,
    receiveVideo,
    toggleSelfMute,
    toggleCamera,
    canUseCamera,
  } = useVoiceChat();

  const [layout, setLayout] = useState(loadLayout);
  const [dragging, setDragging] = useState(false);
  const [gridEl, setGridEl] = useState(null);
  const [theaterFit, setTheaterFit] = useState(null);
  const toggleBtnRef = useRef(null);
  const refocusToggleRef = useRef(false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 }); // live on-screen translate, the spring's starting point
  const springFrameRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // Storage blocked: the layout just won't persist.
    }
  }, [layout]);

  const othersOnCamera = participants.filter((p) => p.camera).length;
  const visible = inCall && (cameraOn || cameraStarting || (receiveVideo && othersOnCamera > 0));
  const theater = visible && layout.large;
  const tileCount = participants.length + 1;

  // Theater tiles are sized to the room they have, not a fixed width: as big
  // as they can be while everyone still fits without scrolling.
  useEffect(() => {
    if (!theater || !gridEl) {
      setTheaterFit(null);
      return undefined;
    }
    const measure = () => {
      const style = getComputedStyle(gridEl);
      const innerW = gridEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const innerH = gridEl.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setTheaterFit(fitTiles(tileCount, innerW, innerH, THEATER_GAP));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gridEl);
    return () => observer.disconnect();
  }, [theater, gridEl, tileCount]);

  // The toggle button remounts with the stage, so keyboard focus follows it.
  useEffect(() => {
    if (!refocusToggleRef.current) return;
    refocusToggleRef.current = false;
    toggleBtnRef.current?.focus({ preventScroll: true });
  }, [theater]);

  // Esc steps back out of the theater.
  useEffect(() => {
    if (!theater) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      refocusToggleRef.current = true;
      setLayout((prev) => ({ ...prev, large: false }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theater]);

  // Hidden mid-glide: drop the motion so it reappears cleanly in its corner.
  useEffect(() => {
    if (visible) return undefined;
    cancelAnimationFrame(springFrameRef.current);
    springFrameRef.current = null;
    offsetRef.current = { x: 0, y: 0 };
    dragRef.current?.stopListening();
    dragRef.current = null;
    setDragging(false);
    return undefined;
  }, [visible]);
  useEffect(
    () => () => {
      cancelAnimationFrame(springFrameRef.current);
      dragRef.current?.stopListening();
    },
    []
  );

  if (!visible) return null;

  // ------------------------------------------------------------ motion
  function setOffset(x, y) {
    offsetRef.current = { x, y };
    const el = stageRef.current;
    if (el) el.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : "";
  }

  function cancelSpring() {
    cancelAnimationFrame(springFrameRef.current);
    springFrameRef.current = null;
  }

  // Settle the offset back to zero (the anchored corner), carrying the
  // release velocity so there's no seam between the drag and the glide.
  function springHome(velocityX = 0, velocityY = 0) {
    cancelSpring();
    if (reduceMotion) {
      setOffset(0, 0);
      return;
    }
    let { x, y } = offsetRef.current;
    let vx = velocityX;
    let vy = velocityY;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const substeps = 4;
      const h = dt / substeps;
      for (let i = 0; i < substeps; i++) {
        vx += (-SPRING_STIFFNESS * x - SPRING_DAMPING * vx) * h;
        vy += (-SPRING_STIFFNESS * y - SPRING_DAMPING * vy) * h;
        x += vx * h;
        y += vy * h;
      }
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(vx) < 8 && Math.abs(vy) < 8) {
        setOffset(0, 0);
        springFrameRef.current = null;
        return;
      }
      setOffset(x, y);
      springFrameRef.current = requestAnimationFrame(step);
    };
    springFrameRef.current = requestAnimationFrame(step);
  }

  // FLIP into a new corner: re-anchor in CSS, then start the transform from
  // wherever the stage is on screen right now and spring it home.
  function moveToCorner(corner, velocityX = 0, velocityY = 0) {
    const el = stageRef.current;
    if (!el) return;
    const before = el.getBoundingClientRect();
    flushSync(() => setLayout((prev) => ({ ...prev, corner })));
    el.style.transform = "";
    const after = el.getBoundingClientRect();
    setOffset(before.left - after.left, before.top - after.top);
    springHome(velocityX, velocityY);
  }

  // Theater and corner stage are separate mounts (keyed below), so a glide
  // in progress is dropped rather than carried into the other layout.
  function setTheater(on) {
    cancelSpring();
    offsetRef.current = { x: 0, y: 0 };
    refocusToggleRef.current = true;
    setLayout((prev) => ({ ...prev, large: on, collapsed: on ? false : prev.collapsed }));
  }

  // ------------------------------------------------------------ drag
  function handlePointerDown(e) {
    if (theater) return; // fills the screen; nothing to move
    if (e.button !== 0 || dragRef.current) return; // one pointer at a time
    if (e.target.closest("[data-no-drag]")) return;
    cancelSpring(); // grabbed mid-glide: continue from where it is now
    const rect = stageRef.current.getBoundingClientRect();
    // Tracked on the window, not the bar: a fast flick can leave the bar
    // before its first move event, and pointer capture on press would
    // retarget the click and break a plain tap on the grip button.
    const onMove = (ev) => handlePointerMove(ev);
    const onUp = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      stopListening();
      handlePointerUp(ev);
    };
    function stopListening() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    dragRef.current = {
      stopListening,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - offsetRef.current.x,
      grabY: e.clientY - offsetRef.current.y,
      // The anchored box (no transform), for edge resistance.
      base: { left: rect.left - offsetRef.current.x, top: rect.top - offsetRef.current.y, width: rect.width, height: rect.height },
      history: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
      active: false,
    };
  }

  function handlePointerMove(e) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      setDragging(true);
    }
    const { base } = drag;
    const margin = 8;
    const clampAxis = (offset, start, size, viewport) => {
      const min = margin - start;
      const max = viewport - margin - size - start;
      if (offset < min) return min + rubberband(offset - min, size);
      if (offset > max) return max + rubberband(offset - max, size);
      return offset;
    };
    setOffset(
      clampAxis(e.clientX - drag.grabX, base.left, base.width, window.innerWidth),
      clampAxis(e.clientY - drag.grabY, base.top, base.height, window.innerHeight)
    );
    drag.history.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (drag.history.length > 6) drag.history.shift();
  }

  function handlePointerUp(e) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.active) return;
    setDragging(false);
    // A drag that ends over the grip button also fires its click: swallow
    // just that one. The click (if any) dispatches before this timeout runs.
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    // Release velocity from the last ~100ms of movement.
    const recent = drag.history.filter((p) => e.timeStamp - p.t < 100);
    const first = recent[0] ?? drag.history[0];
    const last = drag.history[drag.history.length - 1];
    // Clamped: two events a millisecond apart would otherwise read as a
    // near-infinite flick and throw the stage off-screen.
    const elapsed = Math.max(16, last.t - first.t) / 1000;
    const clampVelocity = (v) => Math.max(-MAX_RELEASE_VELOCITY, Math.min(MAX_RELEASE_VELOCITY, v));
    const vx = recent.length > 1 ? clampVelocity((last.x - first.x) / elapsed) : 0;
    const vy = recent.length > 1 ? clampVelocity((last.y - first.y) / elapsed) : 0;

    const rect = stageRef.current.getBoundingClientRect();
    const landX = rect.left + rect.width / 2 + project(vx);
    const landY = rect.top + rect.height / 2 + project(vy);
    const corner = `${landY < window.innerHeight / 2 ? "t" : "b"}${landX < window.innerWidth / 2 ? "l" : "r"}`;
    moveToCorner(corner, vx, vy);
  }

  function handleGripClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const next = CORNERS[(CORNERS.indexOf(layout.corner) + 1) % CORNERS.length];
    moveToCorner(next);
  }

  // ------------------------------------------------------------ tiles
  const othersHiddenNote = receiveVideo ? null : "Camera hidden";
  const tiles = participants.map((p) => ({
    key: p.userId,
    name: p.name,
    stream: p.videoStream,
    wantVideo: p.camera && receiveVideo,
    speaking: p.speaking,
    muted: p.muted,
    reconnecting: p.reconnecting,
    note: p.camera ? othersHiddenNote : null,
  }));
  tiles.push({
    key: "self",
    name: selfName ? `${selfName} (you)` : "You",
    stream: localVideoStream,
    wantVideo: cameraOn,
    mirrored: true,
    // Same rule as the voice panel: only ring while actually transmitting.
    speaking: selfSpeaking && !selfMuted && (voiceInputMode !== "push_to_talk" || pttHeld),
    muted: selfMuted,
    note: cameraStarting ? "Starting camera…" : null,
  });

  const collapsed = layout.collapsed && !theater;
  const columns = theater ? (theaterFit?.cols ?? 1) : tiles.length <= 1 ? 1 : 2;
  const onCameraCount = othersOnCamera + (cameraOn ? 1 : 0);

  const classes = [
    "video-stage",
    `video-stage--${layout.corner}`,
    theater && "video-stage--theater",
    collapsed && "video-stage--collapsed",
    dragging && "video-stage--dragging",
  ]
    .filter(Boolean)
    .join(" ");

  const stageStyle = { "--video-cols": columns };
  // Theater tiles hold at zero until measured, rather than flash at the wrong size.
  if (theater) stageStyle["--tile-w"] = `${theaterFit?.tileW ?? 0}px`;

  return (
    <>
      {theater && <div className="video-theater-scrim" onClick={() => setTheater(false)} aria-hidden="true" />}
      <section
        key={theater ? "theater" : "corner"}
        className={classes}
        ref={stageRef}
        aria-label={theater ? "Party video, full screen" : "Party video"}
        style={stageStyle}
      >
      <header className="video-stage-bar" onPointerDown={handlePointerDown}>
        {!theater && (
          <button
            type="button"
            className="video-stage-grip"
            onClick={handleGripClick}
            aria-label="Move video to the next corner"
            title="Drag to move, or click to step corners"
          >
            <DotsSixVerticalIcon weight="bold" />
          </button>
        )}
        <div className="video-stage-title">
          <span className="video-stage-heading">At the Table</span>
          <span className="video-stage-count num-tabular">
            <VideoCameraIcon weight="fill" aria-hidden="true" />
            {onCameraCount} on camera
          </span>
        </div>
        <div className="video-stage-actions" data-no-drag>
          {/* The theater covers the voice widget, so its two everyday controls come along. */}
          {theater && (
            <>
              <button
                type="button"
                className={`video-stage-btn video-stage-btn--labelled${selfMuted ? " video-stage-btn--muted" : ""}`}
                onClick={toggleSelfMute}
                aria-pressed={selfMuted}
                title={selfMuted ? "Unmute yourself" : "Mute yourself"}
              >
                {selfMuted ? <MicrophoneSlashIcon weight="bold" /> : <MicrophoneIcon weight="bold" />}
                <span>{selfMuted ? "Muted" : "Mic on"}</span>
              </button>
              {canUseCamera && (
                <button
                  type="button"
                  className={`video-stage-btn video-stage-btn--labelled${cameraOn ? " video-stage-btn--on" : ""}`}
                  onClick={toggleCamera}
                  disabled={cameraStarting}
                  aria-pressed={cameraOn}
                  title={cameraOn ? "Turn your camera off" : "Turn your camera on"}
                >
                  {cameraOn ? <VideoCameraIcon weight="fill" /> : <VideoCameraSlashIcon weight="bold" />}
                  <span>{cameraOn ? "Camera on" : "Camera off"}</span>
                </button>
              )}
              <span className="video-stage-divider" aria-hidden="true" />
            </>
          )}
          {!collapsed && (
            <button
              ref={toggleBtnRef}
              type="button"
              className="video-stage-btn"
              onClick={() => setTheater(!theater)}
              aria-label={theater ? "Exit full screen video" : "Full screen video"}
              title={theater ? "Exit full screen (Esc)" : "Full screen, for roleplay"}
            >
              {theater ? <ArrowsInSimpleIcon weight="bold" /> : <ArrowsOutSimpleIcon weight="bold" />}
            </button>
          )}
          {!theater && (
            <button
              type="button"
              className="video-stage-btn"
              onClick={() => setLayout((prev) => ({ ...prev, collapsed: !prev.collapsed }))}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Show video" : "Minimise video"}
              title={collapsed ? "Show video" : "Minimise"}
            >
              {collapsed ? <CaretUpIcon weight="bold" /> : <MinusIcon weight="bold" />}
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div className="video-stage-grid" ref={theater ? setGridEl : undefined}>
          <div className="video-stage-tiles">
            {tiles.map(({ key, ...tile }) => (
              <VideoTile key={key} {...tile} />
            ))}
          </div>
        </div>
      )}

      {!collapsed && !receiveVideo && othersOnCamera > 0 && (
        <p className="video-stage-saver">
          <EyeSlashIcon weight="bold" aria-hidden="true" />
          Others' cameras are off to save data. Turn them back on in Voice Chat.
        </p>
      )}
      </section>
    </>
  );
}
