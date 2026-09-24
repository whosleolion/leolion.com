---
title: Connections Map
type: chart
author: thomas
---

```chart
frame deal @ 590,262 800x160 dashed : the deal
frame hench @ 632,292 290x86 pink
node goldtusk @ 775,145 170x60 pink : [[Tiberius Goldtusk|Goldtusk]] / Head of Orc Mafia
node vale @ 170,250 130x44 pink : Vale Parents
node detective @ 150,375 170x44 pink : Gentleman Detective
node cassandra @ 97,485 160x72 gold : [[Cassandra|Cassandra Vale]] / High Elf Sorcerer / (Neha)
node olf @ 97,625 130x56 pink : [[Olf]] / Homunculus
node orson @ 420,352 130x56 pink : [[Orson Dive]] / Shark Man
node finnian @ 437,485 160x72 gold : [[Finnean|Finnian Fernbrook]] / Halfling Wizard / (Thomas)
node pious @ 712,335 120x56 pink : [[Pious & Reverent Henchman|Pious]] / Orc Henchman
node reverent @ 842,335 120x56 pink : [[Pious & Reverent Henchman|Reverent]] / Orc Henchman
node forgp @ 1047,291 110x24 text : for 500gp
node scrolls @ 1047,335 170x44 green : [[Necromantic Scrolls|Necromancer Scrolls]]
node koldovich @ 1257,335 150x56 pink : [[Alamir Koldovich]] / Dwarven Wizzard
node felt @ 775,485 130x72 gold : [[Felt]] / Gnome Rogue / (Noah)
node rosie @ 1257,600 140x72 gold : [[Rosie]] / Human Ranger / (Zach)
node deadnecro @ 1507,345 160x44 pink : [[The Necromancer|Dead Necromancer]]
node elves @ 1692,175 170x44 pink : Two old elf brothers
node johnny5 @ 1507,525 170x72 pink : [[Five|Johnny 5]] / Mysterious Skeleton / Child
node wizprof @ 937,715 130x44 pink : [[Prof. Alastair Gizamgot|Wizard Prof]]
node captain @ 427,845 150x44 pink : [[Captain Barry Knightly|Captain of Guard]]
node rug @ 677,845 100x44 gold : [[Rug Shagley|Rug]]
node carpet @ 852,845 100x44 gold : [[Carpet Kelly|Carpet]]
node adopted @ 765,905 140x24 text : Adopted family
edge cassandra -> goldtusk bend -60 : Kidnapped by / sold to / for ransom to pay for necromancer lab
edge vale -- goldtusk dashed : possible "business" / connection?
edge vale -> detective : Hired
edge detective -> cassandra : To find
edge olf -> cassandra : Watches after
edge orson -> deal : hosted the deal at / dive's bistro
edge finnian -> orson : employed at dive' bistro
edge hench -> goldtusk : Working for
edge felt -> hench : employed for suitcase deal
edge scrolls -> hench : to
edge koldovich -> scrolls : Selling
edge hench -> koldovich bend -150 : h+h after koldovich for money for deal, / possibly mad at us as we made the scrolls disapear
edge rosie -> koldovich : employed for suitcase deal
edge koldovich -> elves bend 60 : staying at
edge scrolls -> deadnecro bend 100 : scroll is probably to restart / dead necromancer's work
edge goldtusk -- deadnecro bend -110 : Working for, not sure which direction
edge johnny5 -> deadnecro : Created
edge felt -> johnny5 bend 200 : adopted by
edge finnian -> wizprof bend 60 : Student of
edge scrolls -> wizprof : party recovered scroll, / gave to prof for disposal
edge rug -> felt
edge carpet -> felt
edge rug -- carpet
edge captain -> rug : Captured
edge carpet -> johnny5 bend 80 : Betrayed, / tried to sell
```
