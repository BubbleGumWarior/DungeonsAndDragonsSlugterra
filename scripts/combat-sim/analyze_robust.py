"""Compares the key effects across the robustness runs (robust_*.json from run_robust.sh).

    python scripts/combat-sim/analyze_robust.py <dir containing robust_*.json>
"""
import glob
import json
import os
import sys
from collections import defaultdict

import numpy as np

STATS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]


def level_effects(rs, stat, lvl):
    """Mean win-rate difference between patterns with this stat at `lvl` and at -1, holding the rest
    to the pattern distribution via regression on dummies for every stat level."""
    y = np.array([r["win"] for r in rs])
    cols, names = [], []
    for st in ("STR", "DEX", "CON", "WIS"):
        i = STATS.index(st)
        for l in (0, 1, 2):
            cols.append([1.0 if r["mods"][i] == l else 0.0 for r in rs])
            names.append((st, l))
    for st in ("INT", "CHA"):
        i = STATS.index(st)
        cols.append([float(r["mods"][i]) for r in rs])
        names.append((st, "lin"))
    X = np.column_stack([np.ones(len(y))] + [np.array(c) for c in cols])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return dict(zip([("c", 0)] + names, beta))[(stat, lvl)] * 100


def main(d, prefix="robust"):
    files = sorted(glob.glob(os.path.join(d, prefix + "_*.json")), key=lambda f: (os.path.basename(f) != prefix + "_base.json", os.path.basename(f)))
    cols = [
        ("CON+2 (no 2nd)", None), ("DEX+2 (no 2nd)", None), ("STR+2 (longsword)", None),
        ("tower", "towershield"), ("round", "roundshield"), ("belt2", "belt2"),
        ("longsw", "longsword"), ("shortsw", "shortsword"), ("mace", "mace"), ("rapier", "rapier"),
    ]
    print("effects in percentage points of win rate vs the random field (gain of each item = same stat blocks with vs without it)\n")
    print("variant".ljust(18) + "".join(c[0].rjust(19 if i < 3 else 9) for i, c in enumerate(cols)) + "   best-item (mean)")
    for f in files:
        name = os.path.basename(f)[len(prefix) + 1:-len(".json")]
        data = json.load(open(f))
        by = defaultdict(dict)
        for r in data["rows"]:
            by[r["sec"]][tuple(r["mods"])] = r["win"]
        none = by["none"]
        rs_none = [r for r in data["rows"] if r["sec"] == "none"]
        rs_long = [r for r in data["rows"] if r["sec"] == "longsword"]
        vals = [level_effects(rs_none, "CON", 2), level_effects(rs_none, "DEX", 2), level_effects(rs_long, "STR", 2)]
        gains = {}
        for sec in by:
            if sec == "none":
                continue
            gains[sec] = np.mean([by[sec][m] - none[m] for m in none if m in by[sec]]) * 100
        for _, sec in cols[3:]:
            vals.append(gains.get(sec, float("nan")))
        best = max(gains, key=gains.get)
        means = {sec: np.mean(list(v.values())) * 100 for sec, v in by.items()}
        line = name.ljust(18)
        for i, v in enumerate(vals):
            line += f"{v:+{19 if i < 3 else 9}.1f}"
        line += f"   {best} ({gains[best]:+.1f})"
        print(line)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "robust")
