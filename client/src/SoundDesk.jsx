import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  CheckIcon,
  MusicNotesIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  SpeakerHighIcon,
  SpeakerLowIcon,
  SpeakerXIcon,
  StopIcon,
  TrashIcon,
  UploadSimpleIcon,
  WaveformIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import NavBar from "./NavBar.jsx";
import { useAmbient } from "./AmbientPlayer.jsx";
import "./Panel.css";
import "./SoundDesk.css";

// The DM's Sound Desk: upload sounds, fire one-shot effects at the table, and
// set the looping ambience everyone hears in sync. The listening half lives in
// AmbientPlayer.jsx (mounted for every signed-in user); the server side is
// routes/sounds.js. This page is only ever the controls.

const ALL = "__all__";
const UNFILED = "__unfiled__";
const ALLOWED_EXT = ["mp3", "ogg", "oga", "opus", "wav", "webm", "m4a", "aac", "flac"];
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
// A longer file is almost always a music bed; shorter, an effect. Only the
// default -- the DM flips it per file before uploading.
const AMBIENCE_GUESS_MS = 45000;
const HOTKEY_COUNT = 9;

function formatClock(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  // A multi-hour ambience bed reads as 2:05:09, not 125:09.
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

// A length label: a clip under ten seconds reads better as "0.9s" than as a
// rounded-down 0:00. Position readouts use formatClock so both ends match.
function formatTime(ms) {
  return Number.isFinite(ms) && ms >= 0 && ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : formatClock(ms);
}

function extensionOf(filename) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

function nameFromFile(filename) {
  const dot = filename.lastIndexOf(".");
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  return stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    const finish = (ms) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) ? Math.round(probe.duration * 1000) : null);
    probe.onerror = () => finish(null);
    probe.src = url;
  });
}

// A file that came from the default-sounds folder has no duration on record
// (the server can't read one); a browser can, from the file's metadata alone.
function probeDuration(url) {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    const finish = (ms) => {
      clearTimeout(timer);
      probe.removeAttribute("src");
      resolve(ms);
    };
    const timer = setTimeout(() => finish(null), 30000);
    probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) && probe.duration > 0 ? Math.round(probe.duration * 1000) : null);
    probe.onerror = () => finish(null);
    probe.src = url;
  });
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export default function SoundDesk() {
  const { token, user } = useAuth();
  const { ambient, getPositionMs, refresh } = useAmbient();

  const [sounds, setSounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ text: "", error: false });
  const [bank, setBank] = useState(ALL);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fired, setFired] = useState({}); // soundId -> timestamp of the last press, while it's still sounding
  const [position, setPosition] = useState(0);
  const [bandVolume, setBandVolume] = useState(0.8);
  const [previewKey, setPreviewKey] = useState(null);
  const [rescanning, setRescanning] = useState(false);
  const [backfillTick, setBackfillTick] = useState(0);

  const previewRef = useRef(null);
  const volumeTimer = useRef(null);
  const draggingVolume = useRef(false);
  const firedTimers = useRef({});
  const backfilling = useRef(false);
  const probedIds = useRef(new Set());

  const isDungeonMaster = user?.role === "Dungeon Master";

  const api = useCallback(
    async (path, { method = "GET", json, body } = {}) => {
      const res = await fetch(`/api/sounds${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(json ? { "Content-Type": "application/json" } : {}),
        },
        body: json ? JSON.stringify(json) : body,
      });
      if (res.status === 204) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      return data;
    },
    [token]
  );

  const say = (text, error = false) => setStatus({ text, error });

  const loadLibrary = useCallback(async () => {
    try {
      const data = await api("");
      setSounds(data.sounds);
      say("");
    } catch (err) {
      say(err.message, true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isDungeonMaster) loadLibrary();
  }, [isDungeonMaster, loadLibrary]);

  async function rescanFolder() {
    setRescanning(true);
    try {
      const result = await api("/rescan", { method: "POST" });
      await loadLibrary();
      say(result.added || result.removed ? `Folder rescanned: ${result.added} added, ${result.removed} removed.` : "Folder rescanned: no changes.");
    } catch (err) {
      say(err.message, true);
    } finally {
      setRescanning(false);
    }
  }

  // Measure any sound that has no duration on record and report it back, one
  // at a time (a multi-hour file's metadata can take a moment to read).
  useEffect(() => {
    if (!isDungeonMaster || backfilling.current) return;
    const todo = sounds.filter((s) => s.durationMs == null && !probedIds.current.has(s.id));
    if (todo.length === 0) return;
    backfilling.current = true;
    (async () => {
      for (const sound of todo) {
        probedIds.current.add(sound.id);
        const ms = await probeDuration(sound.url);
        if (!ms) continue;
        try {
          const data = await api(`/${sound.id}`, { method: "PATCH", json: { durationMs: ms } });
          setSounds((list) => list.map((item) => (item.id === sound.id ? data.sound : item)));
        } catch {
          // Cosmetic: the row just keeps showing no length.
        }
      }
      backfilling.current = false;
      setBackfillTick((t) => t + 1);
    })();
  }, [sounds, api, isDungeonMaster, backfillTick]);

  // ---------------------------------------------------------------- derived lists
  const banks = useMemo(() => {
    const names = new Set(sounds.map((s) => s.bank).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [sounds]);
  const hasUnfiled = sounds.some((s) => !s.bank);

  // A bank that disappears (its last sound was moved or deleted) shouldn't
  // leave the desk looking at an empty tab that no longer exists.
  useEffect(() => {
    if (bank === ALL) return;
    if (bank === UNFILED ? !hasUnfiled : !banks.includes(bank)) setBank(ALL);
  }, [bank, banks, hasUnfiled]);

  const inBank = useCallback(
    (sound) => bank === ALL || (bank === UNFILED ? !sound.bank : sound.bank === bank),
    [bank]
  );
  const ambienceList = useMemo(() => sounds.filter((s) => s.kind === "ambient" && inBank(s)), [sounds, inBank]);
  const effectList = useMemo(() => sounds.filter((s) => s.kind === "effect" && inBank(s)), [sounds, inBank]);
  const countFor = (predicate) => sounds.filter(predicate).length;
  const selected = sounds.find((s) => s.id === selectedId) || null;

  // ---------------------------------------------------------------- now playing
  useEffect(() => {
    if (!draggingVolume.current && typeof ambient?.volume === "number") setBandVolume(ambient.volume);
  }, [ambient?.volume]);

  useEffect(() => {
    setPosition(getPositionMs());
    if (!ambient?.playing) return undefined;
    const interval = setInterval(() => setPosition(getPositionMs()), 500);
    return () => clearInterval(interval);
  }, [ambient, getPositionMs]);

  const hasBed = Boolean(ambient?.url);
  const bedPlaying = Boolean(ambient?.playing);
  const bedDuration = ambient?.durationMs || 0;
  const progress = bedDuration > 0 ? Math.min(1, position / bedDuration) : 0;

  async function ambientAction(action, json) {
    try {
      await api(`/ambient/${action}`, { method: "POST", json });
      await refresh();
      say("");
    } catch (err) {
      say(err.message, true);
    }
  }

  function handleBandVolume(e) {
    const next = Number(e.target.value) / 100;
    draggingVolume.current = true;
    setBandVolume(next);
    clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(async () => {
      await ambientAction("volume", { volume: next });
      draggingVolume.current = false;
    }, 120);
  }

  // ---------------------------------------------------------------- pads + rows
  async function firePad(sound) {
    if (editing) {
      setSelectedId(sound.id);
      return;
    }
    const at = Date.now();
    setFired((f) => ({ ...f, [sound.id]: at }));
    clearTimeout(firedTimers.current[sound.id]);
    firedTimers.current[sound.id] = setTimeout(
      () => setFired((f) => (f[sound.id] === at ? Object.fromEntries(Object.entries(f).filter(([id]) => Number(id) !== sound.id)) : f)),
      Math.min(sound.durationMs || 900, 30000)
    );
    try {
      await api(`/${sound.id}/play`, { method: "POST" });
      say("");
    } catch (err) {
      setFired((f) => Object.fromEntries(Object.entries(f).filter(([id]) => Number(id) !== sound.id)));
      say(err.message, true);
    }
  }

  async function stopEffects() {
    Object.values(firedTimers.current).forEach(clearTimeout);
    setFired({});
    try {
      await api("/stop-effects", { method: "POST" });
    } catch (err) {
      say(err.message, true);
    }
  }

  async function pickAmbience(sound) {
    if (editing) {
      setSelectedId(sound.id);
      return;
    }
    if (ambient?.soundId === sound.id) return;
    await ambientAction("play", { soundId: sound.id });
  }

  // Digits 1-9 fire the first nine pads in view; Escape silences effects.
  // Space is deliberately left alone -- it is voice chat's push-to-talk key.
  useEffect(() => {
    function handleKey(e) {
      if (editing || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        stopEffects();
        return;
      }
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < HOTKEY_COUNT && effectList[index]) {
        e.preventDefault();
        firePad(effectList[index]);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // firePad/stopEffects close over fresh state each render; re-binding per list change is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, effectList]);

  // On a phone the inspector docks over the bottom of the screen and would
  // cover the very pad being edited, so bring the selection up above it.
  useEffect(() => {
    if (selectedId == null || !window.matchMedia("(max-width: 959px)").matches) return;
    // Instant, not smooth: the inspector reflows as it fills in, which cuts a
    // smooth scroll short before the pad is clear of the sheet.
    document.querySelector(`[data-sound-id="${selectedId}"]`)?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [selectedId]);

  // ---------------------------------------------------------------- local preview (DM's own speakers only)
  const stopPreview = useCallback(() => {
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current = null;
    }
    setPreviewKey(null);
  }, []);

  function togglePreview(key, src) {
    if (previewKey === key) {
      stopPreview();
      return;
    }
    stopPreview();
    const audio = new Audio(src);
    audio.addEventListener("ended", () => setPreviewKey((cur) => (cur === key ? null : cur)));
    audio.play().catch(() => setPreviewKey(null));
    previewRef.current = audio;
    setPreviewKey(key);
  }

  useEffect(() => stopPreview, [stopPreview]);
  useEffect(() => {
    const timers = firedTimers.current;
    return () => {
      clearTimeout(volumeTimer.current);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  if (!isDungeonMaster) return <Navigate to="/dashboard" replace />;

  const bandState = !hasBed ? "Silent" : bedPlaying ? "Playing" : "Paused";
  const volumePercent = Math.round(bandVolume * 100);
  const VolumeIcon = volumePercent === 0 ? SpeakerXIcon : volumePercent < 50 ? SpeakerLowIcon : SpeakerHighIcon;

  return (
    <div className="sd-page">
      <NavBar />

      <main className="sd-body">
        <header className="sd-head">
          <div className="sd-head-text">
            <h1 className="sd-title">Sound Desk</h1>
            <p className="sd-subtitle">What the table hears. Ambience loops in sync for everyone; effects sound the moment you tap them.</p>
          </div>
          <div className="sd-head-actions">
            <button
              type="button"
              className={`panel-btn panel-btn--ghost${editing ? " sd-btn--on" : ""}`}
              onClick={() => {
                setEditing((v) => !v);
                setSelectedId(null);
                stopPreview();
              }}
              aria-pressed={editing}
            >
              {editing ? <CheckIcon weight="bold" /> : <PencilSimpleIcon weight="bold" />}
              {editing ? "Done editing" : "Edit sounds"}
            </button>
            <button type="button" className="panel-btn" onClick={() => setUploadOpen((v) => !v)} aria-expanded={uploadOpen}>
              <UploadSimpleIcon weight="bold" />
              Upload sounds
            </button>
          </div>
        </header>

        <p className={`sd-status${status.error ? " sd-status--error" : ""}`} role="status" aria-live="polite">
          {status.text}
        </p>

        {uploadOpen && (
          <UploadTray
            api={api}
            banks={banks}
            defaultBank={bank !== ALL && bank !== UNFILED ? bank : ""}
            previewKey={previewKey}
            onPreview={togglePreview}
            onClose={() => setUploadOpen(false)}
            onUploaded={loadLibrary}
            onRescan={rescanFolder}
            rescanning={rescanning}
          />
        )}

        <div className="sd-banks" role="group" aria-label="Sound banks">
          <BankTab label="All" count={sounds.length} active={bank === ALL} onClick={() => setBank(ALL)} />
          {banks.map((name) => (
            <BankTab
              key={name}
              label={name}
              count={countFor((s) => s.bank === name)}
              active={bank === name}
              onClick={() => setBank(name)}
            />
          ))}
          {hasUnfiled && banks.length > 0 && (
            <BankTab label="Unfiled" count={countFor((s) => !s.bank)} active={bank === UNFILED} onClick={() => setBank(UNFILED)} />
          )}
        </div>

        <section className={`sd-band${bedPlaying ? " sd-band--playing" : ""}`} aria-label="Now playing">
          <div className="sd-band-main">
            <div className="sd-band-title-row">
              <h2 className={`sd-band-title${hasBed ? "" : " sd-band-title--idle"}`}>{hasBed ? ambient.name : "Nothing playing"}</h2>
              <span className={`sd-band-state sd-band-state--${bandState.toLowerCase()}`}>
                {bedPlaying ? <SpeakerHighIcon weight="bold" /> : hasBed ? <PauseIcon weight="bold" /> : <SpeakerXIcon weight="bold" />}
                {bandState}
              </span>
            </div>
            {hasBed ? (
              <div className="sd-progress">
                <div
                  className="sd-progress-track"
                  role="progressbar"
                  aria-label="Position in the looping track"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <span className="sd-progress-fill" style={{ transform: `scaleX(${progress})` }} />
                </div>
                <span className="sd-progress-time num-tabular">
                  {formatClock(position)}
                  {bedDuration > 0 && ` / ${formatClock(bedDuration)}`}
                </span>
              </div>
            ) : (
              <p className="sd-band-hint">Pick an ambience below to set the scene. It fades in for everyone at the same moment.</p>
            )}
          </div>

          <div className="sd-band-controls">
            <button
              type="button"
              className="sd-transport"
              onClick={() => ambientAction(bedPlaying ? "pause" : "resume")}
              disabled={!hasBed}
              aria-label={bedPlaying ? "Pause ambience" : "Resume ambience"}
              title={bedPlaying ? "Pause" : "Resume"}
            >
              {bedPlaying ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
            </button>
            <button
              type="button"
              className="sd-transport sd-transport--quiet"
              onClick={() => ambientAction("stop")}
              disabled={!bedPlaying}
              aria-label="Stop ambience"
              title="Stop"
            >
              <StopIcon weight="fill" />
            </button>
            <label className="sd-level">
              <VolumeIcon weight="bold" />
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={volumePercent}
                onChange={handleBandVolume}
                className="sd-slider"
                style={{ "--fill": `${volumePercent}%` }}
                aria-label="Ambience level for the table"
              />
              <span className="sd-level-value num-tabular">{volumePercent}%</span>
            </label>
          </div>
        </section>

        <div className={`sd-cols${editing ? " sd-cols--editing" : ""}`}>
          <section className="sd-ambience" aria-labelledby="sd-ambience-h">
            <div className="sd-section-head">
              <h2 id="sd-ambience-h" className="sd-section-title">
                Ambience
              </h2>
            </div>
            {loading ? (
              <div className="sd-rows" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="sd-row sd-row--skeleton" />
                ))}
              </div>
            ) : ambienceList.length === 0 ? (
              <div className="panel-empty sd-empty">
                <MusicNotesIcon weight="duotone" />
                <span>{sounds.some((s) => s.kind === "ambient") ? "No ambience in this bank." : "No ambience yet. Upload a long track to loop as a background bed."}</span>
              </div>
            ) : (
              <ul className="sd-rows">
                {ambienceList.map((sound) => {
                  const current = ambient?.soundId === sound.id;
                  return (
                    <li key={sound.id}>
                      <button
                        type="button"
                        className={`sd-row${current ? " sd-row--current" : ""}${selectedId === sound.id ? " sd-row--selected" : ""}`}
                        data-sound-id={sound.id}
                        onClick={() => pickAmbience(sound)}
                        aria-current={current ? "true" : undefined}
                      >
                        <span className="sd-row-icon">
                          {current && bedPlaying ? <SpeakerHighIcon weight="fill" /> : current ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
                        </span>
                        <span className="sd-row-text">
                          <span className="sd-row-name">{sound.name}</span>
                          {bank === ALL && sound.bank && <span className="sd-row-bank">{sound.bank}</span>}
                        </span>
                        <span className="sd-row-time num-tabular">{formatTime(sound.durationMs)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="sd-effects" aria-labelledby="sd-effects-h">
            <div className="sd-section-head">
              <h2 id="sd-effects-h" className="sd-section-title">
                Effects
              </h2>
              <button type="button" className="panel-btn panel-btn--ghost sd-stop-effects" onClick={stopEffects} title="Silence every effect (Esc)">
                <StopIcon weight="fill" />
                Stop effects
              </button>
            </div>
            {loading ? (
              <div className="sd-pads" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className="sd-pad sd-pad--skeleton" />
                ))}
              </div>
            ) : effectList.length === 0 ? (
              <div className="panel-empty sd-empty">
                <WaveformIcon weight="duotone" />
                <span>{sounds.some((s) => s.kind === "effect") ? "No effects in this bank." : "No effects yet. Upload short clips like an alarm, a door or a blaster shot."}</span>
                {sounds.length === 0 && (
                  <button type="button" className="panel-btn" onClick={() => setUploadOpen(true)}>
                    <UploadSimpleIcon weight="bold" />
                    Upload your first sounds
                  </button>
                )}
              </div>
            ) : (
              <div className="sd-pads">
                {effectList.map((sound, index) => (
                  <Pad
                    key={sound.id}
                    sound={sound}
                    hotkey={!editing && index < HOTKEY_COUNT ? index + 1 : null}
                    firedAt={fired[sound.id]}
                    selected={selectedId === sound.id}
                    editing={editing}
                    onPress={() => firePad(sound)}
                  />
                ))}
                <button type="button" className="sd-pad sd-pad--add" onClick={() => setUploadOpen(true)}>
                  <PlusIcon weight="bold" />
                  <span className="sd-pad-name">Add sound</span>
                </button>
              </div>
            )}
            {!editing && effectList.length > 0 && (
              <p className="sd-hint">Keys 1-9 fire the first nine pads. Esc stops all effects.</p>
            )}
          </section>

          {editing && (
            <Inspector
              key={selected?.id ?? "none"}
              sound={selected}
              banks={banks}
              api={api}
              previewKey={previewKey}
              onPreview={togglePreview}
              onChanged={(next) => setSounds((list) => list.map((s) => (s.id === next.id ? next : s)))}
              onDeleted={(id) => {
                stopPreview();
                setSounds((list) => list.filter((s) => s.id !== id));
                setSelectedId(null);
                refresh();
              }}
              onError={(text) => say(text, true)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function BankTab({ label, count, active, onClick }) {
  return (
    <button type="button" aria-pressed={active} className={`sd-bank${active ? " sd-bank--active" : ""}`} onClick={onClick}>
      {label}
      <span className="sd-bank-count num-tabular">{count}</span>
    </button>
  );
}

function Pad({ sound, hotkey, firedAt, selected, editing, onPress }) {
  const sounding = firedAt != null;
  return (
    <button
      type="button"
      className={`sd-pad${sounding ? " sd-pad--fired" : ""}${selected ? " sd-pad--selected" : ""}`}
      onClick={onPress}
      data-sound-id={sound.id}
      aria-label={editing ? `Edit ${sound.name}` : `Play ${sound.name}`}
    >
      {hotkey != null && <span className="sd-pad-key num-tabular">{hotkey}</span>}
      <span className="sd-pad-time num-tabular">{formatTime(sound.durationMs)}</span>
      <span className="sd-pad-name">{sound.name}</span>
      {sounding && <span key={firedAt} className="sd-pad-sweep" style={{ "--sweep": `${Math.min(sound.durationMs || 900, 30000)}ms` }} aria-hidden="true" />}
    </button>
  );
}

// ---------------------------------------------------------------- inspector
// Edit mode's side panel. Tapping a pad or row selects it here instead of
// playing it, so nothing fires by accident while the library is being tidied.
function Inspector({ sound, banks, api, previewKey, onPreview, onChanged, onDeleted, onError }) {
  const [name, setName] = useState(sound?.name ?? "");
  const [bankName, setBankName] = useState(sound?.bank ?? "");
  const [level, setLevel] = useState(sound ? Math.round(sound.volume * 100) : 100);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!sound) {
    return (
      <aside className="sd-inspector sd-inspector--empty" aria-label="Sound details">
        <PencilSimpleIcon weight="duotone" />
        <p>Select a sound to rename it, file it in a bank, set its level or delete it.</p>
      </aside>
    );
  }

  const dirty = name.trim() !== sound.name || bankName.trim() !== sound.bank || level !== Math.round(sound.volume * 100);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = await api(`/${sound.id}`, { method: "PATCH", json: { name, bank: bankName, volume: level / 100 } });
      onChanged(data.sound);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await api(`/${sound.id}`, { method: "DELETE" });
      onDeleted(sound.id);
    } catch (err) {
      onError(err.message);
    }
  }

  const previewing = previewKey === `lib-${sound.id}`;

  return (
    <aside className="sd-inspector" aria-label={`Editing ${sound.name}`}>
      <h2 className="sd-inspector-title">{sound.name}</h2>
      <p className="sd-inspector-meta">
        {sound.kind === "ambient" ? "Ambience" : "Effect"} · <span className="num-tabular">{formatTime(sound.durationMs)}</span>
      </p>

      <div className="sd-field">
        <label htmlFor="sd-edit-name">Name</label>
        <input id="sd-edit-name" type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="sd-field">
        <label htmlFor="sd-edit-bank">Bank</label>
        <input id="sd-edit-bank" type="text" value={bankName} maxLength={24} list="sd-bank-options" placeholder="e.g. Ship, Combat, Town" onChange={(e) => setBankName(e.target.value)} />
        <datalist id="sd-bank-options">
          {banks.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>
      <div className="sd-field">
        <label htmlFor="sd-edit-level">Level</label>
        <div className="sd-level sd-level--field">
          <input
            id="sd-edit-level"
            type="range"
            min="0"
            max="100"
            step="1"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="sd-slider"
            style={{ "--fill": `${level}%` }}
          />
          <span className="sd-level-value num-tabular">{level}%</span>
        </div>
        <p className="sd-field-hint">This sound's own loudness, so one loud clip is tamed once instead of every play.</p>
      </div>

      <div className="sd-inspector-actions">
        <button type="button" className="panel-btn panel-btn--ghost" onClick={() => onPreview(`lib-${sound.id}`, sound.url)}>
          {previewing ? <StopIcon weight="fill" /> : <PlayIcon weight="fill" />}
          {previewing ? "Stop preview" : "Preview here"}
        </button>
        <button type="button" className="panel-btn" onClick={save} disabled={!dirty || saving || !name.trim()}>
          <CheckIcon weight="bold" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
      <p className="sd-field-hint">Preview plays only on this device, not for the table.</p>

      <div className="sd-danger">
        {sound.library ? (
          <p className="sd-field-hint">
            From the default-sounds folder. You can rename it and set its level here; to remove it, delete the file from the folder and rescan.
          </p>
        ) : confirmDelete ? (
          <>
            <span>Delete this sound for good?</span>
            <div className="sd-danger-actions">
              <button type="button" className="panel-btn panel-btn--ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button type="button" className="panel-btn sd-btn--danger" onClick={remove}>
                <TrashIcon weight="bold" />
                Delete forever
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="panel-btn panel-btn--ghost sd-btn--danger-ghost" onClick={() => setConfirmDelete(true)}>
            <TrashIcon weight="bold" />
            Delete sound
          </button>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- upload
// Inline, not a modal: drop one file or twenty, check the guessed names and
// kinds, then add them all. Files are sent one at a time as raw bytes.
function UploadTray({ api, banks, defaultBank, previewKey, onPreview, onClose, onUploaded, onRescan, rescanning }) {
  const [drafts, setDrafts] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const nextKey = useRef(0);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  // Previews play from object URLs made once per file; release them with the tray.
  useEffect(() => () => draftsRef.current.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl)), []);

  async function addFiles(fileList) {
    const files = [...fileList];
    const fresh = await Promise.all(
      files.map(async (file) => {
        const ext = extensionOf(file.name);
        const key = `draft-${nextKey.current++}`;
        const base = { key, file, ext, name: nameFromFile(file.name), bank: defaultBank, state: "ready", error: "", durationMs: null, kind: "effect", previewUrl: null };
        if (!ALLOWED_EXT.includes(ext)) return { ...base, state: "error", error: "Not a supported audio type (use mp3, ogg, wav, m4a, webm or flac)." };
        if (file.size > MAX_UPLOAD_BYTES) return { ...base, state: "error", error: "Larger than the 30 MB limit." };
        const durationMs = await readDuration(file);
        return { ...base, previewUrl: URL.createObjectURL(file), durationMs, kind: durationMs && durationMs > AMBIENCE_GUESS_MS ? "ambient" : "effect" };
      })
    );
    setDrafts((list) => [...list, ...fresh]);
  }

  function patch(key, changes) {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...changes } : d)));
  }

  async function uploadAll() {
    setBusy(true);
    let failures = 0;
    for (const draft of drafts) {
      if (draft.state !== "ready" && draft.state !== "failed") continue;
      if (!draft.name.trim()) {
        patch(draft.key, { state: "failed", error: "Give it a name." });
        failures++;
        continue;
      }
      patch(draft.key, { state: "uploading", error: "" });
      try {
        const query = new URLSearchParams({
          kind: draft.kind,
          ext: draft.ext,
          name: draft.name.trim(),
          bank: draft.bank.trim(),
          ...(draft.durationMs ? { durationMs: String(draft.durationMs) } : {}),
        });
        await api(`?${query}`, { method: "POST", body: draft.file });
        patch(draft.key, { state: "done" });
      } catch (err) {
        patch(draft.key, { state: "failed", error: err.message });
        failures++;
      }
    }
    setBusy(false);
    await onUploaded();
    if (failures === 0) {
      setDrafts([]);
      onClose();
    }
  }

  const pending = drafts.filter((d) => d.state === "ready" || d.state === "failed").length;

  return (
    <section className="sd-upload panel panel--quiet" aria-label="Upload sounds">
      <div className="sd-upload-head">
        <h2 className="sd-section-title">Upload sounds</h2>
        <button type="button" className="panel-btn panel-btn--icon panel-btn--ghost" onClick={onClose} aria-label="Close upload" disabled={busy}>
          <XIcon weight="bold" />
        </button>
      </div>

      <div
        className={`sd-drop${dragging ? " sd-drop--over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <UploadSimpleIcon weight="duotone" />
        <p>Drop audio files here, or</p>
        <button type="button" className="panel-btn panel-btn--ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.ogg,.wav,.m4a,.flac,.opus,.aac,.webm"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="sd-field-hint">mp3, ogg, wav, m4a, webm or flac, up to 30 MB each. Files over 45 seconds default to ambience.</p>
      </div>

      <div className="sd-rescan">
        <p className="sd-field-hint">
          Very large file, such as a multi-hour ambience track? Put it in <code>server/default-sounds/ambient</code> (or <code>effects</code>)
          and rescan. Its file name becomes its name.
        </p>
        <button type="button" className="panel-btn panel-btn--ghost" onClick={onRescan} disabled={rescanning || busy}>
          {rescanning ? "Scanning…" : "Rescan folder"}
        </button>
      </div>

      {drafts.length > 0 && (
        <ul className="sd-drafts">
          {drafts.map((draft) => (
            <li key={draft.key} className={`sd-draft sd-draft--${draft.state}`}>
              <button
                type="button"
                className="panel-btn panel-btn--icon panel-btn--ghost"
                onClick={() => onPreview(draft.key, draft.previewUrl)}
                hidden={draft.state === "error"}
                disabled={busy}
                aria-label={previewKey === draft.key ? `Stop previewing ${draft.name}` : `Preview ${draft.name}`}
              >
                {previewKey === draft.key ? <StopIcon weight="fill" /> : <PlayIcon weight="fill" />}
              </button>
              <input
                type="text"
                className="sd-draft-name"
                value={draft.name}
                maxLength={60}
                onChange={(e) => patch(draft.key, { name: e.target.value })}
                disabled={draft.state === "uploading" || draft.state === "done" || draft.state === "error"}
                aria-label={`Name for ${draft.file.name}`}
              />
              {draft.state !== "error" && (
                <>
                <div className="dm-console-toggle" role="group" aria-label="Kind">
                  {[
                    { id: "effect", label: "Effect" },
                    { id: "ambient", label: "Ambience" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`dm-console-toggle-btn${draft.kind === option.id ? " dm-console-toggle-btn--active" : ""}`}
                      onClick={() => patch(draft.key, { kind: option.id })}
                      aria-pressed={draft.kind === option.id}
                      disabled={draft.state !== "ready" && draft.state !== "failed"}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="sd-draft-bank"
                  value={draft.bank}
                  maxLength={24}
                  list="sd-upload-banks"
                  placeholder="Bank"
                  onChange={(e) => patch(draft.key, { bank: e.target.value })}
                  disabled={draft.state !== "ready" && draft.state !== "failed"}
                  aria-label={`Bank for ${draft.name || draft.file.name}`}
                />
                </>
              )}
              <span className="sd-draft-state num-tabular">
                {draft.state === "uploading" && "Uploading…"}
                {draft.state === "done" && "Added"}
                {(draft.state === "error" || draft.state === "failed") && draft.error}
                {draft.state === "ready" && formatTime(draft.durationMs)}
              </span>
              <button
                type="button"
                className="panel-btn panel-btn--icon panel-btn--ghost"
                onClick={() => {
                  if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
                  setDrafts((list) => list.filter((d) => d.key !== draft.key));
                }}
                disabled={draft.state === "uploading"}
                aria-label={`Remove ${draft.file.name}`}
              >
                <XIcon weight="bold" />
              </button>
            </li>
          ))}
          <datalist id="sd-upload-banks">
            {banks.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </ul>
      )}

      {drafts.length > 0 && (
        <div className="sd-upload-actions">
          <button type="button" className="panel-btn" onClick={uploadAll} disabled={busy || pending === 0}>
            <UploadSimpleIcon weight="bold" />
            {busy ? "Uploading…" : `Add ${pending} ${pending === 1 ? "sound" : "sounds"}`}
          </button>
        </div>
      )}
    </section>
  );
}
