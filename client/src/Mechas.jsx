import { useAuth } from "./AuthContext.jsx";
import NavBar from "./NavBar.jsx";
import MechaManagement from "./MechaManagement.jsx";
import PlayerMechas from "./PlayerMechas.jsx";
import "./PlaceholderPage.css";

export default function Mechas() {
  const { user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">Mecha-Beasts</h1>

        {isDungeonMaster ? <MechaManagement /> : <PlayerMechas />}
      </div>
    </div>
  );
}
