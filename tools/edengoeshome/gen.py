import os
import os as _os, unicodedata as _ud, html as _html
OUT=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),'..','..','src','building','edengoeshome')
FA='https://fundraising.fracturedatlas.org/eden-goes-home/campaigns/1019a599-339a-434a-983c-9e9f89e51e59'
TIX='https://innovationtickets.com/product/eden-goes-home/'
NYTF='https://newyorktheaterfestival.com/eden-goes-home/'
IG='https://www.instagram.com/edengoeshome/'
PAGES=[('index.html','Home'),('about.html','About'),('artists.html','Artists'),('support.html','Support')]

def page(fname,title,desc,body,head_extra=''):
    nav=''.join(f'<li><a href="{f}"{" aria-current=\"page\"" if f==fname else ""}>{n}</a></li>' for f,n in PAGES)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- STAGING: remove this noindex line when the site is ready to be found by search engines -->
<meta name="robots" content="noindex">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#1f1a63">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="https://edengoeshome.com/images/cover.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
{head_extra}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav"><div class="wrap"><a class="brand" href="index.html">Eden Goes Home</a><nav aria-label="Main"><ul>{nav}</ul></nav></div></header>
<main id="main">
{body}
</main>
<footer><div class="wrap">
<div class="credits">
<div class="logos">
<a href="https://fracturedatlas.org" class="logo-fa" aria-label="Fractured Atlas"><img src="images/fractured-atlas-light.svg" alt="Fractured Atlas" height="40"></a>
<a href="{NYTF}" class="logo-nytf" aria-label="Winterfest, New York Theater Festival"><img src="images/nytf-logo.jpg" alt="New York Theater Festival" width="216" height="45"></a>
</div>
<p><strong>This is a fiscally sponsored project.</strong> <em>Eden Goes Home</em> is fiscally sponsored by <a href="https://fracturedatlas.org">Fractured Atlas</a>. Donations are fully tax-deductible.</p>
<p><em>Eden Goes Home</em> is a new musical by Lena Streitwieser, fully staged at Winterfest, presented by the <a href="{NYTF}">New York Theater Festival</a>, December 2026.</p>
</div>
<div>
<p><a href="{IG}">Instagram @edengoeshome</a><br><a href="{TIX}">Tickets</a> &middot; <a href="{FA}">Donate</a></p>
<p class="credits">Website by <a href="https://leolion.com">Leo Lion</a>.</p>
</div></div></footer>
<script src="js/site.js"></script>
</body></html>
'''

def head(h,p=''):
    return f'<section class="page-head"><div class="wrap"><h1>{h}</h1></div></section>'

DATES=[('Tue, Dec 8','9:00 pm'),('Wed, Dec 9','6:30 pm'),('Sat, Dec 12','4:30 pm')]
def dates_cards():
    return '<div class="cards">'+''.join(f'<div class="card"><div class="big">{d}</div><p style="margin:.3em 0 0"><b>{t}</b><br>Teatro LATEA<br>107 Suffolk St, New York</p></div>' for d,t in DATES)+'</div>'

ld='''<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
'''+',\n'.join(f'''{{"@type":"TheaterEvent","name":"Eden Goes Home","startDate":"2026-12-{d}T{t}-05:00","eventStatus":"https://schema.org/EventScheduled","location":{{"@type":"Place","name":"Teatro LATEA","address":{{"@type":"PostalAddress","streetAddress":"107 Suffolk St","addressLocality":"New York","addressRegion":"NY","addressCountry":"US"}}}},"performer":{{"@type":"Person","name":"Lena Streitwieser"}},"image":"https://edengoeshome.com/images/cover.jpg","offers":{{"@type":"Offer","url":"{TIX}"}}}}''' for d,t in [('08','21:00:00'),('09','18:30:00'),('12','16:30:00')])+'\n]}\n</script>\n'


SYN="When Trinity College Dublin student Eden Summers unexpectedly has to move back &lsquo;home&rsquo; to her small town in the U.S. due to her grandmother&rsquo;s illness, she struggles to navigate balancing family, friends, and school with her dream of a bigger future. Exploring themes of generational tension, socio-economic status, mental health, and national identity, <em>Eden Goes Home</em> is a moving new musical by Lena Streitwieser."
CREDIT='<p class="small">Description by Bella Littler.</p>'

index=f"""<section class="hero">
<div class="wrap"><div>
<span class="eyebrow">A new musical &middot; Winterfest 2026</span>
<h1>Eden Goes <em>Home</em></h1>
<p class="script lede">Who are you when &ldquo;home&rdquo; isn&rsquo;t home?</p>
<p class="lede"><b>December 8&ndash;12, 2026</b><br>Teatro LATEA &middot; 107 Suffolk St, New York</p>
<div class="btns"><a class="btn" href="{TIX}">Get tickets</a><a class="btn alt" href="support.html">Donate</a></div>
<div class="count" id="countdown" aria-label="Countdown to opening night"><div><b>&middot;</b><span>days</span></div><div><b>&middot;</b><span>hrs</span></div><div><b>&middot;</b><span>min</span></div><div><b>&middot;</b><span>sec</span></div></div>
</div>
<div class="poster-wrap"><img class="poster" src="images/cover.jpg" width="1000" height="1000" alt="Eden Goes Home cover art: the title above a purple house silhouette with a green figure standing inside it, set over a map of Ireland with a small paper airplane."></div>
</div><div class="torn"></div></section>
<section class="sheet" id="tickets"><div class="wrap">
<h2>Performances</h2>
<p class="presented">Winterfest &middot; presented by the <a href="{NYTF}">New York Theater Festival</a></p>
{dates_cards()}
<div class="btns"><a class="btn" href="{TIX}">Buy tickets</a></div>
</div></section>
<section class="bricks"><div class="wrap two">
<div><h2>What is Eden Goes Home?</h2>
<p>{SYN}</p>{CREDIT}
<p><a class="btn alt" href="about.html">About the show</a></p></div>
<div class="card"><h3>Support Our Show!</h3>
<p>With the support of fiscal sponsorship program Fractured Atlas, we have launched a fundraising campaign for <em>Eden Goes Home</em>, to finance payment for actors, crew, instrumentalists; props and costumes; projections; rehearsal spaces; and other general production costs.</p>
<a class="btn" href="support.html">Support the show</a></div>
</div></section>"""

about=head('About the Show')+f"""
<section class="sheet"><div class="wrap two">
<div><h2>What is Eden Goes Home?</h2>
<p><em>Eden Goes Home</em> is an original musical centered around themes of cross-generational tensions, socio-economic struggles, questions of national identity, and mental health. When Eden Summers, an American student at Trinity College Dublin, moves back to her small town in the U.S. due to her grandmother&rsquo;s worsening dementia, she learns to appreciate the sacrifices her family members made to give her a brighter future. Granny fights for a way to be heard, despite the deterioration brought on by her dementia. Julie, Eden&rsquo;s mother, laments the dream she left behind to help raise Eden. George, Julie&rsquo;s husband, works overtime to earn enough money for the family to get by, all while trying to be the emotional anchor. Eden puts on a show while she buries her true self underneath a layer of frustration and depression.</p>
<p>Although the show focuses largely on Eden, the presence of Granny permeates the pain of the central characters. The weight of her regression hangs heavily over the family. Without proper support from a retirement home equipped to care for dementia patients, Granny would not be able to function. Without Eden moving home from Ireland, Julie and George could never manage to get the help Granny increasingly urgently needs. Something had to give.</p></div>
<div><p><em>Eden Goes Home</em> may only focus on one family, but their struggles serve as a microcosm of broader societal issues. As Eden and her family grapple with the domestic changes brought about by their financial, emotional, and personal strife, they eventually learn to lean on each other rather than mourning in isolation. When the lights dim and the music swells, the audience will grieve and laugh with the Summers family on stage. Ultimately, both the characters on the stage and the viewers in the audience will be transformed.</p>
<p style="margin-top:24px"><span class="tag">Generational tension</span><span class="tag">Socio-economic status</span><span class="tag">Mental health</span><span class="tag">National identity</span></p></div>
</div></section>
<section class="bricks"><div class="wrap two">
<div><h2>Eden Goes Home&rsquo;s Journey!</h2>
<p><em>Eden Goes Home</em> began with a single song. Director Lena Streitwieser wrote what would eventually become &ldquo;Putting on a Show,&rdquo; a crucial song for Eden near the beginning of the musical. When Lena&rsquo;s parents heard the song, they remarked that it sounded like it belonged in a musical, and that small observation sparked the idea for <em>Eden Goes Home</em>.</p>
<p>Like Eden, Lena attended college abroad and found herself grappling with the question of what &ldquo;home&rdquo; really means. From that starting point, the musical grew through writing, collaboration, and the work of an all-female production team.</p></div>
<div>
<div class="card"><h3>November 2025</h3><p>In November 2025, <em>Eden Goes Home</em> took its first step onto the stage as a rehearsed reading at the Chain Theatre. The response was warm and encouraging, giving the team valuable insight into how the story and its characters resonated with an audience. Since then, Lena has continued developing the show, adding three new songs and revising the book based on feedback from the reading.</p><p class="small">Presented by the <a href="{NYTF}">New York Theater Festival</a>.</p></div>
<div class="card" style="margin-top:20px"><h3>December 2026</h3><p>In December 2026, the <em>Eden Goes Home</em> team will bring the musical to life as a fully staged production at Winterfest. This production will allow us to move beyond the page and into the world of the Summers family, with a complete production, new material, and an audience experiencing the show as a finished piece of theatre.</p></div></div>
</div></section>
<section class="sheet"><div class="wrap two"><div><h2>Director&rsquo;s Note</h2><p class="pull">Have you ever felt disconnected from yourself?</p></div>
<div><p>Untethered to the life unfolding around you? Conflicted on how to be the most truthful version of yourself, and still blend in with your environment? This is the central conflict of Eden Summers, a young woman trying her best to be authentic while struggling under the weight of responsibilities just beyond the stage of life she was unwillingly and suddenly thrust into. Does this sound familiar?</p>
<p>In a way, Eden&rsquo;s plight is universal; we all yearn for human connection, worry too much about blending in, and strive to find our place in this wide world. Eden is not the only character in <em>Eden Goes Home</em> with deeply human goals, however: her father, George, works two jobs to provide for his wife and daughter, while constantly being concerned that his efforts aren&rsquo;t enough. The pressure he feels to support his family is immense, though he keeps it buried underneath his sunny fa&ccedil;ade. His wife, Julie, straddles the difficult line between emotionally supporting her turbulent daughter, Eden, and being the sole caregiver for her rapidly aging and deteriorating mother, Nancy. The true identity of Nancy, or Granny, as Eden knows her, simmers underneath the surface of her dementia-rotten brain, crying to crawl back to the surface, where she might have a chance of being understood. In this sense, Granny&rsquo;s struggle mirrors Eden&rsquo;s own: they both crave connection, though encounter difficulties while finding an authentic way to achieve it.</p>
<p>Although <em>Eden Goes Home</em> centers around one small, suburban family, its themes run deeper than their tree-lined avenue. Generational tensions run high, and permeate the prose as they accent the music. Each character&rsquo;s deep-seeded desire to be heard pushes through the noise either in a solo song, or in a multi-character ballad aiming to move the hearts of a captured audience. My goal is to reach audiences of all shapes and sizes. Due to the musical&rsquo;s inherent family-centered themes, I expect parents with young adult children to relate most strongly to the show, but I sincerely hope and expect people of all walks of life to feel connected to the characters and relate in some way to the journey they embark on together.</p>
<p class="script">&mdash; Lena Streitwieser</p></div></div></section>
<section class="bricks"><div class="wrap"><h2>Performances</h2>{dates_cards()}
<div class="btns"><a class="btn" href="{TIX}">Get tickets</a></div></div></section>"""


def ig(h): return f'<a href="https://www.instagram.com/{h}/">@{h}</a>'
CREW=[
('Lena Streitwieser','Director, Musical Director, Writer/Composer, Eden Summers',"Lena Streitwieser is a storyteller based in New York City. She is a recent graduate of the Dual BA with Trinity College Dublin and Columbia University, having studied film and music. Her work as a film director has been awarded in festivals from California to Japan. She has published film reviews, festival reviews, and essays, though she writes most consistently in her diary. Living in Berlin, Washington, D.C., Dublin, Chicago, and New York has inspired her creatively. <em>Eden Goes Home</em> is her first musical. Eternal thanks to my incredible family and friends for helping my dreams come true! <a href=\"https://www.lenastreitwieser.com\">www.lenastreitwieser.com</a>"),
('Sonja Dighe','Producer, Stage Manager',"Sonja Dighe is a theatre producer and administrator who works across multiple international theatre venues and festivals. She has brought shows to Dublin, Edinburgh, Prague, London, Washington D.C., Philadelphia, San Francisco, Kansas City, Seattle, L.A., and Austin. In NYC she&rsquo;s developed shows at The Tank, A.R.T. NY, MCC, Downtown Art, and BAH. Sonja supports original musicals, fringe shows, and interactive experiences, such as Edinburgh Horror Festival&rsquo;s Best Musical <em>Ghosted! A New Musical</em>, <em>Help Me!!!!</em>, <em>Kaddish (How to be a Sanctuary)</em>, and <em>Liar&rsquo;s Night</em>. She is co-founder of Helianthus Productions and associate producer at The Firebird Project."),
('Xavier Miller','Orchestrator',''),
('Daniel Sirgado','Social Media Manager',''),
('Makena Margolin','Movement Coordinator/Choreographer',''),
('Leo Lion','Graphic/Web Designer, Marketing',"Leo Lion is a theatre &amp; games artist best known for interactive &amp; immersive experiences like <em>HELP ME!!!!, I Was Never Here (there is no spy show), Liar&rsquo;s Night,</em> and roleplaying game shows like <em>Trouble Feature</em> and <em>Scandalton: Live.</em> He is the Artistic Director of The Firebird Project. More about Leo&rsquo;s work at <a href=\"https://leolion.com\">leolion.com</a>"),
]
CAST=[
('Laura Jones','Julie Summers',"Laura participated in the staged reading in 2025 and loved the show. She is thrilled to be returning to bring Julie to life on the stage. Thank you, Lena, for trusting me with your creation. Past favorite roles include: Florence (Chess), Golde (Fiddler on the Roof), Elizabeth (Pride and Prejudice). Thank you, to my love, Brian, for always supporting me and joining me in this adventure. IG: "+ig('laura_lutz_jones')),
('John Sannuto','George Summers',''),
('Victoria Christi','Granny/Nancy Walters',''),
('Ginger Von Klein','Producer, Niamh Donoghue, Ensemble',"Ginger von Klein is an NYC-based actress and filmmaker who is so excited to be producing <em>Eden Goes Home</em>! Her work includes several performances in the D.C. area, including most recently playing Viola in Shakespeare&rsquo;s Twelfth Night at The Theatre Lab. She has directed and produced several festival-recognized short films, her favourite of them being &ldquo;Astraphobia&rdquo; which was nominated in the D.C. International Cinema Festival. She has also worked as an assistant director for several youth programs at The Theatre Lab, which she loved doing for several years."),
('Anneka Shepherd','Pauline, Ensemble',"Anneka is so excited to be a part of <em>Eden Goes Home</em>! Some favorite previous roles include Janet in <em>The Magic School Bus: Lost In The Solar System National Tour,</em> Wendla in <em>Spring Awakening</em>, Little Red in <em>Into The Woods</em>, and Maureen in <em>RENT.</em> A proud AMDA Alum, and VT Native. Thank you to Lena for your beautiful writing and trusting me with our girl Pauline, and to Jennifer Buchanan at Free Flight Talent for making it all possible. <a href=\"http://www.annekashepherd.com\">www.annekashepherd.com</a> "+ig('annekashepherd')),
('Rosie Mueller','Forest, Ensemble',"Rosie Mueller is a queer actor, writer, producer, teaching artist, and musician in NYC, and member of Hamlet Isn&rsquo;t Dead&rsquo;s Resident Acting Company. Select credits include Puck in Midsummer, the new plays Imagination Ward, Entomon, 18 West 11th Street, and No Joke (Amazon Prime). Rosie&rsquo;s projects include the play My Immortal: Da Fanfiction of Da Fanfiction (WorkShop Theater Writer&rsquo;s Intensive, The Tank, Brooklyn Art Haus, DashCon Two) and her short horror film retelling the myth of Bloody Mary before, during, and after Roe v. Wade (currently in post-production). Training: NYU Tisch (Stella Adler, Stonestreet, RADA). <a href=\"http://www.emmarosemueller.com\">www.emmarosemueller.com</a> IG: "+ig('itsrosienow')),
('Brian Cook','Brian Donoghue, Ensemble',''),
('Cassaundra Reed','Shannon Donoghue, Ensemble',''),
('Taylor Parker','Rachel, Siobhan, Ensemble',"Taylor Parker is a New York City-based performer who is thrilled to be back with the <em>Eden Goes Home</em> family after last year&rsquo;s staged reading! She holds a BFA in Musical Theatre and a minor in Music from Catawba College. After touring nationally with Missoula Children&rsquo;s Theatre, she received her MA in Musical Theatre from the Alabama School of the Arts. Some of her favorite credits include Alice Murphy in Bright Star, Lauren in Kinky Boots, and Miss Honey in Matilda. Endless love to JP, Bear, Masago, RS, and Waffle! <a href=\"https://TaylorParker.carrd.co\">TaylorParker.carrd.co</a>"),
('Olivia Dower','Annette, Ensemble',"Olivia Dower is an actor, writer, and theatermaker from Westchester, NY. She recently graduated from Bard College, where she double-majored in Theater and Performance and Political Studies. Recent credits include <em>Peek-a-Boo</em> with Rivers Edge Theater Company, Petra in <em>A Little Night Music</em> at Arc Stages, and Squeaky Fromme in <em>Assassins</em> at Bard College. She is thrilled to be making her New York Theater Festival debut as Annette in <em>Eden Goes Home</em>. Olivia is passionate about new work, experimental theater, and creating art across mediums. Many thanks to Lena for her extraordinary artistry, generosity, and guidance throughout this process!"),
('Jacqueline Evangelista','Victoria, Ensemble',"Jacqueline Evangelista is a NYC-based actress and singer, thrilled to be a part of the company of <em>Eden Goes Home</em>. Select credits include <em>Little Women: The Musical</em> (Jo March), <em>Into the Woods</em> (Witch), <em>Urinetown</em> (Penelope Pennywise), <em>Hurricane Diane (Carole Fleischer) Mr. Burns, A Post-Electric Play</em> (Quincy/Bart), <em>The Mitfords at War</em> (Unity Mitford), and <em>Twelve Maids</em> (Maid/u/s Penelope &amp; Eurycleia). She is a recent graduate of Vassar College, where she earned a B.A. in Drama and Economics with a correlate in Vocal Music Performance. Website: <a href=\"http://www.jacqueline-evangelista.com\">www.jacqueline-evangelista.com</a> IG: "+ig('j_evangie')),
('Tommer Kerem','Zach, Ensemble',''),
('Jake Scacalossi','Daniel, Ensemble',''),
]
BAND=[
('&Oacute;rla Meyers','Piano, Band Lead',"&Oacute;rla is the pianist for <em>Eden Goes Home</em>. She is a senior in the Dual BA program between Sciences Po Paris and Columbia University. &Oacute;rla studies Political Science but music is where most of her energy goes these days. She grew up immersed in both NYC&rsquo;s classical music scene and the rich traditional music of Ireland, where her parents now live. This summer, she wrote and recorded original music, a challenging but exciting experience. She feels lucky to have been exposed to a wide variety of music genres over the years, and even luckier that she gets to add musical theatre to that list with <em>Eden Goes Home</em>!"),
('Jonathan Parker','Bass',''),
]
import re as _re
def _initials(n):
    n=_re.sub(r'&\w+;','O',n) if n.startswith('&') else n
    w=n.split();return (w[0][0]+w[-1][0]).upper()
def _slug(n):
    n=_ud.normalize('NFKD',_html.unescape(n)).encode('ascii','ignore').decode().lower()
    return _re.sub(r'[^a-z0-9]+','-',n).strip('-')
def roster(people):
    out=[]
    for n,r,b in people:
        bio=f'<p>{b}</p>' if b else '<p class="small">Bio coming soon.</p>'
        sl=_slug(n)
        if _os.path.exists(_os.path.join(OUT,'images','artists',sl+'.jpg')):
            av=f'<div class="avatar"><img src="images/artists/{sl}.jpg" alt="{n}" width="84" height="84" loading="lazy"></div>'
        else:
            av=f'<div class="avatar" aria-hidden="true">{_initials(n)}</div>'
        out.append(f'<article class="card artist"><div class="artist-head">{av}<div><h3>{n}</h3><p class="role">{r}</p></div></div>{bio}</article>')
    return '<div class="roster">'+''.join(out)+'</div>'

artists=head('The Artists')+f"""
<section class="sheet"><div class="wrap"><h2>Crew</h2>{roster(CREW)}</div></section>
<section class="bricks"><div class="wrap"><h2>Cast</h2>{roster(CAST)}</div></section>
<section class="sheet"><div class="wrap"><h2>Band</h2>{roster(BAND)}</div></section>"""

support=head('Support the Show')+f"""
<section class="sheet"><div class="wrap two">
<div><h2>What Your Gift Supports</h2>
<p>Bringing a new musical from an idea to a fully staged production takes the work of many artists and collaborators. Your gift directly supports the people who make that work possible.</p>
<p>Campaign funds will help us compensate the artists and creative team behind <em>Eden Goes Home</em>, while maintaining equal pay, union compliance, and the high production value that this project deserves. Your contribution helps make sure that every part of the process, from the performers onstage to the designers, musicians, technicians, and creative team behind the scenes, is treated as essential to the creation of the show.</p>
<p>By supporting <em>Eden Goes Home</em>, you aren&rsquo;t simply helping us put on a performance. You&rsquo;re helping an original musical take its next step toward a larger life.</p>
<div class="btns"><a class="btn" href="{FA}">Donate via Fractured Atlas</a></div></div>
<div class="card"><a href="https://fracturedatlas.org"><img class="card-logo" src="images/fractured-atlas-dark.svg" alt="Fractured Atlas" height="36"></a><h3>Fiscally sponsored by Fractured Atlas</h3><p><em>Eden Goes Home</em> is a fiscally sponsored project of <a href="https://fracturedatlas.org">Fractured Atlas</a>. Amount is fully tax-deductible.</p><p class="small">Questions: <a href="mailto:support@fracturedatlas.org">support@fracturedatlas.org</a> &middot; (888) 692-7878</p></div>
</div></section>
<section class="bricks"><div class="wrap"><h2>Our Goals for This Project</h2>
<p>This production is an important milestone in <em>Eden Goes Home</em>&rsquo;s development. With your support, we hope to:</p>
<div class="cards">
<div class="card"><p>Fully realize a staged version of the musical, bringing the world of the Summers family to life through performance, design, music, and movement.</p></div>
<div class="card"><p>Test new material and songs with a live audience, discovering what resonates and what can be strengthened through the experience of performance.</p></div>
<div class="card"><p>Gauge audience and industry interest in the musical and its potential for a larger-scale production.</p></div>
<div class="card"><p>Gather reviews, feedback, and constructive critique that will help us continue developing the show beyond Winterfest.</p></div></div>
<p style="margin-top:24px">Every new musical needs opportunities to grow in front of an audience. This production gives <em>Eden Goes Home</em> that opportunity. It is both a destination and a beginning: a chance to share the story we have built so far, learn from the people who experience it, and take what we learn into the show&rsquo;s next chapter.</p></div></section>
<section class="sheet"><div class="wrap"><h2>Rewards</h2>
<div class="cards">
<div class="card"><div class="big">$50+</div><h3>Friendly Face</h3><ul><li>Rolling social media shoutouts</li></ul></div>
<div class="card"><div class="big">$100+</div><h3>Neighbor</h3><ul><li>Listed in special thanks section of the program</li><li>Rolling social media shoutouts</li><li>Exclusive BTS video during production</li></ul></div>
<div class="card"><div class="big">$1,000+</div><h3>Family</h3><ul><li>Reserved seating at EGH at Winterfest</li><li>Personalised thank you from cast, production team, and crew</li><li>Listed in special thanks section of the program</li><li>Rolling social media shoutouts</li><li>Exclusive BTS video during production</li></ul></div>
</div>
<div class="btns"><a class="btn" href="{FA}">Donate</a></div></div></section>"""

for f,t,d,b,h in [
 ('index.html','Eden Goes Home — A New Musical','A new musical by Lena Streitwieser. Winterfest, Dec 8–12, 2026, Teatro LATEA, New York. Tickets and donations.',index,ld),
 ('about.html','About — Eden Goes Home','The story of Eden Goes Home and the road to Winterfest 2026.',about,''),
 ('artists.html','Artists — Eden Goes Home','Lena Streitwieser and the company of Eden Goes Home.',artists,''),
 ('support.html','Support — Eden Goes Home','Donate to Eden Goes Home, a fiscally sponsored project of Fractured Atlas. Tax-deductible.',support,'')]:
    open(os.path.join(OUT,f),'w').write(page(f,t,d,b,h))
