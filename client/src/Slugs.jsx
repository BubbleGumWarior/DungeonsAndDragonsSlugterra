import { useAuth } from "./AuthContext.jsx";
import { canEditAsDm, canViewAsDm } from "./roles.js";
import { useLiveState } from "./AccessSocket.jsx";
import NavBar from "./NavBar.jsx";
import SlugManagement from "./SlugManagement.jsx";
import PlayerSlugs from "./PlayerSlugs.jsx";
import "./PlaceholderPage.css";

export default function Slugs() {
  const { user } = useAuth();
  const { slugterraRevealed } = useLiveState();
  const seesAll = canViewAsDm(user);

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">{slugterraRevealed ? "Slugs" : "Creatures"}</h1>

        {seesAll ? <SlugManagement readOnly={!canEditAsDm(user)} /> : <PlayerSlugs />}
      </div>
    </div>
  );
}
