# Planet & Star Image Prompts

Prompts for **hyper-realistic** AI image generators (Midjourney, DALL·E / GPT-image, Flux, Stable Diffusion, Imagen…) for every
world and star on the Galaxy Map (`/galaxy`). Descriptions are drawn from `client/src/planetData.js`
and `docs/the-three-clusters-player-facing.md`.

## How the images get into the app

1. Generate each image **landscape, 16:9** (the detail panel crops to ~16:10, so keep the subject
   near the centre and leave the edges as "breathing room").
2. Save as **JPG**, ~1280×720 or 1600×900, named exactly as the **File** line under each prompt.
3. Drop them in `client/public/planets/`.

That's it — clicking a world (or a cluster's star) on the Galaxy Map shows its image at the top
of the detail panel. If a file is missing, the panel simply shows text only, so you can add
images one at a time.

> Filenames are the world name lower-cased, apostrophes dropped, other punctuation → `-`
> (`Vorn's Forge` → `vorns-forge.jpg`). Stars are `star-threxa.jpg`, `star-verrin.jpg`, `star-kaeth.jpg`.

## Shared style (already included in every prompt below)

Every prompt below already ends with this style block, so you can copy and paste it as-is. It's listed here for reference or tweaking. Using one block keeps all 20 images looking like they belong to the same campaign.

```
Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens,
photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading,
large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance,
8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark,
16:9 landscape composition, subject centred with soft margins
```

**Negative prompt** (for tools that support one): `glowing yellow dots, specks, speckles, sparkles, tiny lights, dust motes, noise, film grain, over-detailed, busy texture, illustration, painting, cartoon, 3d render, text, letters, watermark, UI, frame, border, blurry, low resolution, oversaturated, cropped subject`

**Lighting rule per cluster** — this is what makes the star chart feel coherent:

| Cluster | Star | Light on the surface |
| --- | --- | --- |
| Threxa Combine | Dying red giant | Dim, heavy **red-orange** sun, huge in the sky, long ember shadows |
| Verrin Concord | Close binary pair | **Two suns** (one slightly larger, white-gold + pale blue), soft double shadows |
| Kaeth Dominion | Black-hole accretion disc | Pale, cold, restless light; a **glowing amber-violet ring** hanging in the sky |
| Unclaimed | None | Dark open space, distant faint stars, cold rim-light |

---

## Stars (shown when you click a cluster's star)

### The Threxa Combine — red giant
**File:** `star-threxa.jpg`
```
A dying red giant star filling a third of the frame, its bloated surface a churning mass of molten orange and dark crimson convection cells, huge looping prominences arcing off the edge into black space, faint dust and ember glow around it, a couple of distant planets silhouetted in the foreground orbit, ominous and ancient mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### The Verrin Concord — binary pair
**File:** `star-verrin.jpg`
```
A close binary star pair locked in orbit, one larger white-gold star and one smaller pale-blue star, a luminous bridge of plasma streaming between them, soft lens-flare glow, delicate gas-cloud filaments in teal and amber behind them, a couple of bright planets catching double light in the foreground, calm, wealthy, welcoming mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### The Kaeth Dominion — black hole
**File:** `star-kaeth.jpg`
```
A supermassive black hole seen at a slight tilt, a perfectly black event horizon ringed by a thin, brilliant accretion disc glowing amber to violet, gravitationally lensed light bending over the top and under the bottom, faint violet haze, three large angular warships holding formation in the foreground, cold, militaristic, awe-inspiring mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

---

## Threxa Combine (red giant, dim red sky)

### Cindrath
*Volcanic fleet-command world — warden training grounds.*
**File:** `cindrath.jpg`
```
A volcanic planet surface of black glass ridges and slow rivers of glowing lava, ash-fall drifting through the air, tall jagged command spires rising from the ash like teeth lit orange from below, a squad of wardens drilling on an obstacle course laid across a cooling lava flow field, an enormous dim red giant sun low on the horizon, threatening and disciplined mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Pyrsis Barrens
*Geyser labour-camp world.*
**File:** `pyrsis-barrens.jpg`
```
A flat, scalding expanse of mineral-crusted ground in pale ochre and rust, dozens of geysers erupting columns of steam, low rolling fog swallowing the distance, grim barracks and watchtowers half hidden in the steam, a single line of workers in the middle distance, a huge dim red sun glowing through the vapour, bleak and oppressive mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Ashfall Rift
*Geothermal mountain world worked by an occupied population.*
**File:** `ashfall-rift.jpg`
```
Steep volcanic mountains scarred with glowing fissures venting steam and heat, rope-bridges and terraces strung between ridgelines, mining platforms clinging to cliffs above sulphur-yellow seams, heavy drifting ash clouds, a distant guard tower with an angular red banner, a dim red sun smouldering behind the peaks, weary, sulphurous mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Vorn's Forge
*Industrial shipyard world where captured slugs are bonded.*
**File:** `vorns-forge.jpg`
```
A vast industrial shipyard world, enormous half-built starship hulls in gantry cradles, cargo lifters hauling armoured plates, massive processing halls glowing furnace-orange, chimneys and cooling towers venting smoke into a rust-red sky, rows of reinforced slug-transport containers being loaded onto freighters, steel-grey and ember palette, relentless, loud, mechanical mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### The Wellspring
*Combine capital built in ruins older than the Combine; the Grand Coliseum.*
**File:** `the-wellspring.jpg`
```
A sprawling capital city built into the ruins of a vast ancient civilisation, towering weathered stone halls and colossal columns older than the city around them, at the centre a gigantic open-air coliseum with banners and broadcast drones circling above it, golden light spilling from the arena, a swollen red sun overhead, grand, imperial, spectacle-driven mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Kessa-9
*Open grassland hunting reserve — no roads, towers or settlements.*
**File:** `kessa-9.jpg`
```
A limitless sea of tall wind-bent grass in olive and gold rolling to every horizon, no roads and no buildings, one small hunting party on foot far in the distance, a dim blood-red sky with a huge red sun low and heavy, long dramatic shadows, dark shapes of wild creatures moving through the grass, eerie, quiet, predatory mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

---

## Verrin Concord (binary pair, soft double light)

### Virid Canopy
*Dense jungle resource concession.*
**File:** `virid-canopy.jpg`
```
A dense alien jungle world, endless emerald canopy with glowing blue and violet flowers, towering trees draped in vines, a narrow extraction road cut through the forest and already being reclaimed by green, a few harvesting rigs among the giant trunks, shafts of light from two suns piercing the mist, lush, humid, quietly dangerous mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Solenne
*Agricultural world feeding the Lattice.*
**File:** `solenne.jpg`
```
Wide golden-green cultivated fields and stepped orchard terraces rolling over gentle hills, irrigation channels glittering, tall wind-turbines and low farmsteads, grain-hauler skiffs drifting low over the crops, a warm hazy sky with two suns (one larger white-gold, one smaller pale blue) casting soft double shadows, peaceful, pastoral, abundant mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Maren's Deep
*Ocean world with floating city-states.*
**File:** `marens-deep.jpg`
```
A planet-wide ocean with no land, graceful floating city-states of white domes, spires and rope bridges riding the gentle swell, sailing vessels and low barges between them, silver light from two suns scattering across open water, a faint second sun reflection, towering storm clouds on the horizon, deep teal and sapphire palette, elegant, ancient, independent mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Aurelia Docks
*Neutral shipyard-and-market world.*
**File:** `aurelia-docks.jpg`
```
A sprawling neutral port-world, huge landing platforms and tiered market districts stacked along a coast, ships of every faction docked side by side (angular red Threxan hulls, sleek Concord traders, blocky grey Dominion cruisers), colourful market awnings, a few shuttles in the skyways, warm hazy light from a binary sun pair, busy, cosmopolitan, slightly shady mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Kethrun Reach
*Finance and shipping-law world.*
**File:** `kethrun-reach.jpg`
```
A world of tall slate-teal towers, vaulted court halls and endless archive spires linked by glass sky-bridges, a few robed figures crossing marble plazas, giant ledger-like façades with bold geometric patterns, cool even light from a distant binary pair, perfectly symmetrical composition, orderly, cold, scrupulously fair mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

---

## Kaeth Dominion (black-hole accretion disc, pale restless light)

### Marrek's Hold
*Swamp world under military occupation.*
**File:** `marreks-hold.jpg`
```
A murky swamp world of dark green water and twisted dead-grey trees, fog hanging low, raised patrol causeways and checkpoint watchtowers cutting across the wetlands, two armoured troop skiffs gliding between them, faint toxic green haze, an amber-violet accretion ring glowing in the sky above the mist, oppressive, occupied, claustrophobic mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Drennow Yards
*Asteroid-belt shipyard complex building warships.*
**File:** `drennow-yards.jpg`
```
A drifting asteroid belt strung with docking scaffolds, floating foundries, a half-built angular grey warship hull in a gantry cradle at the centre, a few cargo tugs between large rock fragments, deep shadow between the asteroids lit only by the distant amber-violet glow of a black hole accretion disc, cold metal, industrial and militaristic mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Vhalden
*Wind-scoured conscript training world.*
**File:** `vhalden.jpg`
```
A harsh, wind-scoured plateau of tan and brown rock, long obstacle ranges, climbing walls and trench lines scarring the terrain to the horizon, a few ranks of conscripts in identical grey uniforms running drills, dust and sand streaming across the frame, cold twilight sky with a faint amber-violet ring low on the horizon, bleak, punishing, disciplined mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Ossuary Station
*Fortified border outpost facing Threxa space.*
**File:** `ossuary-station.jpg`
```
A fortified border outpost on a dark asteroid, bristling with sensor dishes and gun emplacements, grey-black armour plating with angular watch towers, two searchlight beams sweeping across empty space, one large drifting wreckage section nearby, distant red glow of Threxan space on one side and the violet glow of the accretion disc on the other, grim, vigilant, haunted mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

### Kaeloth Prime
*Icebound homeworld and military capital.*
**File:** `kaeloth-prime.jpg`
```
An icebound world of glacier-blue ice sheets and frozen oceans, low armoured cities built flat and hunkered against the cold, disciplined grid of streets with one column of soldiers marching, pale restless light from a huge amber-violet accretion ring arching across the sky, long blue shadows, frost haze, beautiful, silent, absolutely disciplined mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

---

## Unclaimed Space

### The Threshold
*Derelict-hull graveyard between the clusters.*
**File:** `the-threshold.jpg`
```
A vast graveyard of derelict starship hulls drifting in open space, a dozen enormous broken ships of all three factions' designs tangled together like a reef, a couple of scavenger workships cutting parts from the wrecks, a few improvised habitats clinging to the hulls, shafts of cold light from far-off stars, deep black space with faint nebula, lawless, lonely, resourceful mood. Style: hyper-realistic cinematic photograph, shot on a full-frame cinema camera with a 24mm lens, photorealistic materials, physically based lighting, volumetric atmosphere, natural film colour grading, large clean readable shapes with smooth surfaces and restrained detail, soft depth of field in the distance, 8k, no glowing dots, no specks, no sparkles, no tiny scattered lights, no noise, no text, no logos, no watermark, 16:9 landscape composition, subject centred with soft margins
```

---

## Tips

- **Consistency:** in Midjourney, generate Cindrath first, then reuse it with `--sref <image url>`
  for the rest so the look stays identical. In GPT-image / Flux, keep the shared
  style text at the end of each prompt word-for-word.
- **From orbit instead of surface:** if you'd rather show each world as a sphere in space, replace the
  first sentence of any prompt with `The planet [Name] seen from orbit as a full globe against black
  space, atmosphere glowing along its edge,` and keep the rest as the surface description.
- **Fixing a bad crop:** the panel uses `object-fit: cover`, so anything near the very top/bottom edge
  may be trimmed — regenerate with "subject centred, generous margins" if so.
