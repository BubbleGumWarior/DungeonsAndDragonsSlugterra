#!/usr/bin/env bash
# Where does CON's / DEX's value come from? Switch one channel off for everyone and re-measure.
#   SIM_OUT=<dir> bash scripts/combat-sim/run_ablate.sh ; python scripts/combat-sim/analyze_robust.py <dir> ablate
set -e
cd "$(dirname "$0")/../.."
COMMON="field=200 sample=400 secs=none,longsword,roundshield"
run() { name=$1; shift; node scripts/combat-sim/exp_landscape.mjs $COMMON "$@" out=ablate_${name}.json 2>&1 | tail -1 | sed "s/^/[$name] /"; }
run base
run noConGrit     ablate=conGrit
run noConKO       ablate=conKO
run noConHunker   ablate=conHunker
run noConAny      ablate=conGrit,conKO,conHunker
run noDexAP       ablate=dexAP
run noDexDC       ablate=dexDC
run noDexInit     ablate=dexInit
run noDexSkills   ablate=dexSkills
run noDexAny      ablate=dexAP,dexDC,dexInit,dexSkills
echo done
