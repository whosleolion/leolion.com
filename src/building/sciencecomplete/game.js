/* SCIENCE COMPLETE — rough build.
   Built on the YEP engine (/building/yepdemo): 1-bit canvas, no build step.
   Assets come from tools/sciencecomplete/make_assets.py.

   Layout of this file:
     1. WORDS    — every line of text in the game (edit freely)
     2. ITEMS    — key items and their descriptions
     3. MAPS     — room layouts as ASCII
     4. SCRIPTS  — what happens when you examine / talk to things
     5. engine   — movement, dialogue, menus, battle, drawing */
(() => {
  'use strict';

  const W = 240, H = 160, T = 16;

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

  // ======================================================== state
  const fresh = () => ({
    map: 'labA', x: 6, y: 4, dir: 'up',
    items: [], protons: 0, flags: {}, buttons: 0, ad: 0, bought: {},
  });
  let S = fresh();
  const has = (id) => S.items.includes(id);
  const flag = (f) => !!S.flags[f];

  // ======================================================== 4. SCRIPTS
  // Each handler is async: await say([...]) / await choose([...], prompt).
  const EXAMINE = {
    labA: {
      u: async () => {
        const n = S.buttons++;
        beep(220, 0.05);
        await say([n < WORDS.button.length ? WORDS.button[n] : pick(WORDS.buttonAfter)]);
      },
      t: async () => {
        if (has('chris')) return say(WORDS.tubesAfter);
        if (!has('microscope')) return say([pick(WORDS.experiments), WORDS.thirst]);
        await say(WORDS.microscope);
        await give('chris');
      },
      '=': () => say(WORDS.rayBusyBench),
      w: () => say(WORDS.reflection),
      k: async () => {
        if (flag('cabinet')) return say(WORDS.cabinetAfter);
        S.flags.cabinet = 1;
        await say(WORDS.cabinetFirst);
        await give('wetNotes');
        await give('microscope');
        await give('adapter');
      },
      c: consoleScript,
      L: () => say(WORDS.exitLocked),
    },
    bathroom: {
      y: async () => {
        if (!has('wetNotes')) return say(WORDS.dryerNone);
        await say(WORDS.dryerWet);
        take('wetNotes');
        await give('dryNotes');
      },
      s: () => say(WORDS.sink),
      o: () => say(WORDS.graffiti),
      '|': () => say(WORDS.graffiti),
    },
    hub: {
      n: (x) => say(WORDS.plaques[x - 1] || ['A plaque.']),
      '^': () => say(WORDS.stairs),
    },
    deck: {
      '*': hatchScript, p: hatchScript,
      b: () => say(WORDS.board),
    },
    labB: {
      h: beeScript,
      P: () => say(WORDS.plant),
      w: () => say(WORDS.reflection),
    },
    labC: {
      R: rayScript, q: rayScript,
      '=': () => say(WORDS.rayBusyBench),
      w: () => say(WORDS.reflection),
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
  };

  // pickups sitting on furniture
  const THINGS = [
    { map: 'deck', x: 5, y: 2, sprite: 'phone', item: 'camera', words: 'phone' },
    { map: 'breakroom', x: 4, y: 2, sprite: 'hat', item: 'hat', words: 'hatPickup' },
    { map: 'servers', x: 6, y: 1, sprite: 'usb', item: 'usb', words: 'usbPickup', locked: () => !flag('slimes') },
  ];

  async function consoleScript() {
    if (!flag('validated')) {
      await say(WORDS.doubt);
      const a = await choose(['YES', 'NO', 'MAYBE'], WORDS.captcha, true);
      await say(WORDS.captchaReplies[a]);
      await say(WORDS.friend);
      S.flags.validated = 1;
      return;
    }
    for (;;) {
      const opts = ['EXIT CODE', 'ADS', 'SURVEY'];
      if (has('adapter') && has('extenders')) opts.push('DAISY CHAIN');
      opts.push('LOG OFF');
      const i = await choose(opts, WORDS.consoleMenu);
      const pickd = opts[i];
      if (pickd === 'EXIT CODE') {
        if (flag('exit')) { await say(WORDS.exitOpen); continue; }
        if (has('wetNotes')) { await say(WORDS.wetCode); continue; }
        if (!has('dryNotes')) { await say(WORDS.noCode); continue; }
        const code = await codeEntry();
        if (code === null) continue;
        if (code === '3141') {
          S.flags.exit = 1;
          jingle();
          await say(WORDS.codeRight);
        } else await say(WORDS.codeWrong);
      } else if (pickd === 'ADS') {
        await say(WORDS.ads[S.ad++ % WORDS.ads.length]);
      } else if (pickd === 'SURVEY') {
        const r = await choose(['5 STARS', '4 STARS', 'NO COMMENT'], WORDS.survey, true);
        await say(WORDS.surveyReplies[r]);
        await choose(['NO', 'NO', 'NO'], WORDS.survey2, true);
        await say(WORDS.survey2Reply);
        await say(WORDS.invite);
        S.flags.invited = 1;
      } else if (pickd === 'DAISY CHAIN') {
        await say(WORDS.chain);
        take('adapter'); take('extenders');
        await give('chain');
      } else {
        await say(WORDS.logoff);
        return;
      }
    }
  }

  async function hatchScript() {
    if (flag('hatch')) return say(WORDS.hatchAfter);
    S.flags.hatch = 1;
    await say(WORDS.hatch);
    await give('inspiration');
  }

  async function beeScript() {
    if (has('beePic') || flag('beeGiven')) return say(WORDS.beesAfter);
    if (!has('camera')) return say(WORDS.beesNoCamera);
    beep(1400, 0.03); setTimeout(() => beep(1800, 0.03), 60);
    await say(WORDS.beesPhoto);
    await give('beePic');
  }

  async function rayScript() {
    if (!has('chris')) return say(WORDS.rayNothing);
    const opts = ['VISIT CHRIS'];
    if (has('usb') && has('chain')) opts.push('ENTER THE USB');
    opts.push('NEVER MIND');
    const pickd = opts[await choose(opts, WORDS.rayMenu)];
    if (pickd === 'VISIT CHRIS') {
      await say(WORDS.shrink);
      await warp(['micro', 6, 6, 'up'], true);
    } else if (pickd === 'ENTER THE USB') {
      if (!has('inspiration')) return say(WORDS.noInspiration);
      await say(WORDS.usbShrink);
      await warp(['net', 1, 3, 'right'], true);
      await say(WORDS.netArrive);
    }
  }

  async function dianeScript() {
    if (flag('diane')) return say(WORDS.coatsAfter);
    S.flags.diane = 1;
    await say(WORDS.diane1);
    await say(WORDS.dianeA1[await choose(['YES', 'NO', 'MAYBE'], WORDS.dianeQ1, true)]);
    await say(WORDS.dianeA2[await choose(['YES', 'NO', 'MAYBE'], WORDS.dianeQ2, true)]);
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
      const opts = ['QUARK ARMOR  5P', 'ELECTRON BLADE 5P', 'LEAVE'];
      const i = await choose(opts, `${WORDS.protonMenu} (YOU HAVE ${S.protons}P)`);
      if (i === 2 || i < 0) return;
      const id = i === 0 ? 'armor' : 'blade';
      if (has(id)) { await say(WORDS.protonSoldOut); continue; }
      if (S.protons < 5) { await say(WORDS.protonBroke); continue; }
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

  async function adScript(n) { await say(WORDS.adsNet[n.ad]); }

  async function consoleNetScript() { await say(WORDS.consoleNet); }

  const NPCS = [
    { map: 'labB', x: 7, y: 3, kind: 'bees', wander: 2, talk: beeScript, ghost: true },
    { map: 'micro', x: 3, y: 2, kind: 'chris', talk: chrisScript },
    { map: 'micro', x: 9, y: 2, kind: 'proton', talk: protonScript },
    { map: 'servers', x: 6, y: 3, kind: 'slime', talk: slimeScript, gone: () => flag('slimes') },
    { map: 'net', x: 5, y: 2, kind: 'ad', ad: 0, talk: adScript },
    { map: 'net', x: 8, y: 4, kind: 'ad', ad: 1, talk: adScript },
    { map: 'net', x: 11, y: 1, kind: 'ad', ad: 2, talk: adScript },
    { map: 'net', x: 14, y: 2, kind: 'avatar', talk: consoleNetScript },
  ].map((n) => Object.assign({
    px: n.x * T, py: n.y * T, tx: n.x, ty: n.y, dir: 'down', moving: false,
    home: [n.x, n.y], timer: 60 + Math.random() * 120,
  }, n));

  async function give(id) {
    if (!has(id)) S.items.push(id);
    jingle();
    await say([`Got ${ITEMS[id][0]}!`]);
  }
  function take(id) { S.items = S.items.filter((i) => i !== id); }
  async function gainProtons(n) {
    S.protons += n;
    jingle();
    await say([`Got ${n} PROTONS! (${S.protons}P)`]);
  }

  // ======================================================== 5. engine
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const pick = (a) => a[(Math.random() * a.length) | 0];

  const img = {};
  let atlas;
  async function load() {
    atlas = await (await fetch('assets/atlas.json')).json();
    await Promise.all(['tiles', 'sprites', 'font'].map((n) => new Promise((ok, fail) => {
      const i = new Image();
      i.onload = () => { img[n] = i; ok(); };
      i.onerror = fail;
      i.src = `assets/${n}.png`;
    })));
    const c = document.createElement('canvas');
    c.width = img.font.width; c.height = img.font.height;
    const g = c.getContext('2d');
    g.drawImage(img.font, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    img.fontWhite = c;
    img.spritesLit = halo(img.sprites);
    atlas.spritesLit = atlas.sprites;
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    img.dither = [null];
    for (let lv = 1; lv <= 3; lv++) {
      const p = document.createElement('canvas');
      p.width = p.height = 4;
      const pg = p.getContext('2d');
      pg.fillStyle = '#000';
      bayer.forEach((v, i) => { if (v < lv * 4) pg.fillRect(i % 4, (i / 4) | 0, 1, 1); });
      img.dither.push(ctx.createPattern(p, 'repeat'));
    }
  }

  // copy of a sprite sheet with a 1px white outline, so black-edged sprites read on black floors
  function halo(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data, out = new Uint8ClampedArray(a);
    const op = (x, y) => a[(y * c.width + x) * 4 + 3] > 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (op(x, y)) continue;
        // only look at neighbours inside the same 16x16 cell
        const lx = x % T, ly = y % T;
        if ((lx > 0 && op(x - 1, y)) || (lx < T - 1 && op(x + 1, y)) ||
            (ly > 0 && op(x, y - 1)) || (ly < T - 1 && op(x, y + 1))) out.set([255, 255, 255, 255], (y * c.width + x) * 4);
      }
    }
    g.putImageData(new ImageData(out, c.width, c.height), 0, 0);
    return c;
  }

  function cell(sheet, name, x, y, scale = 1) {
    const i = atlas[sheet][name];
    if (i === undefined) return;
    ctx.drawImage(img[sheet], (i % atlas.cols) * T, ((i / atlas.cols) | 0) * T, T, T,
      Math.round(x), Math.round(y), T * scale, T * scale);
  }
  function text(str, x, y, white) {
    const f = white ? img.fontWhite : img.font;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i) - 32;
      if (c <= 0 || c > 94) continue;
      ctx.drawImage(f, (c % 16) * 8, ((c / 16) | 0) * 8, 8, 8, x + i * 8, y, 8, 8);
    }
  }
  function bigText(str, x, y, s) {
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i) - 32;
      if (c <= 0 || c > 94) continue;
      ctx.drawImage(img.fontWhite, (c % 16) * 8, ((c / 16) | 0) * 8, 8, 8, x + i * 8 * s, y, 8 * s, 8 * s);
    }
  }
  const center = (str, y, white = true) => text(str, ((W - str.length * 8) / 2) | 0, y, white);
  function box(x, y, w, h) {
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#000'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  }

  // ---------------------------------------------------- sound
  let audio, muted = false;
  function beep(freq, dur = 0.04, vol = 0.04) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = freq; g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* no audio */ }
  }
  const jingle = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, 0.05), i * 110));

  // ---------------------------------------------------- input
  const held = { up: 0, down: 0, left: 0, right: 0, a: 0, b: 0, run: 0 };
  const hit = {};
  const press = (k) => { hit[k] = true; };
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    KeyZ: 'a', Enter: 'a', Space: 'a', KeyX: 'b', Escape: 'b', Backspace: 'b',
    ShiftLeft: 'run', ShiftRight: 'run',
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') { toggleMute(); return; }
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    if (!held[k]) press(k);
    held[k] = 1;
  });
  addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) held[k] = 0; });
  addEventListener('blur', () => Object.keys(held).forEach((k) => (held[k] = 0)));

  function toggleMute() {
    muted = !muted;
    const b = document.getElementById('mute');
    if (b) b.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  }
  document.getElementById('mute')?.addEventListener('click', toggleMute);

  const pad = document.getElementById('dpad');
  if (pad) {
    const setDir = (e) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const before = ['up', 'down', 'left', 'right'].find((d) => held[d]);
      held.up = held.down = held.left = held.right = 0;
      if (Math.hypot(dx, dy) < r.width * 0.12) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      held[d] = 1;
      if (d !== before) press(d);
    };
    const clear = () => { held.up = held.down = held.left = held.right = 0; };
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); setDir(e); e.preventDefault(); });
    pad.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') setDir(e); });
    pad.addEventListener('pointerup', clear);
    pad.addEventListener('pointercancel', clear);
  }
  for (const [id, k] of [['btn-a', 'a'], ['btn-b', 'b']]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); press(k); held[k] = 1; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => (held[k] = 0));
  }

  // ---------------------------------------------------- UI: dialogue, choices, code entry
  const COLS = 27, LINES = 3;
  let ui = null; // {kind:'say'|'choose'|'code'|'inv', ...}
  function wrap(s) {
    const out = [];
    let line = '';
    for (const w of s.split(' ')) {
      const next = line ? `${line} ${w}` : w;
      if (next.length > COLS) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
    return out;
  }
  function paginate(pages) {
    const out = [];
    for (const p of pages) {
      const lines = wrap(p);
      for (let i = 0; i < lines.length; i += LINES) out.push(lines.slice(i, i + LINES));
    }
    return out;
  }
  function say(pages) {
    return new Promise((resolve) => { ui = { kind: 'say', pages: paginate(pages), page: 0, shown: 0, resolve }; });
  }
  // prompt shows in the text box; cancel (B) resolves -1 unless required
  function choose(opts, prompt, required = false) {
    return new Promise((resolve) => {
      ui = { kind: 'choose', opts, idx: 0, prompt: prompt ? paginate([prompt]).pop() : null, required, resolve };
    });
  }
  function codeEntry() {
    return new Promise((resolve) => { ui = { kind: 'code', digits: [0, 0, 0, 0], pos: 0, resolve }; });
  }

  function updateUI() {
    const u = ui;
    if (u.kind === 'say') {
      const total = u.pages[u.page].join('').length;
      if (u.shown < total) {
        u.shown += held.a ? 3 : 1;
        if (u.shown % 3 === 0) beep(880 + (u.shown % 7) * 20, 0.02, 0.02);
        if (hit.a) u.shown = total;
      } else if (hit.a || hit.b) {
        beep(660, 0.03);
        if (++u.page >= u.pages.length) { ui = null; u.resolve(); } else u.shown = 0;
      }
    } else if (u.kind === 'choose' || u.kind === 'inv') {
      if (hit.up) { u.idx = (u.idx + u.opts.length - 1) % u.opts.length; beep(520, 0.02); }
      if (hit.down) { u.idx = (u.idx + 1) % u.opts.length; beep(520, 0.02); }
      if (hit.a) { beep(780, 0.04); ui = null; u.resolve(u.idx); } else if (hit.b && !u.required) { ui = null; u.resolve(-1); }
    } else if (u.kind === 'code') {
      if (hit.left) u.pos = (u.pos + 3) % 4;
      if (hit.right) u.pos = (u.pos + 1) % 4;
      if (hit.up) u.digits[u.pos] = (u.digits[u.pos] + 1) % 10;
      if (hit.down) u.digits[u.pos] = (u.digits[u.pos] + 9) % 10;
      if (hit.up || hit.down || hit.left || hit.right) beep(520, 0.02);
      if (hit.a) { ui = null; u.resolve(u.digits.join('')); } else if (hit.b) { ui = null; u.resolve(null); }
    }
  }

  function drawTextBox(lines, shown = Infinity, arrow = false) {
    const y = H - 48;
    box(2, y, W - 4, 46);
    let left = shown;
    lines.forEach((line, i) => {
      text(line.slice(0, Math.max(0, left)), 12, y + 9 + i * 11);
      left -= line.length;
    });
    if (arrow && (frame >> 4) % 2) cell('sprites', 'arrow', W - 24, y + 30);
  }
  function drawList(opts, idx, x, yBottom, w) {
    const vis = Math.min(opts.length, 6);
    const top = Math.max(0, Math.min(idx - 2, opts.length - vis));
    const h = vis * 12 + 14;
    const y = yBottom - h;
    box(x, y, w, h);
    for (let i = 0; i < vis; i++) {
      const o = opts[top + i];
      text(o.slice(0, ((w - 30) / 8) | 0), x + 20, y + 8 + i * 12);
      if (top + i === idx) cell('sprites', 'cursor', x + 2, y + 8 + i * 12 - 4);
    }
  }
  function drawUI() {
    const u = ui;
    if (!u) return;
    if (u.kind === 'say') {
      const total = u.pages[u.page].join('').length;
      drawTextBox(u.pages[u.page], u.shown, u.shown >= total);
    } else if (u.kind === 'choose') {
      if (u.prompt) drawTextBox(u.prompt);
      const w = Math.max(...u.opts.map((o) => o.length)) * 8 + 32;
      drawList(u.opts, u.idx, W - w - 2, u.prompt ? H - 48 : H - 2, w);
    } else if (u.kind === 'code') {
      drawTextBox(['ENTER EXIT CODE', 'UP/DOWN change, LEFT/RIGHT', 'move, A confirm']);
      box(W / 2 - 44, 30, 88, 50);
      u.digits.forEach((d, i) => {
        text(String(d), W / 2 - 34 + i * 20, 46);
        if (i === u.pos) { ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - 35 + i * 20, 58, 10, 2); }
      });
    } else if (u.kind === 'inv') {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      box(0, 0, W, 22);
      text(`ITEMS   PROTONS: ${S.protons}P`, 10, 7);
      if (!u.opts.length) text('(NOTHING YET)', 20, 40);
      else drawList(u.opts, u.idx, 0, H, W);
    }
  }

  async function openInventory() {
    for (;;) {
      const opts = S.items.map((i) => ITEMS[i][0]);
      const i = await new Promise((resolve) => { ui = { kind: 'inv', opts, idx: 0, resolve }; });
      if (i < 0 || !opts.length) return;
      const d = ITEMS[S.items[i]][1];
      await say(typeof d === 'function' ? d() : [d]);
    }
  }

  // ---------------------------------------------------- world
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const player = { x: 6, y: 4, px: 96, py: 64, tx: 6, ty: 4, dir: 'up', moving: false, stepCount: 0 };
  const charAt = (m, x, y) => (MAPS[m].rows[y] || '')[x] ?? ' ';
  const npcsHere = () => NPCS.filter((n) => n.map === S.map && !(n.gone && n.gone()));
  const thingAt = (x, y) => THINGS.find((t) => t.map === S.map && t.x === x && t.y === y && !flag(`took_${t.item}`));

  function solidAt(x, y, self) {
    const c = charAt(S.map, x, y);
    if (c === 'L' && flag('exit')) return false;
    if (TILEDEF[c][1]) return true;
    for (const n of npcsHere()) {
      if (n === self || n.ghost) continue;
      if ((n.x === x && n.y === y) || (n.moving && n.tx === x && n.ty === y)) return true;
    }
    if (self !== player && ((player.x === x && player.y === y) || (player.tx === x && player.ty === y))) return true;
    return false;
  }

  function tryMove(a, dir) {
    a.dir = dir;
    const [dx, dy] = DIRS[dir];
    if (solidAt(a.x + dx, a.y + dy, a)) return false;
    a.moving = true; a.tx = a.x + dx; a.ty = a.y + dy;
    return true;
  }
  function stepActor(a, speed) {
    const gx = a.tx * T, gy = a.ty * T;
    a.px += Math.sign(gx - a.px) * Math.min(speed, Math.abs(gx - a.px));
    a.py += Math.sign(gy - a.py) * Math.min(speed, Math.abs(gy - a.py));
    if (a.px === gx && a.py === gy) { a.x = a.tx; a.y = a.ty; a.moving = false; a.stepCount = (a.stepCount || 0) + 1; return true; }
    return false;
  }

  let turnHold = 0, lastDir = null, bump = 0;
  function heldDir() {
    if (lastDir && held[lastDir]) return lastDir;
    lastDir = ['up', 'down', 'left', 'right'].find((d) => held[d]) || null;
    return lastDir;
  }

  function updatePlayer() {
    if (player.moving) {
      if (stepActor(player, held.run ? 4 : 2)) arrive();
      if (player.moving) return;
    }
    if (busy) return;
    if (hit.a) return run(interact);
    if (hit.b) return run(openInventory);
    const d = heldDir();
    if (!d) { turnHold = 0; return; }
    if (d !== player.dir && turnHold === 0) { player.dir = d; turnHold = 1; return; }
    if (turnHold > 0 && turnHold < 5) { turnHold++; return; }
    if (!tryMove(player, d)) {
      if (bump-- <= 0) { beep(90, 0.05, 0.03); bump = 18; }
    }
  }

  function arrive() {
    const m = MAPS[S.map];
    const w = m.warps[`${player.x},${player.y}`];
    if (w) return run(() => warp(w));
    if (charAt(S.map, player.x, player.y) === 'U') return run(ending);
  }

  // ---------------------------------------------------- async plumbing
  let busy = false;
  async function run(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } finally { busy = false; }
  }
  const wait = (frames) => new Promise((r) => waiters.push([frame + frames, r]));
  let waiters = [];
  let fade = 0, flash = 0;
  async function fadeTo(level) {
    while (fade !== level) { fade += Math.sign(level - fade); await wait(4); }
  }
  async function warp([m, x, y, dir], zap) {
    if (zap) { for (let i = 0; i < 6; i++) { flash = i % 2 ? 0 : 3; beep(1200 - i * 150, 0.05); await wait(5); } flash = 0; }
    else { beep(330, 0.06); setTimeout(() => beep(247, 0.08), 70); }
    await fadeTo(4);
    S.map = m;
    Object.assign(player, { x, y, tx: x, ty: y, px: x * T, py: y * T, dir, moving: false });
    save();
    toast = { text: MAPS[m].name, until: frame + 100 };
    await fadeTo(0);
  }

  async function interact() {
    const [dx, dy] = DIRS[player.dir];
    const x = player.x + dx, y = player.y + dy;
    const npc = npcsHere().find((n) => n.x === x && n.y === y) ||
      npcsHere().find((n) => n.ghost && Math.abs(n.x - x) + Math.abs(n.y - y) <= 1 && S.map === 'labB');
    if (npc && npc.kind !== 'bees') return npc.talk(npc);
    const th = thingAt(x, y);
    if (th) {
      if (th.locked && th.locked()) return say(WORDS.slimeWarn);
      await say(WORDS[th.words]);
      S.flags[`took_${th.item}`] = 1;
      return give(th.item);
    }
    const c = charAt(S.map, x, y);
    const fn = (EXAMINE[S.map] || {})[c];
    if (fn) return fn(x, y);
    if (npc) return npc.talk(npc);
  }

  function updateNPC(n) {
    if (n.moving) { stepActor(n, 1); return; }
    if (!n.wander || busy) return;
    if (--n.timer > 0) return;
    n.timer = 60 + Math.random() * 120;
    const d = pick(Object.keys(DIRS));
    const [dx, dy] = DIRS[d];
    if (Math.abs(n.x + dx - n.home[0]) > n.wander || Math.abs(n.y + dy - n.home[1]) > n.wander) return;
    if (n.ghost) {
      const c = charAt(S.map, n.x + dx, n.y + dy);
      if (!TILEDEF[c] || TILEDEF[c][1] && c !== 'h') return;
      n.moving = true; n.tx = n.x + dx; n.ty = n.y + dy;
      return;
    }
    tryMove(n, d);
  }

  // ---------------------------------------------------- battle
  let battleState = null;
  async function battle() {
    await fadeTo(4);
    battleState = { hp: 12, slimes: [6, 6, 6], shake: 0, hurt: 0 };
    scene = 'battle';
    await fadeTo(0);
    await say(WORDS.battleStart);
    const B = battleState;
    let result = null;
    while (!result) {
      const c = await choose(['FIGHT', 'ITEM', 'RUN'], `HP ${B.hp}/12   SLIMES LEFT: ${B.slimes.filter((s) => s > 0).length}`, true);
      if (c === 0) {
        const target = B.slimes.findIndex((s) => s > 0);
        B.shake = 12;
        beep(150, 0.1, 0.06);
        if (has('blade')) { B.slimes[target] = 0; await say(WORDS.hitBlade); } else await say(WORDS.hitFist);
      } else if (c === 1) {
        const opts = S.items.map((i) => ITEMS[i][0]);
        if (!opts.length) { await say(['You have nothing.']); continue; }
        const i = await choose(opts, 'USE WHICH?');
        if (i < 0) continue;
        await say(S.items[i] === 'chris' ? WORDS.itemChris : WORDS.itemNotNow(opts[i]));
      } else {
        await say(WORDS.run);
        result = 'run';
        break;
      }
      const alive = B.slimes.filter((s) => s > 0).length;
      if (!alive) { result = 'win'; break; }
      if (has('armor')) await say(WORDS.slimeBounce);
      else {
        const dmg = alive * 4;
        B.hp = Math.max(0, B.hp - dmg);
        B.hurt = 12;
        beep(80, 0.15, 0.06);
        await say(WORDS.slimeHit(alive, dmg));
        if (B.hp <= 0) { result = 'lose'; }
      }
    }
    if (result === 'win') { jingle(); await say(WORDS.win); S.flags.slimes = 1; }
    if (result === 'lose') await say(WORDS.lose);
    await fadeTo(4);
    scene = 'play';
    battleState = null;
    if (result !== 'win') {
      S.map = 'hub';
      Object.assign(player, { x: 14, y: 1, tx: 14, ty: 1, px: 14 * T, py: T, dir: 'down', moving: false });
    }
    save();
    await fadeTo(0);
  }

  function drawBattle() {
    const B = battleState;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 76, W, 2);
    const first = B.slimes.findIndex((s) => s > 0);
    B.slimes.forEach((hp, i) => {
      if (hp <= 0) return;
      const sx = 30 + i * 64 + (i === first && B.shake > 0 ? ((B.shake % 4) - 2) * 2 : 0);
      cell('sprites', `slime${(frame >> 4) % 2}`, sx, 30, 3);
    });
    if (B.shake > 0) B.shake--;
    if (B.hurt > 0) { B.hurt--; if (B.hurt % 4 < 2) { ctx.fillStyle = img.dither[2]; ctx.fillRect(0, 0, W, H); } }
    text('SLIMES', 8, 6);
  }

  // ---------------------------------------------------- ending
  async function ending() {
    await fadeTo(4);
    scene = 'ending';
    endPage = 0;
    await fadeTo(0);
    for (endPage = 0; endPage < WORDS.ending.length; endPage++) {
      await waitA();
    }
    endPage = -1;
    jingle();
    await waitA();
    clearSave();
    location.reload();
  }
  let endPage = 0;
  const waitA = () => new Promise((r) => { waitingA = r; });
  let waitingA = null;

  function drawEnding() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // stars drifting down: the planet falling away
    for (let i = 0; i < 40; i++) {
      const x = (i * 53) % W, y = (i * 97 + frame * (1 + (i % 3))) % H;
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 1, 1);
    }
    if (endPage >= 0) {
      const lines = wrap(WORDS.ending[endPage]);
      lines.forEach((l, i) => center(l, 60 + i * 12 - lines.length * 6));
    } else {
      bigText('SCIENCE', (W - 7 * 16) / 2, 44, 2);
      bigText('COMPLETE', (W - 8 * 16) / 2, 66, 2);
      center('THANKS FOR PLAYING', 104);
    }
    if ((frame >> 5) % 2) cell('sprites', 'arrow', W - 22, H - 18);
  }

  // ---------------------------------------------------- save
  const KEY = 'sciencecomplete.save.v1';
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.assign({}, S, { x: player.x, y: player.y, dir: player.dir })));
    } catch (e) { /* no storage */ }
  }
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------- drawing
  let frame = 0, scene = 'title', toast = null;

  function tileName(def) {
    const t = def[0];
    if (!ANIM[t]) return t;
    return `${t}${(frame / ANIM[t] | 0) % 2}`;
  }

  function drawWorld() {
    const m = MAPS[S.map];
    const mw = m.rows[0].length * T, mh = m.rows.length * T;
    const cx = mw <= W ? (mw - W) / 2 : Math.max(0, Math.min(mw - W, player.px + 8 - W / 2));
    const cy = mh <= H ? (mh - H) / 2 : Math.max(0, Math.min(mh - H, player.py + 8 - H / 2));
    const ox = -Math.round(cx), oy = -Math.round(cy);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const base = S.map === 'breakroom' ? 'floor' : 'lab_floor';
    for (let y = 0; y < m.rows.length; y++) {
      for (let x = 0; x < m.rows[y].length; x++) {
        const c = m.rows[y][x];
        const def = TILEDEF[c];
        if (!def || !def[0]) continue;
        const px = ox + x * T, py = oy + y * T;
        if (def[2]) cell('tiles', def[2] === 'base' ? base : def[2], px, py);
        if (c === 'L' && flag('exit')) cell('tiles', 'doorway', px, py);
        else cell('tiles', tileName(def), px, py);
      }
    }
    for (const t of THINGS) {
      if (t.map === S.map && !flag(`took_${t.item}`)) cell('sprites', t.sprite, ox + t.x * T, oy + t.y * T - 6);
    }
    const actors = [player, ...npcsHere()].sort((a, b) => a.py - b.py);
    for (const a of actors) {
      let name, dy = -2;
      if (a === player) {
        const phase = a.moving && (Math.abs(a.px - a.tx * T) + Math.abs(a.py - a.ty * T)) < 9;
        if (a.dir === 'left' || a.dir === 'right') name = `s_${a.dir}${phase ? 1 : 0}`;
        else name = `s_${a.dir}${phase ? (a.stepCount % 2 ? 1 : 2) : 0}`;
      } else {
        const k = a.kind === 'chris' && flag('hatGiven') ? 'chris_hat' : a.kind;
        name = `${k}${(frame >> (a.kind === 'bees' ? 3 : 5)) % 2}`;
        if (a.kind === 'ad') dy = Math.round(Math.sin(frame / 15 + a.x) * 1.5) - 2;
      }
      cell(S.map === 'net' ? 'spritesLit' : 'sprites', name, ox + a.px, oy + a.py + dy);
    }
  }

  function drawToast() {
    if (!toast || frame > toast.until || ui) return;
    const w = toast.text.length * 8 + 16;
    box(4, 4, w, 22);
    text(toast.text, 12, 11);
  }

  let titleOpts = null;
  function drawTitle() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    bigText('SCIENCE', (W - 7 * 16) / 2, 22, 2);
    bigText('COMPLETE', (W - 8 * 16) / 2, 44, 2);
    center('A ROUGH BUILD', 72);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 88, W, 24);
    const t = frame, x = ((t * 0.6) % (W + 80)) - 40;
    cell('sprites', `s_right${(t >> 3) % 2}`, x, 92);
    cell('sprites', `chris${(t >> 4) % 2}`, x - 22, 92);
    cell('sprites', `slime${(t >> 4) % 2}`, x - 64, 92);
    if (!titleOpts && (t >> 5) % 2) center(matchMedia('(pointer: coarse)').matches ? 'TAP A TO START' : 'PRESS Z TO START', 128);
  }

  function render() {
    if (scene === 'title') drawTitle();
    else if (scene === 'battle') drawBattle();
    else if (scene === 'ending') drawEnding();
    else { drawWorld(); drawToast(); }
    if (scene !== 'ending') drawUI();
    const f = Math.max(fade, flash);
    if (f > 0) { ctx.fillStyle = f >= 4 ? '#000' : img.dither[f]; ctx.fillRect(0, 0, W, H); }
  }

  async function startGame() {
    const saved = loadSave();
    if (saved) {
      titleOpts = true;
      const c = await choose(['CONTINUE', 'NEW GAME'], null, true);
      titleOpts = null;
      if (c === 0) S = Object.assign(fresh(), saved);
      else { clearSave(); S = fresh(); }
    }
    beep(784, 0.08);
    await fadeTo(4);
    scene = 'play';
    Object.assign(player, { x: S.x, y: S.y, tx: S.x, ty: S.y, px: S.x * T, py: S.y * T, dir: S.dir, moving: false });
    toast = { text: MAPS[S.map].name, until: frame + 100 };
    await fadeTo(0);
    if (!saved || !Object.keys(S.flags).length && !S.items.length) await say(WORDS.intro);
  }

  function update() {
    frame++;
    waiters = waiters.filter(([f, r]) => (f <= frame ? (r(), false) : true));
    if (waitingA && (hit.a || hit.b)) { const r = waitingA; waitingA = null; r(); }
    else if (ui) updateUI();
    else if (scene === 'title') { if (hit.a && !busy) run(startGame); }
    else if (scene === 'play' && fade === 0 && !flash) updatePlayer();
    if (scene === 'play') npcsHere().forEach(updateNPC);
    for (const k in hit) delete hit[k];
  }

  function fit() {
    const r = document.getElementById('stage').getBoundingClientRect();
    const s = Math.min((r.width - 16) / W, (r.height - 16) / H);
    const k = s >= 2 ? Math.floor(s) : s;
    canvas.style.width = `${W * k}px`;
    canvas.style.height = `${H * k}px`;
  }
  addEventListener('resize', fit);

  let last = 0, acc = 0;
  function loop(ts) {
    acc += Math.min(100, ts - (last || ts));
    last = ts;
    while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
    render();
    requestAnimationFrame(loop);
  }

  load().then(() => { fit(); requestAnimationFrame(loop); }).catch((e) => {
    document.getElementById('stage').textContent = 'Could not load assets.';
    console.error(e);
  });

  window.SC = { get S() { return S; }, get ui() { return ui; }, get busy() { return busy; }, get scene() { return scene; }, player, NPCS, MAPS, has };
})();
