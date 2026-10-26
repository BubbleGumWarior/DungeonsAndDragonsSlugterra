"""Reads exp_paired.mjs output and prints the average change in win rate (percentage points) each
variant makes versus the baseline, for the same stat blocks and Secondary item.

    python scripts/combat-sim/analyze_paired.py paired_skills.json
"""
import json
import sys
from collections import defaultdict

import numpy as np


def main(path):
    data = json.load(open(path))
    rows = data["rows"]
    variants = []
    for r in rows:
        if r["variant"] not in variants:
            variants.append(r["variant"])
    base_name = variants[0]
    # the intimidation variants are judged against their own baseline
    base_for = {v: base_name for v in variants}
    for v in variants:
        if "[uses Intimidate]" in v:
            base_for[v] = next(x for x in variants if x.startswith("baseline") and "[uses" in x)

    cell = {}  # (pi, sec, variant) -> win
    for r in rows:
        cell[(r["pi"], r["sec"], r["variant"])] = r["win"]
    secs = sorted({r["sec"] for r in rows})
    patterns = {r["pi"]: r["mods"] for r in rows}

    def viable(pi):
        m = patterns[pi]
        return m[1] >= 1 and m[2] >= 1  # DEX and CON both at +1 or better

    print(f"set={data['set']} loadout={data['loadout']} dist={data['startDist']} field={data['fieldSize']}  stat patterns={len(patterns)}  viable (DEX>=+1 & CON>=+1)={sum(viable(p) for p in patterns)}")
    for group, keep in (("ALL stat patterns", lambda p: True), ("VIABLE patterns (DEX>=+1, CON>=+1)", viable)):
        print(f"\n== {group}: change in win rate vs baseline (pp), paired, mean ± 95% CI ==")
        print("  " + "variant".ljust(34) + "".join(s.rjust(16) for s in secs))
        for v in variants:
            if v == base_for[v]:
                continue
            cells = []
            for s in secs:
                d = [cell[(p, s, v)] - cell[(p, s, base_for[v])] for p in patterns if keep(p) and (p, s, v) in cell and (p, s, base_for[v]) in cell]
                if not d:
                    cells.append("-".rjust(16))
                    continue
                d = np.array(d) * 100
                cells.append(f"{d.mean():+6.2f}±{1.96 * d.std(ddof=1) / np.sqrt(len(d)):4.2f}".rjust(16))
            print("  " + v.ljust(34) + "".join(cells))


if __name__ == "__main__":
    main(sys.argv[1])
