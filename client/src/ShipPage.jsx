import { useAuth } from "./AuthContext.jsx";
import { canEditAsDm, isAssistant } from "./roles.js";
import NavBar from "./NavBar.jsx";
import ShipBlueprint from "./ShipBlueprint.jsx";
import "./PlaceholderPage.css";

export default function ShipPage() {
  const { user } = useAuth();
  const isDungeonMaster = canEditAsDm(user);

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">Deck Plan</h1>
        <ShipBlueprint isDungeonMaster={isDungeonMaster} assistant={isAssistant(user)} />
      </div>
    </div>
  );
}
