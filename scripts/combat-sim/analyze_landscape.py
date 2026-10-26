"""Reads the output of exp_landscape.mjs and prints how each stat modifier moves win rate.

    python scripts/combat-sim/analyze_landscape.py path/to/landscape_standard_450.json

Needs only numpy.
"""
import json
import sys
from collections import defaultdict

import numpy as np

STATS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]


def ols(X, y):
    X1 = np.column_stack([np.ones(len(X)), X])
    beta, *_ = np.linalg.lstsq(X1, y, rcond=None)
    resid = y - X1 @ beta
    dof = max(1, len(y) - X1.shape[1])
    sigma2 = float(resid @ resid) / dof
    cov = sigma2 * np.linalg.inv(X1.T @ X1)
    se = np.sqrt(np.diag(cov))
    r2 = 1 - float(resid @ resid) / float(((y - y.mean()) ** 2).sum())
    return beta, se, r2


def main(path):
    data = json.load(open(path))
    rows = data["rows"]
    print(f"loadout={data['loadout']} startDist={data['startDist']} field={data['fieldSize']} duels/candidate={rows[0]['n']}")
    by_sec = defaultdict(list)
    for r in rows:
        by_sec[r["sec"]].append(r)

    print("\n== mean win rate by Secondary item (all 1,568 stat patterns) ==")
    ranking = sorted(by_sec.items(), key=lambda kv: -np.mean([r["win"] for r in kv[1]]))
    for sec, rs in ranking:
        w = np.array([r["win"] for r in rs])
        print(f"  {sec:12s} mean {100*w.mean():5.1f}%   best {100*w.max():5.1f}%   worst {100*w.min():5.1f}%   sd across stat patterns {100*w.std():4.1f}")

    print("\n== effect of +1 modifier on win rate (percentage points), OLS per Secondary ==")
    print("  " + "item".ljust(12) + "".join(s.rjust(14) for s in STATS) + "      R2")
    for sec, rs in ranking:
        X = np.array([r["mods"] for r in rs], dtype=float)
        y = np.array([r["win"] for r in rs])
        beta, se, r2 = ols(X, y)
        cells = "".join(f"{100*b:+6.2f}±{100*2*s:4.2f}".rjust(14) for b, s in zip(beta[1:], se[1:]))
        print("  " + sec.ljust(12) + cells + f"   {r2:5.2f}")
    print("  (±  = 95% CI half-width)")

    print("\n== effect of each modifier LEVEL vs a -1 modifier (pp of win rate), dummy-coded OLS per Secondary ==")
    print("   (the modifier steps are -1 -> 0 -> +1 -> +2; scores 8-9, 10-11, 12-13, 14-15)")
    for sec in ("none", "rapier", "longsword", "mace", "roundshield", "towershield", "belt2"):
        rs = by_sec.get(sec)
        if not rs:
            continue
        y = np.array([r["win"] for r in rs])
        cols, names = [], []
        for st in ("STR", "DEX", "CON", "WIS"):  # INT/CHA are inert, kept as linear controls below
            idx = STATS.index(st)
            for lvl in (0, 1, 2):
                cols.append([1.0 if r["mods"][idx] == lvl else 0.0 for r in rs])
                names.append((st, lvl))
        for st in ("INT", "CHA"):
            idx = STATS.index(st)
            cols.append([float(r["mods"][idx]) for r in rs])
            names.append((st, "lin"))
        X = np.array(cols).T
        beta, se_, r2 = ols(X, y)
        table = {n: (b, e) for n, b, e in zip(names, beta[1:], se_[1:])}
        print(f"  {sec:12s} (R2 {r2:.2f})")
        for st in ("STR", "DEX", "CON", "WIS"):
            cells = "   ".join(f"{('+' if lvl > 0 else '') + str(lvl)}: {100*table[(st, lvl)][0]:+6.1f}" for lvl in (0, 1, 2))
            print(f"      {st}  {cells}")

    print("\n== mean win rate by modifier level, pooled over all items ==")
    for i, name in enumerate(STATS):
        line = []
        for m in (-1, 0, 1, 2):
            w = [r["win"] for r in rows if r["mods"][i] == m]
            line.append(f"{m:+d}: {100*np.mean(w):5.1f}%")
        print(f"  {name}  " + "   ".join(line))

    print("\n== best stat block per Secondary (win rate vs the random field) ==")
    for sec, rs in ranking:
        top = max(rs, key=lambda r: r["win"])
        st = top["stats"]
        print(f"  {sec:12s} {100*top['win']:5.1f}%   STR {st['strength']:2d} DEX {st['dexterity']:2d} CON {st['constitution']:2d} INT {st['intelligence']:2d} WIS {st['wisdom']:2d} CHA {st['charisma']:2d}")
    for sec in ("none", "longsword", "mace", "roundshield", "towershield", "belt2"):
        rs = sorted(by_sec.get(sec, []), key=lambda r: -r["win"])
        if not rs:
            continue
        print(f"\n== {sec}: top 6 / bottom 4 stat blocks (STR DEX CON INT WIS CHA scores) ==")
        for r in rs[:6] + rs[-4:]:
            st = r["stats"]
            print(f"  {st['strength']:2d} {st['dexterity']:2d} {st['constitution']:2d} {st['intelligence']:2d} {st['wisdom']:2d} {st['charisma']:2d}   win {100*r['win']:5.1f}%  rounds {r['rounds']:4.1f}  dealt {r['dmgDealt']:5.1f}  taken {r['dmgTaken']:5.1f}  hunkerHeal {r['hunkerHeal']:5.1f}")

    print("\n== does initiative matter? win rate when acting first vs second (pooled) ==")
    f = [r["firstWin"] for r in rows if r["firstWin"] is not None]
    print(f"  acting first: {100*np.mean(f):.1f}%   (second = {100*(2*np.mean([r['win'] for r in rows]) - np.mean(f)):.1f}%)")


if __name__ == "__main__":
    main(sys.argv[1])
