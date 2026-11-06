// Waypage: Discover's hand-picked list. Edit by pull request. Between the
// two marker lines it must stay strict JSON: the app reads this file again
// from GitHub (raw, main) to pick up new entries without a release, and
// parses only that part.
//
// kind: "feed" (followed in Feeds; a Substack-style newsletter with a feed
//       is a feed too; give "feed", the feed's own address, checked to work:
//       many sites' homepages turn the app away with a 403), or
//       "newsletter" (email only, so it goes to the app's Newsletters:
//       "signup" is the page to sign up on), or
//       "serial" (a story posted on its own site, most on WordPress, shown
//       under Sites; "url" is its table of contents, saved as a collection).
window.Waypage = window.Waypage || {};
window.Waypage.discoverList =
// LIST START
{
  "entries": [
    { "kind": "feed", "name": "Quanta Magazine", "about": "Maths, physics and biology, written for anyone.", "url": "https://www.quantamagazine.org/", "feed": "https://www.quantamagazine.org/feed/" },
    { "kind": "feed", "name": "Nautilus", "about": "Science told through stories and essays.", "url": "https://nautil.us/", "feed": "https://nautil.us/feed/" },
    { "kind": "feed", "name": "Knowable Magazine", "about": "Researchers explain their own fields.", "url": "https://knowablemagazine.org/", "feed": "https://knowablemagazine.org/rss" },
    { "kind": "feed", "name": "Ars Technica", "about": "Science and technology news, in depth.", "url": "https://arstechnica.com/", "feed": "https://feeds.arstechnica.com/arstechnica/index" },
    { "kind": "feed", "name": "Rest of World", "about": "Technology outside the Western bubble.", "url": "https://restofworld.org/", "feed": "https://restofworld.org/feed/latest/" },
    { "kind": "feed", "name": "Simon Willison", "about": "A programmer's notes on AI, data and the web.", "url": "https://simonwillison.net/", "feed": "https://simonwillison.net/atom/everything/" },
    { "kind": "feed", "name": "Julia Evans", "about": "Friendly explanations of how computers work.", "url": "https://jvns.ca/", "feed": "https://jvns.ca/atom.xml" },
    { "kind": "feed", "name": "Hacker News", "about": "The front page of a programmers' link site.", "url": "https://news.ycombinator.com/", "feed": "https://news.ycombinator.com/rss" },
    { "kind": "feed", "name": "Aeon", "about": "Long essays on ideas and culture.", "url": "https://aeon.co/", "feed": "https://aeon.co/feed.rss" },
    { "kind": "feed", "name": "Psyche", "about": "The mind, wellbeing and living well.", "url": "https://psyche.co/", "feed": "https://psyche.co/feed.rss" },
    { "kind": "feed", "name": "The Marginalian", "about": "Books, art and philosophy, read slowly.", "url": "https://www.themarginalian.org/", "feed": "https://www.themarginalian.org/feed/" },
    { "kind": "feed", "name": "The Public Domain Review", "about": "Odd and lovely finds from old books.", "url": "https://publicdomainreview.org/", "feed": "https://publicdomainreview.org/rss.xml" },
    { "kind": "feed", "name": "Atlas Obscura", "about": "Strange places and their stories.", "url": "https://www.atlasobscura.com/", "feed": "https://www.atlasobscura.com/feeds/latest" },
    { "kind": "feed", "name": "Open Culture", "about": "Free courses, books, films and lectures.", "url": "https://www.openculture.com/", "feed": "https://www.openculture.com/feed" },
    { "kind": "feed", "name": "Longreads", "about": "The best long writing, picked and published.", "url": "https://longreads.com/", "feed": "https://longreads.com/feed/" },
    { "kind": "feed", "name": "Kottke", "about": "One of the web's oldest link blogs.", "url": "https://kottke.org/", "feed": "https://feeds.kottke.org/main" },
    { "kind": "feed", "name": "BBC News", "about": "World news, all day.", "url": "https://www.bbc.com/news", "feed": "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { "kind": "feed", "name": "The Guardian", "about": "International edition.", "url": "https://www.theguardian.com/international", "feed": "https://www.theguardian.com/world/rss" },
    { "kind": "feed", "name": "NPR", "about": "News from America's public radio.", "url": "https://www.npr.org/", "feed": "https://feeds.npr.org/1001/rss.xml" },
    { "kind": "feed", "name": "Clarkesworld", "about": "A science fiction and fantasy magazine.", "url": "https://clarkesworldmagazine.com/", "feed": "https://clarkesworldmagazine.com/feed/" },
    { "kind": "feed", "name": "Lightspeed", "about": "Science fiction and fantasy, free to read.", "url": "https://www.lightspeedmagazine.com/", "feed": "https://www.lightspeedmagazine.com/rss-2/" },
    { "kind": "feed", "name": "Astral Codex Ten", "about": "Long, curious posts on science and society.", "url": "https://www.astralcodexten.com/", "feed": "https://www.astralcodexten.com/feed" },
    { "kind": "feed", "name": "Experimental History", "about": "Psychology and science, written with jokes.", "url": "https://www.experimental-history.com/", "feed": "https://www.experimental-history.com/feed" },
    { "kind": "feed", "name": "Construction Physics", "about": "How buildings and infrastructure get made.", "url": "https://www.construction-physics.com/", "feed": "https://www.construction-physics.com/feed" },
    { "kind": "feed", "name": "Noahpinion", "about": "Economics and the news, argued plainly.", "url": "https://www.noahpinion.blog/", "feed": "https://www.noahpinion.blog/feed" },
    { "kind": "feed", "name": "Slow Boring", "about": "Policy, argued in plain words.", "url": "https://www.slowboring.com/", "feed": "https://www.slowboring.com/feed" },
    { "kind": "feed", "name": "One Useful Thing", "about": "What AI is actually good for, tried out.", "url": "https://www.oneusefulthing.org/", "feed": "https://www.oneusefulthing.org/feed" },
    { "kind": "feed", "name": "Platformer", "about": "Big tech and how it's run.", "url": "https://www.platformer.news/", "feed": "https://www.platformer.news/rss/" },
    { "kind": "feed", "name": "The Conversation", "about": "Academics write about their own research, plainly.", "url": "https://theconversation.com/global", "feed": "https://theconversation.com/global/articles.atom" },
    { "kind": "feed", "name": "ProPublica", "about": "Investigative journalism in the public interest.", "url": "https://www.propublica.org/", "feed": "https://www.propublica.org/feeds/propublica/main" },
    { "kind": "feed", "name": "Works in Progress", "about": "Essays on ideas that could make the world better.", "url": "https://worksinprogress.co/", "feed": "https://worksinprogress.co/feed/" },
    { "kind": "feed", "name": "Asterisk", "about": "A magazine of clear thinking about big questions.", "url": "https://asteriskmag.com/", "feed": "https://asteriskmag.com/feed" },
    { "kind": "feed", "name": "Undark", "about": "Science journalism about science's place in society.", "url": "https://undark.org/", "feed": "https://undark.org/feed/" },
    { "kind": "feed", "name": "Smithsonian Magazine", "about": "History, science, art and travel.", "url": "https://www.smithsonianmag.com/", "feed": "https://www.smithsonianmag.com/rss/latest_articles/" },
    { "kind": "feed", "name": "Our World in Data", "about": "The world's big problems, in charts and plain words.", "url": "https://ourworldindata.org/", "feed": "https://ourworldindata.org/atom.xml" },
    { "kind": "feed", "name": "3 Quarks Daily", "about": "A daily pick of essays from across the web.", "url": "https://3quarksdaily.com/", "feed": "https://3quarksdaily.com/feed" },
    { "kind": "feed", "name": "Low-tech Magazine", "about": "Old and simple technology, from a solar-powered site.", "url": "https://solar.lowtechmagazine.com/", "feed": "https://solar.lowtechmagazine.com/posts/index.xml" },
    { "kind": "feed", "name": "Lobsters", "about": "Programming links, voted on and discussed.", "url": "https://lobste.rs/", "feed": "https://lobste.rs/rss" },
    { "kind": "feed", "name": "Dan Luu", "about": "Long, careful essays on programming and work.", "url": "https://danluu.com/", "feed": "https://danluu.com/atom.xml" },
    { "kind": "feed", "name": "The Old New Thing", "about": "Raymond Chen on why Windows works the way it does.", "url": "https://devblogs.microsoft.com/oldnewthing/", "feed": "https://devblogs.microsoft.com/oldnewthing/feed" },
    { "kind": "feed", "name": "Ken Shirriff", "about": "Old computers and chips, taken apart and explained.", "url": "https://www.righto.com/", "feed": "https://www.righto.com/feeds/posts/default" },
    { "kind": "feed", "name": "Daring Fireball", "about": "Apple, technology and design, by John Gruber.", "url": "https://daringfireball.net/", "feed": "https://daringfireball.net/feeds/main" },
    { "kind": "feed", "name": "Reactor", "about": "Science fiction and fantasy stories, essays and news (once Tor.com).", "url": "https://reactormag.com/", "feed": "https://reactormag.com/feed/" },
    { "kind": "feed", "name": "Uncanny Magazine", "about": "Science fiction and fantasy stories and essays.", "url": "https://www.uncannymagazine.com/", "feed": "https://www.uncannymagazine.com/feed/" },
    { "kind": "feed", "name": "Strange Horizons", "about": "A weekly magazine of speculative fiction.", "url": "http://strangehorizons.com/", "feed": "https://strangehorizons.com/feed/" },
    { "kind": "feed", "name": "xkcd", "about": "A webcomic of romance, sarcasm, maths and language.", "url": "https://xkcd.com/", "feed": "https://xkcd.com/atom.xml" },
    { "kind": "feed", "name": "Saturday Morning Breakfast Cereal", "about": "A daily comic about science, philosophy and people.", "url": "https://www.smbc-comics.com/", "feed": "https://www.smbc-comics.com/comic/rss" },
    { "kind": "feed", "name": "Al Jazeera", "about": "World news from the Middle East outward.", "url": "https://www.aljazeera.com/", "feed": "https://www.aljazeera.com/xml/rss/all.xml" },
    { "kind": "feed", "name": "DW", "about": "Germany's international news, in English.", "url": "https://www.dw.com/en/", "feed": "https://rss.dw.com/rdf/rss-en-all" },
    { "kind": "feed", "name": "Garbage Day", "about": "The internet's culture, weird and otherwise.", "url": "https://www.garbageday.email/", "feed": "https://www.garbageday.email/feed" },
    { "kind": "feed", "name": "Recomendo", "about": "Six short, useful recommendations every week.", "url": "https://www.recomendo.com/", "feed": "https://www.recomendo.com/feed" },
    { "kind": "feed", "name": "Today in Tabs", "about": "A funny daily round-up of the internet.", "url": "https://www.todayintabs.com/", "feed": "https://www.todayintabs.com/feed" },
    { "kind": "feed", "name": "Ynet", "about": "Israel's news, in Hebrew.", "url": "https://www.ynet.co.il/", "feed": "https://www.ynet.co.il/Integration/StoryRss2.xml" },
    { "kind": "feed", "name": "Davar", "about": "Israeli news and work life, in Hebrew.", "url": "https://www.davar1.co.il/", "feed": "https://www.davar1.co.il/feed/" },
    { "kind": "feed", "name": "Haaretz", "about": "Israeli news and opinion, in Hebrew.", "url": "https://www.haaretz.co.il/", "feed": "https://www.haaretz.co.il/srv/htz---all-articles" },
    { "kind": "feed", "name": "The Times of Israel", "about": "Israel and the Jewish world, in English.", "url": "https://www.timesofisrael.com/", "feed": "https://www.timesofisrael.com/feed/" },
    { "kind": "serial", "name": "The Wandering Inn", "about": "A long, cosy and sometimes brutal fantasy about an inn.", "url": "https://wanderinginn.com/table-of-contents/" },
    { "kind": "serial", "name": "Worm", "about": "A bullied teenager with a bug-control power, and a dark superhero world.", "url": "https://parahumans.wordpress.com/table-of-contents/" },
    { "kind": "serial", "name": "Ward", "about": "Worm's sequel, after the end of the world.", "url": "https://www.parahumans.net/table-of-contents/" },
    { "kind": "serial", "name": "Pale", "about": "Three young witches keep the peace in a small town.", "url": "https://palewebserial.wordpress.com/table-of-contents/" },
    { "kind": "serial", "name": "Pact", "about": "An inheritance with a demon-sized debt attached.", "url": "https://pactwebserial.wordpress.com/table-of-contents/" },
    { "kind": "serial", "name": "A Practical Guide to Evil", "about": "An orphan joins the villains to change the empire from inside.", "url": "https://practicalguidetoevil.wordpress.com/table-of-contents/" },
    { "kind": "serial", "name": "Katalepsis", "about": "Cosmic horror and a slow romance at a British university.", "url": "https://katalepsis.net/table-of-contents/" },
    { "kind": "serial", "name": "The Gods Are Bastards", "about": "A magic school, a fallen god and a world on the edge of an industrial age.", "url": "https://tiraas.net/table-of-contents/" },
    { "kind": "serial", "name": "Unsong", "about": "The Bible is literally true and the world runs on the names of God.", "url": "https://unsongbook.com/" },
    { "kind": "newsletter", "name": "Money Stuff", "about": "Finance, explained and made funny.", "url": "https://www.bloomberg.com/opinion/authors/ARbTQlRLRjE/matthew-s-levine", "signup": "https://www.bloomberg.com/account/newsletters/money-stuff" },
    { "kind": "newsletter", "name": "Morning Brew", "about": "Business news for the morning, short.", "url": "https://www.morningbrew.com/", "signup": "https://www.morningbrew.com/daily/subscribe" },
    { "kind": "newsletter", "name": "1440", "about": "The day's news in five minutes, without a side.", "url": "https://join1440.com/", "signup": "https://join1440.com/" },
    { "kind": "newsletter", "name": "Benedict Evans", "about": "A weekly read on what matters in tech.", "url": "https://www.ben-evans.com/", "signup": "https://www.ben-evans.com/newsletter" },
    { "kind": "newsletter", "name": "NextDraft", "about": "The day's most fascinating news, picked and written up.", "url": "https://nextdraft.com/", "signup": "https://nextdraft.com/" },
    { "kind": "newsletter", "name": "Dense Discovery", "about": "Design, tech and thoughtful living, weekly.", "url": "https://www.densediscovery.com/", "signup": "https://www.densediscovery.com/" }
  ]
}
// LIST END
;
