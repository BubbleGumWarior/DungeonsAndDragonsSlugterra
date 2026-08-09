import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import NpcManagement from "./NpcManagement.jsx";
import "./PlaceholderPage.css";

export default function Npcs() {
  const { user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";

  return (
    <div className="placeholder-page placeholder-page--wide">
      <Link className="placeholder-back" to="/dashboard">
        <ArrowLeftIcon weight="bold" />
        Back to Dashboard
      </Link>

      <h1 className="slugs-page-title">NPCs</h1>

      {isDungeonMaster ? (
        <NpcManagement />
      ) : (
        <p className="slug-management-empty">Only the Dungeon Master can manage NPCs.</p>
      )}
    </div>
  );
}
