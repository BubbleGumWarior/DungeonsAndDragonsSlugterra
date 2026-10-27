import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BatteryChargingIcon,
  BowlFoodIcon,
  FirstAidKitIcon,
  FlaskIcon,
  HeartbeatIcon,
  PackageIcon,
  PillIcon,
  ThermometerIcon,
  ToolboxIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { maxGrit } from "./characterData.js";
import { MEDPACK_HEAL_FRACTION, MEDS_DOSES_NEEDED, SUPPLIES } from "./careData.js";
import { magazineCapacity } from "./itemData.js";
import NavBar from "./NavBar.jsx";
import SlugCare from "./SlugCare.jsx";
import KnockoutPips from "./KnockoutPips.jsx";
import Hint from "./Hint.jsx";
import "./PlaceholderPage.css";
import "./Panel.css";
import "./SlugCare.css";
import "./Consumables.css";

const SUPPLY_ICONS = {
  pods: PackageIcon,
  kibble: BowlFoodIcon,
  "repair-kit": ToolboxIcon,
  "energy-cell": BatteryChargingIcon,
  medpack: FirstAidKitIcon,
  "revival-tonic": FlaskIcon,
  meds: PillIcon,
};

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

// What you carry that gets used up, one line each. Hover (or focus, or tap) a
// row for the full rules -- the same text the Market shows before you buy.
function PackLedger({ counts, neededPods }) {
  return (
    <section className="pack" aria-labelledby="pack-title">
      <div className="pack-head">
        <h2 id="pack-title">Your Pack</h2>
        <Link to="/market" className="slug-care-buy">
          Restock at the Market
        </Link>
      </div>
      <ul className="pack-list">
        {SUPPLIES.map((s) => {
          const Icon = SUPPLY_ICONS[s.key];
          const count = counts[s.field] ?? 0;
          const lowPods = s.key === "pods" && neededPods > count;
          return (
            <li key={s.key} className={`pack-row${count === 0 ? " pack-row--empty" : ""}`}>
              <Hint
                align="start"
                title={s.name}
                tip={s.rules.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                className="pack-hint"
              >
                <span className="pack-icon">
                  <Icon weight="duotone" />
                </span>
                <span className="pack-text">
                  <span className="pack-name">{s.name}</span>
                  <span className="pack-effect">
                    {lowPods ? (
                      <span className="pack-low">
                        <WarningIcon weight="fill" /> Below your magazine size ({neededPods})
                      </span>
                    ) : (
                      s.effect
                    )}
                  </span>
                </span>
                <strong className="pack-count num-tabular" aria-label={`${count} ${s.name}`}>
                  ×{count}
                </strong>
              </Hint>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Heal yourself between fights: Medpacks restore Grit, Revival Tonics clear
// knockout pips. Same lane layout as Slug Care.
function FieldMedicine({ character, onCharacter }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);

  const max = maxGrit(character.stats, character.gritBonus);
  const grit = character.currentGrit ?? max;
  const pips = character.knockoutPips ?? [false, false, false];
  const knocked = pips.filter(Boolean).length;
  const healAmount = Math.ceil(max * MEDPACK_HEAL_FRACTION);
  const medpacks = character.medpacks ?? 0;
  const tonics = character.revivalTonics ?? 0;
  const meds = character.meds ?? 0;
  const ill = Boolean(character.ill);
  const medsStreak = character.medsStreak ?? 0;
  const pct = Math.max(0, Math.min(100, (grit / max) * 100));

  async function use(kind) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/consumables/${kind}`, { method: "POST", headers: authHeaders(token) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work.");
      onCharacter(data.character);
      setNote(
        kind === "medpack"
          ? `Healed ${data.healed} Grit.`
          : kind === "meds"
          ? data.cured
            ? "You feel well again."
            : `Dose ${data.streak} of ${data.needed} taken. Take the next one after your next long rest.`
          : `Cleared ${data.cleared} knockout pip.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="slug-care medicine" aria-labelledby="medicine-title">
      <div className="slug-care-head">
        <div className="slug-care-heading">
          <h2 id="medicine-title">Field Medicine</h2>
          <p>Patch yourself up between fights.</p>
        </div>
      </div>

      {error && <p className="panel-error">{error}</p>}
      {note && (
        <p className="medicine-note" role="status">
          {note}
        </p>
      )}

      <div className="slug-care-lanes">
        <div className="slug-care-lane">
          <span className="slug-care-lane-label">
            <HeartbeatIcon weight="bold" />
            Grit
          </span>
          <Hint
            align="start"
            title="Medpack"
            tip={
              <>
                <p>
                  A Medpack heals <b>{Math.round(MEDPACK_HEAL_FRACTION * 100)}%</b> of your maximum Grit (up to{" "}
                  <b>{healAmount}</b> for you), never past full.
                </p>
                <p>Supplies can't be used while you are in a fight.</p>
              </>
            }
            className="slug-care-lane-hint"
          >
            <div className="slug-care-food">
              <div
                className="slug-care-meter slug-care-meter--plain"
                role="meter"
                aria-label="Grit"
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={grit}
              >
                <span className="slug-care-meter-fill medicine-grit-fill" style={{ transform: `scaleX(${pct / 100})` }} />
              </div>
              <span className="slug-care-state">
                <strong className="num-tabular">
                  {grit}/{max}
                </strong>{" "}
                Grit
              </span>
            </div>
          </Hint>
          <div className="slug-care-actions">
            <button
              type="button"
              className="panel-btn slug-care-btn"
              disabled={grit >= max || medpacks < 1 || busy === "medpack"}
              title={medpacks < 1 && grit < max ? "You're out of Medpacks" : undefined}
              onClick={() => use("medpack")}
            >
              Use Medpack
            </button>
          </div>
        </div>

        <div className="slug-care-lane">
          <span className="slug-care-lane-label">
            <WarningIcon weight="bold" />
            Knockouts
          </span>
          <Hint
            align="start"
            title="Revival Tonic"
            tip={
              <>
                <p>A Revival Tonic clears one of your knockout pips.</p>
                <p>Supplies can't be used while you are in a fight.</p>
              </>
            }
            className="slug-care-lane-hint"
          >
            <div className="slug-care-food">
              <KnockoutPips pips={pips} size="lg" inline />
              <span className="slug-care-state">
                <strong className="num-tabular">{knocked}/3</strong> knocked out
              </span>
            </div>
          </Hint>
          <div className="slug-care-actions">
            <button
              type="button"
              className="panel-btn slug-care-btn"
              disabled={knocked === 0 || tonics < 1 || busy === "tonic"}
              title={tonics < 1 && knocked > 0 ? "You're out of Revival Tonics" : undefined}
              onClick={() => use("tonic")}
            >
              Use Tonic
            </button>
          </div>
        </div>

        <div className="slug-care-lane">
          <span className="slug-care-lane-label">
            <ThermometerIcon weight="bold" />
            Illness
          </span>
          <Hint
            align="start"
            title="Meds"
            tip={
              <>
                <p>
                  Sleeping in clothes that don't suit the climate can make you ill. While ill, your max Grit, AP and accuracy are all halved
                  when a fight begins.
                </p>
                <p>
                  Take one dose of Meds per long rest, <b>{MEDS_DOSES_NEEDED}</b> rests in a row, to recover. Miss a rest and the count starts over.
                </p>
              </>
            }
            className="slug-care-lane-hint"
          >
            <div className="slug-care-food">
              <span className="slug-care-state">
                <strong>{ill ? "Ill" : "Healthy"}</strong>
                {ill && (
                  <>
                    {" "}
                    · <strong className="num-tabular">{medsStreak}/{MEDS_DOSES_NEEDED}</strong> doses
                    {character.medsTaken ? " (taken for today)" : ""}
                  </>
                )}
              </span>
            </div>
          </Hint>
          <div className="slug-care-actions">
            <button
              type="button"
              className="panel-btn slug-care-btn"
              disabled={!ill || character.medsTaken || meds < 1 || busy === "meds"}
              title={!ill ? "You're not ill" : character.medsTaken ? "Already taken today" : meds < 1 ? "You're out of Meds" : undefined}
              onClick={() => use("meds")}
            >
              Take Meds
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayerConsumables() {
  const { token, user } = useAuth();
  const { characterUpdate, slugUpdate, blasterUpdate, partyHealed, marketChanged, tradeCompleted, equipmentChanged } = useLiveState();
  const [character, setCharacter] = useState(null);
  const [slugs, setSlugs] = useState([]);
  const [blasters, setBlasters] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/characters/me", { headers: authHeaders(token) }).then((r) => r.json()),
      fetch("/api/slugs/me", { headers: authHeaders(token) }).then((r) => r.json()),
      fetch("/api/blasters/me", { headers: authHeaders(token) }).then((r) => r.json()),
    ])
      .then(([c, s, b]) => {
        setCharacter(c.character || null);
        setSlugs(s.slugs || []);
        setBlasters(b.blasters || []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [token]);

  // Purchases, trades and rests change stock in bulk -- refetch rather than
  // trusting a burst of socket payloads.
  useEffect(() => {
    load();
  }, [load, marketChanged, tradeCompleted, partyHealed, equipmentChanged]);

  useEffect(() => {
    if (!slugUpdate || slugUpdate.userId !== user?.id) return;
    setSlugs((prev) => {
      if (!slugUpdate.slug) return prev.filter((s) => s.id !== slugUpdate.slugId);
      return prev.some((s) => s.id === slugUpdate.slug.id)
        ? prev.map((s) => (s.id === slugUpdate.slug.id ? slugUpdate.slug : s))
        : [...prev, slugUpdate.slug];
    });
  }, [slugUpdate, user]);

  useEffect(() => {
    if (!blasterUpdate || blasterUpdate.userId !== user?.id) return;
    setBlasters((prev) => {
      if (!blasterUpdate.blaster) return prev.filter((b) => b.id !== blasterUpdate.blasterId);
      return prev.some((b) => b.id === blasterUpdate.blaster.id)
        ? prev.map((b) => (b.id === blasterUpdate.blaster.id ? blasterUpdate.blaster : b))
        : [...prev, blasterUpdate.blaster];
    });
  }, [blasterUpdate, user]);

  useEffect(() => {
    if (!characterUpdate || characterUpdate.userId !== user?.id) return;
    setCharacter((prev) => (prev ? { ...prev, ...characterUpdate.character } : prev));
  }, [characterUpdate, user]);

  const neededPods = useMemo(
    () => blasters.filter((b) => b.equipped).reduce((max, b) => Math.max(max, magazineCapacity(b)), 0),
    [blasters]
  );

  if (!loaded) return null;
  if (!character) {
    return <p className="consumables-empty">Create your character first -- consumables belong to a character.</p>;
  }

  const patchCounts = (patch) => setCharacter((prev) => ({ ...prev, ...patch }));

  return (
    <div className="consumables">
      <PackLedger counts={character} neededPods={neededPods} />
      <SlugCare
        slugs={slugs}
        character={character}
        kibble={character.kibble ?? 0}
        energyCells={character.energyCells ?? 0}
        onSlugChange={(updated) => setSlugs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
        onSupplies={patchCounts}
      />
      <FieldMedicine character={character} onCharacter={(c) => setCharacter((prev) => ({ ...prev, ...c }))} />
    </div>
  );
}

// The DM doesn't carry a pack; this is a read-only view of what each player
// is holding (stock is set from the Market's Purses tool).
function DMConsumables() {
  const { token } = useAuth();
  const { marketChanged, partyHealed } = useLiveState();
  const [purses, setPurses] = useState([]);

  useEffect(() => {
    fetch("/api/market", { headers: authHeaders(token) })
      .then((r) => r.json())
      .then((d) => setPurses(d.purses || []))
      .catch(() => {});
  }, [token, marketChanged, partyHealed]);

  return (
    <div className="consumables">
      <section className="pack">
        <div className="pack-head">
          <h2>What the party is carrying</h2>
          <Link to="/market" className="slug-care-buy">
            Set stock in Market › Purses
          </Link>
        </div>
        {purses.length === 0 ? (
          <p className="consumables-empty">No characters yet.</p>
        ) : (
          <div className="dm-pack-scroll">
            <table className="dm-pack">
              <thead>
                <tr>
                  <th scope="col">Character</th>
                  {SUPPLIES.map((s) => (
                    <th scope="col" key={s.key}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purses.map((p) => (
                  <tr key={p.userId}>
                    <th scope="row">{p.name}</th>
                    {SUPPLIES.map((s) => (
                      <td key={s.key} className="num-tabular">
                        {p[s.field] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Consumables() {
  const { user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">Consumables</h1>
        {isDungeonMaster ? <DMConsumables /> : <PlayerConsumables />}
      </div>
    </div>
  );
}
