import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon, PlayIcon, StopIcon, VideoCameraIcon, WarningIcon } from "@phosphor-icons/react";
import { canUseCamera, loadCameraDeviceId, openCameraStream, VIDEO_MAX_FRAMERATE } from "./voiceVideo.js";

// Settings' camera counterpart to the mic check: opens the camera the call
// would use (the one picked in Voice Chat's device list), shows it, and
// reports what it actually delivers -- the resolution the browser negotiated
// and the frame rate measured off real frames. A webcam's frame rate is the
// usual hidden culprit: most quietly halve it in a dim room.

const FULL_HD = 1080;
const HD = 720;
const LOW_FPS = 20;

function describeError(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access is blocked. Allow it in your browser's site settings, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera found. Plug one in (or pick another in Voice Chat's devices), then try again.";
    case "NotReadableError":
    case "AbortError":
      return "Your camera is busy in another app (Zoom, Teams, OBS…). Close it there, then try again.";
    default:
      return "Couldn't start your camera. Check your browser's site permissions.";
  }
}

// Counts frames the <video> element actually presents, once a second.
function useMeasuredFps(videoRef, stream) {
  const [fps, setFps] = useState(null);
  useEffect(() => {
    const el = videoRef.current;
    setFps(null);
    if (!el || !stream) return undefined;
    let cancelled = false;
    let frames = 0;
    let windowStart = performance.now();
    let handle = null;

    const tick = (now) => {
      if (cancelled) return;
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        windowStart = now;
      }
      handle = el.requestVideoFrameCallback(tick);
    };

    if (typeof el.requestVideoFrameCallback === "function") {
      handle = el.requestVideoFrameCallback(tick);
      return () => {
        cancelled = true;
        el.cancelVideoFrameCallback?.(handle);
      };
    }
    // No per-frame callback (older Firefox): fall back to what the camera claims.
    const claimed = stream.getVideoTracks()[0]?.getSettings().frameRate;
    if (claimed) setFps(Math.round(claimed));
    return () => {
      cancelled = true;
    };
  }, [videoRef, stream]);
  return fps;
}

function verdict({ height, fps }) {
  if (fps == null || !height) return { tone: "pending", text: "Measuring…" };
  if (fps < LOW_FPS) {
    return {
      tone: "warn",
      text: `Only ${fps} fps. Webcams slow down in dim light -- add light in front of you, or close other apps using the camera.`,
    };
  }
  if (height >= FULL_HD) {
    return { tone: "good", text: "Ready for the table: full 1080p at a smooth frame rate." };
  }
  if (height >= HD) {
    return { tone: "good", text: "Ready for the table: 720p at a smooth frame rate. Sharp in the small view, a little soft full screen." };
  }
  return {
    tone: "ok",
    text: "Works fine. Your camera tops out below 720p, so the table will see you a little softer.",
  };
}

export default function CameraCheck() {
  const [stream, setStream] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fps = useMeasuredFps(videoRef, stream);

  useEffect(() => {
    const el = videoRef.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
    if (el && stream) el.play().catch(() => {});
  }, [stream]);

  // Leaving the page mid-test shouldn't leave the camera light on.
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function handleToggle() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      return;
    }
    setError("");
    setStarting(true);
    try {
      const next = await openCameraStream(loadCameraDeviceId());
      const [track] = next.getVideoTracks();
      // Unplugged mid-test: drop back to idle rather than freeze.
      track?.addEventListener("ended", () => {
        if (streamRef.current === next) {
          streamRef.current = null;
          setStream(null);
          setError("The camera disconnected.");
        }
      });
      streamRef.current = next;
      setStream(next);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setStarting(false);
    }
  }

  if (!canUseCamera()) {
    return (
      <div className="camera-check">
        <p className="mic-check-hint">This browser can't use a camera, so video chat will be audio-only here.</p>
      </div>
    );
  }

  const track = stream?.getVideoTracks()[0];
  const settings = track?.getSettings() ?? {};
  const live = Boolean(stream);
  const result = live ? verdict({ height: settings.height, fps }) : null;

  return (
    <>
      <div className="camera-check">
        <div className={`camera-check-preview${live ? " camera-check-preview--live" : ""}`}>
          <video ref={videoRef} className="camera-check-video" autoPlay playsInline muted />
          {!live && <VideoCameraIcon weight="duotone" className="camera-check-idle" aria-hidden="true" />}
        </div>

        <div className="mic-check-controls">
          <button type="button" className="panel-btn panel-btn--test" onClick={handleToggle} disabled={starting}>
            {live ? <StopIcon weight="fill" /> : <PlayIcon weight="fill" />}
            {starting ? "Starting…" : live ? "Stop Test" : "Test Camera"}
          </button>

          {live ? (
            <dl className="camera-check-stats">
              <div className="camera-check-stat camera-check-stat--wide">
                <dt>Camera</dt>
                <dd title={track?.label}>{track?.label || "Unnamed camera"}</dd>
              </div>
              <div className="camera-check-stat">
                <dt>Resolution</dt>
                <dd className="num-tabular">{settings.width && settings.height ? `${settings.width}×${settings.height}` : "—"}</dd>
              </div>
              <div className="camera-check-stat">
                <dt>Frame rate</dt>
                <dd className="num-tabular">
                  {fps == null ? "—" : `${fps} fps`}
                  <span className="camera-check-target"> / {VIDEO_MAX_FRAMERATE}</span>
                </dd>
              </div>
            </dl>
          ) : (
            <span className="mic-check-hint">Checks the camera the call will use, and how sharp and smooth it looks to the table.</span>
          )}
        </div>
      </div>

      {result && (
        <p className={`camera-check-verdict camera-check-verdict--${result.tone}`} role="status">
          {result.tone === "warn" ? <WarningIcon weight="bold" /> : result.tone !== "pending" && <CheckCircleIcon weight="bold" />}
          {result.text}
        </p>
      )}
      {error && <p className="panel-error">{error}</p>}
    </>
  );
}
