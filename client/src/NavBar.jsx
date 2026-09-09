import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  CaretDownIcon,
  DiceFiveIcon,
  ShieldCheckIcon,
  SignOutIcon,
  EyeIcon,
  EyeSlashIcon,
  BackpackIcon,
  CircleDashedIcon,
  PawPrintIcon,
  PlanetIcon,
  RocketIcon,
  SwordIcon,
  BookOpenTextIcon,
  GearSixIcon,
  ListIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import "./NavBar.css";

// A navbar dropdown that groups several destinations under one trigger, so
// the bar doesn't sprawl. Desktop: click the trigger for an absolute popover.
// Mobile (inside the hamburger panel): `display: contents` drops the trigger
// and the menu flows inline as a labelled, always-open subsection -- keeping
// the grid-rows reveal trick (see NavBar.css) working on a single box.
function NavGroup({ id, label, icon, items, openGroup, setOpenGroup }) {
  const location = useLocation();
  const open = openGroup === id;
  const childActive = items.some(
    (it) => location.pathname === it.to || location.pathname.startsWith(`${it.to}/`)
  );

  return (
    <div className="navbar-group">
      <button
        type="button"
        className={`navbar-link navbar-group-trigger${childActive ? " navbar-link--active" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpenGroup(open ? null : id);
        }}
      >
        {icon}
        <span className="nav-label">{label}</span>
        <CaretDownIcon weight="bold" className="navbar-group-caret" />
      </button>

      <div className={`navbar-group-menu${open ? " navbar-group-menu--open" : ""}`}>
        <span className="navbar-group-label">{label}</span>
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) => `navbar-sublink${isActive ? " navbar-sublink--active" : ""}`}
          >
            {it.icon}
            <span className="nav-label">{it.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

// Shared top bar for every page behind the AuthGate. One instance owns the
// mobile hamburger state, the open-dropdown state, and the active-tab
// indicator, so every page gets consistent "where am I" color-coding without
// re-deriving it locally.
export default function NavBar() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { slugterraRevealed } = useLiveState();
  const [navOpen, setNavOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const navRef = useRef(null);
  const actionsRef = useRef(null);
  const [indicator, setIndicator] = useState(null);
  const isDungeonMaster = user?.role === "Dungeon Master";
  const showSlugterraTabs = isDungeonMaster || slugterraRevealed;
  // On the dashboard itself there's nowhere to "go back" to -- show the
  // brand mark. Everywhere else, the brand slot becomes the way home.
  const isDashboard = location.pathname === "/dashboard";

  const loadoutItems = [
    { to: "/slugs", label: slugterraRevealed ? "Slugs" : "Creatures", icon: <CircleDashedIcon weight="bold" /> },
    { to: "/inventory", label: "Inventory", icon: <BackpackIcon weight="bold" /> },
  ];
  const starChartItems = [
    { to: "/galaxy", label: "Galaxy Map", icon: <PlanetIcon weight="bold" /> },
    { to: "/ship", label: "Deck Plan", icon: <RocketIcon weight="bold" /> },
    { to: "/mechas", label: "Mecha-Beasts", icon: <PawPrintIcon weight="bold" /> },
  ];

  // Close the mobile dropdown / an open nav group on an outside tap/click or
  // Escape, same as any other popover in the app.
  useEffect(() => {
    if (!navOpen && !openGroup) return;
    function handlePointerDown(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setNavOpen(false);
        setOpenGroup(null);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setNavOpen(false);
        setOpenGroup(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navOpen, openGroup]);

  // Any route change closes both.
  useEffect(() => {
    setNavOpen(false);
    setOpenGroup(null);
  }, [location.pathname]);

  // Sliding active-tab bar: measure the currently-active top-level link (a
  // flat link or a group trigger whose child route is active) inside
  // .navbar-actions and glide a gold underline there. Group *sub*links use
  // their own class so they never get measured. CSS hides the bar below the
  // hamburger breakpoint.
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
        // Closing on any inner link/logout click (rather than threading
        // onClick through every single item) is what dismisses the mobile
        // dropdown and any open nav group once the user actually picks
        // something. Group triggers opt out -- they manage their own state.
        onClick={(e) => {
          const el = e.target.closest("a, button");
          if (!el || el.classList.contains("navbar-group-trigger")) return;
          setNavOpen(false);
          setOpenGroup(null);
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
              <NavGroup
                id="loadout"
                label="Loadout"
                icon={<BackpackIcon weight="bold" />}
                items={loadoutItems}
                openGroup={openGroup}
                setOpenGroup={setOpenGroup}
              />
              <NavGroup
                id="starcharts"
                label="Star Charts"
                icon={<PlanetIcon weight="bold" />}
                items={starChartItems}
                openGroup={openGroup}
                setOpenGroup={setOpenGroup}
              />
              <NavLink className={linkClass} to="/chronicle">
                <BookOpenTextIcon weight="bold" />
                <span className="nav-label">Chronicle</span>
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
