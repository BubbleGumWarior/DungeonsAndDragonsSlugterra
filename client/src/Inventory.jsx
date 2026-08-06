import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import InventoryManagement from "./InventoryManagement.jsx";
import PlayerInventory from "./PlayerInventory.jsx";
import "./PlaceholderPage.css";

export default function Inventory() {
  const { user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";

  return (
    <div className="placeholder-page placeholder-page--wide">
      <Link className="placeholder-back" to="/dashboard">
        <ArrowLeftIcon weight="bold" />
        Back to Dashboard
      </Link>

      <h1 className="slugs-page-title">Inventory</h1>

      {isDungeonMaster ? <InventoryManagement /> : <PlayerInventory />}
    </div>
  );
}
