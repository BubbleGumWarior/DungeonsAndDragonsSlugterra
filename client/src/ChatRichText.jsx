import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { visit } from "unist-util-visit";

// Party Chat messages are stored as plain markdown and rendered here, never as
// HTML. The renderer allows a small set of marks (bold, italic, strike, code,
// quotes, lists, links, spoilers) and drops everything else, so a pasted
// "<script>" or a raw image tag just shows up as text.

const SPOILER = /\|\|([^|\n]+?)\|\|/g;

// ||hidden|| -> a span the renderer below turns into a click-to-reveal chip.
// Works on text nodes only, so a spoiler can't wrap other formatting.
function remarkSpoiler() {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index == null || !node.value.includes("||")) return;
      const parts = [];
      let last = 0;
      for (const match of node.value.matchAll(SPOILER)) {
        if (match.index > last) parts.push({ type: "text", value: node.value.slice(last, match.index) });
        parts.push({
          type: "spoiler",
          data: { hName: "span", hProperties: { className: ["chat-spoiler"] } },
          children: [{ type: "text", value: match[1] }],
        });
        last = match.index + match[0].length;
      }
      if (parts.length === 0) return;
      if (last < node.value.length) parts.push({ type: "text", value: node.value.slice(last) });
      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "chat-spoiler"]],
  },
};

const REMARK_PLUGINS = [[remarkGfm, { singleTilde: false }], remarkSpoiler];
const REHYPE_PLUGINS = [[rehypeSanitize, schema]];
const DISALLOWED = ["img", "table", "thead", "tbody", "tr", "th", "td", "hr", "input"];

function Spoiler({ children }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={shown ? undefined : "Hidden text, activate to reveal"}
      className={`chat-spoiler${shown ? " chat-spoiler--shown" : ""}`}
      onClick={() => setShown(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setShown(true);
        }
      }}
    >
      {children}
    </span>
  );
}

const heading = ({ children }) => (
  <p>
    <strong>{children}</strong>
  </p>
);

const COMPONENTS = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  span: ({ className, children }) =>
    className === "chat-spoiler" ? <Spoiler>{children}</Spoiler> : <span>{children}</span>,
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
};

// Raw HTML is never rendered. Escaping "<" keeps it visible as text instead of
// silently swallowing the whole line (markdown treats a leading tag as an HTML
// block, which would leave an empty bubble).
const escapeHtml = (text) => text.replace(/</g, "\\<");

export default function ChatRichText({ source }) {
  return (
    <div className="chat-rich">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
        disallowedElements={DISALLOWED}
        unwrapDisallowed
      >
        {escapeHtml(source)}
      </ReactMarkdown>
    </div>
  );
}
