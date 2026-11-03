import { useMemo, useState } from "react";
import { MagnifyingGlassIcon, PlusIcon, TargetIcon, TShirtIcon, WrenchIcon } from "@phosphor-icons/react";
import {
  BASE_TYPE_KEYS,
  EQUIPMENT_KINDS,
  EQUIPMENT_KIND_KEYS,
  QUALITY_TIERS,
  effectiveAccuracy,
  equipmentSummary,
  formatSigned,
  qualityInfo,
} from "./itemData.js";
import { EQUIPMENT_ICONS } from "./EquipmentCard.jsx";
import { formatRange, outfitChips } from "./outfitData.js";
import { CLIMATE_GROUPS, climateOf } from "./useDmOutfits.js";
import { Bits, DeskRow } from "./DeskParts.jsx";
import "./InventoryDesk.css";

// Each catalog tab: how its rows read, what the filter chips split on, and
// whether the DM owns the templates (outfits are a fixed catalog).
const TABS = [
  {
    key: "blaster",
    label: "Blasters",
    noun: "blaster",
    icon: () => TargetIcon,
    editable: true,
    filters: BASE_TYPE_KEYS.map((k) => ({ key: k, label: k })),
    filterOf: (t) => t.baseType,
  },
  {
    key: "mod",
    label: "Mods",
    noun: "mod",
    icon: () => WrenchIcon,
    editable: true,
    filters: QUALITY_TIERS.map((q) => ({ key: String(q.tier), label: q.label })),
    filterOf: (t) => String(t.quality ?? 0),
  },
  {
    key: "equipment",
    label: "Equipment",
    noun: "equipment",
    icon: (t) => EQUIPMENT_ICONS[t.kind] || EQUIPMENT_ICONS.melee,
    editable: true,
    filters: EQUIPMENT_KIND_KEYS.map((k) => ({ key: k, label: EQUIPMENT_KINDS[k].label })),
    filterOf: (t) => t.kind,
  },
  {
    key: "outfit",
    label: "Outfits",
    noun: "outfit",
    icon: () => TShirtIcon,
    editable: false,
    filters: CLIMATE_GROUPS.map((g) => ({ key: g.key, label: g.label })),
    filterOf: climateOf,
  },
];

// The one-line stat read-out under each name, so the DM can pick without
// opening anything.
function summarize(type, t) {
  if (type === "blaster") {
    const q = qualityInfo(t.quality);
    return [t.baseType, { text: q.label, color: q.color }, `Acc ${formatSigned(effectiveAccuracy(t, []))}`, `Range ${t.range}`, `Mag ${t.magazineSize}`];
  }
  if (type === "mod") {
    const q = qualityInfo(t.quality);
    return [
      { text: q.label, color: q.color },
      t.accuracyBonus ? `Accuracy ${formatSigned(t.accuracyBonus)}` : null,
      t.reloadApBonus ? `Reload AP ${formatSigned(t.reloadApBonus)}` : null,
      t.speedBonus ? `Speed ${formatSigned(t.speedBonus)}` : null,
      t.grantsDualShot ? "Dual Shot" : null,
      t.grantsRangeFinder ? "Range Finder" : null,
    ];
  }
  if (type === "equipment") return [equipmentSummary(t)];
  return [formatRange({ min: t.comfortMin, max: t.comfortMax }), ...outfitChips(t).map((c) => c.label)];
}

function CatalogRow({ type, tab, item, recipient, owned, onGive, onCustomize, onEdit, onDelete }) {
  const Icon = tab.icon(item);
  return (
    <DeskRow
      lead={
        <span className="desk-row-icon" aria-hidden="true">
          <Icon weight="duotone" />
        </span>
      }
      name={item.name}
      sub={<Bits items={summarize(type, item)} />}
      recipient={recipient}
      blockedLabel={owned ? "Owned" : undefined}
      onGive={() => onGive(type, item)}
      onCustomize={tab.editable ? () => onCustomize(type, item) : undefined}
      onEdit={tab.editable ? () => onEdit(type, item) : undefined}
      onDelete={tab.editable ? () => onDelete(type, item) : undefined}
      kind="template"
    />
  );
}

export default function GiftCatalog({
  catalog, // { blaster: [], mod: [], equipment: [], outfit: [] }
  recipient,
  ownedOutfitIds,
  status,
  onGive,
  onCustomize,
  onEdit,
  onDelete,
  onNew,
}) {
  const [tabKey, setTabKey] = useState("blaster");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState({});
  const tab = TABS.find((t) => t.key === tabKey);
  const items = catalog[tabKey];
  const activeFilter = filter[tabKey] ?? "all";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((it) => (!q || it.name.toLowerCase().includes(q)) && (activeFilter === "all" || tab.filterOf(it) === activeFilter));
    if (tabKey !== "outfit") return list;
    return [...list].sort((a, b) => a.comfortMin + a.comfortMax - (b.comfortMin + b.comfortMax));
  }, [items, query, activeFilter, tab, tabKey]);

  // Only offer chips that would show something.
  const chips = tab.filters.filter((f) => items.some((it) => tab.filterOf(it) === f.key));

  return (
    <section className="desk-catalog" aria-label="Catalog">
      <div className="desk-tabs" role="tablist" aria-label="Catalog">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`desk-tab-${t.key}`}
            aria-selected={t.key === tabKey}
            aria-controls="desk-catalog-panel"
            tabIndex={t.key === tabKey ? 0 : -1}
            className={`desk-tab ${t.key === tabKey ? "desk-tab--on" : ""}`}
            onClick={() => setTabKey(t.key)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const next = TABS[(TABS.indexOf(t) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
              setTabKey(next.key);
              document.getElementById(`desk-tab-${next.key}`)?.focus();
            }}
          >
            {t.label}
            <span className="desk-tab-count">{catalog[t.key].length}</span>
          </button>
        ))}
      </div>

      <div className="desk-catalog-body" role="tabpanel" id="desk-catalog-panel" aria-labelledby={`desk-tab-${tabKey}`}>
        <div className="desk-toolbar">
          <label className="desk-search">
            <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${tab.label.toLowerCase()}`} aria-label={`Search ${tab.label.toLowerCase()}`} />
          </label>
          {tab.editable && (
            <button type="button" className="desk-new" onClick={() => onNew(tabKey)}>
              <PlusIcon weight="bold" />
              New
            </button>
          )}
        </div>

        {chips.length > 1 && (
          <div className="desk-chips" role="group" aria-label="Filter">
            <button type="button" className={`desk-chip ${activeFilter === "all" ? "desk-chip--on" : ""}`} aria-pressed={activeFilter === "all"} onClick={() => setFilter((f) => ({ ...f, [tabKey]: "all" }))}>
              All
            </button>
            {chips.map((c) => (
              <button key={c.key} type="button" className={`desk-chip ${activeFilter === c.key ? "desk-chip--on" : ""}`} aria-pressed={activeFilter === c.key} onClick={() => setFilter((f) => ({ ...f, [tabKey]: c.key }))}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="desk-empty">
            {items.length === 0 ? (
              <>
                <p>{tab.editable ? `No ${tab.noun} templates yet.` : "No outfits in the catalog."}</p>
                {tab.editable && <p>{tabKey === "equipment" ? "Templates are also what the Market sells." : "Make one, then hand it out from here."}</p>}
              </>
            ) : (
              <p>Nothing matches{query ? ` "${query.trim()}"` : " that filter"}.</p>
            )}
          </div>
        ) : (
          <ul className="desk-list">
            {visible.map((item) => (
              <CatalogRow
                key={item.id}
                type={tabKey}
                tab={tab}
                item={item}
                recipient={recipient}
                owned={tabKey === "outfit" && ownedOutfitIds.has(item.id)}
                onGive={onGive}
                onCustomize={onCustomize}
                onEdit={onEdit}
                onDelete={onDelete}
              />
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
