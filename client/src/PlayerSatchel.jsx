import { ThermometerHotIcon, TrashIcon, WrenchIcon } from "@phosphor-icons/react";
import BlasterCard from "./BlasterCard.jsx";
import ModCard from "./ModCard.jsx";
import EquipmentCard from "./EquipmentCard.jsx";
import { formatRange, outfitChips } from "./outfitData.js";
import "./InventoryDesk.css";

function Section({ title, count, children }) {
  if (count === 0) return null;
  return (
    <section className="desk-section">
      <h3 className="desk-section-title">
        {title}
        <span className="desk-section-count">{count}</span>
      </h3>
      {children}
    </section>
  );
}

// Everything one character carries, laid out so the DM sees the result of a
// Give right away.
export default function PlayerSatchel({
  recipient,
  blasters,
  mods,
  equipment,
  outfits,
  allMods,
  onEditBlaster,
  onEditMod,
  onEditEquipment,
  onRestoreBlaster,
  onRemoveOutfit,
}) {
  if (!recipient) {
    return (
      <section className="desk-satchel desk-satchel--empty" aria-label="Inventory">
        <p className="desk-satchel-hint">No players yet. Once someone joins, you can hand them gear from the catalog.</p>
      </section>
    );
  }

  const worn = outfits.find((o) => o.equipped);
  const total = blasters.length + mods.length + equipment.length + outfits.length;
  const summary = [
    blasters.length && `${blasters.length} ${blasters.length === 1 ? "blaster" : "blasters"}`,
    mods.length && `${mods.length} ${mods.length === 1 ? "mod" : "mods"}`,
    equipment.length && `${equipment.length} equipment`,
    outfits.length && `${outfits.length} ${outfits.length === 1 ? "outfit" : "outfits"}`,
  ].filter(Boolean);

  return (
    <section className="desk-satchel" aria-label={`${recipient.name}'s inventory`}>
      <header className="desk-satchel-head">
        <div className="desk-satchel-who">
          <h2>{recipient.name}</h2>
          {recipient.ill && (
            <span className="desk-ill">
              <ThermometerHotIcon weight="fill" aria-hidden="true" /> Ill
            </span>
          )}
        </div>
        <p className="desk-satchel-meta">
          {total === 0 ? "Carrying nothing yet" : summary.join(" · ")}
          {worn && (
            <>
              <span aria-hidden="true"> · </span>
              wearing <b>{worn.name}</b>
            </>
          )}
        </p>
      </header>

      {total === 0 && (
        <div className="desk-empty desk-empty--big">
          <p>{recipient.name} has nothing assigned.</p>
          <p>Pick something from the catalog and press Give.</p>
        </div>
      )}

      <Section title="Blasters" count={blasters.length}>
        <div className="desk-cards">
          {blasters.map((blaster) => (
            <BlasterCard
              key={blaster.id}
              blaster={blaster}
              equippedMods={allMods.filter((m) => m.equippedBlasterId === blaster.id)}
              onClick={() => onEditBlaster(blaster)}
              actions={
                (blaster.durability ?? 100) < 100 ? (
                  <button
                    type="button"
                    className="slug-management-icon-btn"
                    onClick={() => onRestoreBlaster(blaster.id)}
                    title="Expert repair: restore to 100%"
                    aria-label={`Restore ${blaster.name} to 100%`}
                  >
                    <WrenchIcon weight="bold" />
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Mods" count={mods.length}>
        <div className="desk-cards">
          {mods.map((mod) => (
            <ModCard key={mod.id} mod={mod} blasters={blasters} onClick={() => onEditMod(mod)} />
          ))}
        </div>
      </Section>

      <Section title="Equipment" count={equipment.length}>
        <div className="desk-cards">
          {equipment.map((item) => (
            <EquipmentCard key={item.id} item={item} onClick={() => onEditEquipment(item)} />
          ))}
        </div>
      </Section>

      <Section title="Wardrobe" count={outfits.length}>
        <ul className="desk-outfits">
          {outfits.map((o) => {
            const chips = outfitChips(o);
            return (
              <li key={o.id} className={`desk-outfit ${o.equipped ? "desk-outfit--worn" : ""}`}>
                <div className="desk-outfit-text">
                  <span className="desk-outfit-name">{o.name}</span>
                  <span className="desk-outfit-range">{formatRange({ min: o.comfortMin, max: o.comfortMax })}</span>
                  {(o.equipped || chips.length > 0) && (
                    <span className="desk-outfit-tags">
                      {o.equipped && <span className="desk-tag desk-tag--worn">Worn</span>}
                      {chips.map((c) => (
                        <span key={c.label} className={`desk-tag ${c.good ? "desk-tag--good" : "desk-tag--bad"}`}>
                          {c.label}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="slug-management-icon-btn slug-management-icon-btn--danger"
                  onClick={() => onRemoveOutfit(o)}
                  title={`Take away ${o.name}`}
                  aria-label={`Take away ${o.name}`}
                >
                  <TrashIcon weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </section>
  );
}
