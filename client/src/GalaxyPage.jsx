import { useAuth } from "./AuthContext.jsx";
import NavBar from "./NavBar.jsx";
import GalaxyMap from "./GalaxyMap.jsx";
import "./PlaceholderPage.css";

export default function GalaxyPage() {
  const { user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">Galaxy Map</h1>
        <GalaxyMap isDungeonMaster={isDungeonMaster} />
      </div>
    </div>
  );
}
