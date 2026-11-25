import { useAuth } from "./AuthContext.jsx";
import { canEditAsDm, canViewAsDm } from "./roles.js";
import NavBar from "./NavBar.jsx";
import MechaManagement from "./MechaManagement.jsx";
import PlayerMechas from "./PlayerMechas.jsx";
import "./PlaceholderPage.css";

export default function Mechas() {
  const { user } = useAuth();
  const seesAll = canViewAsDm(user);

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">Mecha-Beasts</h1>

        {seesAll ? <MechaManagement readOnly={!canEditAsDm(user)} /> : <PlayerMechas />}
      </div>
    </div>
  );
}
