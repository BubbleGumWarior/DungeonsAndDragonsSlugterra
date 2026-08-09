import { EyeIcon, EyeSlashIcon, UserCircleIcon } from "@phosphor-icons/react";
import "./NpcCard.css";

export default function NpcCard({ npc, slugTemplates, blasterTemplates, mechaTemplates, onClick, actions }) {
  const slugCount = npc.slugTemplateIds?.length || 0;
  const blasterCount = npc.blasterTemplateIds?.length || 0;
  const mecha = mechaTemplates?.find((m) => m.id === npc.mechaTemplateId);

  return (
    <div className={`npc-card ${onClick ? "npc-card--clickable" : ""}`} onClick={onClick}>
      <div className="npc-card-portrait">
        {npc.image ? <img src={npc.image} alt={npc.name} /> : <UserCircleIcon weight="duotone" />}
      </div>
      <div className="npc-card-body">
        <h3 className="npc-card-name">
          {npc.name}
          <span className={`npc-card-reveal ${npc.revealed ? "npc-card-reveal--on" : ""}`} title={npc.revealed ? "Revealed to players" : "Hidden from players"}>
            {npc.revealed ? <EyeIcon weight="bold" /> : <EyeSlashIcon weight="bold" />}
          </span>
        </h3>
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
      </div>
      {actions && (
        <div className="npc-card-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
