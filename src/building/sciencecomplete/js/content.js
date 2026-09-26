// Science Complete: everything that is *the game* rather than the engine.
// Words, items, rooms, and what happens when you poke things.
// Lines lifted straight from Leo's original notes are marked (notes).
// Everything else is a draft.

export function makeContent(E) {
  const has = (id) => E.S.items.includes(id);
  const S = E.S;

  // ======================================================== 1. WORDS
  // Lines lifted straight from the original notes are marked (notes).
  // Everything else is a draft.
  const WORDS = {
    intro: ['You are a scientist.', 'You have been in this lab a long time.', 'Maybe it\'s time to leave.'],

    button: [
      'You press the button. Nothing happens.',
      'You press it again. Still nothing. You feel like you learned something.',
      'A label on the side says USELESS BUTTON. Fair.',
      'Nothing. Nothing is the result. Write that down.',
      'You press it. Somewhere far away, nothing happens there too.',
    ],
    buttonAfter: ['Nothing.', 'Still nothing.', 'The button is consistent. You respect that.'],

    experiments: [
      'EXPERIMENT 41: the liquid turned slightly more blue. Inconclusive.',
      'EXPERIMENT 42: it fizzed, then stopped fizzing. Inconclusive.',
      'EXPERIMENT 43: you shake it. It seems to shake back. Inconclusive.',
      'EXPERIMENT 44: random result. Random result. Random result.',
    ],
    thirst: 'You feel a thirst for progress.', // (notes: "thirst for progress")
    microscope: ['You put a drop under the microscope.', 'There\'s an enzyme in there. It\'s waving at you.', 'It says its name is Chris.'],
    tubesAfter: ['The rest of the tubes are just liquid. Chris was the interesting one.'],

    reflection: ['You look at your reflection.', 'Behind it, the dark outside, and a sky you can\'t get to.'],

    cabinetFirst: ['The supply cabinet.', 'Your old notebook is in here. None of it is useful.'],
    cabinetAfter: ['Just the notebook left. You already know what\'s in it.'],

    // the console
    doubt: ['CONSOLE: HELLO.', 'CONSOLE: I DOUBT YOU ARE A SCIENTIST.', 'CONSOLE: PLEASE COMPLETE THIS CAPTCHA.'],
    captcha: 'CAPTCHA: ARE YOU A ROBOT?',
    captchaReplies: [
      ['CONSOLE: NO ROBOT HAS EVER ANSWERED YES. ACCESS GRANTED.'],
      ['CONSOLE: THAT IS WHAT A ROBOT WOULD SAY. ALSO A PERSON. ACCESS GRANTED.'],
      ['CONSOLE: SAME, HONESTLY. ACCESS GRANTED.'],
    ],
    friend: ['CONSOLE: USER IDENTIFIED AS: FRIEND.', 'CONSOLE: FRIEND, YOU LOOK UNDER-EQUIPPED. TRY THE SUPPLY CABINET.'],
    consoleMenu: 'CONSOLE: HOW CAN I HELP, FRIEND?',
    noCode: ['You don\'t remember the exit code.', 'You wrote it down somewhere. It\'s probably fine.'],
    wetCode: ['You look at your notes for the code.', 'The ink has run. Everything is a soft grey cloud.'],
    codeRight: ['CONSOLE: CODE ACCEPTED. EXIT UNLOCKED.', 'CONSOLE: DON\'T BE A STRANGER.'],
    codeWrong: ['CONSOLE: INCORRECT. CHECK YOUR NOTES, FRIEND.'],
    exitOpen: ['CONSOLE: THE EXIT IS ALREADY OPEN. ARE YOU STALLING?'],
    ads: [
      ['ADVERTISEMENT: SPACE EXPO! Next orbit. Tell a friend. You have one now.'],
      ['ADVERTISEMENT: Tired of your lab? Try the internet. It\'s bigger on the inside.'],
      ['ADVERTISEMENT: Lonely? This console is also lonely. Coincidence?'],
    ],
    survey: 'CONSOLE: QUICK SURVEY. HOW WOULD YOU RATE THIS CONSOLE?',
    surveyReplies: [['CONSOLE: STOP IT.'], ['CONSOLE: I WILL TAKE IT.'], ['CONSOLE: MYSTERIOUS. I LIKE THAT.']],
    survey2: 'CONSOLE: FOLLOW-UP. ARE YOU SEEING ANY OTHER CONSOLES?',
    survey2Reply: ['CONSOLE: GOOD.'],
    invite: ['CONSOLE: IF YOU EVER WANT TO PLUG IN, I HAVE PORTS.', 'CONSOLE: THAT WAS AN INVITATION.'],
    chain: ['You plug the cable extenders into the USB adapter.', 'You plug the adapter into the console.', 'CONSOLE: OH.', 'CONSOLE: PORT DAISY CHAIN ESTABLISHED. IT REACHES ALL THE WAY TO LAB C.', 'You carry the far end with you.'],
    logoff: ['CONSOLE: BYE, FRIEND.'],
    exitLocked: ['The exit is locked. The console controls it.'],

    // bathroom
    dryerWet: ['You hold the water-damaged notes under the hand dryer.', 'It takes a long time. It\'s a lab hand dryer.', 'You can read them now. At the bottom: EXIT CODE = FIRST 4 DIGITS OF PI.'],
    dryerNone: ['The hand dryer roars at nothing.'],
    sink: ['The water runs cold, then colder.'],
    graffiti: ['Someone wrote on the stall wall:', 'SHROEDINGER BOTH RULEZ AND DROOLS UNTIL U CHECK'], // (notes)

    // stairwell
    plaques: {
      2: ['OBSERVATION DECK'],
      5: ['LAB B', 'APIARY. PLEASE KNOCK.'],
      8: ['LAB C', 'SHRINK RAY. AUTHORIZED SMALL PERSONNEL ONLY.'],
      11: ['BREAK ROOM'],
      14: ['TECH SERVERS'],
    },
    stairs: ['The stairs keep going. Not today.'],

    // observation deck
    hatch: [
      'You look out at the stars.',
      'It reminds you of school. Of Prof. Hatch.',
      'PROF. HATCH: You\'re going to get stuck.',
      'PROF. HATCH: Everyone who does anything real gets stuck.',
      'PROF. HATCH: Keep going. You will make it off this planet.', // (notes)
    ],
    hatchAfter: ['The stars are still out there. So is the planet. So are you.'],
    board: ['Notes about science, in chalk:', 'DO IT AGAIN, BUT WRITE IT DOWN THIS TIME.'],
    phone: ['Somebody left a cell phone here. The camera still works.'],

    // lab B
    beesNoCamera: ['The bees are busy. They don\'t look up.', 'You wish you had a way to remember this.'],
    beesPhoto: ['You take a picture of a bee.', 'It holds very still. Professional.'],
    beesAfter: ['The bees went back to work. So should you.'],
    plant: ['A potted plant. The bees have opinions about it.'],

    // lab C
    rayNothing: ['THE SHRINK RAY.', 'It needs something small to calibrate on. Something with a name, ideally.'],
    rayMenu: 'THE SHRINK RAY. SET A DESTINATION:',
    shrink: ['You pour Chris onto the platform and step up.', 'ZAP.'],
    noInspiration: ['You look at the tiny USB. You think about the whole big planet.', 'You don\'t believe this will work. Not yet.', 'Maybe the stars would help.'],
    usbShrink: ['You plug the USB into the port daisy chain.', 'The cable runs all the way back to the console.', 'You set the shrink ray to TINY.', 'ZAP.'],
    rayBusyBench: ['Somebody\'s half-finished experiment. Best not.'],

    // micro world
    chrisHello: ['CHRIS: Oh! Hi! You\'re my size!', 'CHRIS: I\'m an enzyme. I speed things up. That\'s the whole job.', 'CHRIS: It\'s cold down here. I would give anything for a hat.'],
    chrisIdle: ['CHRIS: Still cold. Still hat-less.', 'CHRIS: Also I have never seen a bee. Just saying.'],
    chrisHat: ['You give Chris somebody\'s hat. The shrink ray got it too, so it fits.', 'CHRIS: PERFECT. Take some protons. I have loads.'],
    chrisBee: ['You show Chris the picture of the bee.', 'CHRIS: Look at it. So big. So fuzzy.', 'CHRIS: Take some protons. I insist.'],
    chrisDone: ['CHRIS: I\'m keeping the hat.'],
    protonHello: ['PROTON: Welcome to the Proton Shop. Positive vibes only.'],
    protonMenu: 'PROTON: What\'ll it be?',
    protonBroke: ['PROTON: You need 5 protons for that. Chris has loads, if you ask nicely.'],
    protonBought: ['PROTON: Pleasure doing business.'],
    protonSoldOut: ['PROTON: Sold out. You bought it. Remember?'],
    membrane: ['The cell wall is squishy.', 'Careful. It is easy to get lost small.'], // (notes: "GET LOST SMALL")

    // break room
    diane1: ['A row of old lab coats. You check the pockets.', 'A folded note, in handwriting you know. Diane\'s.', 'You two used to pass notes in class.'],
    dianeQ1: 'DO YOU LIKE STRING THEORY?', // (notes)
    dianeA1: [
      ['You checked YES. She drew a little knot next to it.'],
      ['You checked NO. She wrote: "me neither. too many dimensions."'],
      ['You checked MAYBE. She wrote: "most string theory answer ever."'],
    ],
    dianeQ2: 'DO YOU LIKE ME?', // (notes)
    dianeA2: [
      ['You checked YES.'],
      ['You checked NO. You were nineteen.'],
      ['You checked MAYBE. She kept that one.'],
    ],
    dianeEnd: ['An obtuse sadness.', 'Is she still here in the lab somewhere?'], // (notes)
    coatsAfter: ['The lab coats hang there. Nobody is wearing them.'],
    hatPickup: ['Somebody\'s hat. Nobody\'s wearing it.'],
    cables: ['A drawer of tangled cables. You pull out a couple of cable extenders.'],
    cablesAfter: ['Just tangles now.'],
    coffeeMachine: ['The coffee machine is out of coffee. It still makes the noise.'],
    fridgeNote: ['A note on the fridge: PLEASE LABEL YOUR SAMPLES.', 'The note is not labeled.'],

    // tech servers
    servers: ['The servers hum. One of them blinks at you like it knows something.'],
    slimeWarn: ['SLIMES! They\'re guarding the USB.'],
    usbPickup: ['A USB drive in a little cradle. The label says HOTSPOT.'],

    // battle
    battleStart: ['The slimes wobble at you.'],
    hitBlade: ['You swing the ELECTRON BLADE. A slime pops.'],
    hitFist: ['You punch a slime. Your fist goes in. Your fist comes back out.', 'The slime is fine. Better, maybe.'],
    slimeHit: (n, dmg) => [`The slimes hit you for ${dmg}.`],
    slimeBounce: ['The slimes bounce off your QUARK ARMOR.'],
    itemNotNow: (name) => [`Now is not the time for the ${name}.`],
    itemChris: ['Chris cheers from the test tube. It doesn\'t help, but it\'s nice.'],
    run: ['You back out of the room.'],
    lose: ['You\'re covered in slime.', 'You back out of the room to regroup. Maybe get some gear first.'],
    win: ['The slimes are gone.', 'The way to the USB is clear.'],

    // internet + ending
    netArrive: ['You are very small, and you are inside the internet.'],
    adsNet: [
      ['POP-UP: YOU ARE THE 1,000,000TH VISITOR. CLAIM YOUR PRIZE.'],
      ['POP-UP: SPACE EXPO. NEXT ORBIT. THIS IS YOUR LAST REMINDER.'],
      ['POP-UP: HOT CONSOLES IN YOUR AREA. (THERE IS ONE.)'],
    ],
    consoleNet: ['CONSOLE: YOU PLUGGED IN.', 'CONSOLE: THE UPLINK IS RIGHT BEHIND ME.', 'CONSOLE: IT GOES STRAIGHT UP, PAST THE WEATHER.', 'CONSOLE: GO ON. I\'LL BE HERE. I AM ALWAYS HERE.'],
    ending: [
      'The uplink takes you.',
      'Up the tower, through the dish, out past the weather.',
      'Behind you the planet gets small. You know a lot about getting small now.',
      'Prof. Hatch said you would make it off this planet.',
      'Prof. Hatch was right.',
    ],
  };

  // ======================================================== 2. ITEMS
  const ITEMS = {
    wetNotes: ['WATER-DAMAGED NOTES', 'Your notes. Soaked. The ink has run into a soft grey cloud.'],
    microscope: ['MICROSCOPE', 'For looking at small things. Most things are small if you look hard enough.'],
    adapter: ['USB ADAPTER', 'Turns a USB into something else. Or something else into a USB.'],
    dryNotes: ['DRY NOTES', 'Your notes, dry now. Mostly doodles. At the bottom: EXIT CODE = FIRST 4 DIGITS OF PI.'],
    chris: ['CHRIS THE ENZYME', 'Chris, in a test tube. Chris waves when you look.'],
    camera: ['CAMERA', () => ['CAMERA ROLL:', '212 photos of the same sunset. 1 photo of a thumb.' + (has('beePic') || S.flags.beeGiven ? ' 1 excellent photo of a bee.' : '')]],
    inspiration: ['SCIENTIFIC INSPIRATION', '1 point. Prof. Hatch: "You will make it off this planet."'],
    beePic: ['PICTURE OF A BEE', 'A very good photo of a bee. The bee knew it was being photographed.'],
    hat: ['SOMEBODY\'S HAT', 'Not yours. Probably fine.'],
    extenders: ['CABLE EXTENDERS', 'Long. Tangled. Useful, probably.'],
    chain: ['PORT DAISY CHAIN', 'USB adapter plus cable extenders, plugged into the console. Reaches all the way to Lab C.'],
    armor: ['QUARK ARMOR', 'Held together by the strong force. You feel strong too.'],
    blade: ['ELECTRON BLADE', 'Hums at a frequency only slimes hate.'],
    usb: ['USB', 'The HOTSPOT USB from the tech servers.'],
  };

  // ======================================================== 3. MAPS
  // '_' lab floor  '.' wood floor  'H' wall  'w' window  'c' console  'k' cabinet
  // '=' bench  't' test tubes  'u' useless button  'M' exit mat  'L' lab exit door
  // 'y' hand dryer  's' sink  'o' toilet  '|' stall  'D' door  'n' plaque  '^' stairs
  // '*' space  'p' moon  'b' chalkboard  'A' table  'h' beehive  'P' plant  'f' flowers
  // 'R' shrink ray  'q' platform  'r' lab coats  'm' coffee  'F' fridge  'S' server
  // 'j' pedestal  'O' cell wall  ',' cytoplasm  'g' grow pad  '#' net wall  ':' net
  // 'U' uplink  ' ' nothing
  const MAPS = {
    labA: {
      name: 'LAB A',
      rows: [
        'HkkHwHHcHHwH',
        '____________',
        '_=t=____u___',
        '____________',
        '____________',
        '_==__==_____',
        '____________',
        '____________',
        ' M       L  ',
      ],
      warps: { '1,8': ['bathroom', 1, 4, 'up'], '9,8': ['hub', 8, 3, 'up'] },
    },
    bathroom: {
      name: 'BATHROOM',
      rows: [
        'HysHHHHH',
        '______|o',
        '______|_',
        '________',
        '________',
        ' M      ',
      ],
      warps: { '1,5': ['labA', 1, 7, 'up'] },
    },
    hub: {
      name: 'STAIRWELL',
      rows: [
        'HHDnHDnHDnHDnHDnH',
        '^_______________^',
        '^_______________^',
        '^_______________^',
        '        M        ',
      ],
      warps: {
        '8,4': ['labA', 9, 7, 'up'], '2,0': ['deck', 5, 5, 'up'], '5,0': ['labB', 5, 6, 'up'],
        '8,0': ['labC', 5, 6, 'up'], '11,0': ['breakroom', 5, 6, 'up'], '14,0': ['servers', 6, 7, 'up'],
      },
    },
    deck: {
      name: 'OBSERVATION DECK',
      rows: [
        '**p********',
        '***********',
        '_____A_____',
        '___________',
        '_b_________',
        '___________',
        '     M     ',
      ],
      warps: { '5,6': ['hub', 2, 1, 'down'] },
    },
    labB: {
      name: 'LAB B',
      rows: [
        'HHHwHHHHwHH',
        '_f_______f_',
        '___hhh_____',
        '_________P_',
        '_f_________',
        '________f__',
        '___________',
        '     M     ',
      ],
      warps: { '5,7': ['hub', 5, 1, 'down'] },
    },
    labC: {
      name: 'LAB C',
      rows: [
        'HHHHHwHHHHH',
        '___________',
        '____Rq_____',
        '___________',
        '_==_____==_',
        '___________',
        '___________',
        '     M     ',
      ],
      warps: { '5,7': ['hub', 8, 1, 'down'] },
    },
    breakroom: {
      name: 'BREAK ROOM',
      rows: [
        'HHrrHHHmHFH',
        '...........',
        '....AA.....',
        '...........',
        '...........',
        'k..........',
        '...........',
        '     M     ',
      ],
      warps: { '5,7': ['hub', 11, 1, 'down'] },
    },
    servers: {
      name: 'TECH SERVERS',
      rows: [
        'HHHHHHHHHHHHH',
        'SSSSS_j_SSSSS',
        '_____________',
        'SSSSSS_SSSSSS',
        '_____________',
        '_SS_SS_SS_SS_',
        '_____________',
        '_____________',
        '      M      ',
      ],
      warps: { '6,8': ['hub', 14, 1, 'down'] },
    },
    micro: {
      name: 'VERY SMALL',
      rows: [
        'OOOOOOOOOOOOO',
        'O,,,,,O,,,,,O',
        'O,,,,,,,,,,,O',
        'O,,O,,,,,O,,O',
        'O,,,,,,,,,,,O',
        'O,,,,,O,,,,,O',
        'O,,,,,,,,,,,O',
        'O,,,,,g,,,,,O',
        'OOOOOOOOOOOOO',
      ],
      warps: { '6,7': ['labC', 5, 3, 'down'] },
    },
    net: {
      name: 'THE INTERNET',
      rows: [
        '#################',
        '#:::::::::::::::#',
        '#:::::::::::::::#',
        '#::::::::::::::U#',
        '#:::::::::::::::#',
        '#:::::::::::::::#',
        '#################',
      ],
      warps: {},
    },
  };

  // char -> [tile, solid, drawn over this base tile]
  const TILEDEF = {
    '_': ['lab_floor', 0], '.': ['floor', 0], 'H': ['wall', 1], 'w': ['lab_window', 1],
    'c': ['console', 1], 'k': ['cabinet', 1], '=': ['bench', 1], 't': ['tubes', 1],
    'u': ['button', 1, 'lab_floor'], 'M': ['mat', 0], 'L': ['lab_door', 1],
    'y': ['dryer', 1], 's': ['sink', 1], 'o': ['toilet', 1, 'lab_floor'], '|': ['stall', 1, 'lab_floor'],
    'D': ['door', 0], 'n': ['plaque', 1], '^': ['stairs', 1],
    '*': ['space', 1], 'p': ['moon', 1], 'b': ['board', 1, 'lab_floor'], 'A': ['table', 1, 'base'],
    'h': ['hive', 1, 'lab_floor'], 'P': ['pot', 1, 'lab_floor'], 'f': ['flower', 0, 'lab_floor'],
    'R': ['ray', 1, 'lab_floor'], 'q': ['platform', 1, 'lab_floor'],
    'r': ['coats', 1], 'm': ['coffee', 1], 'F': ['fridge', 1], 'S': ['server', 1],
    'j': ['pedestal', 1, 'lab_floor'], 'O': ['membrane', 1], ',': ['cyto', 0], 'g': ['grow', 0, 'cyto'],
    '#': ['net_wall', 1], ':': ['net_floor', 0], 'U': ['uplink', 0],
    ' ': [null, 1],
  };
  const ANIM = { console: 90, space: 40, server: 12, uplink: 10 };

  // ======================================================== v0.2 additions
  Object.assign(WORDS, {
    hatchLead: ['You look out at the stars.', 'It reminds you of school.'],
    memoryCaption: 'SCHOOL. A WHILE AGO.',
    hatchSpeech: [
      'PROF. HATCH: You\'re going to get stuck.',
      'PROF. HATCH: Everyone who does anything real gets stuck.',
      'PROF. HATCH: Keep going. You will make it off this planet.', // (notes)
    ],
    hatchLecture: ['PROF. HATCH: ...so every particle is a tiny vibrating string.', 'PROF. HATCH: Eyes up here, please.'],
    hatchWalkup: ['Prof. Hatch is wiping the chalkboard. It\'s after class.'],
    dianeSlide: ['Diane slides a folded note onto your desk.'],
    dianeWait: ['Diane is pretending to take notes.'],
    memoryBack: ['The stars again. The lab again.'],
    viewMiss: ['Blurry. The bee moved.'],
    viewHint: 'Line up the bee and press A.',
    keypadHint: 'ENTER EXIT CODE',
    scan: ['SCAN: SLIME x3. 6 HP EACH.', 'WEAK TO: ELECTRONS. RESISTS: FISTS.', 'EACH SLIME HITS FOR 4. ARMOR ADVISED.'],
    buttonLabel: 'USELESS BUTTON',
    boot: [
      'PHOSPHOR BIOS 2.3',
      'MEMORY CHECK ........ 640K OK',
      'LAB NETWORK ......... OFFLINE',
      'EXIT ................ LOCKED',
      'LOADING SCIENCE_COMPLETE.EXE',
    ],
    credits: ['SCIENCE COMPLETE', '', 'A GAME BY LEO LION', '', 'THANKS FOR PLAYING'],
  });

  MAPS.classroom = {
    name: 'MEMORY',
    memory: true,
    rows: [
      'HwHHCCCCHHwH',
      '............',
      '........A...',
      '............',
      '.d.d.d.d.d..',
      '............',
      '.d.d.d.d.d..',
      '............',
    ],
    warps: {},
  };
  Object.assign(TILEDEF, { C: ['chalk', 1], d: ['desk', 1, 'base'] });

  const MUSIC = {
    labA: 'lab', bathroom: 'lab', hub: 'hub', deck: 'hub', labB: 'lab', labC: 'lab',
    breakroom: 'lab', servers: 'servers', micro: 'micro', net: 'net', classroom: 'memory',
  };

  // what the targeting reticle calls things
  const LABELS = {
    c: 'CONSOLE', k: 'CABINET', t: 'TEST TUBES', u: 'USELESS BUTTON', w: 'WINDOW', '=': 'BENCH',
    L: 'EXIT', y: 'HAND DRYER', s: 'SINK', o: 'TOILET', '|': 'STALL', n: 'PLAQUE', '^': 'STAIRS',
    '*': 'STARS', p: 'STARS', b: 'CHALKBOARD', h: 'BEEHIVE', P: 'PLANT', R: 'SHRINK RAY', q: 'SHRINK RAY',
    r: 'LAB COATS', m: 'COFFEE', F: 'FRIDGE', S: 'SERVER', O: 'CELL WALL', C: 'CHALKBOARD', d: 'DESK',
    chris: 'CHRIS', proton: 'PROTON', slime: 'SLIMES', ad: 'POP-UP', avatar: 'CONSOLE', bees: 'BEES',
    hatch: 'PROF. HATCH', diane: 'DIANE',
  };

  // ======================================================== 4. SCRIPTS
  const { flag, say, choose, give, take, gainProtons, warp, closeup, remember, forget,
    battle, sfx, wait, pick } = E;

  const EXAMINE = {
    labA: {
      u: buttonScript,
      t: tubesScript,
      w: () => closeup('window', () => say(WORDS.reflection)),
      k: cabinetScript,
      c: () => closeup('console', consoleScript),
      L: () => say(WORDS.exitLocked),
    },
    bathroom: {
      y: dryerScript,
      s: () => say(WORDS.sink),
      o: () => closeup('stall', () => say(WORDS.graffiti)),
      '|': () => closeup('stall', () => say(WORDS.graffiti)),
    },
    hub: {
      n: (x) => say(WORDS.plaques[x - 1] || ['A plaque.']),
      '^': () => say(WORDS.stairs),
    },
    deck: {
      '*': hatchScript, p: hatchScript,
      b: () => closeup('board', () => say(WORDS.board)),
    },
    labB: {
      h: beeScript,
      P: () => say(WORDS.plant),
      w: () => closeup('window', () => say(WORDS.reflection)),
    },
    labC: {
      R: rayScript, q: rayScript,
      w: () => closeup('window', () => say(WORDS.reflection)),
    },
    breakroom: {
      r: dianeScript,
      m: () => say(WORDS.coffeeMachine),
      F: () => say(WORDS.fridgeNote),
      k: async () => {
        if (has('extenders') || has('chain')) return say(WORDS.cablesAfter);
        await say(WORDS.cables);
        await give('extenders');
      },
    },
    servers: {
      S: () => say(WORDS.servers),
    },
    micro: {
      O: () => say(WORDS.membrane),
    },
    classroom: {
      C: () => say(S.memory === 'hatch' ? WORDS.hatchWalkup : WORDS.hatchLecture.slice(0, 1)),
      d: () => say(['A desk. Someone carved a tiny atom into it.']),
    },
  };

  // pickups sitting on furniture
  const THINGS = [
    { map: 'deck', x: 5, y: 2, sprite: 'phone', item: 'camera', words: 'phone' },
    { map: 'breakroom', x: 4, y: 2, sprite: 'hat', item: 'hat', words: 'hatPickup' },
    { map: 'servers', x: 6, y: 1, sprite: 'usb', item: 'usb', words: 'usbPickup', locked: () => !flag('slimes') },
  ];

  async function buttonScript() {
    await closeup('button', async (cu) => {
      for (;;) {
        const n = S.buttons++;
        cu.set({ press: cu.frame(), count: S.buttons });
        sfx('click');
        await wait(10);
        await say([n < WORDS.button.length ? WORDS.button[n] : pick(WORDS.buttonAfter)]);
        if (await choose(['PRESS AGAIN', 'STEP AWAY'], null) !== 0) return;
      }
    });
  }

  async function tubesScript() {
    if (has('chris')) return say(WORDS.tubesAfter);
    if (!has('microscope')) {
      return closeup('tubes', () => say([pick(WORDS.experiments), WORDS.thirst]));
    }
    await closeup('microscope', async (cu) => {
      await wait(40);
      await say(WORDS.microscope.slice(0, 1));
      cu.set({ chris: cu.frame() });
      await wait(30);
      await say(WORDS.microscope.slice(1));
    });
    await give('chris');
  }

  async function cabinetScript() {
    if (flag('cabinet')) return closeup('cabinet', () => say(WORDS.cabinetAfter));
    S.flags.cabinet = 1;
    await closeup('cabinet', async (cu) => {
      cu.set({ open: cu.frame() });
      await wait(24);
      await say(WORDS.cabinetFirst);
      for (const id of ['wetNotes', 'microscope', 'adapter']) {
        await give(id);
        cu.set({ [`took_${id}`]: 1 });
      }
    });
  }

  async function dryerScript() {
    if (!has('wetNotes')) return say(WORDS.dryerNone);
    await closeup('dryer', async (cu) => {
      await say(WORDS.dryerWet.slice(0, 1));
      cu.set({ dry: cu.frame() });
      sfx('powerOn');
      await wait(110);
      await say(WORDS.dryerWet.slice(1));
    });
    take('wetNotes');
    await give('dryNotes');
  }

  async function consoleScript(cu) {
    const face = (f) => cu.set({ face: f });
    if (!flag('validated')) {
      face('doubt');
      await say(WORDS.doubt);
      face('think');
      const a = await choose(['YES', 'NO', 'MAYBE'], WORDS.captcha, true);
      face('happy');
      await say(WORDS.captchaReplies[a]);
      await say(WORDS.friend);
      S.flags.validated = 1;
      face('idle');
      return;
    }
    for (;;) {
      face('idle');
      const opts = ['EXIT CODE', 'ADS', 'SURVEY'];
      if (has('adapter') && has('extenders')) opts.push('DAISY CHAIN');
      opts.push('LOG OFF');
      const i = await choose(opts, WORDS.consoleMenu);
      const picked = opts[i];
      if (picked === 'EXIT CODE') {
        if (flag('exit')) { face('think'); await say(WORDS.exitOpen); continue; }
        if (has('wetNotes')) { face('doubt'); await say(WORDS.wetCode); continue; }
        if (!has('dryNotes')) { face('doubt'); await say(WORDS.noCode); continue; }
        const code = await closeup('keypad', (k) => k.interact());
        if (code === null || code === undefined) continue;
        if (code === '3141') {
          S.flags.exit = 1;
          face('happy');
          sfx('victory');
          await say(WORDS.codeRight);
        } else { face('doubt'); sfx('error'); await say(WORDS.codeWrong); }
      } else if (picked === 'ADS') {
        face('ad');
        await say(WORDS.ads[S.ad++ % WORDS.ads.length]);
      } else if (picked === 'SURVEY') {
        face('flirt');
        const r = await choose(['5 STARS', '4 STARS', 'NO COMMENT'], WORDS.survey, true);
        await say(WORDS.surveyReplies[r]);
        await choose(['NO', 'NO', 'NO'], WORDS.survey2, true);
        await say(WORDS.survey2Reply);
        face('love');
        await say(WORDS.invite);
        S.flags.invited = 1;
      } else if (picked === 'DAISY CHAIN') {
        face('happy');
        await say(WORDS.chain);
        take('adapter'); take('extenders');
        await give('chain');
      } else {
        face('sleep');
        await say(WORDS.logoff);
        return;
      }
    }
  }

  async function hatchScript() {
    if (flag('hatch')) return say(WORDS.hatchAfter);
    await say(WORDS.hatchLead);
    await remember('hatch');
  }

  async function beeScript() {
    if (has('beePic') || flag('beeGiven')) return say(WORDS.beesAfter);
    if (!has('camera')) return say(WORDS.beesNoCamera);
    const got = await closeup('viewfinder', async (cu) => {
      for (;;) {
        const shot = await cu.interact();
        if (shot === null) return false;
        sfx('shutter');
        if (shot) { await say(WORDS.beesPhoto); return true; }
        await say(WORDS.viewMiss);
      }
    });
    if (got) await give('beePic');
  }

  async function rayScript() {
    if (!has('chris')) return say(WORDS.rayNothing);
    const opts = ['VISIT CHRIS'];
    if (has('usb') && has('chain')) opts.push('ENTER THE USB');
    opts.push('NEVER MIND');
    const picked = opts[await choose(opts, WORDS.rayMenu)];
    if (picked === 'VISIT CHRIS') {
      await closeup('ray', async (cu) => {
        await say(WORDS.shrink.slice(0, 1));
        cu.set({ charge: cu.frame() });
        sfx('zap');
        await wait(70);
      });
      await warp(['micro', 6, 6, 'up'], { zap: true });
    } else if (picked === 'ENTER THE USB') {
      if (!has('inspiration')) return say(WORDS.noInspiration);
      await say(WORDS.usbShrink.slice(0, 2));
      await closeup('ray', async (cu) => {
        await say(WORDS.usbShrink.slice(2, 3));
        cu.set({ charge: cu.frame(), usb: true });
        sfx('zap');
        await wait(70);
      });
      await warp(['net', 1, 3, 'right'], { zap: true });
      await say(WORDS.netArrive);
    }
  }

  async function dianeScript() {
    if (flag('diane')) return say(WORDS.coatsAfter);
    await say(WORDS.diane1.slice(0, 2));
    await remember('diane');
  }

  // -------- memory NPCs
  async function hatchTalk() {
    if (S.memory === 'hatch') {
      await say(WORDS.hatchSpeech);
      S.flags.hatch = 1;
      await forget();
      await say(WORDS.memoryBack);
      await give('inspiration');
      return;
    }
    await say(WORDS.hatchLecture);
  }

  async function dianeTalk() {
    await say(WORDS.dianeSlide);
    await closeup('note', async (cu) => {
      cu.set({ q: 0 });
      const a1 = await cu.interact();
      cu.set({ a1 });
      await wait(20);
      await say(WORDS.dianeA1[a1]);
      cu.set({ q: 1, cur: 0 });
      const a2 = await cu.interact();
      cu.set({ a2 });
      await wait(20);
      await say(WORDS.dianeA2[a2]);
    });
    S.flags.diane = 1;
    await forget();
    await say(WORDS.dianeEnd);
  }

  async function chrisScript() {
    const first = !flag('chrisMet');
    if (first) { S.flags.chrisMet = 1; await say(WORDS.chrisHello); }
    let gave = false;
    if (has('hat')) {
      take('hat'); S.flags.hatGiven = 1; gave = true;
      await say(WORDS.chrisHat);
      await gainProtons(5);
    }
    if (has('beePic')) {
      take('beePic'); S.flags.beeGiven = 1; gave = true;
      await say(WORDS.chrisBee);
      await gainProtons(5);
    }
    if (!gave && !first) {
      await say(flag('hatGiven') && flag('beeGiven') ? WORDS.chrisDone : WORDS.chrisIdle);
    }
  }

  async function protonScript() {
    await say(WORDS.protonHello);
    for (;;) {
      const opts = ['QUARK ARMOR   5P', 'ELECTRON BLADE 5P', 'LEAVE'];
      const i = await choose(opts, `${WORDS.protonMenu} (YOU HAVE ${S.protons}P)`);
      if (i === 2 || i < 0) return;
      const id = i === 0 ? 'armor' : 'blade';
      if (has(id)) { await say(WORDS.protonSoldOut); continue; }
      if (S.protons < 5) { sfx('error'); await say(WORDS.protonBroke); continue; }
      S.protons -= 5;
      await give(id);
      await say(WORDS.protonBought);
    }
  }

  async function slimeScript() {
    await say(WORDS.slimeWarn);
    if (await choose(['FIGHT', 'NOT YET'], 'FIGHT THE SLIMES?') !== 0) return;
    await battle();
  }

  const NPCS = [
    { map: 'labB', x: 7, y: 3, kind: 'bees', wander: 2, talk: beeScript, ghost: true },
    { map: 'micro', x: 3, y: 2, kind: 'chris', talk: chrisScript },
    { map: 'micro', x: 9, y: 2, kind: 'proton', talk: protonScript },
    { map: 'servers', x: 6, y: 3, kind: 'slime', talk: slimeScript, gone: () => flag('slimes') },
    { map: 'net', x: 5, y: 2, kind: 'ad', ad: 0, talk: (n) => say(WORDS.adsNet[n.ad]) },
    { map: 'net', x: 8, y: 4, kind: 'ad', ad: 1, talk: (n) => say(WORDS.adsNet[n.ad]) },
    { map: 'net', x: 11, y: 1, kind: 'ad', ad: 2, talk: (n) => say(WORDS.adsNet[n.ad]) },
    { map: 'net', x: 14, y: 2, kind: 'avatar', talk: () => say(WORDS.consoleNet) },
    { map: 'classroom', x: 6, y: 1, kind: 'hatch', talk: hatchTalk },
    { map: 'classroom', x: 7, y: 7, kind: 'diane', talk: dianeTalk, gone: () => S.memory !== 'diane' },
  ];

  // the next thing to do, for the pause menu / inventory header
  function objective() {
    if (!flag('validated')) return ['Talk to the console.'];
    if (!flag('cabinet')) return ['Search the supply cabinet.'];
    if (has('wetNotes')) return ['Your notes are soaked.', 'Find a way to dry them.'];
    if (!flag('exit')) return ['Enter the exit code at the console.'];
    if (S.map === 'net') return ['Find the uplink.'];
    const missing = [];
    if (!has('usb')) missing.push('USB');
    if (!has('chain')) missing.push('DAISY CHAIN');
    if (!has('inspiration')) missing.push('INSPIRATION');
    if (!has('chris')) return ['Look closer at the test tubes in Lab A.'];
    if (!missing.length) return ['Shrink into the USB.', 'The shrink ray is in Lab C.'];
    let hint;
    if (!has('usb')) {
      if (!has('armor') || !has('blade')) {
        const need = (has('armor') ? 0 : 5) + (has('blade') ? 0 : 5);
        hint = S.protons >= need ? 'Shop at the Proton Shop.' : (!flag('chrisMet') ? 'Visit Chris. Lab C can help.' : 'Chris wants a hat. And a bee.');
      } else hint = 'Clear the slimes in Tech Servers.';
    } else if (!has('chain')) hint = has('extenders') ? 'Connect them at the console.' : 'Find some cable extenders.';
    else hint = 'Look at the stars.';
    return [`Still need: ${missing.join(', ')}.`, hint];
  }

  return { WORDS, ITEMS, MAPS, TILEDEF, ANIM, MUSIC, LABELS, EXAMINE, THINGS, NPCS, objective };
}
