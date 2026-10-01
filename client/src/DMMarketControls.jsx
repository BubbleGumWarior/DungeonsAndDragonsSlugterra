import { useEffect, useState } from "react";
import { CheckIcon, CoinsIcon, MinusIcon, PlusIcon, TagIcon } from "@phosphor-icons/react";
import "./Panel.css";
import "./DMMarketControls.css";

// The DM's market tools: one slim toolbar (planet price stepper + two
// toggles) with the listing form and the purses table opening on demand,
// instead of permanently stacked blocks.
export default function DMMarketControls({ data, planetName, dmCall, token }) {
  const [open, setOpen] = useState(null); // null | "listing" | "purses"
  const [pct, setPct] = useState(data.pricePct);
  const [catalog, setCatalog] = useState(null);
  const [kind, setKind] = useState("mod");
  const [templateId, setTemplateId] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purses, setPurses] = useState({});

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

        <div className="dmm-toggles">
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
            <span>Pods</span>
          </div>
          {(data.purses ?? []).map((p) => (
            <div key={p.userId} className="dmm-purses-row">
              <span className="dmm-purses-name">{p.name}</span>
              {["credits", "pods"].map((field) => (
                <div key={field} className="dmm-purses-cell">
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
