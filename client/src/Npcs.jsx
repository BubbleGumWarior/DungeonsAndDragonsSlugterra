import { useAuth } from "./AuthContext.jsx";
import NavBar from "./NavBar.jsx";
import NpcManagement from "./NpcManagement.jsx";
import NpcPlayerBoard from "./NpcPlayerBoard.jsx";
import "./PlaceholderPage.css";

export default function Npcs() {
  const { user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">NPCs</h1>

        {isDungeonMaster ? <NpcManagement /> : <NpcPlayerBoard />}
      </div>
    </div>
  );
}
