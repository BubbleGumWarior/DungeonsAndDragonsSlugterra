import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { BackpackIcon, PuzzlePieceIcon, ShieldIcon, TargetIcon, UserCircleIcon, UserIcon } from "@phosphor-icons/react";
import SlugIcon from "./SlugIcon.jsx";
import { parseRef } from "./noteLinks.js";

// Notes are stored as markdown and rendered here, never as HTML. Beyond what
// Party Chat allows this adds headings, numbered lists, rules, tables, and the
// `ref:` links that become chips for owned items, slugs and people.

const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "ref"],
  },
};

const REMARK_PLUGINS = [[remarkGfm, { singleTilde: false }]];
const REHYPE_PLUGINS = [[rehypeSanitize, schema]];
const DISALLOWED = ["img", "input", "code", "pre"];

const urlTransform = (url) => (url.startsWith("ref:") ? url : defaultUrlTransform(url));
const escapeHtml = (text) => text.replace(/</g, "\\<");

export function RefIcon({ kind, size = 15 }) {
  if (kind === "slug") return <SlugIcon size={size} />;
  const Icon = { blaster: TargetIcon, mod: PuzzlePieceIcon, gear: ShieldIcon, pc: UserCircleIcon, npc: UserIcon }[kind] || BackpackIcon;
  return <Icon weight="bold" size={size} aria-hidden="true" />;
}

function RefChip({ kind, id, entry, onOpenRef, children }) {
  return (
    <button
      type="button"
      className={`nb-chip nb-chip--${kind}${entry ? "" : " nb-chip--lost"}`}
      onClick={(e) => onOpenRef({ kind, id, label: e.currentTarget.textContent }, e.currentTarget)}
    >
      <RefIcon kind={kind} size={14} />
      <span>{children}</span>
    </button>
  );
}

export default function NoteRichText({ source, lookup, onOpenRef }) {
  const components = useMemo(
    () => ({
      a: ({ href, children }) => {
        const ref = parseRef(href);
        if (ref) {
          return (
            <RefChip kind={ref.kind} id={ref.id} entry={lookup(ref.kind, ref.id)} onOpenRef={onOpenRef}>
              {children}
            </RefChip>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {children}
          </a>
        );
      },
      h1: ({ children }) => <h3 className="nb-h1">{children}</h3>,
      h2: ({ children }) => <h4 className="nb-h2">{children}</h4>,
      h3: ({ children }) => <h5 className="nb-h3">{children}</h5>,
      h4: ({ children }) => <h5 className="nb-h3">{children}</h5>,
      h5: ({ children }) => <h5 className="nb-h3">{children}</h5>,
      h6: ({ children }) => <h5 className="nb-h3">{children}</h5>,
      table: ({ children }) => (
        <div className="nb-table-wrap">
          <table>{children}</table>
        </div>
      ),
    }),
    [lookup, onOpenRef]
  );

  return (
    <div className="nb-prose">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
        disallowedElements={DISALLOWED}
        unwrapDisallowed
        urlTransform={urlTransform}
      >
        {escapeHtml(source)}
      </ReactMarkdown>
    </div>
  );
}
