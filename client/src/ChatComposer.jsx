import { useCallback, useEffect, useRef, useState } from "react";
import {
  CodeIcon,
  EyeSlashIcon,
  ImageSquareIcon,
  LinkIcon,
  ListBulletsIcon,
  PaperPlaneRightIcon,
  QuotesIcon,
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  XIcon,
} from "@phosphor-icons/react";

export const MAX_BODY_LENGTH = 2000;
export const MAX_IMAGES = 3;

const IMAGE_MAX_EDGE = 1280;
const GIF_MAX_BYTES = 1_500_000;
const MAX_TEXTAREA_HEIGHT = 168;

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Photos from a phone are several MB; shrink them in the browser first so the
// upload stays quick. The server re-encodes again, this only saves bandwidth.
async function prepareImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name || "That file"} isn't an image.`);
  if (file.type === "image/gif") {
    if (file.size > GIF_MAX_BYTES) throw new Error("GIFs must be under 1.5 MB.");
    return readAsDataUrl(file);
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(`${file.name || "That image"} couldn't be read.`);
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("That image couldn't be processed.");
  return readAsDataUrl(blob);
}

// What each toolbar button writes around the selection. `line` marks prefix
// styles that apply to the start of every selected line instead of wrapping.
const FORMATS = {
  bold: { before: "**", after: "**", placeholder: "bold text" },
  italic: { before: "*", after: "*", placeholder: "italic text" },
  strike: { before: "~~", after: "~~", placeholder: "struck text" },
  spoiler: { before: "||", after: "||", placeholder: "hidden text" },
  code: { before: "`", after: "`", placeholder: "code" },
  quote: { line: "> ", placeholder: "quoted text" },
  list: { line: "- ", placeholder: "list item" },
  link: { before: "[", after: "](https://)", placeholder: "link text" },
};

const TOOLS = [
  { id: "bold", label: "Bold", hint: "Ctrl+B", Icon: TextBIcon },
  { id: "italic", label: "Italic", hint: "Ctrl+I", Icon: TextItalicIcon },
  { id: "strike", label: "Strikethrough", Icon: TextStrikethroughIcon },
  { id: "spoiler", label: "Spoiler", Icon: EyeSlashIcon },
  { id: "code", label: "Code", Icon: CodeIcon },
  { id: "quote", label: "Quote", Icon: QuotesIcon },
  { id: "list", label: "Bulleted list", Icon: ListBulletsIcon },
  { id: "link", label: "Link", hint: "Ctrl+K", Icon: LinkIcon },
];

function isTouchPrimary() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
}

export default function ChatComposer({ draft, setDraft, images, setImages, onSend, sending, error, setError }) {
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const pendingSelection = useRef(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(0);

  // Grow with the text up to a cap, then scroll. Runs after React commits the
  // new value so scrollHeight is current.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    if (pendingSelection.current) {
      const [start, end] = pendingSelection.current;
      pendingSelection.current = null;
      el.focus();
      el.setSelectionRange(start, end);
    }
  }, [draft]);

  const applyFormat = useCallback(
    (id) => {
      const el = textRef.current;
      const fmt = FORMATS[id];
      if (!el || !fmt) return;
      const { selectionStart: start, selectionEnd: end } = el;
      let next;
      let selStart;
      let selEnd;

      if (fmt.line) {
        const lineStart = draft.lastIndexOf("\n", start - 1) + 1;
        const chosen = draft.slice(lineStart, end) || fmt.placeholder;
        const prefixed = chosen
          .split("\n")
          .map((line) => (line.startsWith(fmt.line) ? line.slice(fmt.line.length) : fmt.line + line))
          .join("\n");
        next = draft.slice(0, lineStart) + prefixed + draft.slice(end);
        selStart = lineStart;
        selEnd = lineStart + prefixed.length;
      } else {
        const chosen = draft.slice(start, end);
        const wrapped = chosen.startsWith(fmt.before) && chosen.endsWith(fmt.after) && chosen.length >= fmt.before.length + fmt.after.length;
        if (wrapped) {
          const inner = chosen.slice(fmt.before.length, chosen.length - fmt.after.length);
          next = draft.slice(0, start) + inner + draft.slice(end);
          selStart = start;
          selEnd = start + inner.length;
        } else {
          const inner = chosen || fmt.placeholder;
          next = draft.slice(0, start) + fmt.before + inner + fmt.after + draft.slice(end);
          selStart = start + fmt.before.length;
          selEnd = selStart + inner.length;
          // A link wants the URL filled next, not the label.
          if (id === "link" && chosen) {
            selStart = selEnd + 2;
            selEnd = selStart + "https://".length;
          }
        }
      }

      if (next.length > MAX_BODY_LENGTH) return;
      pendingSelection.current = [selStart, selEnd];
      setDraft(next);
    },
    [draft, setDraft]
  );

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    if (files.length > room) setError(`Only ${MAX_IMAGES} images fit in one message.`);
    else setError(null);

    const picked = files.slice(0, room);
    setProcessing((n) => n + picked.length);
    const results = await Promise.allSettled(picked.map(prepareImage));
    setProcessing((n) => n - picked.length);

    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) setError(failed.reason?.message || "That image couldn't be added.");
    if (ok.length) setImages((prev) => [...prev, ...ok].slice(0, MAX_IMAGES));
  }

  function handleKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      const shortcut = { b: "bold", i: "italic", k: "link" }[key];
      if (shortcut) {
        e.preventDefault();
        applyFormat(shortcut);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchPrimary()) {
      e.preventDefault();
      onSend();
    }
  }

  function handlePaste(e) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  }

  function hasFiles(e) {
    return Array.from(e.dataTransfer?.types ?? []).includes("Files");
  }

  const canSend = !sending && processing === 0 && (draft.trim().length > 0 || images.length > 0);
  const nearLimit = draft.length > MAX_BODY_LENGTH * 0.8;

  return (
    <form
      className={`chat-composer${dragging ? " chat-composer--drag" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      {(images.length > 0 || processing > 0) && (
        <ul className="chat-attachments" aria-label="Attached images">
          {images.map((src, i) => (
            <li key={i} className="chat-attachment">
              <img src={src} alt={`Attachment ${i + 1}`} />
              <button
                type="button"
                className="chat-attachment-remove"
                aria-label={`Remove attachment ${i + 1}`}
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <XIcon weight="bold" />
              </button>
            </li>
          ))}
          {Array.from({ length: processing }, (_, i) => (
            <li key={`p${i}`} className="chat-attachment chat-attachment--loading" aria-label="Preparing image" />
          ))}
        </ul>
      )}

      <textarea
        ref={textRef}
        rows={1}
        className="chat-composer-input"
        placeholder="Say something to the table..."
        aria-label="Message"
        value={draft}
        maxLength={MAX_BODY_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />

      <div className="chat-composer-bar">
        <button
          type="button"
          className="chat-tool"
          title="Attach images"
          aria-label="Attach images"
          disabled={images.length >= MAX_IMAGES}
          onClick={() => fileRef.current?.click()}
        >
          <ImageSquareIcon weight="bold" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="chat-tools-divider" aria-hidden="true" />

        <div className="chat-tools" role="toolbar" aria-label="Formatting">
          {TOOLS.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              type="button"
              className="chat-tool"
              title={hint ? `${label} (${hint})` : label}
              aria-label={label}
              // Keep the textarea's selection: a mousedown would blur it first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat(id)}
            >
              <Icon weight="bold" />
            </button>
          ))}
        </div>

        {nearLimit && (
          <span className="chat-count num-tabular" aria-live="polite">
            {MAX_BODY_LENGTH - draft.length}
          </span>
        )}

        <button type="submit" className="panel-btn panel-btn--icon chat-send" disabled={!canSend} aria-label="Send message">
          <PaperPlaneRightIcon weight="bold" />
        </button>
      </div>

      {error && (
        <p className="panel-error chat-composer-error" role="alert">
          {error}
        </p>
      )}

      {dragging && <div className="chat-drop">Drop images to attach</div>}
    </form>
  );
}
