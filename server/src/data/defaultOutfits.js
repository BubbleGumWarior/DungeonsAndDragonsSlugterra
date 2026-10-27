// The default outfit catalog (masculine clothing, text only). Seeded once per
// name by seedDefaultOutfits.js; a DM-edited row is never overwritten.
//
//   name / desc     what the player reads
//   min / max       comfort range in degrees Celsius
//   g               extra max Grit
//   mv              walking distance change, percent (negative = bulky)
//   ap              AP per turn change
//   ac              accuracy change on every attack roll
//   price           credits; left out, it is derived from the range and Grit
//   everywhere      sold on all 17 worlds
//   also            extra world indexes that stock it, beyond the climate rule
//   starter         handed to every character, never sold
//
// Where it is sold (unless `everywhere`/`also`): a world whose temperature lies
// within the comfort range widened by SELL_MARGIN degrees may stock it, and
// whether it does is a fixed per-world "local stock" roll (seedDefaultOutfits.js)
// so neighbouring worlds don't sell the same racks. The deep-cold worlds
// (below ALWAYS_STOCK_BELOW) skip the roll: there is little to choose from.
// Worlds are indexed as in planetRules.js PLANET_TEMPS.
export const SELL_MARGIN = 6;
export const ALWAYS_STOCK_BELOW = -60;
export const STOCK_CHANCE_INSIDE = 70; // percent, when the world is inside the comfort range
export const STOCK_CHANCE_MARGIN = 35; // percent, when it is only just outside

export const DEFAULT_OUTFITS = [
  // ---- Everyday ------------------------------------------------------------
  { name: "Museum Tour Outfit", desc: "Plain jeans, worn trainers and a short-sleeve tee with a museum's logo across the chest. Comfortable for a day indoors and not much else.", min: 12, max: 28, starter: true },
  { name: "Denim and Tee", desc: "Dark jeans, a plain cotton tee and canvas shoes. Goes anywhere mild.", min: 10, max: 30 },
  { name: "Casual Hoodie and Chinos", desc: "A grey zip hoodie over a cotton tee, with khaki chinos.", min: 6, max: 24 },
  { name: "Flannel Work Shirt and Jeans", desc: "Heavy flannel and hard-wearing jeans. The padding turns a glancing blow.", min: 4, max: 24, g: 1 },
  { name: "Button-Up and Slacks", desc: "A pressed oxford shirt, slacks and leather shoes. Smart, light and no use in a scrap.", min: 14, max: 28 },
  { name: "Cargo Pants and Henley", desc: "A ribbed henley and cargo pants with pockets for everything.", min: 6, max: 26 },
  { name: "Bomber Jacket Kit", desc: "A padded bomber jacket, a tee and sturdy trousers.", min: 0, max: 20 },
  { name: "Denim Jacket and Boots", desc: "A lined denim jacket, jeans and broken-in work boots.", min: 2, max: 22 },
  { name: "Tracksuit", desc: "A loose zip-up track top and bottoms. Nothing restricts your stride.", min: 8, max: 28, mv: 5 },
  { name: "Tailored Suit", desc: "A charcoal two-piece suit, shirt and tie. Looks the part at a meeting, not a firefight.", min: 14, max: 27 },
  { name: "Smart Casual Blazer", desc: "A navy blazer over an open-collar shirt and dark trousers.", min: 12, max: 27 },
  { name: "Dinner Jacket and Tie", desc: "A black dinner jacket, white shirt and bow tie. Strictly for formal evenings.", min: 14, max: 26 },

  // ---- Warm ----------------------------------------------------------------
  { name: "Gym Shorts and Tank", desc: "A sleeveless training top and shorts. Cool, and easy to move in.", min: 18, max: 36, mv: 5 },
  { name: "Linen Shirt and Shorts", desc: "A loose linen shirt, tailored shorts and sandals.", min: 20, max: 38 },
  { name: "Surf Shorts and Tee", desc: "Quick-dry board shorts, a thin tee and flip-flops.", min: 22, max: 40 },
  { name: "Light Cargo Vest Set", desc: "A many-pocketed vest over a thin shirt, with light trousers.", min: 18, max: 36, g: 1 },
  { name: "Sun Hat and Safari Kit", desc: "A wide-brimmed hat, vented shirt and ripstop shorts.", min: 18, max: 44, g: 1 },
  { name: "Mesh Cooling Vest Set", desc: "A coolant-weave vest and thin trousers that pull heat off the skin.", min: 24, max: 46 },
  { name: "Loose Desert Robes", desc: "Layered cotton robes and a head wrap that keep sun and sand off the skin.", min: 26, max: 50, g: 1 },
  { name: "Sandstorm Layers", desc: "Goggles, a face cloth and breathable layers sealed at the wrists.", min: 20, max: 48, g: 1 },
  { name: "Ashwalker Duster", desc: "A long scorch-proofed duster, mask and boots for fallout and cinders.", min: 24, max: 50, g: 2, mv: -5 },
  { name: "Heat-Reflective Coveralls", desc: "Foil-bright coveralls that bounce radiant heat away.", min: 32, max: 58, g: 3, mv: -5 },
  { name: "Foundry Apron and Leathers", desc: "A thick leather apron, gauntlets and a face shield. Heavy, and it works.", min: 30, max: 62, g: 5, mv: -10 },
  { name: "Ceramic-Weave Heat Suit", desc: "A full ceramic-fibre suit for standing next to open furnaces. Stiff and slow.", min: 40, max: 75, g: 6, mv: -15 },

  // ---- Cold ----------------------------------------------------------------
  { name: "Wool Sweater and Corduroys", desc: "A chunky knit sweater, corduroys and wool socks.", min: -6, max: 16 },
  { name: "Thermal Base Layers", desc: "Long thermal underwear under a plain shirt and trousers. Thin enough to move freely.", min: -14, max: 12 },
  { name: "Fleece-Lined Work Jacket", desc: "A canvas work jacket with a fleece lining, gloves and a beanie.", min: -10, max: 14, g: 2 },
  { name: "Quilted Work Vest and Jeans", desc: "A quilted vest, flannel shirt and lined jeans.", min: -8, max: 20, g: 1 },
  { name: "Heated Vest Rig", desc: "A battery-heated vest under a shell jacket. The pack is a nuisance.", min: -26, max: 8, mv: -5 },
  { name: "Insulated Parka Set", desc: "A hooded insulated parka, snow trousers and boots.", min: -25, max: 10, g: 2, mv: -5 },
  { name: "Down Overcoat", desc: "A knee-length down overcoat, scarf and gloves.", min: -35, max: 4, g: 1, mv: -10 },
  { name: "Frostwarden Coat Set", desc: "A thick storm coat, over-trousers and a fur-lined hood.", min: -45, max: 5, g: 3, mv: -10 },
  { name: "Cold-Weather Combat Fatigues", desc: "Layered, padded fatigues with ceramic plates sewn in.", min: -30, max: 15, g: 4, mv: -5 },
  { name: "Arctic Expedition Gear", desc: "Triple-layer expedition clothing with a sealed hood and mitts.", min: -50, max: 0, g: 4, mv: -15 },
  { name: "Polar Survey Suit", desc: "A one-piece powered-heat suit built for the long dark.", min: -70, max: -5, g: 5, mv: -20, also: [12] },
  { name: "Cryo-Cell Insulated Suit", desc: "A bulky vacuum-insulated suit with a rebreather. You waddle.", min: -110, max: -30, g: 6, mv: -25, ap: -1 },
  { name: "Deep-Cold Pressure Rig", desc: "A rigid, heated pressure rig for the coldest places anyone lives.", min: -150, max: -60, g: 8, mv: -35, ap: -2, also: [16] },

  // ---- Work and travel -----------------------------------------------------
  { name: "Mechanic Coveralls", desc: "Oil-stained coveralls with reinforced knees and a tool loop.", min: 8, max: 30, g: 2 },
  { name: "Cargo Hauler Overalls", desc: "Heavy overalls, a back brace and steel-toed boots.", min: 5, max: 32, g: 2, mv: -5 },
  { name: "Dock Worker's Waterproofs", desc: "A hi-vis waterproof jacket and trousers with grip boots.", min: 8, max: 32, g: 1, mv: -5 },
  { name: "Pilot's Flight Jacket Kit", desc: "A shearling flight jacket, gloves and goggles.", min: -5, max: 24, g: 1 },
  { name: "Trader's Long Coat", desc: "A long weatherproof coat with deep inside pockets.", min: -5, max: 20, g: 1 },
  { name: "Leather Jacket and Jeans", desc: "A scuffed leather jacket, a tee and dark jeans.", min: 2, max: 24, g: 1 },
  { name: "Hiker Trail Gear", desc: "A shell jacket, trail trousers and a day pack.", min: -10, max: 28, g: 2 },
  { name: "Rain Slicker and Waders", desc: "A yellow slicker and hip waders for wet ground.", min: 5, max: 30, mv: -5 },
  { name: "Smuggler's Duster", desc: "A long coat with hidden pockets, a scarf and rugged boots.", min: -10, max: 30, g: 2, mv: -5 },
  { name: "Scavenger Patchwork", desc: "A patched-together coat and trousers from whatever turned up. Cheap and ugly.", min: -10, max: 32, g: 1 },
  { name: "Rugged Field Fatigues", desc: "Hard-wearing fatigues with knee and elbow pads.", min: 0, max: 28, g: 3 },
  { name: "Enforcer Riot Padding", desc: "Ballistic padding, shin guards and a helmet. Very safe, very clumsy.", min: 5, max: 30, g: 6, mv: -15, ap: -1 },

  // ---- Vacuum --------------------------------------------------------------
  { name: "Vacuum Pressure Undersuit", desc: "A skin-tight pressure undersuit with a rebreather hood. Handles a wide spread of temperatures and some vacuum.", min: -100, max: 70, g: 4, mv: -30, ap: -1, also: [16] },
  { name: "EVA Space Suit", desc: "A full hard-shell spacesuit with its own climate system. Comfortable at any temperature there is, but severely restricts your movement.", min: -273, max: 1000, g: 10, mv: -50, ap: -2, price: 900, everywhere: true },
];
