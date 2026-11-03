import { useCallback, useEffect, useRef, useState } from "react";
import {
  AtIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  MinusIcon,
  QuotesIcon,
  TextBIcon,
  TextHIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
} from "@phosphor-icons/react";
import NoteLinkPicker from "./NoteLinkPicker.jsx";
import { buildRef } from "./noteLinks.js";

export const MAX_NOTE_LENGTH = 20000;

// What each toolbar button writes around the selection. `line` styles prefix
// every selected line instead of wrapping it.
const FORMATS = {
  heading: { line: "## ", placeholder: "Heading" },
  subheading: { line: "### ", placeholder: "Subheading" },
  bold: { before: "**", after: "**", placeholder: "bold text" },
  italic: { before: "*", after: "*", placeholder: "italic text" },
  strike: { before: "~~", after: "~~", placeholder: "struck text" },
  quote: { line: "> ", placeholder: "quoted text" },
  list: { line: "- ", placeholder: "list item" },
  numbered: { line: "1. ", placeholder: "list item" },
  link: { before: "[", after: "](https://)", placeholder: "link text" },
};

const TOOLS = [
  [
    { id: "heading", label: "Heading", Icon: TextHIcon },
    { id: "bold", label: "Bold", hint: "Ctrl+B", Icon: TextBIcon },
    { id: "italic", label: "Italic", hint: "Ctrl+I", Icon: TextItalicIcon },
    { id: "strike", label: "Strikethrough", Icon: TextStrikethroughIcon },
  ],
  [
    { id: "list", label: "Bulleted list", Icon: ListBulletsIcon },
    { id: "numbered", label: "Numbered list", Icon: ListNumbersIcon },
    { id: "quote", label: "Quote", Icon: QuotesIcon },
    { id: "rule", label: "Divider", Icon: MinusIcon },
    { id: "link", label: "Web link", Icon: LinkSimpleIcon },
  ],
];

// Brackets would end the label early; swap them for parentheses.
const linkLabel = (text) => text.replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim();

export default function NoteEditor({ value, onChange, entries, linksLoaded, autoFocus }) {
  const textRef = useRef(null);
  const pendingSelection = useRef(null);
  const pickerRange = useRef([0, 0]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);

  // Put the caret back after React commits the new value.
  useEffect(() => {
    if (!pendingSelection.current) return;
    const [start, end] = pendingSelection.current;
    pendingSelection.current = null;
    const el = textRef.current;
    el?.focus();
    el?.setSelectionRange(start, end);
  }, [value]);

  const commit = useCallback(
    (next, selStart, selEnd) => {
      if (next.length > MAX_NOTE_LENGTH) return;
      pendingSelection.current = [selStart, selEnd];
      onChange(next);
    },
    [onChange]
  );

  const applyFormat = useCallback(
    (id) => {
      const el = textRef.current;
      if (!el) return;
      const { selectionStart: start, selectionEnd: end } = el;

      if (id === "rule") {
        const lead = start > 0 && value[start - 1] !== "\n" ? "\n\n" : value.slice(0, start).endsWith("\n\n") || start === 0 ? "" : "\n";
        const insert = `${lead}---\n\n`;
        commit(value.slice(0, end) + insert + value.slice(end), end + insert.length, end + insert.length);
        return;
      }

      const fmt = FORMATS[id];
      if (!fmt) return;

      if (fmt.line) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const chosen = value.slice(lineStart, end) || fmt.placeholder;
        const prefixed = chosen
          .split("\n")
          .map((line) => (line.startsWith(fmt.line) ? line.slice(fmt.line.length) : fmt.line + line))
          .join("\n");
        commit(value.slice(0, lineStart) + prefixed + value.slice(end), lineStart, lineStart + prefixed.length);
        return;
      }

      const chosen = value.slice(start, end);
      const wrapped =
        chosen.startsWith(fmt.before) && chosen.endsWith(fmt.after) && chosen.length >= fmt.before.length + fmt.after.length;
      if (wrapped) {
        const inner = chosen.slice(fmt.before.length, chosen.length - fmt.after.length);
        commit(value.slice(0, start) + inner + value.slice(end), start, start + inner.length);
        return;
      }
      const inner = chosen || fmt.placeholder;
      let selStart = start + fmt.before.length;
      let selEnd = selStart + inner.length;
      // A link wants its address filled next, not its label.
      if (id === "link" && chosen) {
        selStart = selEnd + 2;
        selEnd = selStart + "https://".length;
      }
      commit(value.slice(0, start) + fmt.before + inner + fmt.after + value.slice(end), selStart, selEnd);
    },
    [value, commit]
  );

  function openPicker() {
    const el = textRef.current;
    pickerRange.current = el ? [el.selectionStart, el.selectionEnd] : [value.length, value.length];
    setPickerOpen(true);
  }

  function pick(entry) {
    const [start, end] = pickerRange.current;
    const label = linkLabel(value.slice(start, end)) || linkLabel(entry.name);
    const link = `[${label}](${buildRef(entry.kind, entry.id)})`;
    const next = value.slice(0, start) + link + value.slice(end);
    setPickerOpen(false);
    const caret = start + link.length;
    commit(next, caret, caret);
  }

  function handleKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey) {
      const shortcut = { b: "bold", i: "italic" }[e.key.toLowerCase()];
      if (shortcut) {
        e.preventDefault();
        applyFormat(shortcut);
        return;
      }
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPicker();
        return;
      }
    }
  }

  // "@" at the start of a word opens the picker, as in a chat mention. Read from
  // the change rather than the keydown so phone keyboards (whose key events
  // carry no character) work too; the "@" itself is never kept.
  function handleChange(e) {
    const next = e.target.value;
    const caret = e.target.selectionStart;
    const typed = next.length === value.length + 1 && next[caret - 1] === "@";
    if (typed && (caret === 1 || /\s/.test(next[caret - 2]))) {
      const without = next.slice(0, caret - 1) + next.slice(caret);
      pickerRange.current = [caret - 1, caret - 1];
      onChange(without);
      setPickerOpen(true);
      return;
    }
    onChange(next);
  }

  const remaining = MAX_NOTE_LENGTH - value.length;

  return (
    <div className="nb-editor">
      <div className="nb-toolbar" role="toolbar" aria-label="Formatting">
        <button
          type="button"
          className="nb-linkbtn"
          data-nb-picker-trigger
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          title="Link to an item, slug or person (Ctrl+K, or type @)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
        >
          <AtIcon weight="bold" />
          Link to…
        </button>
        {TOOLS.map((group, i) => (
          <div className="nb-tool-group" key={i}>
            {group.map(({ id, label, hint, Icon }) => (
              <button
                key={id}
                type="button"
                className="nb-tool"
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
        ))}
      </div>

      {pickerOpen && (
        <NoteLinkPicker
          entries={entries}
          loaded={linksLoaded}
          onPick={pick}
          onClose={() => {
            setPickerOpen(false);
            const el = textRef.current;
            el?.focus();
            el?.setSelectionRange(...pickerRange.current);
          }}
        />
      )}

      <textarea
        ref={textRef}
        className="nb-textarea"
        value={value}
        maxLength={MAX_NOTE_LENGTH}
        spellCheck
        placeholder="Write here. Type @ to link something you own, a slug, or someone from the Chronicle."
        aria-label="Note text"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />

      <p className="nb-editor-foot">
        <span>Links turn into chips when you switch to Read.</span>
        {remaining < 2000 && <span className="num-tabular">{remaining.toLocaleString()} left</span>}
      </p>
    </div>
  );
}
