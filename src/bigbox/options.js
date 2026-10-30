// Inside The Big-Box: dice faces. Source: the "INSIDE THE BOX(STORE)" sheet.
// Edit freely. Prompts read after "Shopping for", so they shouldn't start with "For".
window.BIGBOX = {
  shopping: [
    "6 months on a deserted island",
    "Entire design for a high-concept Hamlet",
    "Kindergarten show & tell",
    "Apocalypse bunker",
    "Last minute Halloween costume",
    "Last minute wedding gift",
    "Last minute baby shower gift",
    "Running a fake-antique scam",
    "Fashion statement piece",
    "A wistful keepsake for your spouse after you die tragically",
    "Week-long road trip",
    "Entire production design for a student short film",
    "Something old, something new, something borrowed, and something blue",
    "Leaving on a doorstep as a threat",
    "Dinner party table statement piece",
    "Last minute housewarming gift",
    "Last minute graduation gift",
    "Entire production design for a Fringe solo show",
    "Entire design for a high-concept Newsies",
    "Explaining human life to an alien",
    "Entertaining a child for hours",
    "Getting the most sick you've ever been",
    "Explaining modern life when you go back in time",
    "Last minute birthday gift for your friend with the initial [X]",
    "Decorating a whole house for a [Holiday] party",
    "When your time machine breaks down in [era]",
    "Tea with the Queen"
  ],
  constraints: [
    "50¢",
    "$5",
    "$10",
    "$20",
    "$50",
    "$75",
    "$100 (must spend)",
    "$500 (must spend)",
    "$5000 (must spend)",
    "Must require ID to purchase",
    "As much as you can carry in one hand",
    "As much as you can carry in your arms",
    "As much as you can fit in your trunk",
    "One item you can see without moving right now"
  ],
  // Variable blanks: each roll picks one value and shows it on a tab on the card.
  fillers: {
    "[X]": "ABCDEFGHIJKLMNOPRSTW".split(""),
    "[Holiday]": ["Halloween", "Thanksgiving", "Christmas", "Hanukkah", "Easter", "Fourth of July", "Valentine's Day", "New Year's Eve"],
    "[era]": ["the Stone Age", "ancient Egypt", "ancient Rome", "the Middle Ages", "the Wild West", "the 1920s", "the 1980s", "the far future"]
  },
  tabs: { "[X]": "Initial", "[Holiday]": "Holiday", "[era]": "Era" },
  headings: ["Shopping for", "Constraint"]
};
