import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@phosphor-icons/react";
import useTravel from "./useTravel.js";
import GalaxyMap from "./GalaxyMap.jsx";
import TravelPanel from "./TravelPanel.jsx";
import "./NavConsole.css";

// The room's picture, and its shape. NavConsole.css places everything on the
// stage as a share of this picture, so the hologram stays registered to the
// holotable in it; keep IMAGE_AR in step with --img-ar there.
const BRIDGE_IMAGE = "/ship/nav-bridge.webp";
const IMAGE_AR = 1935 / 812;

// How wide, relative to its height, the star map is drawn. The map itself keeps
// a fixed size against the picture; a screen wider than the picture stretches
// the stage (up to 1.4x, see CSS), and the sky of the map stretches with it, so
// the hologram effect reaches every cluster rather than just the middle. On a
// phone it is the map's own shape.
const MAP_ASPECT = 1000 / 680;
// On the table the clusters are drawn larger (the room around them is busy) and
// the ring is lifted so the front cluster clears the sheet's fade into the table.
const CONSOLE_LOOK = { ringCy: 232, frontScale: 1.32, backScale: 0.34, backOpacity: 0.62 };
const SHEET_ASPECT = 3.2;
const MAX_STRETCH = 1.4;
const SHEET_HEIGHT_SHARE = 0.58; // keep in step with --sh in NavConsole.css
function projectionLayout() {
  if (window.innerWidth <= 880) return { aspect: MAP_ASPECT, visible: 1 };
  const naturalWidth = window.innerHeight * IMAGE_AR;
  const stretch = Math.max(1, Math.min(window.innerWidth / naturalWidth, MAX_STRETCH));
  const aspect = SHEET_ASPECT * stretch;
  // The stage can be wider than the screen (cropped at the sides); only this
  // share of the hologram sheet is actually on screen, and the clusters are
  // spread to fit within it.
  const stageWidth = naturalWidth * stretch;
  const sheetWidth = window.innerHeight * SHEET_HEIGHT_SHARE * aspect;
  const visible = Math.min(1, Math.min(window.innerWidth, stageWidth) / sheetWidth);
  return { aspect, visible };
}

// The first-person view at the Nav Computer: you are standing at the holotable
// in the ship's bridge, the star map is light rising out of it, and the ship's
// readout and the world dossier hang over the room on either side. It is the
// only way to the Galaxy Map -- opened from the Deck Plan.
//
// The hologram is built from the app's own tokens (gold light), so it follows
// the chosen theme.
export default function NavConsole({ isDungeonMaster = false, onClose, chamberName = "Nav Computer" }) {
  const { travel, error, busy, act } = useTravel();
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // The dossier is portalled out of the tilted projection into this flat host,
  // so it never leans with the map.
  const [dossierHost, setDossierHost] = useState(null);
  const [layout, setLayout] = useState(projectionLayout);
  const { aspect, visible } = layout;

  useEffect(() => {
    const onResize = () => setLayout(projectionLayout());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div
      className="nav-console"
      role="dialog"
      aria-modal="true"
      aria-label={`${chamberName} star console`}
      style={{ "--nav-aspect": aspect }}
    >
      <div className="nav-stage">
        <img className="nav-bridge" src={BRIDGE_IMAGE} alt="" draggable={false} />
        <span className="nav-scrim" aria-hidden="true" />
        <span className="nav-cone" aria-hidden="true" />
        <span className="nav-emitter" aria-hidden="true" />
        <div className="nav-holo">
          <div className="nav-holo-map">
            {travel ? (
              <GalaxyMap
                travel={travel}
                travelAct={act}
                travelBusy={busy}
                isDungeonMaster={isDungeonMaster}
                dossierHost={dossierHost}
                aspect={aspect}
                visibleShare={visible}
                look={aspect === MAP_ASPECT ? undefined : CONSOLE_LOOK}
              />
            ) : (
              <p className="nav-warming">Warming the projector…</p>
            )}
          </div>
        </div>
      </div>

      <header className="nav-bar">
        <h1 className="nav-title">{chamberName}</h1>
        <button ref={closeRef} type="button" className="nav-leave" onClick={onClose}>
          <XIcon weight="bold" /> Leave the console
        </button>
      </header>

      <div className="nav-readout">
        <TravelPanel travel={travel} isDungeonMaster={isDungeonMaster} act={act} busy={busy} error={error} />
      </div>

      <div className="nav-dossier-host" ref={setDossierHost} />
    </div>,
    document.body
  );
}
