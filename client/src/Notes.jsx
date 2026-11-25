import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpenTextIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  PencilSimpleLineIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { canViewAsDm } from "./roles.js";
import NavBar from "./NavBar.jsx";
import NoteEditor from "./NoteEditor.jsx";
import NoteRefCard from "./NoteRefCard.jsx";
import NoteRichText from "./NoteRichText.jsx";
import { openRefTarget, useNoteLinkables } from "./noteLinks.js";
import "./Slugpedia.css";
import "./Notes.css";

const SAVE_DELAY_MS = 800;
const MAX_TITLE_LENGTH = 120;

const isBlank = (n) => !n.title.trim() && !n.body.trim();
const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;
const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtMonth = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });

// A one-line taste of the body for the index: links reduced to their label and
// the markdown marks dropped.
function excerpt(body) {
  return body
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[>#\s*+-]+|(?<=\n)[>#\s*+-]+|\d+\.\s|[*_~`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

const displayTitle = (n) => n.title.trim() || excerpt(n.body).slice(0, 40) || "Untitled note";

const SAVE_LABEL = { saved: "Saved", dirty: "Unsaved", saving: "Saving…", error: "Couldn’t save" };

// A private journal bound like the Slugpedia: the index of pages on the left,
// the open page on the right, written in markdown and read back with chips for
// anything linked. Everything a player types saves itself.
export default function Notes() {
  const { token, user } = useAuth();
  // The DM and a DM Assistant read every book (their own notes stay their own to edit).
  const isDM = canViewAsDm(user);
  const navigate = useNavigate();
  const { entries, lookup, loaded: linksLoaded } = useNoteLinkables();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("read");
  const [query, setQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState("all"); // DM only: "all" | "mine" | a user id
  const [saveState, setSaveState] = useState("saved");
  const [actionError, setActionError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mobileView, setMobileView] = useState("index");
  const [refTarget, setRefTarget] = useState(null);
  const [focusBody, setFocusBody] = useState(false);

  const pending = useRef(new Map());
  const timer = useRef(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const listRef = useRef(null);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` }),
    []
  );

  useEffect(() => {
    fetch(isDM ? "/api/notes?scope=all" : "/api/notes", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setNotes(data.notes || []);
        setSelectedId(data.notes?.[0]?.id ?? null);
      })
      .catch(() => setLoadError("Your notes couldn’t be loaded. Try reloading the page."))
      .finally(() => setLoading(false));
  }, [token, isDM]);

  // ---- Saving -------------------------------------------------------------

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = null;
    const batch = [...pending.current.entries()];
    pending.current.clear();
    if (batch.length === 0) return;
    setSaveState("saving");
    const results = await Promise.all(
      batch.map(async ([id, patch]) => {
        try {
          const res = await fetch(`/api/notes/${id}`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify(patch),
            keepalive: true,
          });
          if (res.status === 404) return true; // deleted elsewhere: nothing left to save to
          if (!res.ok) throw new Error();
          const { note } = await res.json();
          setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, updatedAt: note.updatedAt } : n)));
          return true;
        } catch {
          // Keep the text queued, but never over something typed since.
          pending.current.set(id, { ...patch, ...(pending.current.get(id) || {}) });
          return false;
        }
      })
    );
    setSaveState(results.every(Boolean) ? (pending.current.size ? "dirty" : "saved") : "error");
  }, [headers]);

  const edit = useCallback(
    (id, patch) => {
      if (notesRef.current.find((n) => n.id === id)?.userId !== userIdRef.current) return;
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
      pending.current.set(id, { ...(pending.current.get(id) || {}), ...patch });
      setSaveState("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush]
  );

  // Leaving the page (or closing the tab) must not lose the last few keystrokes.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  // ---- Page actions -------------------------------------------------------

  // Walking away from a page nobody wrote on tears it out, so "New note" never
  // leaves a trail of empty leaves.
  function leaveCurrent() {
    const current = notesRef.current.find((n) => n.id === selectedId);
    flush();
    if (current && current.userId === user?.id && isBlank(current)) {
      pending.current.delete(current.id);
      setNotes((prev) => prev.filter((n) => n.id !== current.id));
      fetch(`/api/notes/${current.id}`, { method: "DELETE", headers: headers() }).catch(() => {});
      return current.id;
    }
    return null;
  }

  function selectNote(id) {
    setMobileView("entry");
    if (id === selectedId) return;
    leaveCurrent();
    setSelectedId(id);
    setMode("read");
    setConfirmDelete(false);
    setActionError(null);
  }

  async function createNote() {
    setActionError(null);
    const current = notes.find((n) => n.id === selectedId);
    if (current && current.userId === user?.id && isBlank(current)) {
      setMode("write");
      setFocusBody(true);
      setMobileView("entry");
      return;
    }
    leaveCurrent();
    try {
      const res = await fetch("/api/notes", { method: "POST", headers: headers(), body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start a new note.");
      setQuery("");
      setNotes((prev) => [{ ...data.note, userId: user.id, authorName: user.username }, ...prev]);
      setSelectedId(data.note.id);
      setMode("write");
      setFocusBody(true);
      setConfirmDelete(false);
      setMobileView("entry");
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function deleteNote(id) {
    const index = visible.findIndex((n) => n.id === id);
    const neighbour = visible[index + 1] ?? visible[index - 1] ?? null;
    pending.current.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setSelectedId(neighbour?.id ?? null);
    setMode("read");
    setConfirmDelete(false);
    if (!neighbour) setMobileView("index");
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE", headers: headers() });
      if (!res.ok) throw new Error();
    } catch {
      setActionError("That page couldn’t be torn out. Reload to see where it stands.");
    }
  }

  // ---- Derived ------------------------------------------------------------

  // Who wrote what, for the DM's filter row: the DM first, then each author
  // by name.
  const authors = useMemo(() => {
    const seen = new Map();
    for (const n of notes) if (n.userId !== user?.id && !seen.has(n.userId)) seen.set(n.userId, n.authorName);
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [notes, user?.id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (authorFilter === "mine" && n.userId !== user?.id) return false;
      if (authorFilter !== "all" && authorFilter !== "mine" && n.userId !== authorFilter) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        (n.authorName ?? "").toLowerCase().includes(q)
      );
    });
  }, [notes, query, authorFilter, user?.id]);

  const current = notes.find((n) => n.id === selectedId) ?? null;
  // Other people's pages are for reading only, even for the DM.
  const readOnly = Boolean(current && current.userId !== user?.id);
  const activeMode = readOnly ? "read" : mode;
  const pos = current ? visible.findIndex((n) => n.id === current.id) : -1;
  const totalWords = useMemo(() => visible.reduce((sum, n) => sum + wordCount(n.body), 0), [visible]);

  function step(delta) {
    if (visible.length === 0) return;
    const from = pos === -1 ? 0 : pos;
    selectNote(visible[(from + delta + visible.length) % visible.length].id);
  }

  // Left/right turn the page while reading, as in the Slugpedia.
  const keyRef = useRef();
  keyRef.current = (e) => {
    if (mode !== "read" || refTarget || e.target.closest?.("input, textarea, [contenteditable]")) return;
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  };
  useEffect(() => {
    const onKey = (e) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(".sp-index-row--on")?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const openRef = useCallback((ref, anchor) => setRefTarget({ ...ref, anchor }), []);
  const closeRef = useCallback(() => setRefTarget(null), []);

  let lastMonth = "";
  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="nb-stage" data-view={mobileView}>
        <div className="sp-book nb-book">
          <div className="sp-pages">
            <section className="sp-page sp-page--index nb-index">
              <header className="sp-index-head">
                <h1 className="sp-title">Notes</h1>
                <p className="sp-subtitle">
                  {isDM ? "Your pages, and everyone else’s at the table." : "Your own pages. Nobody else at the table can read them."}
                </p>
                <label className="sp-search">
                  <MagnifyingGlassIcon weight="bold" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={isDM ? "Search every note" : "Search your notes"}
                    aria-label={isDM ? "Search every note" : "Search your notes"}
                  />
                </label>
                <button type="button" className="nb-new" onClick={createNote} disabled={loading || Boolean(loadError)}>
                  <PlusIcon weight="bold" />
                  New note
                </button>
                {isDM && authors.length > 0 && (
                  <div className="nb-authors" role="group" aria-label="Whose notes">
                    {[{ id: "all", name: "Everyone" }, { id: "mine", name: "Mine" }, ...authors].map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="nb-author-chip"
                        aria-pressed={authorFilter === a.id}
                        onClick={() => setAuthorFilter(a.id)}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </header>

              <div className="sp-index-list" ref={listRef}>
                {loading ? (
                  <p className="sp-empty">Turning to the first page…</p>
                ) : loadError ? (
                  <p className="sp-empty" role="alert">
                    {loadError}
                  </p>
                ) : notes.length === 0 ? (
                  <p className="sp-empty">The pages are blank. Start with a new note.</p>
                ) : visible.length === 0 ? (
                  <p className="sp-empty">{query ? `Nothing in your notes matches “${query}”.` : "No notes here yet."}</p>
                ) : (
                  visible.map((n) => {
                    const month = fmtMonth(n.updatedAt);
                    const showMonth = month !== lastMonth;
                    lastMonth = month;
                    const preview = n.title.trim() ? excerpt(n.body) : "";
                    return (
                      <div key={n.id}>
                        {showMonth && <p className="sp-letter">{month}</p>}
                        <button
                          type="button"
                          className={`sp-index-row nb-row ${n.id === selectedId ? "sp-index-row--on" : ""}`}
                          onClick={() => selectNote(n.id)}
                          aria-current={n.id === selectedId ? "true" : undefined}
                        >
                          <span className="nb-row-line">
                            <span className="sp-index-name nb-row-name">{displayTitle(n)}</span>
                            <span className="sp-leader" aria-hidden="true" />
                            <span className="sp-index-meta">
                              {n.userId !== user?.id && <span className="nb-seal">{n.authorName}</span>}
                              <em>{fmtDay(n.updatedAt)}</em>
                            </span>
                          </span>
                          {preview && <span className="nb-row-excerpt">{preview}</span>}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <footer className="sp-index-foot">
                {visible.length} {visible.length === 1 ? "note" : "notes"} · {totalWords.toLocaleString()} words
              </footer>
            </section>

            <section className="sp-page sp-page--entry nb-sheet">
              {current ? (
                <>
                  <header className="nb-sheet-head">
                    <button type="button" className="nb-back" onClick={() => setMobileView("index")}>
                      <CaretLeftIcon weight="bold" />
                      All notes
                    </button>
                    <input
                      className="nb-title"
                      value={current.title}
                      maxLength={MAX_TITLE_LENGTH}
                      placeholder="Untitled note"
                      aria-label="Note title"
                      readOnly={readOnly}
                      onChange={(e) => edit(current.id, { title: e.target.value })}
                    />
                    <p className="nb-meta">
                      {readOnly && (
                        <>
                          <span className="nb-seal">{current.authorName}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span>Last written {fmtDay(current.updatedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="num-tabular">{wordCount(current.body).toLocaleString()} words</span>
                      {!readOnly && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className={`nb-save nb-save--${saveState}`} role="status">
                            {SAVE_LABEL[saveState]}
                            {saveState === "error" && (
                              <button type="button" className="nb-retry" onClick={flush}>
                                Retry
                              </button>
                            )}
                          </span>
                        </>
                      )}
                    </p>
                    <div className="sp-ribbons nb-ribbons" role="tablist" aria-label="Note mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeMode === "read"}
                        className={`sp-ribbon ${activeMode === "read" ? "sp-ribbon--on" : ""}`}
                        onClick={() => setMode("read")}
                      >
                        <BookOpenTextIcon weight="bold" aria-hidden="true" />
                        Read
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeMode === "write"}
                          className={`sp-ribbon ${activeMode === "write" ? "sp-ribbon--on" : ""}`}
                          onClick={() => {
                            setMode("write");
                            setFocusBody(true);
                          }}
                        >
                          <PencilSimpleLineIcon weight="bold" aria-hidden="true" />
                          Write
                        </button>
                      )}
                    </div>
                  </header>

                  <div className="nb-body" key={current.id}>
                    {activeMode === "write" ? (
                      <NoteEditor
                        value={current.body}
                        onChange={(body) => edit(current.id, { body })}
                        entries={entries}
                        linksLoaded={linksLoaded}
                        autoFocus={focusBody}
                      />
                    ) : current.body.trim() ? (
                      <div className="nb-read">
                        <NoteRichText source={current.body} lookup={lookup} onOpenRef={openRef} />
                      </div>
                    ) : (
                      <p className="nb-blank">
                        A blank page.{" "}
                        {!readOnly && (
                          <button
                            type="button"
                            className="nb-inline-btn"
                            onClick={() => {
                              setMode("write");
                              setFocusBody(true);
                            }}
                          >
                            Start writing
                          </button>
                        )}
                      </p>
                    )}
                  </div>

                  {actionError && (
                    <p className="nb-error" role="alert">
                      {actionError}
                    </p>
                  )}

                  <footer className={`sp-turn nb-turn${confirmDelete ? " nb-turn--confirming" : ""}`}>
                    <button type="button" onClick={() => step(-1)} aria-label="Previous note" disabled={visible.length < 2}>
                      <CaretLeftIcon weight="bold" />
                    </button>
                    <span>
                      {pos === -1 ? "—" : pos + 1} of {visible.length}
                    </span>
                    <button type="button" onClick={() => step(1)} aria-label="Next note" disabled={visible.length < 2}>
                      <CaretRightIcon weight="bold" />
                    </button>
                    <span className="nb-turn-spacer" />
                    {readOnly ? null : confirmDelete ? (
                      <span className="nb-confirm">
                        Tear out this page?
                        <button type="button" className="nb-confirm-yes" onClick={() => deleteNote(current.id)}>
                          Tear out
                        </button>
                        <button type="button" className="nb-confirm-no" onClick={() => setConfirmDelete(false)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="nb-delete"
                        onClick={() => setConfirmDelete(true)}
                        aria-label="Delete this note"
                        title="Delete this note"
                      >
                        <TrashIcon weight="bold" />
                      </button>
                    )}
                  </footer>
                </>
              ) : (
                <div className="nb-welcome">
                  <BookOpenTextIcon weight="duotone" aria-hidden="true" />
                  <h2>{notes.length ? "Pick a page" : "A fresh book"}</h2>
                  <p>
                    {notes.length
                      ? "Choose a note from the index, or start a new one."
                      : "Keep track of clues, plans and promises. Link the blasters, slugs and people you mention so they are one tap away."}
                  </p>
                  {!loadError && (
                    <button type="button" className="nb-new" onClick={createNote} disabled={loading}>
                      <PlusIcon weight="bold" />
                      New note
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        {refTarget && (
          <NoteRefCard
            target={refTarget}
            entry={lookup(refTarget.kind, refTarget.id)}
            onClose={closeRef}
            onOpen={(entry) => {
              closeRef();
              flush();
              openRefTarget(entry, navigate);
            }}
          />
        )}
      </div>
    </div>
  );
}
