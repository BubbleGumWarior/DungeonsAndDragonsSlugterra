import { useMemo, useState } from "react";
import {
  CircleDashedIcon,
  DownloadSimpleIcon,
  FunnelSimpleIcon,
  GearSixIcon,
  GiftIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShuffleIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { SLUG_TYPES, typeColor } from "./slugData.js";
import { SLUG_TRAIT_GROUPS, SLUG_TRAIT_LIST } from "./slugTraits.jsx";
import { SORT_OPTIONS, filterTemplates, sortTemplates } from "./SlugToolbar.jsx";
import { Bits, DeskRow } from "./DeskParts.jsx";
import "./SlugToolbar.css";
import "./InventoryDesk.css";

function toggled(set, key) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function ManageAction({ icon: Icon, title, note, danger, onClick, disabled }) {
  return (
    <button type="button" className={`desk-action ${danger ? "desk-action--danger" : ""}`} onClick={onClick} disabled={disabled}>
      <Icon weight="bold" aria-hidden="true" />
      <span className="desk-action-text">
        <span className="desk-action-title">{title}</span>
        <span className="desk-action-note">{note}</span>
      </span>
    </button>
  );
}

// What the slug can do, in full: both ability texts and every trait it carries.
function SlugDetails({ template, traits }) {
  return (
    <>
      {template.velocityAbility && (
        <p className="desk-detail">
          <span className="desk-detail-label">Velocity ability</span>
          {template.velocityAbility}
        </p>
      )}
      {template.protoformUtility && (
        <p className="desk-detail">
          <span className="desk-detail-label">Protoform utility</span>
          {template.protoformUtility}
        </p>
      )}
      {traits.length > 0 && (
        <div className="desk-detail">
          <span className="desk-detail-label">Traits</span>
          <div className="desk-traits">
            {traits.map((t) => {
              const Icon = t.icon;
              return (
                <span key={t.key} className="desk-trait" title={t.description}>
                  <Icon weight="bold" aria-hidden="true" />
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {!template.protoformUtility && !template.velocityAbility && traits.length === 0 && (
        <p className="desk-detail desk-detail--none">No abilities recorded for this slug.</p>
      )}
    </>
  );
}

function SlugRow({ template, held, recipient, onGive, onCustomize, onEdit, onDelete }) {
  const traits = SLUG_TRAIT_LIST.filter((t) => template[t.key]);
  // The preview a DM reads before giving is the velocity ability (what the slug
  // does in a fight); with none recorded, its traits by name so it never looks blank.
  const blurb = template.velocityAbility || traits.map((t) => t.label).join(", ") || "No velocity ability recorded.";
  return (
    <DeskRow
      lead={
        <span className="desk-row-icon desk-row-icon--art" style={{ "--type-color": typeColor(template.type) }} aria-hidden="true">
          {template.protoformImage ? <img src={template.protoformImage} alt="" loading="lazy" decoding="async" /> : <CircleDashedIcon weight="duotone" />}
        </span>
      }
      name={template.name}
      sub={
        <Bits
          items={[
            // Lifted toward the ink colour: the darker element colours (Dark, Metal) are too dim to read as text.
            { text: template.type, color: `color-mix(in srgb, ${typeColor(template.type)} 60%, var(--ink))` },
            `Power ${template.clashPower}`,
            `Defense ${template.clashDefense}`,
            `AP ${template.apCost}`,
            held > 0 && { text: `Has ${held}`, color: "var(--gold-soft)" },
          ]}
        />
      }
      blurb={blurb}
      details={<SlugDetails template={template} traits={traits} />}
      recipient={recipient}
      onGive={() => onGive(template)}
      onCustomize={onCustomize ? () => onCustomize(template) : undefined}
      onEdit={() => onEdit(template)}
      onDelete={() => onDelete(template)}
      kind="template"
    />
  );
}

// The DM's slug roster as a one-click catalog: search, narrow by element or
// ability, press Give. Bulk and test tools live behind Manage so the list
// stays the star.
export default function SlugCatalog({ templates, recipient, heldByTemplate, status, bulk, onGive, onCustomize, onEdit, onDelete, onNew, onBundle, bundleOpen }) {
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState(() => new Set());
  const [flags, setFlags] = useState(() => new Set());
  const [sortKey, setSortKey] = useState("name-asc");
  const [panel, setPanel] = useState(null); // "filters" | "manage" | null

  const visible = useMemo(() => sortTemplates(filterTemplates(templates, { query, types, flags }), sortKey), [templates, query, types, flags, sortKey]);
  const activeCount = types.size + flags.size;
  const filtering = activeCount > 0 || query.trim();

  function clear() {
    setQuery("");
    setTypes(new Set());
    setFlags(new Set());
  }

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));

  return (
    <section className="desk-catalog" aria-label="Slug templates">
      <header className="desk-catalog-head">
        <h2>Slug templates</h2>
        <span className="desk-tab-count">{templates.length}</span>
      </header>

      <div className="desk-catalog-body">
        <div className="desk-toolbar">
          <label className="desk-search">
            <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or element" aria-label="Search slug templates" />
          </label>
          <select className="desk-select" value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="Sort templates">
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="desk-actions">
          <button type="button" className={`desk-pill ${panel === "filters" ? "desk-pill--on" : ""}`} aria-expanded={panel === "filters"} onClick={() => togglePanel("filters")}>
            <FunnelSimpleIcon weight="bold" />
            Filters
            {activeCount > 0 && <span className="desk-pill-count">{activeCount}</span>}
          </button>
          <button type="button" className={`desk-pill ${panel === "manage" ? "desk-pill--on" : ""}`} aria-expanded={panel === "manage"} onClick={() => togglePanel("manage")}>
            <GearSixIcon weight="bold" />
            Manage
          </button>
          {onBundle && (
            <button
              type="button"
              className="desk-pill slug-bundle-open"
              onClick={onBundle}
              disabled={bundleOpen || templates.length === 0}
              title={bundleOpen ? "A slug bundle is already open on everyone's screen" : "Offer several slugs; players take one each"}
            >
              <GiftIcon weight="bold" />
              Give Slug Bundle
            </button>
          )}
          <button type="button" className="desk-new desk-new--end" onClick={onNew}>
            <PlusIcon weight="bold" />
            New
          </button>
        </div>

        {panel === "filters" && (
          <div className="desk-panel">
            <div className="desk-panel-group">
              <span className="desk-panel-title">Element</span>
              <div className="desk-panel-chips" role="group" aria-label="Filter by element">
                {SLUG_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`slug-type-chip ${types.has(t.key) ? "slug-type-chip--active" : ""}`}
                    style={{ "--chip-color": t.color }}
                    aria-pressed={types.has(t.key)}
                    onClick={() => setTypes((s) => toggled(s, t.key))}
                  >
                    {t.key}
                  </button>
                ))}
              </div>
            </div>
            {SLUG_TRAIT_GROUPS.map((group) => (
              <div className="desk-panel-group" key={group.key}>
                <span className="desk-panel-title">{group.label}</span>
                <div className="desk-panel-chips" role="group" aria-label={`Filter by ${group.label}`}>
                  {group.traits.map((f) => {
                    const Icon = f.icon;
                    const on = flags.has(f.key);
                    return (
                      <button key={f.key} type="button" className={`slug-flag-chip ${on ? "slug-flag-chip--active" : ""}`} aria-pressed={on} title={f.label} onClick={() => setFlags((s) => toggled(s, f.key))}>
                        <Icon weight={on ? "fill" : "bold"} />
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {panel === "manage" && (
          <div className="desk-panel desk-manage">
            <ManageAction icon={DownloadSimpleIcon} title="Import default slugs" note="Adds any of the standard roster you are missing." onClick={bulk.importDefaults} disabled={bulk.busy} />
            <ManageAction
              icon={TrashIcon}
              danger
              title="Remove all templates"
              note="Also deletes every slug a player holds."
              onClick={bulk.removeAll}
              disabled={bulk.busy || templates.length === 0}
            />
            <span className="desk-panel-title desk-manage-sep">Testing</span>
            <ManageAction
              icon={ShuffleIcon}
              title="Give random to players"
              note="Fills every empty slot on equipped blasters."
              onClick={bulk.giveRandom}
              disabled={bulk.busy || !bulk.canGiveRandom}
            />
            <ManageAction
              icon={TrashIcon}
              danger
              title="Remove player slugs"
              note="Takes every slug from every player."
              onClick={bulk.removePlayerSlugs}
              disabled={bulk.busy || !bulk.canRemovePlayerSlugs}
            />
          </div>
        )}

        <div className="desk-count">
          <span>{visible.length === templates.length ? `${templates.length} slugs` : `${visible.length} of ${templates.length} slugs`}</span>
          {filtering && (
            <button type="button" className="desk-link" onClick={clear}>
              <XIcon weight="bold" />
              Clear
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="desk-empty">
            {templates.length === 0 ? (
              <>
                <p>No templates yet.</p>
                <p>Import the default roster from Manage, or make your own.</p>
              </>
            ) : (
              <p>No slugs match those filters.</p>
            )}
          </div>
        ) : (
          <ul className="desk-list">
            {visible.map((t) => (
              <SlugRow key={t.id} template={t} held={heldByTemplate.get(t.id) ?? 0} recipient={recipient} onGive={onGive} onCustomize={onCustomize} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>

      <p className={`desk-status ${status?.error ? "desk-status--error" : ""}`} role="status" aria-live="polite">
        {status?.text}
      </p>
    </section>
  );
}
