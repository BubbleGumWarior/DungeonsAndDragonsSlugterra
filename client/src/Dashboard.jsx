import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DiceFiveIcon,
  ShieldCheckIcon,
  SignOutIcon,
  CastleTurretIcon,
  PlusIcon,
  UserCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  BackpackIcon,
  CircleDashedIcon,
  PawPrintIcon,
  SwordIcon,
  MaskHappyIcon,
  ListIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { maxGrit } from "./characterData.js";
import Roster from "./Roster.jsx";
import KnockoutPips from "./KnockoutPips.jsx";
import GritRing from "./GritRing.jsx";
import DMCharacterViewer from "./DMCharacterViewer.jsx";
import ChatBox from "./ChatBox.jsx";
import ChallengePanel from "./ChallengePanel.jsx";
import DiceRollPanel from "./DiceRollPanel.jsx";
import SlugHuntPanel from "./SlugHuntPanel.jsx";
import "./Dashboard.css";

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const { slugterraRevealed, characterUpdate } = useLiveState();
  const [character, setCharacter] = useState(undefined);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef(null);
  const isDungeonMaster = user?.role === "Dungeon Master";

  // Mobile-only hamburger dropdown (see Dashboard.css) -- close it on an
  // outside tap/click or Escape, same as any other popover in the app.
  useEffect(() => {
    if (!navOpen) return;
    function handlePointerDown(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setNavOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setNavOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navOpen]);

  useEffect(() => {
    if (user?.role !== "Player") return;
    let cancelled = false;
    fetch("/api/characters/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCharacter(data.character);
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  useEffect(() => {
    if (user?.role === "Player" && characterUpdate && characterUpdate.userId === user?.id) {
      setCharacter(characterUpdate.character);
    }
  }, [characterUpdate, user]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  async function handleToggleSlugterra() {
    await fetch("/api/settings/slugterra", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ revealed: !slugterraRevealed }),
    });
  }

  const showSlugterraTabs = isDungeonMaster || slugterraRevealed;

  return (
    <div className="dashboard-page">
      <nav className="dashboard-nav" ref={navRef}>
        <span className="dashboard-brand">
          <DiceFiveIcon weight="duotone" />
          <span className="nav-label">Dungeon Lair</span>
        </span>

        <button
          type="button"
          className="dashboard-nav-toggle"
          onClick={() => setNavOpen((v) => !v)}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
        >
          {navOpen ? <XIcon weight="bold" /> : <ListIcon weight="bold" />}
        </button>

        <div
          className={`dashboard-nav-actions ${navOpen ? "dashboard-nav-actions--open" : ""}`}
          // Closing on any inner link/button click (rather than threading
          // onClick through every single item) is what dismisses the mobile
          // dropdown once the user actually picks something.
          onClick={(e) => {
            if (e.target.closest("a, button")) setNavOpen(false);
          }}
        >
          {/* The grid-rows reveal trick (see Dashboard.css) needs exactly
              one sizable grid item to clip/expand -- this inner wrapper is
              that item on mobile. On desktop it's `display: contents`, so
              it's invisible to layout and every link/button below is still
              a direct flex item of .dashboard-nav-actions, same as before. */}
          <div className="dashboard-nav-actions-inner">
            {showSlugterraTabs && (
              <>
                <Link className="dashboard-admin-link" to="/inventory">
                  <BackpackIcon weight="bold" />
                  <span className="nav-label">Inventory</span>
                </Link>
                <Link className="dashboard-admin-link" to="/slugs">
                  <CircleDashedIcon weight="bold" />
                  <span className="nav-label">{slugterraRevealed ? "Slugs" : "Creatures"}</span>
                </Link>
                <Link className="dashboard-admin-link" to="/mechas">
                  <PawPrintIcon weight="bold" />
                  <span className="nav-label">Mecha-Beasts</span>
                </Link>
                <Link className="dashboard-admin-link" to="/npcs">
                  <MaskHappyIcon weight="bold" />
                  <span className="nav-label">NPCs</span>
                </Link>
                <Link className="dashboard-admin-link" to="/combat">
                  <SwordIcon weight="bold" />
                  <span className="nav-label">Combat</span>
                </Link>
              </>
            )}
            {isDungeonMaster && (
              <>
                <button className="dashboard-admin-link" onClick={handleToggleSlugterra}>
                  {slugterraRevealed ? <EyeSlashIcon weight="bold" /> : <EyeIcon weight="bold" />}
                  <span className="nav-label">{slugterraRevealed ? "Hide Slugterra" : "Reveal Slugterra"}</span>
                </button>
                <Link className="dashboard-admin-link" to="/admin">
                  <ShieldCheckIcon weight="bold" />
                  <span className="nav-label">Admin</span>
                </Link>
              </>
            )}
            <button className="dashboard-logout" onClick={handleLogout}>
              <SignOutIcon weight="bold" />
              <span className="nav-label">Log Out</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="dashboard-body">
        <div className={`dashboard-grid${showSlugterraTabs ? "" : " dashboard-grid--minimal"}`}>
          <div className="dashboard-hero">
            {user?.role === "Player" ? (
              character === undefined ? null : character ? (
                <Link to="/character" className="character-card">
                  <span className="character-card-portrait">
                    <GritRing current={character.currentGrit} max={maxGrit(character.stats)} />
                    {character.portrait ? (
                      <img src={character.portrait} alt={character.name} />
                    ) : (
                      <UserCircleIcon weight="duotone" />
                    )}
                    <KnockoutPips size="md" pips={character.knockoutPips} editable={false} />
                  </span>
                  <div className="character-card-info">
                    <h1>{character.name}</h1>
                    <p>View character sheet</p>
                  </div>
                </Link>
              ) : (
                <button type="button" className="character-empty-card" onClick={() => navigate("/character/create")}>
                  <span className="character-empty-plus">
                    <PlusIcon weight="bold" />
                  </span>
                  <h1>Create Your Character</h1>
                  <p>You haven't created a character yet. Begin your legend.</p>
                </button>
              )
            ) : selectedUserId ? (
              <DMCharacterViewer userId={selectedUserId} onDeselect={() => setSelectedUserId(null)} />
            ) : (
              <div className="dashboard-card">
                <span className="dashboard-icon">
                  <CastleTurretIcon weight="duotone" />
                </span>
                <h1>Logged in as {user?.username}</h1>
                <p>Select a character from the roster below to view and edit their sheet.</p>
                <span className="dashboard-role">{user?.role}</span>
              </div>
            )}
          </div>

          <Roster
            selectable={isDungeonMaster}
            healable={isDungeonMaster}
            selectedUserId={selectedUserId}
            onSelect={(c) => setSelectedUserId(c.userId)}
          />

          {showSlugterraTabs && (
            <>
              <div className="chat-slot">
                <ChatBox />
              </div>
              <ChallengePanel isDungeonMaster={isDungeonMaster} />
              <SlugHuntPanel isDungeonMaster={isDungeonMaster} />
            </>
          )}
          {isDungeonMaster && <DiceRollPanel />}
        </div>
      </div>
    </div>
  );
}
