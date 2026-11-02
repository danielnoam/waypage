// Waypage: Discover's hand-picked list. Edit by pull request. Between the
// two marker lines it must stay strict JSON: the app reads this file again
// from GitHub (raw, main) to pick up new entries without a release, and
// parses only that part.
//
// kind: "feed" (followed in Feeds; a homepage is enough, its feed is found;
//       a Substack-style newsletter with a feed is a feed too), or
//       "newsletter" (email only, so it goes to the app's Newsletters:
//       "signup" is the page to sign up on).
// topic: one of the topics below.
window.Waypage = window.Waypage || {};
window.Waypage.discoverList =
// LIST START
{
  "topics": ["Science", "Ideas", "Tech", "Culture", "News", "Fiction"],
  "entries": [
    { "kind": "feed", "name": "Quanta Magazine", "about": "Maths, physics and biology, written for anyone.", "topic": "Science", "url": "https://www.quantamagazine.org/" },
    { "kind": "feed", "name": "Nautilus", "about": "Science told through stories and essays.", "topic": "Science", "url": "https://nautil.us/" },
    { "kind": "feed", "name": "Knowable Magazine", "about": "Researchers explain their own fields.", "topic": "Science", "url": "https://knowablemagazine.org/" },
    { "kind": "feed", "name": "Ars Technica", "about": "Science and technology news, in depth.", "topic": "Tech", "url": "https://arstechnica.com/" },
    { "kind": "feed", "name": "Rest of World", "about": "Technology outside the Western bubble.", "topic": "Tech", "url": "https://restofworld.org/" },
    { "kind": "feed", "name": "Simon Willison", "about": "A programmer's notes on AI, data and the web.", "topic": "Tech", "url": "https://simonwillison.net/" },
    { "kind": "feed", "name": "Julia Evans", "about": "Friendly explanations of how computers work.", "topic": "Tech", "url": "https://jvns.ca/" },
    { "kind": "feed", "name": "Hacker News", "about": "The front page of a programmers' link site.", "topic": "Tech", "url": "https://news.ycombinator.com/", "feed": "https://news.ycombinator.com/rss" },
    { "kind": "feed", "name": "Aeon", "about": "Long essays on ideas and culture.", "topic": "Ideas", "url": "https://aeon.co/" },
    { "kind": "feed", "name": "Psyche", "about": "The mind, wellbeing and living well.", "topic": "Ideas", "url": "https://psyche.co/" },
    { "kind": "feed", "name": "Works in Progress", "about": "Essays on ideas that could make the world better.", "topic": "Ideas", "url": "https://worksinprogress.co/" },
    { "kind": "feed", "name": "The Marginalian", "about": "Books, art and philosophy, read slowly.", "topic": "Ideas", "url": "https://www.themarginalian.org/" },
    { "kind": "feed", "name": "The Public Domain Review", "about": "Odd and lovely finds from old books.", "topic": "Culture", "url": "https://publicdomainreview.org/" },
    { "kind": "feed", "name": "Atlas Obscura", "about": "Strange places and their stories.", "topic": "Culture", "url": "https://www.atlasobscura.com/" },
    { "kind": "feed", "name": "Open Culture", "about": "Free courses, books, films and lectures.", "topic": "Culture", "url": "https://www.openculture.com/" },
    { "kind": "feed", "name": "Longreads", "about": "The best long writing, picked and published.", "topic": "Culture", "url": "https://longreads.com/" },
    { "kind": "feed", "name": "Kottke", "about": "One of the web's oldest link blogs.", "topic": "Culture", "url": "https://kottke.org/" },
    { "kind": "feed", "name": "BBC News", "about": "World news, all day.", "topic": "News", "url": "https://www.bbc.com/news", "feed": "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { "kind": "feed", "name": "The Guardian", "about": "International edition.", "topic": "News", "url": "https://www.theguardian.com/international", "feed": "https://www.theguardian.com/world/rss" },
    { "kind": "feed", "name": "NPR", "about": "News from America's public radio.", "topic": "News", "url": "https://www.npr.org/", "feed": "https://feeds.npr.org/1001/rss.xml" },
    { "kind": "feed", "name": "Reactor", "about": "Science fiction and fantasy stories and essays (was Tor.com).", "topic": "Fiction", "url": "https://reactormag.com/" },
    { "kind": "feed", "name": "Clarkesworld", "about": "A science fiction and fantasy magazine.", "topic": "Fiction", "url": "https://clarkesworldmagazine.com/" },
    { "kind": "feed", "name": "Lightspeed", "about": "Science fiction and fantasy, free to read.", "topic": "Fiction", "url": "https://www.lightspeedmagazine.com/" },
    { "kind": "feed", "name": "Astral Codex Ten", "about": "Long, curious posts on science and society.", "topic": "Ideas", "url": "https://www.astralcodexten.com/" },
    { "kind": "feed", "name": "Experimental History", "about": "Psychology and science, written with jokes.", "topic": "Science", "url": "https://www.experimental-history.com/" },
    { "kind": "feed", "name": "Construction Physics", "about": "How buildings and infrastructure get made.", "topic": "Science", "url": "https://www.construction-physics.com/" },
    { "kind": "feed", "name": "Noahpinion", "about": "Economics and the news, argued plainly.", "topic": "Ideas", "url": "https://www.noahpinion.blog/" },
    { "kind": "feed", "name": "Slow Boring", "about": "Policy, argued in plain words.", "topic": "News", "url": "https://www.slowboring.com/" },
    { "kind": "feed", "name": "One Useful Thing", "about": "What AI is actually good for, tried out.", "topic": "Tech", "url": "https://www.oneusefulthing.org/" },
    { "kind": "feed", "name": "Platformer", "about": "Big tech and how it's run.", "topic": "Tech", "url": "https://www.platformer.news/" },
    { "kind": "feed", "name": "Garbage Day", "about": "What happened on the internet this week.", "topic": "Culture", "url": "https://www.garbageday.email/" },
    { "kind": "newsletter", "name": "Money Stuff", "about": "Finance, explained and made funny.", "topic": "News", "url": "https://www.bloomberg.com/opinion/authors/ARbTQlRLRjE/matthew-s-levine", "signup": "https://www.bloomberg.com/account/newsletters/money-stuff" },
    { "kind": "newsletter", "name": "Morning Brew", "about": "Business news for the morning, short.", "topic": "News", "url": "https://www.morningbrew.com/", "signup": "https://www.morningbrew.com/daily/subscribe" },
    { "kind": "newsletter", "name": "1440", "about": "The day's news in five minutes, without a side.", "topic": "News", "url": "https://join1440.com/", "signup": "https://join1440.com/" }
  ]
}
// LIST END
;
