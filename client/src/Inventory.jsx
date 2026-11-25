import { useAuth } from "./AuthContext.jsx";
import { canEditAsDm, canViewAsDm } from "./roles.js";
import NavBar from "./NavBar.jsx";
import InventoryManagement from "./InventoryManagement.jsx";
import PlayerInventory from "./PlayerInventory.jsx";
import "./PlaceholderPage.css";

export default function Inventory() {
  const { user } = useAuth();
  const seesAll = canViewAsDm(user);

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">Inventory</h1>

        {seesAll ? <InventoryManagement readOnly={!canEditAsDm(user)} /> : <PlayerInventory />}
      </div>
    </div>
  );
}
