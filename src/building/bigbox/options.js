// Inside The Big-Box: dice faces. Source: the "INSIDE THE BOX(STORE)" sheet.
// Edit freely. [X], [Holiday] and [era] get filled in randomly on each roll (see FILLERS).
window.BIGBOX = {
  shopping: [
    "6 months on a deserted island",
    "Entire design for a high-concept Hamlet",
    "Kindergarten show & tell",
    "Apocalypse bunker",
    "Last minute Halloween costume",
    "Last minute wedding gift",
    "Last minute baby shower gift",
    "For running a fake-antique scam",
    "Fashion statement piece",
    "As a wistful keepsake for your spouse after you die tragically",
    "Week-long road trip",
    "Entire production design for a student short film",
    "Something old, something new, something borrowed, and something blue",
    "For leaving on a doorstep as a threat",
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
    "For when your time machine breaks down in [era]",
    "For tea with the Queen"
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
  fillers: {
    "[X]": "ABCDEFGHIJKLMNOPRSTVW".split(""),
    "[Holiday]": ["Halloween", "Thanksgiving", "Christmas", "Hanukkah", "Diwali", "Lunar New Year", "Fourth of July", "Easter", "Passover", "Eid", "Mardi Gras", "Valentine's Day", "Kwanzaa", "New Year's Eve"],
    "[era]": ["the Stone Age", "ancient Rome", "the Wild West", "the 1920s", "the Middle Ages", "the 1980s", "Victorian London", "ancient Egypt", "the Renaissance", "the far future", "the Jazz Age", "feudal Japan"]
  },
  headings: ["Shopping for", "Constraint"]
};
