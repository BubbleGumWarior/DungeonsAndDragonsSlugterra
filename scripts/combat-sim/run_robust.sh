#!/usr/bin/env bash
# Re-runs a reduced stat landscape under different loadouts / start distances / play styles so the
# conclusions can be checked for robustness.   SIM_OUT=<dir> bash scripts/combat-sim/run_robust.sh
set -e
cd "$(dirname "$0")/../.."
COMMON="field=200 sample=400 secs=none,shortsword,longsword,mace,rapier,roundshield,towershield,belt2"
run() { name=$1; shift; node scripts/combat-sim/exp_landscape.mjs $COMMON "$@" out=robust_${name}.json 2>&1 | tail -1 | sed "s/^/[$name] /"; }

run base
run heavy      loadout=heavy
run nodot      loadout=nodot
run wild       loadout=wild
run bonded     loadout=bonded
run pistol     loadout=pistol
run repeater   loadout=repeater
run sniper     loadout=sniper
run dist250    dist=250
run dist900    dist=900
run noKite     policy=noKite
run noReserve  policy=noReserve
run noReactions policy=noReactions
run noHunkerLeftover policy=noHunkerLeftover
run eagerHunker policy=eagerHunker
run stubborn   policy=stubborn
run noFirstAid policy=noFirstAid
echo done
