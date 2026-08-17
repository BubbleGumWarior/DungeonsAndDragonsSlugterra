import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  DiceFiveIcon,
  ShieldCheckIcon,
  SignOutIcon,
  EyeIcon,
  EyeSlashIcon,
  BackpackIcon,
  CircleDashedIcon,
  PawPrintIcon,
  SwordIcon,
  MaskHappyIcon,
  GearSixIcon,
  ListIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import "./NavBar.css";

// Shared top bar for every page behind the AuthGate. One instance owns the
// mobile hamburger state and the active-tab indicator, so every page gets
// consistent "where am I" color-coding without re-deriving it locally.
export default function NavBar() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { slugterraRevealed } = useLiveState();
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef(null);
  const actionsRef = useRef(null);
  const [indicator, setIndicator] = useState(null);
  const isDungeonMaster = user?.role === "Dungeon Master";
  const showSlugterraTabs = isDungeonMaster || slugterraRevealed;
  // On the dashboard itself there's nowhere to "go back" to -- show the
  // brand mark. Everywhere else, the brand slot becomes the way home.
  const isDashboard = location.pathname === "/dashboard";

  // Mobile-only hamburger dropdown (see NavBar.css) -- close it on an
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

  // Sliding active-tab bar: measure the currently-active link's position
  // inside .navbar-actions (the real flex row on desktop -- see NavBar.css
  // for why .navbar-actions-inner isn't the one to measure) and glide a
  // gold underline there. Recomputed whenever the route or the visible tab
  // set changes; CSS hides it below the hamburger breakpoint, where the
  // actions become a vertical list and a horizontal bar stops meaning
  // anything.
  useLayoutEffect(() => {
    function measure() {
      const container = actionsRef.current;
      if (!container) return;
      const active = container.querySelector(".navbar-link--active");
      if (!active) {
        setIndicator(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      setIndicator({ left: activeRect.left - containerRect.left, width: activeRect.width });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [location.pathname, showSlugterraTabs, isDungeonMaster, navOpen]);

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

  function linkClass({ isActive }) {
    return `navbar-link${isActive ? " navbar-link--active" : ""}`;
  }

  return (
    <nav className="navbar" ref={navRef}>
      {isDashboard ? (
        <span className="navbar-brand">
          <DiceFiveIcon weight="duotone" />
          <span className="nav-label">Dungeon Lair</span>
        </span>
      ) : (
        <Link className="navbar-brand navbar-brand--back" to="/dashboard">
          <ArrowLeftIcon weight="bold" />
          <span className="nav-label">Back to Dashboard</span>
        </Link>
      )}

      <button
        type="button"
        className="navbar-toggle"
        onClick={() => setNavOpen((v) => !v)}
        aria-label={navOpen ? "Close menu" : "Open menu"}
        aria-expanded={navOpen}
      >
        {navOpen ? <XIcon weight="bold" /> : <ListIcon weight="bold" />}
      </button>

      <div
        className={`navbar-actions ${navOpen ? "navbar-actions--open" : ""}`}
        ref={actionsRef}
        // Closing on any inner link/button click (rather than threading
        // onClick through every single item) is what dismisses the mobile
        // dropdown once the user actually picks something.
        onClick={(e) => {
          if (e.target.closest("a, button")) setNavOpen(false);
        }}
      >
        {/* The grid-rows reveal trick (see NavBar.css) needs exactly one
            sizable grid item to clip/expand -- this inner wrapper is that
            item on mobile. On desktop it's `display: contents`, so it's
            invisible to layout and every link/button below is still a
            direct flex item of .navbar-actions, same as before the
            wrapper existed. */}
        <div className="navbar-actions-inner">
          {showSlugterraTabs && (
            <>
              <NavLink className={linkClass} to="/inventory">
                <BackpackIcon weight="bold" />
                <span className="nav-label">Inventory</span>
              </NavLink>
              <NavLink className={linkClass} to="/slugs">
                <CircleDashedIcon weight="bold" />
                <span className="nav-label">{slugterraRevealed ? "Slugs" : "Creatures"}</span>
              </NavLink>
              <NavLink className={linkClass} to="/mechas">
                <PawPrintIcon weight="bold" />
                <span className="nav-label">Mecha-Beasts</span>
              </NavLink>
              <NavLink className={linkClass} to="/npcs">
                <MaskHappyIcon weight="bold" />
                <span className="nav-label">NPCs</span>
              </NavLink>
              <NavLink className={linkClass} to="/combat">
                <SwordIcon weight="bold" />
                <span className="nav-label">Combat</span>
              </NavLink>
            </>
          )}
          {isDungeonMaster && (
            <>
              <button type="button" className="navbar-action" onClick={handleToggleSlugterra}>
                {slugterraRevealed ? <EyeSlashIcon weight="bold" /> : <EyeIcon weight="bold" />}
                <span className="nav-label">{slugterraRevealed ? "Hide Slugterra" : "Reveal Slugterra"}</span>
              </button>
              <NavLink className={linkClass} to="/admin">
                <ShieldCheckIcon weight="bold" />
                <span className="nav-label">Admin</span>
              </NavLink>
            </>
          )}
          <NavLink className={linkClass} to="/settings">
            <GearSixIcon weight="bold" />
            <span className="nav-label">Settings</span>
          </NavLink>
          <button type="button" className="navbar-logout" onClick={handleLogout}>
            <SignOutIcon weight="bold" />
            <span className="nav-label">Log Out</span>
          </button>
        </div>

        <span
          className="navbar-indicator"
          style={indicator ? { left: `${indicator.left}px`, width: `${indicator.width}px`, opacity: 1 } : { width: 0, opacity: 0 }}
          aria-hidden="true"
        />
      </div>
    </nav>
  );
}
