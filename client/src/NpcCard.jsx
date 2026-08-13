import { EyeIcon, EyeSlashIcon, UserCircleIcon } from "@phosphor-icons/react";
import NpcGuessedChips from "./NpcGuessedChips.jsx";
import "./NpcCard.css";

export default function NpcCard({ npc, mechaTemplates, gallery, onClick, onToggleReveal, actions }) {
  const slugCount = npc.slugTemplateIds?.length || 0;
  const blasterCount = npc.blasterTemplateIds?.length || 0;
  const guessedIds = npc.guessedSlugTemplateIds || [];
  const mecha = mechaTemplates?.find((m) => m.id === npc.mechaTemplateId);

  return (
    <div className={`npc-card ${onClick ? "npc-card--clickable" : ""}`} onClick={onClick}>
      <div className="npc-card-portrait">
        {npc.image ? <img src={npc.image} alt={npc.name} /> : <UserCircleIcon weight="duotone" />}
      </div>
      <div className="npc-card-body">
        <h3 className="npc-card-name">{npc.name}</h3>
        <div className="npc-card-stats">
          <span>{npc.maxGrit} Grit</span>
          <span>{npc.maxAp} AP</span>
        </div>
        <div className="npc-card-loadout">
          {slugCount > 0 && <span>{slugCount} slug{slugCount === 1 ? "" : "s"}</span>}
          {blasterCount > 0 && <span>{blasterCount} blaster{blasterCount === 1 ? "" : "s"}</span>}
          {mecha && <span>{mecha.name}</span>}
          {slugCount === 0 && blasterCount === 0 && !mecha && <span>No gear assigned</span>}
        </div>
        {guessedIds.length > 0 && gallery && (
          <div className="npc-card-guessed">
            <NpcGuessedChips gallery={gallery} guessedIds={guessedIds} />
          </div>
        )}
      </div>
      <div className="npc-card-actions" onClick={(e) => e.stopPropagation()}>
        {onToggleReveal && (
          <button
            type="button"
            className={`npc-card-reveal-btn ${npc.revealed ? "npc-card-reveal-btn--on" : ""}`}
            onClick={() => onToggleReveal(npc)}
            title={npc.revealed ? "Revealed to players -- click to hide" : "Hidden from players -- click to reveal"}
          >
            {npc.revealed ? <EyeIcon weight="bold" /> : <EyeSlashIcon weight="bold" />}
            {npc.revealed ? "Revealed" : "Hidden"}
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
