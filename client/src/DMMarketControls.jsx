import { useEffect, useState } from "react";
import { CheckIcon, CoinsIcon, LockKeyIcon, LockKeyOpenIcon, MinusIcon, PlusIcon, TagIcon } from "@phosphor-icons/react";
import { SUPPLIES } from "./careData.js";
import "./Panel.css";
import "./DMMarketControls.css";

// The DM's market tools: one slim toolbar (planet price stepper + two
// toggles) with the listing form and the purses table opening on demand,
// instead of permanently stacked blocks.
// The purses table edits credits plus one supply at a time (picked from the
// header), so it stays two columns wide however many consumables there are.
const PURSE_LABELS = { credits: "Credits", ...Object.fromEntries(SUPPLIES.map((s) => [s.field, s.name])) };

export default function DMMarketControls({ data, planetName, dmCall, token }) {
  const [open, setOpen] = useState(null); // null | "listing" | "purses"
  const [pct, setPct] = useState(data.pricePct);
  const [catalog, setCatalog] = useState(null);
  const [kind, setKind] = useState("mod");
  const [templateId, setTemplateId] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purses, setPurses] = useState({});
  const [supply, setSupply] = useState("pods");

  useEffect(() => {
    setPct(data.pricePct);
  }, [data.pricePct, data.planetIndex]);

  useEffect(() => {
    fetch("/api/market/catalog", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((b) => setCatalog(b.catalog || null))
      .catch(() => {});
  }, [token]);

  const templates = catalog?.[kind] ?? [];
  const chosen = templates.find((t) => String(t.id) === String(templateId));
  const dirty = Number(pct) !== data.pricePct;

  const savePct = () => dmCall(`/planets/${data.planetIndex}`, "PUT", { pricePct: Number(pct) });
  const step = (d) => setPct((v) => Math.max(10, Math.min(500, (Number(v) || 100) + d)));

  function changeKind(next) {
    setKind(next);
    setTemplateId("");
    setPrice("");
  }

  function pickTemplate(id) {
    setTemplateId(id);
    const t = templates.find((x) => String(x.id) === String(id));
    setPrice(t ? String(t.defaultPrice) : "");
  }

  async function post(e) {
    e.preventDefault();
    if (!chosen) return;
    const ok = await dmCall("/listings", "POST", {
      kind,
      templateId: chosen.id,
      basePrice: price === "" ? undefined : Number(price),
      quantity: quantity === "" ? null : Number(quantity),
    });
    if (ok) {
      setTemplateId("");
      setPrice("");
      setQuantity("");
    }
  }

  function setPurse(userId, field) {
    const key = `${userId}:${field}`;
    if (purses[key] === undefined || purses[key] === "") return;
    dmCall(`/purse/${userId}`, "PATCH", { [field]: Number(purses[key]) }).then((ok) => {
      if (ok) setPurses((p) => ({ ...p, [key]: "" }));
    });
  }

  const saveMood = (mood) => dmCall("/mood", "PUT", { mood });
  const toggleOpen = () => dmCall("/open", "PUT", { open: !data.open });

  return (
    <div className="dmm">
      <div className="dmm-bar">
        <div className="dmm-group">
          <span className="dmm-label">Prices on {planetName}</span>
          <div className="dmm-stepper">
            <button type="button" onClick={() => step(-5)} aria-label="Lower price modifier">
              <MinusIcon weight="bold" />
            </button>
            <input
              type="number"
              min={10}
              max={500}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && dirty && savePct()}
              aria-label="Price modifier percent"
            />
            <span className="dmm-unit">%</span>
            <button type="button" onClick={() => step(5)} aria-label="Raise price modifier">
              <PlusIcon weight="bold" />
            </button>
          </div>
          {dirty && (
            <button type="button" className="dmm-save" onClick={savePct}>
              Save
            </button>
          )}
          {data.barterPct > 0 && <span className="dmm-note">+{data.barterPct}% from a poor haggle</span>}
        </div>

        <label className="dmm-group">
          <span className="dmm-label">Mood</span>
          <select className="dmm-select" value={data.mood} onChange={(e) => saveMood(e.target.value)} aria-label="Merchants' mood">
            {(data.moods ?? []).map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({m.pct > 0 ? "+" : m.pct < 0 ? "−" : ""}
                {Math.abs(m.pct)}%)
              </option>
            ))}
          </select>
        </label>

        <div className="dmm-toggles">
          <button
            type="button"
            className={`dmm-toggle dmm-toggle--open${data.open ? " dmm-toggle--on" : ""}`}
            aria-pressed={data.open}
            onClick={toggleOpen}
          >
            {data.open ? <LockKeyOpenIcon weight="bold" /> : <LockKeyIcon weight="bold" />}
            {data.open ? "Market open" : "Market closed"}
          </button>
          <button
            type="button"
            className={`dmm-toggle${open === "listing" ? " dmm-toggle--on" : ""}`}
            aria-expanded={open === "listing"}
            onClick={() => setOpen(open === "listing" ? null : "listing")}
          >
            <TagIcon weight="bold" />
            Post listing
          </button>
          <button
            type="button"
            className={`dmm-toggle${open === "purses" ? " dmm-toggle--on" : ""}`}
            aria-expanded={open === "purses"}
            onClick={() => setOpen(open === "purses" ? null : "purses")}
          >
            <CoinsIcon weight="bold" />
            Purses
          </button>
        </div>
      </div>

      {open === "listing" && (
        <form className="dmm-panel dmm-form" onSubmit={post}>
          <label className="dmm-field">
            <span>Type</span>
            <select value={kind} onChange={(e) => changeKind(e.target.value)}>
              <option value="mod">Blaster Mod</option>
              <option value="mecha_mod">Mecha Mod</option>
              <option value="blaster">Blaster</option>
              <option value="equipment">Equipment</option>
              <option value="mecha">Mecha-Beast</option>
              <option value="slug">Slug</option>
            </select>
          </label>
          <label className="dmm-field dmm-field--grow">
            <span>Template</span>
            <select value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
              <option value="">Choose…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="dmm-field dmm-field--num">
            <span>Price</span>
            <input
              type="number"
              min={1}
              placeholder={chosen ? String(chosen.defaultPrice) : "—"}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="dmm-field dmm-field--num">
            <span>Stock</span>
            <input type="number" min={1} max={99} placeholder="∞" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <button type="submit" className="panel-btn dmm-submit" disabled={!chosen}>
            <PlusIcon weight="bold" />
            Post
          </button>
        </form>
      )}

      {open === "purses" && (
        <div className="dmm-panel dmm-purses">
          <div className="dmm-purses-head">
            <span>Character</span>
            <span>Credits</span>
            <select
              className="dmm-select dmm-purses-supply"
              value={supply}
              onChange={(e) => setSupply(e.target.value)}
              aria-label="Supply to edit"
            >
              {SUPPLIES.map((s) => (
                <option key={s.field} value={s.field}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {(data.purses ?? []).map((p) => (
            <div key={p.userId} className="dmm-purses-row">
              <span className="dmm-purses-name">{p.name}</span>
              {["credits", supply].map((field) => (
                <div key={field} className="dmm-purses-cell">
                  <span className="dmm-purses-field">{PURSE_LABELS[field]}</span>
                  <span className="dmm-purses-value num-tabular">{p[field]}</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="set"
                    aria-label={`Set ${field} for ${p.name}`}
                    value={purses[`${p.userId}:${field}`] ?? ""}
                    onChange={(e) => setPurses((st) => ({ ...st, [`${p.userId}:${field}`]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && setPurse(p.userId, field)}
                  />
                  <button
                    type="button"
                    className="dmm-purses-set"
                    disabled={!purses[`${p.userId}:${field}`]}
                    onClick={() => setPurse(p.userId, field)}
                    aria-label={`Apply ${field} for ${p.name}`}
                  >
                    <CheckIcon weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          ))}
          {(data.purses ?? []).length === 0 && <p className="dmm-empty">No characters yet.</p>}
        </div>
      )}
    </div>
  );
}
