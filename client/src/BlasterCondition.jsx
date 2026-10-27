import { qualityInfo } from "./itemData.js";
import {
  REPAIR_DC,
  REPAIR_FAIL_DAMAGE,
  SHOTS_TO_BREAK,
  durabilityPercent,
  durabilityState,
  shotsLeft,
} from "./careData.js";
import Hint from "./Hint.jsx";
import "./BlasterCondition.css";

// What a blaster's condition means, spelled out for whoever hovers it.
export function DurabilityRules({ blaster }) {
  const quality = qualityInfo(blaster.quality);
  const durability = blaster.durability ?? 100;
  return (
    <>
      <p>
        Every shot fired wears a blaster down. A <b>{quality.label}</b> blaster survives about{" "}
        <b>{SHOTS_TO_BREAK[blaster.quality] ?? SHOTS_TO_BREAK[0]}</b> shots from new
        {durability > 0 && (
          <>
            ; this one has about <b>{shotsLeft(durability, blaster.quality)}</b> left
          </>
        )}
        .
      </p>
      <p>
        A <b>Repair Kit</b> lets you roll d20 + Engineering. Above <b>{REPAIR_DC}</b> it is restored to 100%. On a fail the
        kit is used up and the blaster loses a further <b>{REPAIR_FAIL_DAMAGE}%</b>.
      </p>
      <p className="hint-warn">
        At 0% a blaster is broken: it can't fire, and a kit can't fix it. Only an expert's workshop can -- ask your DM.
      </p>
    </>
  );
}

// The blaster's wear bar, with the rules one hover away.
export default function BlasterCondition({ blaster }) {
  const durability = blaster.durability ?? 100;
  const pct = durabilityPercent(durability);
  const state = durabilityState(durability);
  return (
    <Hint align="center" title="Blaster condition" tip={<DurabilityRules blaster={blaster} />} className="blaster-condition-hint">
      <div className={`blaster-condition blaster-condition--${state.tone}`}>
        <div className="blaster-condition-row">
          <span className="blaster-condition-label">Condition</span>
          <span className="blaster-condition-value">
            <strong className="num-tabular">{pct}%</strong> {state.label}
          </span>
        </div>
        <div
          className="blaster-condition-bar"
          role="meter"
          aria-label={`${blaster.name} condition`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}% — ${state.label}`}
        >
          <span className="blaster-condition-fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>
    </Hint>
  );
}
