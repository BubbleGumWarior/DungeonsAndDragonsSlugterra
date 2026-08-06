import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import SlugManagement from "./SlugManagement.jsx";
import PlayerSlugs from "./PlayerSlugs.jsx";
import "./PlaceholderPage.css";

export default function Slugs() {
  const { user } = useAuth();
  const { slugterraRevealed } = useLiveState();
  const isDungeonMaster = user?.role === "Dungeon Master";

  return (
    <div className="placeholder-page placeholder-page--wide">
      <Link className="placeholder-back" to="/dashboard">
        <ArrowLeftIcon weight="bold" />
        Back to Dashboard
      </Link>

      <h1 className="slugs-page-title">{slugterraRevealed ? "Slugs" : "Creatures"}</h1>

      {isDungeonMaster ? <SlugManagement /> : <PlayerSlugs />}
    </div>
  );
}
