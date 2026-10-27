import { useEffect, useMemo, useRef, useState } from "react";
import { CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import SlugImageModal from "./SlugImageModal.jsx";
import {
  SLUG_TRAITS,
  CLASH_POWER_MAX,
  CLASH_DEFENSE_MAX,
  AP_COST_MAX,
  ENERGY_PIPS_MAX,
  typeColor,
  typeBallistics,
} from "./slugData.js";
import "./Slugpedia.css";

// Species data only -- the raw stat block. Loyalty is a per-slinger bond, not a
// property of the species, so it (and its clash/accuracy modifiers) never
// appears in the book.
const STAT_ROWS = [
  { key: "clashPower", label: "Clash Power", max: CLASH_POWER_MAX },
  { key: "clashDefense", label: "Clash Defense", max: CLASH_DEFENSE_MAX },
  { key: "apCost", label: "AP Cost", max: AP_COST_MAX },
  { key: "maxEnergyPips", label: "Energy Pips", max: ENERGY_PIPS_MAX },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
const roman = (i) => ROMAN[i] ?? String(i + 1);
const pad = (n) => String(n).padStart(3, "0");

const traitsOf = (v) => (v.discovered ? SLUG_TRAITS.filter((t) => v[t.key]) : []);
const artKey = (v) => [v.type, v.protoformImage, v.velocityImage].join("|");

// Two entries are the same variant when everything the book shows agrees. The
// server also keys entries on loyalty tier, so one slug caught at two bond
// levels is two rows there -- they collapse into one variant here.
function variantKey(v) {
  if (!v.discovered) return `sealed|${artKey(v)}`;
  return [
    artKey(v),
    ...STAT_ROWS.map((r) => v[r.key]),
    v.protoformUtility,
    v.velocityAbility,
    ...traitsOf(v).map((t) => t.key),
  ].join("|");
}

// Every distinct slug the party has encountered, one entry per species (by
// name) with its distinct variants in order: caught variants first, oldest
// first, then any only ever seen on an NPC.
function buildSpecies(entries) {
  const byName = new Map();
  for (const entry of entries) {
    if (!byName.has(entry.name)) byName.set(entry.name, []);
    byName.get(entry.name).push(entry);
  }
  return [...byName.entries()]
    .map(([name, list]) => {
      const ordered = [...list].sort(
        (a, b) => Number(b.discovered) - Number(a.discovered) || new Date(a.firstSeenAt) - new Date(b.firstSeenAt)
      );
      const seen = new Set();
      const variants = ordered.filter((v) => {
        const key = variantKey(v);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // A sealed sighting that just repeats a caught variant's art is the same slug.
      const caughtArt = new Set(variants.filter((v) => v.discovered).map(artKey));
      const kept = variants.filter((v) => v.discovered || !caughtArt.has(artKey(v)));
      return { name, type: kept[0].type, variants: kept, discovered: kept.some((v) => v.discovered) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function Thumb({ entry, className = "" }) {
  const src = entry.protoformImage || entry.velocityImage;
  return (
    <span className={`sp-thumb ${entry.discovered ? "" : "sp-thumb--sealed"} ${className}`}>
      {src && <img src={src} alt="" loading="lazy" decoding="async" />}
    </span>
  );
}

function Plate({ image, label, caption, landscape, onOpen }) {
  return (
    <figure className={`sp-plate ${landscape ? "sp-plate--landscape" : ""}`}>
      {image ? (
        <button type="button" className="sp-plate-frame" onClick={onOpen} aria-label={`View ${label} full size`}>
          <img src={image} alt={label} loading="lazy" decoding="async" />
        </button>
      ) : (
        <div className="sp-plate-frame sp-plate-frame--empty">No likeness recorded</div>
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function StatLine({ label, value, max, sealed }) {
  return (
    <div className="sp-stat">
      <span className="sp-stat-label">{label}</span>
      <span className="sp-leader" aria-hidden="true" />
      <span className="sp-stat-value">{sealed ? "?" : value}</span>
      <span className="sp-meter" aria-hidden="true">
        {!sealed && <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />}
      </span>
    </div>
  );
}

// How a variant departs from the first one on record, as short phrases.
function otherDifferences(v, base) {
  const out = [];
  if (v.protoformImage !== base.protoformImage || v.velocityImage !== base.velocityImage) out.push("Different art");
  if (v.protoformUtility !== base.protoformUtility) out.push("Protoform notes");
  if (v.velocityAbility !== base.velocityAbility) out.push("Velocity notes");
  return out;
}

function VariantLedger({ variants, selected, onSelect }) {
  const base = variants[0];
  const baseTraits = new Set(traitsOf(base).map((t) => t.key));
  return (
    <section className="sp-section">
      <h4 className="sp-section-title">Variants on record</h4>
      <div className="sp-ledger-scroll">
        <table className="sp-ledger">
          <thead>
            <tr>
              <td />
              {variants.map((v, i) => (
                <th key={v.id} scope="col">
                  <button
                    type="button"
                    className={`sp-ledger-head ${i === selected ? "sp-ledger-head--on" : ""}`}
                    onClick={() => onSelect(i)}
                    aria-pressed={i === selected}
                  >
                    <Thumb entry={v} />
                    <span>{roman(i)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {variants.map((v, i) => {
                  if (!v.discovered) return <td key={v.id} className="sp-ledger-sealed">?</td>;
                  const delta = i > 0 && base.discovered ? v[row.key] - base[row.key] : 0;
                  return (
                    <td key={v.id} className={delta !== 0 ? "sp-ledger-diff" : ""}>
                      {v[row.key]}
                      {delta !== 0 && <small>{delta > 0 ? `+${delta}` : delta}</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">Traits</th>
              {variants.map((v, i) => {
                if (!v.discovered) return <td key={v.id} className="sp-ledger-sealed">?</td>;
                const mine = traitsOf(v);
                const mineKeys = new Set(mine.map((t) => t.key));
                const lost = i > 0 && base.discovered ? traitsOf(base).filter((t) => !mineKeys.has(t.key)) : [];
                if (mine.length === 0 && lost.length === 0) return <td key={v.id}>—</td>;
                return (
                  <td key={v.id} className="sp-ledger-traits">
                    {mine.map((t) => (
                      <span key={t.key} className={i > 0 && base.discovered && !baseTraits.has(t.key) ? "sp-new" : ""}>
                        {t.label}
                      </span>
                    ))}
                    {lost.map((t) => (
                      <span key={t.key} className="sp-lost">
                        {t.label}
                      </span>
                    ))}
                  </td>
                );
              })}
            </tr>
            {variants.length > 1 && (
              <tr>
                <th scope="row">Also differs</th>
                {variants.map((v, i) => {
                  const diffs = i === 0 || !v.discovered || !base.discovered ? [] : otherDifferences(v, base);
                  return <td key={v.id}>{diffs.length ? diffs.join(", ") : "—"}</td>;
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SpeciesEntry({ species, number, onOpenImage }) {
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, species.variants.length - 1);
  const v = species.variants[index];
  const sealed = !v.discovered;
  const multiple = species.variants.length > 1;
  const ballistics = typeBallistics(v.type);
  const traits = traitsOf(v);
  const fmtMod = (n) => (n > 0 ? `+${n}` : `${n}`);

  return (
    <article className="sp-entry" style={{ "--type-color": typeColor(v.type) }}>
      <header className="sp-entry-head">
        <p className="sp-eyebrow">
          Entry No. {pad(number)}
          <span className="sp-seal">{v.type}</span>
        </p>
        <h3 className="sp-entry-name">{species.name}</h3>
        {multiple && (
          <div className="sp-ribbons" role="tablist" aria-label="Variants">
            {species.variants.map((variant, i) => (
              <button
                key={variant.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`sp-ribbon ${i === index ? "sp-ribbon--on" : ""}`}
                onClick={() => setSelected(i)}
              >
                {roman(i)}
              </button>
            ))}
          </div>
        )}
        {multiple && (
          <p className="sp-variant-note">
            Variant {roman(index)} of {species.variants.length}
            {index === 0 ? " — first on record" : ""}
          </p>
        )}
      </header>

      <div className="sp-plates">
        <Plate
          image={v.protoformImage}
          label="Protoform"
          caption="Plate I — Protoform"
          onOpen={() => onOpenImage(v, "protoform")}
        />
        <Plate
          image={v.velocityImage}
          label="Velocity form"
          caption="Plate II — Velocity form"
          landscape
          onOpen={() => onOpenImage(v, "velocity")}
        />
      </div>

      {sealed ? (
        <p className="sp-sealed-note">
          Seen in the wild, never caught. Its stats and abilities stay unrecorded until a player catches one.
        </p>
      ) : (
        <section className="sp-section">
          <h4 className="sp-section-title">Field notes</h4>
          <p className="sp-prose">
            <span className="sp-run-head">Protoform.</span> {v.protoformUtility || "Nothing recorded."}
          </p>
          <p className="sp-prose">
            <span className="sp-run-head">Velocity form.</span> {v.velocityAbility || "Nothing recorded."}
          </p>
        </section>
      )}

      <section className="sp-section">
        <h4 className="sp-section-title">Specimen record</h4>
        <div className="sp-stats">
          {STAT_ROWS.map((row) => (
            <StatLine key={row.key} label={row.label} value={v[row.key]} max={row.max} sealed={sealed} />
          ))}
        </div>
      </section>

      {!sealed && (
        <section className="sp-section">
          <h4 className="sp-section-title">{v.type} element</h4>
          <dl className="sp-facts">
            <div>
              <dt>Range</dt>
              <dd>
                {ballistics.band} <small>~{ballistics.range}u</small>
              </dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{fmtMod(ballistics.accuracyMod)}</dd>
            </div>
            <div className="sp-facts-wide">
              <dt>On a hit</dt>
              <dd>{ballistics.hitEffect}</dd>
            </div>
          </dl>
        </section>
      )}

      {traits.length > 0 && (
        <section className="sp-section">
          <h4 className="sp-section-title">Special traits</h4>
          <ul className="sp-traits">
            {traits.map((t) => (
              <li key={t.key}>
                <strong>{t.label}.</strong> {t.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {multiple && <VariantLedger variants={species.variants} selected={index} onSelect={setSelected} />}
    </article>
  );
}

// A field guide to every slug the party has ever encountered -- assigned to a
// player, or carried by an NPC that joined combat. Left page: the index. Right
// page: the selected species, with its variants set side by side.
export default function Slugpedia({ onClose }) {
  const { token } = useAuth();
  const { slugpediaUpdate } = useLiveState();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState(null);
  const [viewer, setViewer] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    fetch("/api/slugpedia", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, slugpediaUpdate]);

  const species = useMemo(() => buildSpecies(entries), [entries]);
  const numbers = useMemo(() => new Map(species.map((s, i) => [s.name, i + 1])), [species]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return species;
    return species.filter((s) => s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q));
  }, [species, query]);

  const current = species.find((s) => s.name === selectedName) ?? visible[0] ?? species[0] ?? null;
  const pos = current ? visible.findIndex((s) => s.name === current.name) : -1;

  function step(delta) {
    if (visible.length === 0) return;
    const from = pos === -1 ? 0 : pos;
    setSelectedName(visible[(from + delta + visible.length) % visible.length].name);
  }

  // Left/right turn the page, Escape closes the book (unless the art viewer is
  // up -- it handles its own Escape).
  const keyRef = useRef();
  keyRef.current = (e) => {
    if (viewer) return;
    if (e.key === "Escape") onClose();
    else if (e.target instanceof HTMLInputElement) return;
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  };
  useEffect(() => {
    const onKey = (e) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(".sp-index-row--on")?.scrollIntoView({ block: "nearest" });
  }, [current?.name]);

  const variantCount = species.reduce((n, s) => n + s.variants.length, 0);
  const sealedCount = species.filter((s) => !s.discovered).length;

  let lastLetter = "";
  return (
    <div className="sp-backdrop" onClick={onClose}>
      <div className="sp-book" role="dialog" aria-modal="true" aria-label="Slugpedia" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sp-close" onClick={onClose} aria-label="Close Slugpedia">
          <XIcon weight="bold" />
        </button>

        <div className="sp-pages">
          <section className="sp-page sp-page--index">
            <header className="sp-index-head">
              <h2 className="sp-title">Slugpedia</h2>
              <p className="sp-subtitle">A field guide to every slug the party has met</p>
              <label className="sp-search">
                <MagnifyingGlassIcon weight="bold" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a slug or element"
                  aria-label="Search the Slugpedia"
                />
              </label>
            </header>

            <div className="sp-index-list" ref={listRef}>
              {loading ? (
                <p className="sp-empty">Turning to the first page…</p>
              ) : species.length === 0 ? (
                <p className="sp-empty">The pages are blank. No slugs discovered yet.</p>
              ) : visible.length === 0 ? (
                <p className="sp-empty">Nothing in the index matches “{query}”.</p>
              ) : (
                visible.map((s) => {
                  const letter = s.name.charAt(0).toUpperCase();
                  const showLetter = letter !== lastLetter;
                  lastLetter = letter;
                  return (
                    <div key={s.name}>
                      {showLetter && <p className="sp-letter">{letter}</p>}
                      <button
                        type="button"
                        className={`sp-index-row ${current?.name === s.name ? "sp-index-row--on" : ""}`}
                        style={{ "--type-color": typeColor(s.type) }}
                        onClick={() => setSelectedName(s.name)}
                        aria-current={current?.name === s.name ? "true" : undefined}
                      >
                        <Thumb entry={s.variants[0]} />
                        <span className="sp-index-name">{s.name}</span>
                        <span className="sp-leader" aria-hidden="true" />
                        <span className="sp-index-meta">
                          {s.variants.length > 1 && <em>{s.variants.length} variants</em>}
                          {!s.discovered && <em>sealed</em>}
                          <span className="sp-dot" title={s.type} />
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <footer className="sp-index-foot">
              {species.length} species · {variantCount} variants
              {sealedCount > 0 && ` · ${sealedCount} sealed`}
            </footer>
          </section>

          <section className="sp-page sp-page--entry">
            {current ? (
              <>
                <div className="sp-entry-scroll">
                  <SpeciesEntry
                    key={current.name}
                    species={current}
                    number={numbers.get(current.name)}
                    onOpenImage={(slug, form) => setViewer({ slug, form })}
                  />
                </div>
                <footer className="sp-turn">
                  <button type="button" onClick={() => step(-1)} aria-label="Previous entry" disabled={visible.length < 2}>
                    <CaretLeftIcon weight="bold" />
                  </button>
                  <span>
                    {pos === -1 ? "—" : pos + 1} of {visible.length}
                  </span>
                  <button type="button" onClick={() => step(1)} aria-label="Next entry" disabled={visible.length < 2}>
                    <CaretRightIcon weight="bold" />
                  </button>
                </footer>
              </>
            ) : (
              <p className="sp-empty sp-empty--page">Nothing has been recorded here yet.</p>
            )}
          </section>
        </div>
      </div>

      {viewer && <SlugImageModal slug={viewer.slug} initialForm={viewer.form} onClose={() => setViewer(null)} />}
    </div>
  );
}
