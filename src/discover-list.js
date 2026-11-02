// Waypage: Discover's hand-picked list. Edit by pull request. Between the
// two marker lines it must stay strict JSON: the app reads this file again
// from GitHub (raw, main) to pick up new entries without a release, and
// parses only that part.
//
// kind: "feed" (followed in Feeds; a homepage is enough, its feed is found;
//       a Substack-style newsletter with a feed is a feed too), or
//       "newsletter" (email only, so it goes to the app's Newsletters:
//       "signup" is the page to sign up on), or
//       "serial" (a story posted on its own site, most on WordPress, shown
//       under Sites; "url" is its table of contents, saved as a collection).
window.Waypage = window.Waypage || {};
window.Waypage.discoverList =
// LIST START
{
  "entries": [
    { "kind": "feed", "name": "Quanta Magazine", "about": "Maths, physics and biology, written for anyone.", "url": "https://www.quantamagazine.org/" },
    { "kind": "feed", "name": "Nautilus", "about": "Science told through stories and essays.", "url": "https://nautil.us/" },
    { "kind": "feed", "name": "Knowable Magazine", "about": "Researchers explain their own fields.", "url": "https://knowablemagazine.org/" },
    { "kind": "feed", "name": "Ars Technica", "about": "Science and technology news, in depth.", "url": "https://arstechnica.com/" },
    { "kind": "feed", "name": "Rest of World", "about": "Technology outside the Western bubble.", "url": "https://restofworld.org/" },
    { "kind": "feed", "name": "Simon Willison", "about": "A programmer's notes on AI, data and the web.", "url": "https://simonwillison.net/" },
    { "kind": "feed", "name": "Julia Evans", "about": "Friendly explanations of how computers work.", "url": "https://jvns.ca/" },
    { "kind": "feed", "name": "Hacker News", "about": "The front page of a programmers' link site.", "url": "https://news.ycombinator.com/", "feed": "https://news.ycombinator.com/rss" },
    { "kind": "feed", "name": "Aeon", "about": "Long essays on ideas and culture.", "url": "https://aeon.co/" },
    { "kind": "feed", "name": "Psyche", "about": "The mind, wellbeing and living well.", "url": "https://psyche.co/" },
    { "kind": "feed", "name": "Works in Progress", "about": "Essays on ideas that could make the world better.", "url": "https://worksinprogress.co/" },
    { "kind": "feed", "name": "The Marginalian", "about": "Books, art and philosophy, read slowly.", "url": "https://www.themarginalian.org/" },
    { "kind": "feed", "name": "The Public Domain Review", "about": "Odd and lovely finds from old books.", "url": "https://publicdomainreview.org/" },
    { "kind": "feed", "name": "Atlas Obscura", "about": "Strange places and their stories.", "url": "https://www.atlasobscura.com/" },
    { "kind": "feed", "name": "Open Culture", "about": "Free courses, books, films and lectures.", "url": "https://www.openculture.com/" },
    { "kind": "feed", "name": "Longreads", "about": "The best long writing, picked and published.", "url": "https://longreads.com/" },
    { "kind": "feed", "name": "Kottke", "about": "One of the web's oldest link blogs.", "url": "https://kottke.org/" },
    { "kind": "feed", "name": "BBC News", "about": "World news, all day.", "url": "https://www.bbc.com/news", "feed": "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { "kind": "feed", "name": "The Guardian", "about": "International edition.", "url": "https://www.theguardian.com/international", "feed": "https://www.theguardian.com/world/rss" },
    { "kind": "feed", "name": "NPR", "about": "News from America's public radio.", "url": "https://www.npr.org/", "feed": "https://feeds.npr.org/1001/rss.xml" },
    { "kind": "feed", "name": "Reactor", "about": "Science fiction and fantasy stories and essays (was Tor.com).", "url": "https://reactormag.com/" },
    { "kind": "feed", "name": "Clarkesworld", "about": "A science fiction and fantasy magazine.", "url": "https://clarkesworldmagazine.com/" },
    { "kind": "feed", "name": "Lightspeed", "about": "Science fiction and fantasy, free to read.", "url": "https://www.lightspeedmagazine.com/" },
    { "kind": "feed", "name": "Astral Codex Ten", "about": "Long, curious posts on science and society.", "url": "https://www.astralcodexten.com/" },
    { "kind": "feed", "name": "Experimental History", "about": "Psychology and science, written with jokes.", "url": "https://www.experimental-history.com/" },
    { "kind": "feed", "name": "Construction Physics", "about": "How buildings and infrastructure get made.", "url": "https://www.construction-physics.com/" },
    { "kind": "feed", "name": "Noahpinion", "about": "Economics and the news, argued plainly.", "url": "https://www.noahpinion.blog/" },
    { "kind": "feed", "name": "Slow Boring", "about": "Policy, argued in plain words.", "url": "https://www.slowboring.com/" },
    { "kind": "feed", "name": "One Useful Thing", "about": "What AI is actually good for, tried out.", "url": "https://www.oneusefulthing.org/" },
    { "kind": "feed", "name": "Platformer", "about": "Big tech and how it's run.", "url": "https://www.platformer.news/" },
    { "kind": "feed", "name": "Garbage Day", "about": "What happened on the internet this week.", "url": "https://www.garbageday.email/" },
    { "kind": "serial", "name": "The Wandering Inn", "about": "A long, cosy and sometimes brutal fantasy about an inn.", "url": "https://wanderinginn.com/table-of-contents/" },
    { "kind": "serial", "name": "Worm", "about": "A bullied teenager with a bug-control power, and a dark superhero world.", "url": "https://parahumans.wordpress.com/table-of-contents/" },
    { "kind": "serial", "name": "Ward", "about": "Worm's sequel, after the end of the world.", "url": "https://www.parahumans.net/table-of-contents/" },
    { "kind": "serial", "name": "Pale", "about": "Three young witches keep the peace in a small town.", "url": "https://palewebserial.wordpress.com/table-of-contents/" },
    { "kind": "serial", "name": "Pact", "about": "An inheritance with a demon-sized debt attached.", "url": "https://pactwebserial.wordpress.com/table-of-contents/" },
    { "kind": "serial", "name": "A Practical Guide to Evil", "about": "An orphan joins the villains to change the empire from inside.", "url": "https://practicalguidetoevil.wordpress.com/table-of-contents/" },
    { "kind": "serial", "name": "Katalepsis", "about": "Cosmic horror and a slow romance at a British university.", "url": "https://katalepsis.net/table-of-contents/" },
    { "kind": "newsletter", "name": "Money Stuff", "about": "Finance, explained and made funny.", "url": "https://www.bloomberg.com/opinion/authors/ARbTQlRLRjE/matthew-s-levine", "signup": "https://www.bloomberg.com/account/newsletters/money-stuff" },
    { "kind": "newsletter", "name": "Morning Brew", "about": "Business news for the morning, short.", "url": "https://www.morningbrew.com/", "signup": "https://www.morningbrew.com/daily/subscribe" },
    { "kind": "newsletter", "name": "1440", "about": "The day's news in five minutes, without a side.", "url": "https://join1440.com/", "signup": "https://join1440.com/" }
  ]
}
// LIST END
;
