import { useEffect, useRef } from "react";
import { WrenchIcon } from "@phosphor-icons/react";
import { useLiveState } from "./AccessSocket.jsx";
import { useToast } from "./Toast.jsx";
import { describeShipWork } from "./shipData.js";

// Someone rolled Engineering to build or upgrade a compartment. Everyone is told
// who, what, and how it went (the same line is also in the Events feed).
export default function ShipBuildToasts() {
  const { shipBuildResult } = useLiveState();
  const { push } = useToast();
  const lastSeen = useRef(null);

  useEffect(() => {
    if (!shipBuildResult || shipBuildResult.at === lastSeen.current) return;
    lastSeen.current = shipBuildResult.at;
    const text = describeShipWork(shipBuildResult);
    push({
      tone: shipBuildResult.success ? "success" : "warn",
      icon: <WrenchIcon weight="bold" />,
      title: text.title,
      body: text.detail,
      duration: 11000,
    });
  }, [shipBuildResult, push]);

  return null;
}
