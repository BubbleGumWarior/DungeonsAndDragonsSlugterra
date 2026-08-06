import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import MechaManagement from "./MechaManagement.jsx";
import PlayerMechas from "./PlayerMechas.jsx";
import "./PlaceholderPage.css";

export default function Mechas() {
  const { user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";

  return (
    <div className="placeholder-page placeholder-page--wide">
      <Link className="placeholder-back" to="/dashboard">
        <ArrowLeftIcon weight="bold" />
        Back to Dashboard
      </Link>

      <h1 className="slugs-page-title">Mecha-Beasts</h1>

      {isDungeonMaster ? <MechaManagement /> : <PlayerMechas />}
    </div>
  );
}
