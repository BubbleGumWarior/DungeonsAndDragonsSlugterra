import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BatteryChargingIcon,
  BowlFoodIcon,
  CoinsIcon,
  CubeIcon,
  EyeIcon,
  EyeSlashIcon,
  FirstAidKitIcon,
  FlaskIcon,
  HandshakeIcon,
  PawPrintIcon,
  PlusIcon,
  SwordIcon,
  TargetIcon,
  TrashIcon,
  WrenchIcon,
  PackageIcon,
  ToolboxIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { useToast } from "./Toast.jsx";
import { PLANETS } from "./planetData.js";
import { SUPPLIES } from "./careData.js";
import BarterModal from "./BarterModal.jsx";
import DMMarketControls from "./DMMarketControls.jsx";
import SlugIcon from "./SlugIcon.jsx";
import { EQUIPMENT_ICONS } from "./EquipmentCard.jsx";
import "./Panel.css";
import "./MarketShop.css";

const CATEGORIES = [
  { key: "supply", label: "Supplies", icon: <PackageIcon weight="bold" /> },
  { key: "mod", label: "Blaster Mods", icon: <WrenchIcon weight="bold" /> },
  { key: "mecha_mod", label: "Mecha Mods", icon: <CubeIcon weight="bold" /> },
  { key: "blaster", label: "Blasters", icon: <TargetIcon weight="bold" /> },
  { key: "equipment", label: "Equipment", icon: <SwordIcon weight="bold" /> },
  { key: "mecha", label: "Mecha-Beasts", icon: <PawPrintIcon weight="bold" /> },
  { key: "slug", label: "Slugs", icon: <SlugIcon size={19} /> },
];

// Supplies are bought by the handful and each has its own picture.
const SUPPLY_ICONS = {
  pods: <PackageIcon weight="duotone" />,
  kibble: <BowlFoodIcon weight="duotone" />,
  "repair-kit": <ToolboxIcon weight="duotone" />,
  "energy-cell": <BatteryChargingIcon weight="duotone" />,
  medpack: <FirstAidKitIcon weight="duotone" />,
  "revival-tonic": <FlaskIcon weight="duotone" />,
};

// Supply key -> the field on the player's `me` counts.
const SUPPLY_FIELD = Object.fromEntries(SUPPLIES.map((s) => [s.key, s.field]));

const KIND_LABELS = {
  supply: "Supply",
  mod: "Blaster Mod",
  mecha_mod: "Mecha Mod",
  blaster: "Blaster",
  equipment: "Equipment",
  mecha: "Mecha-Beast",
  slug: "Slug",
};

// Equipment shows its own kind's icon (shield, armor, belt, sword) -- no pictures.
function equipmentIcon(item) {
  const Icon = item.kind === "equipment" ? EQUIPMENT_ICONS[item.equipKind] : null;
  return Icon ? <Icon weight="bold" /> : null;
}

function kindIcon(kind) {
  return CATEGORIES.find((c) => c.key === kind)?.icon ?? <CubeIcon weight="bold" />;
}

function authJson(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function MarketShop() {
  const { token, user } = useAuth();
  const { slugHuntArea, marketChanged, tradeCompleted, partyHealed } = useLiveState();
  const { push } = useToast();
  const isDM = user?.role === "Dungeon Master";
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState("supply");
  const [barterOpen, setBarterOpen] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [qtyByKey, setQtyByKey] = useState({});

  const load = useCallback(() => {
    fetch("/api/market", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load the market.");
        setData(body);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load, slugHuntArea, marketChanged, tradeCompleted, partyHealed]);

  const planetName = data ? PLANETS[data.planetIndex]?.name ?? `Planet ${data.planetIndex + 1}` : "";

  const grouped = useMemo(() => {
    const out = {};
    for (const c of CATEGORIES) out[c.key] = [];
    for (const it of data?.items ?? []) (out[it.kind] ??= []).push(it);
    return out;
  }, [data]);

  // Land on the first category that actually has stock.
  useEffect(() => {
    if (!data) return;
    if ((grouped[category]?.length ?? 0) === 0) {
      const first = CATEGORIES.find((c) => grouped[c.key]?.length > 0);
      if (first) setCategory(first.key);
    }
  }, [data, grouped, category]);

  const qtyOf = (item) => qtyByKey[item.key] ?? 1;

  async function buy(item, quantity = 1) {
    setBusyKey(item.key);
    try {
      const res = await fetch("/api/market/buy", {
        method: "POST",
        headers: authJson(token),
        body: JSON.stringify({ key: item.key, quantity }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not buy that.");
      push({
        tone: "success",
        title: "Purchased",
        body: `${quantity > 1 ? `${quantity} × ` : ""}${body.label} for ${body.total} credits.`,
        icon: <CoinsIcon weight="bold" />,
      });
      load();
    } catch (err) {
      push({ tone: "warn", title: "Couldn't buy that", body: err.message });
    } finally {
      setBusyKey(null);
    }
  }

  async function dmCall(path, method, body) {
    const res = await fetch(`/api/market${path}`, {
      method,
      headers: authJson(token),
      body: body ? JSON.stringify(body) : undefined,
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      push({ tone: "warn", title: "Market", body: out.error || "That didn't work." });
      return false;
    }
    load();
    return true;
  }

  if (error && !data) return <p className="panel-error">{error}</p>;
  if (!data) return null;

  const items = grouped[category] ?? [];
  const planetPct = data.pricePct;
  const markup = data.barterPct;
  const discount = data.barter?.discountPct ?? 0;
  const barterRoll = data.barter?.roll;
  const moodPct = data.moodPct ?? 0;
  const closed = !data.open;
  const moodLabel = data.mood ? data.mood[0].toUpperCase() + data.mood.slice(1) : "";

  return (
    <div className="market-shop">
      <div className="market-banner">
        <div className="market-banner-main">
          <p className="market-kicker">Docked at</p>
          <h2 className="market-planet">{planetName}</h2>
          <div className="market-chips">
            <span className={`market-chip ${planetPct < 100 ? "market-chip--good" : planetPct > 100 ? "market-chip--bad" : ""}`}>
              Local prices {planetPct}%
            </span>
            {closed ? (
              <span className="market-chip market-chip--bad">Closed</span>
            ) : (
              <span className="market-chip market-chip--good">Open</span>
            )}
            {moodPct !== 0 && (
              <span className={`market-chip ${moodPct < 0 ? "market-chip--good" : "market-chip--bad"}`}>
                {moodLabel} mood {moodPct > 0 ? "+" : "−"}
                {Math.abs(moodPct)}%
              </span>
            )}
            {markup > 0 && <span className="market-chip market-chip--bad">Poor haggle +{markup}%</span>}
            {discount > 0 && <span className="market-chip market-chip--good">Your haggle −{discount}%</span>}
          </div>
        </div>

        {!isDM && !closed && (
          <div className="market-banner-side">
            <div className="market-purse">
              <span className="market-purse-row">
                <CoinsIcon weight="fill" />
                <strong className="num-tabular">{data.me?.credits ?? 0}</strong> credits
              </span>

            </div>
            {data.barter ? (
              <p className="market-barter-done">
                {barterRoll
                  ? `You rolled ${barterRoll.die}${barterRoll.modifier >= 0 ? "+" : ""}${barterRoll.modifier} = ${barterRoll.total} here`
                  : "You've haggled here"}
              </p>
            ) : (
              <button type="button" className="panel-btn market-barter-btn" onClick={() => setBarterOpen(true)}>
                <HandshakeIcon weight="bold" />
                Barter
              </button>
            )}
          </div>
        )}
      </div>

      {isDM && <DMMarketControls data={data} planetName={planetName} dmCall={dmCall} token={token} />}

      {closed && !isDM ? (
        <p className="market-empty market-closed">The market on {planetName} is closed. Wait for the shopkeepers to open up.</p>
      ) : (
        <>
      {closed && <p className="market-empty market-closed">Closed to players — open the market above when you're ready.</p>}
      <div className="market-tabs" role="tablist">
        {CATEGORIES.map((c) => {
          const count = grouped[c.key]?.length ?? 0;
          if (count === 0 && !isDM) return null;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              className={`market-tab${category === c.key ? " market-tab--active" : ""}`}
              onClick={() => setCategory(c.key)}
            >
              {c.icon}
              {c.label}
              <span className="market-tab-count num-tabular">{count}</span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="market-empty">Nothing for sale in this section on {planetName}.</p>
      ) : (
        <div className="market-grid">
          {items.map((item) => {
            const reduced = item.price < item.basePrice;
            const dearer = item.price > item.basePrice;
            return (
              <article key={item.key} className={`market-item${item.hidden ? " market-item--hidden" : ""}`}>
                <div className="market-item-art">
                  {item.image ? <img src={item.image} alt="" loading="lazy" /> : SUPPLY_ICONS[item.key] ?? equipmentIcon(item) ?? kindIcon(item.kind)}
                </div>
                <div className="market-item-body">
                  <div className="market-item-top">
                    <h3 className="market-item-name">{item.name}</h3>
                    <span className="market-item-kind">{KIND_LABELS[item.kind]}</span>
                  </div>
                  {item.description && <p className="market-item-desc">{item.description}</p>}
                  {item.kind === "supply" && !isDM && (
                    <p className="market-owned">
                      In your pack <strong className="num-tabular">×{data.me?.[SUPPLY_FIELD[item.key]] ?? 0}</strong>
                    </p>
                  )}
                  {item.tags?.length > 0 && (
                    <div className="market-item-tags">
                      {item.tags.map((t) => (
                        <span key={t} className="market-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="market-item-foot">
                  <div className="market-price">
                    <CoinsIcon weight="fill" />
                    <span className={`market-price-now num-tabular${reduced ? " market-price-now--good" : dearer ? " market-price-now--bad" : ""}`}>
                      {item.kind === "supply" && !isDM ? item.price * qtyOf(item) : item.price}
                    </span>
                    {(reduced || dearer) && <s className="market-price-was num-tabular">{item.basePrice}</s>}
                    {item.quantity != null && <span className="market-stock">{item.quantity} left</span>}
                  </div>

                  {!isDM && (
                    <div className="market-buy">
                      {item.kind === "supply" && (
                        <input
                          type="number"
                          className="market-qty"
                          min={1}
                          max={20}
                          value={qtyOf(item)}
                          onChange={(e) =>
                            setQtyByKey((prev) => ({ ...prev, [item.key]: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }))
                          }
                          aria-label={`Quantity of ${item.name}`}
                        />
                      )}
                      <button
                        type="button"
                        className="panel-btn"
                        disabled={busyKey === item.key}
                        onClick={() => buy(item, item.kind === "supply" ? qtyOf(item) : 1)}
                      >
                        Buy
                      </button>
                    </div>
                  )}
                </div>
                {isDM && (
                  <button
                    type="button"
                    className="market-item-dm"
                    title={item.standing ? (item.hidden ? "Restock on this planet" : "Pull from this planet's shelves") : "Remove this listing"}
                    aria-label={item.standing ? (item.hidden ? "Restock" : "Pull from sale") : "Remove listing"}
                    onClick={() =>
                      item.standing
                        ? dmCall("/hidden", "POST", { key: item.key, hidden: !item.hidden })
                        : dmCall(`/listings/${item.listingId}`, "DELETE")
                    }
                  >
                    {item.standing ? item.hidden ? <EyeIcon weight="bold" /> : <EyeSlashIcon weight="bold" /> : <TrashIcon weight="bold" />}
                  </button>
                )}
                {item.hidden && <span className="market-item-flag">Pulled from sale</span>}
              </article>
            );
          })}
        </div>
      )}

        </>
      )}

      {barterOpen && <BarterModal planetName={planetName} onClose={() => setBarterOpen(false)} onResolved={() => load()} />}
    </div>
  );
}
