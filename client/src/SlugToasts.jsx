import { useEffect, useRef } from "react";
import { HeartIcon } from "@phosphor-icons/react";
import { useLiveState } from "./AccessSocket.jsx";
import { useToast } from "./Toast.jsx";
import { LOYALTY_TIER_LABELS } from "./slugData.js";

// One of the player's slugs filled its loyalty meter and rose a tier. The
// server only messages the owner, so this is the whole announcement.
export default function SlugToasts() {
  const { slugTierUp } = useLiveState();
  const { push } = useToast();
  const lastSeen = useRef(null);

  useEffect(() => {
    if (!slugTierUp || slugTierUp.at === lastSeen.current) return;
    lastSeen.current = slugTierUp.at;
    push({
      tone: "success",
      icon: <HeartIcon weight="fill" />,
      title: `${slugTierUp.slugName} warms to you`,
      body: `Now ${LOYALTY_TIER_LABELS[slugTierUp.tier] ?? "closer"}. Keep firing it to earn more of its trust.`,
    });
  }, [slugTierUp, push]);

  return null;
}
