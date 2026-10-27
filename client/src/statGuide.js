// Player-facing notes on what each stat and skill does for you in this world.
// Plain language, no numbers -- the exact rules live on the server. Keep these
// in step with the rules when a skill gains (or loses) a job.
//
// `summary` is the stat's own pull; `hiddenSummary` is the pre-reveal version,
// which has to read like an ordinary modern-day campaign (no slugs, blasters or
// worlds), so that view shows the stat summaries only.
// A skill with no `benefit` has no mechanical job yet -- the guide says the DM
// calls for it when the story needs it.

export const STAT_GUIDE = [
  {
    key: "strength",
    summary: "Swings land harder and more often with a melee weapon, and a strong arm makes the most of a heavy one.",
    hiddenSummary: "Hit harder in a scrap and carry more of the load.",
    skills: {
      athletics: "Cover more ground every time you move in a fight.",
    },
  },
  {
    key: "dexterity",
    summary: "You act earlier, get more done in a turn, and are harder to hit. It also adds a little to how much you can take.",
    hiddenSummary: "Quicker reactions, steadier hands, and harder to hit.",
    skills: {
      acrobatics: "Dodge incoming shots, sidestep blasts, and run along walls for less effort.",
      sleightOfHand: "Reload faster, so more of your turn goes into shooting.",
      stealth: "Slip out of sight mid-fight and strike from hiding.",
      piloting: null,
    },
  },
  {
    key: "constitution",
    summary: "Your staying power: more Grit to burn through, a better chance of staying on your feet, and bigger heals when you Patch Up.",
    hiddenSummary: "Shrug off knocks and stay on your feet longer.",
    skills: {
      fortitude: "Every point of Fortitude stretches the range of temperatures your outfit is comfortable in by 5 degrees at both ends, so you can wear it on colder and hotter worlds without paying for it.",
    },
  },
  {
    key: "intelligence",
    summary: "The stat behind knowledge. It powers the skills that make slug hunts pay off, and the lore the DM calls on when you study the past.",
    hiddenSummary: "Knowledge and know-how, the stat behind research and lore.",
    skills: {
      nature: "Earns you more slug hunts every time the party rests. Without it, all you'll ever turn up is Floppers.",
      arcana: "Tips a slug hunt toward rarer finds.",
      history: null,
      splicing: null,
      engineering: "Work on the ship's compartments, and make Repair Kits mend a worn blaster.",
      astrogation: null,
    },
  },
  {
    key: "wisdom",
    summary: "Instinct and awareness. It's how you read a fight, look after your slugs, and live off the land.",
    hiddenSummary: "Awareness and instinct, for spotting trouble and handling animals.",
    skills: {
      creatureHandling: "Find wild slugs on a hunt, feed your own better, and earn your slugs' trust faster as you fire them.",
      insight: "At the start of a fight, read a foe and learn which slugs they carry. Miss, and you only learn them as they fire.",
      perception: "Spot a shot early enough to answer it, and see through foes who are hiding.",
      medicine: "Patch up a friend in a fight for less of your turn.",
      survival: "Forage while the party sleeps: every long rest you turn up Slug Kibble, as long as your Survival is above zero.",
    },
  },
  {
    key: "charisma",
    summary: "Force of personality. It earns you better deals at the market and a few tricks that rattle or impress a crowd.",
    hiddenSummary: "Persuasion and presence, for talking your way through.",
    skills: {
      persuasion: "Haggle prices down at the market.",
      intimidation: "Rattle a foe so they have less to spend on their next turn.",
      performance: "Fire with flair for a chance at extra Fame.",
      deception: "Keep your name quiet: Heat climbs more slowly than your Fame does.",
    },
  },
];
