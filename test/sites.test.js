// Discussion and code sites, saved in a browser from saved copies of the
// sites' own answers (test/fixtures/sites/), since the sites change:
// `node test/sites.test.js`. Every request to the site is answered from
// a fixture, so nothing goes out. Needs Playwright, like ui.test.js.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function playwright() {
  const tries = ["playwright", "/opt/node-tools/node_modules/playwright"];
  if (process.env.PLAYWRIGHT_MODULE) tries.unshift(process.env.PLAYWRIGHT_MODULE);
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}
const pw = playwright();
if (!pw) {
  console.log("  skip - Playwright isn't installed here (set PLAYWRIGHT_MODULE to its path)");
  process.exit(0);
}

const PORT = 5800 + Math.floor(Math.random() * 500);
const ROOT = "http://localhost:" + PORT + "/";
const FIX = path.join(__dirname, "fixtures", "sites");
const fixture = (name) => fs.readFileSync(path.join(FIX, name), "utf8");

let passed = 0;
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + String(e.message).split("\n").slice(0, 4).join("\n    ")); process.exitCode = 1; }
}

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => fetch(ROOT).then(() => resolve(child), () => (Date.now() - t0 > 5000 ? reject(new Error("server didn't start")) : setTimeout(poll, 100)));
    poll();
  });
}

// Saves `url` with `answers` ([test, fixture name or null for a 404])
// standing in for the network, and returns { meta, doc } with the clip's
// HTML parsed in the page, plus the addresses that were asked for.
async function saveWith(browser, url, answers) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const p = await ctx.newPage();
  const asked = [];
  await ctx.route((u) => !u.href.startsWith(ROOT), (route) => {
    // The web copy asks the fetch proxy (worker/) for a page; it's
    // answered as the page's site would, the way the proxy passes it on.
    const raw = new URL(route.request().url());
    const u = /\.workers\.dev$/.test(raw.hostname) && raw.searchParams.get("url") || raw.href;
    asked.push(u);
    const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "X-Final-Url", "x-final-url": u };
    const hit = answers.find(([t]) => (typeof t === "string" ? u.startsWith(t) : t.test(u)));
    if (!hit || !hit[1]) return route.fulfill({ status: 404, body: "", headers: cors });
    const type = /\.json$/.test(hit[1]) ? "application/json" : /\.txt$/.test(hit[1]) ? "text/plain" : "text/html";
    route.fulfill({ status: 200, body: fixture(hit[1]), headers: { "content-type": type + "; charset=utf-8", ...cors } });
  });
  await p.goto(ROOT);
  await p.waitForFunction(() => window.Waypage && window.Waypage.save && window.Waypage.store);
  const got = await p.evaluate(async (url) => {
    try {
      const meta = await window.Waypage.save.save(url);
      return { meta, html: await window.Waypage.store.readPage(meta.id) };
    } catch (e) { return { error: String(e && e.message) }; }
  }, url);
  await ctx.close();
  if (got.error) throw new Error(got.error);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP + "/" + got.meta.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) + ".html", got.html);
  return { meta: got.meta, html: got.html, asked };
}

// Runs `fn(arg)` in the app with `answers` standing in for the network,
// as saveWith does, for the calls that aren't a whole save (Find chapters).
async function inPage(browser, answers, fn, arg) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const p = await ctx.newPage();
  const asked = [];
  await ctx.route((u) => !u.href.startsWith(ROOT), (route) => {
    const raw = new URL(route.request().url());
    const u = /\.workers\.dev$/.test(raw.hostname) && raw.searchParams.get("url") || raw.href;
    asked.push(u);
    const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "X-Final-Url", "x-final-url": u };
    const hit = answers.find(([t]) => (typeof t === "string" ? u.startsWith(t) : t.test(u)));
    if (!hit || !hit[1]) return route.fulfill({ status: 404, body: "", headers: cors });
    route.fulfill({ status: 200, body: fixture(hit[1]), headers: { "content-type": (/\.json$/.test(hit[1]) ? "application/json" : "text/html") + "; charset=utf-8", ...cors } });
  });
  await p.goto(ROOT);
  await p.waitForFunction(() => window.Waypage && window.Waypage.save && window.Waypage.store);
  const got = await p.evaluate(fn, arg);
  await ctx.close();
  return { got, asked };
}

// What the saved page says, worked out in Node without a DOM: enough to
// check the shape of a thread.
const count = (html, re) => (html.match(re) || []).length;
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ");

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch();
  try {
    await test("GitHub: a pull request saves its post and every comment", async () => {
      const { meta, html } = await saveWith(browser, "https://github.com/danielnoam/waypage/pull/182", [
        ["https://api.github.com/repos/danielnoam/waypage/issues/182/comments", "github-issue-comments.json"],
        ["https://api.github.com/repos/danielnoam/waypage/issues/182", "github-issue.json"],
      ]);
      assert.strictEqual(meta.title, "docs: architecture, formats, pipeline, developing and user guide #182");
      assert.strictEqual(meta.site, "GitHub");
      assert.strictEqual(meta.byline, "danielnoam/waypage · Pull request, closed");
      assert.strictEqual(meta.url, "https://github.com/danielnoam/waypage/pull/182");
      assert.strictEqual(count(html, /class="co-comment"/g), 1);
      assert.ok(/<h2[^>]*>Comments \(1\)<\/h2>/.test(html), "a Comments heading with the count");
      assert.ok(/class="co-who"><strong>omri-ehud<\/strong>/.test(html), "the author over the post");
    });

    await test("GitHub: a code file is saved as code, from its raw copy", async () => {
      const { meta, html, asked } = await saveWith(browser, "https://github.com/danielnoam/waypage/blob/main/server.js", [
        ["https://raw.githubusercontent.com/danielnoam/waypage/main/server.js", "github-server.js.txt"],
      ]);
      assert.strictEqual(meta.title, "server.js");
      assert.strictEqual(meta.byline, "danielnoam/waypage");
      assert.ok(!asked.some((u) => u.startsWith("https://github.com/danielnoam/waypage/blob/")), "the page itself isn't fetched");
      assert.strictEqual(count(html, /<pre>/g), 1);
      assert.ok(plain(html).includes("createServer"), "the code is there");
    });

    await test("GitHub: a repo is its README, titled by the repo", async () => {
      const { meta, html } = await saveWith(browser, "https://github.com/danielnoam/waypage", [
        ["https://github.com/danielnoam/waypage", "github-repo.html"],
      ]);
      assert.strictEqual(meta.title, "danielnoam/waypage");
      assert.strictEqual(meta.site, "GitHub");
      assert.ok(/<h2[^>]*>Library<\/h2>/.test(html), "the README's headings");
      assert.ok(!/Go to file|Latest commit/.test(plain(html)), "no file list");
    });

    await test("GitHub: when the API fails, the page is read as before", async () => {
      const { meta } = await saveWith(browser, "https://github.com/danielnoam/waypage/pull/182", [
        ["https://api.github.com/", null],
        ["https://github.com/danielnoam/waypage/pull/182", "github-repo.html"],
      ]);
      assert.strictEqual(meta.site, "GitHub");
    });
    await test("Hacker News: the story link and every comment, nested in HN's order", async () => {
      const { meta, html } = await saveWith(browser, "https://news.ycombinator.com/item?id=50331957", [
        ["https://news.ycombinator.com/item?id=50331957", "hn-item.html"],
      ]);
      assert.strictEqual(meta.title, "Bones may release proteins that slow aging and extend life span");
      assert.strictEqual(meta.site, "Hacker News");
      assert.ok(count(html, /class="co-comment"/g) >= 85, "about 89 comments, a few may be deleted: " + count(html, /class="co-comment"/g));
      assert.ok(count(html, /class="co-replies"/g) > 10, "replies nested");
      const first = html.indexOf("<strong>Qem</strong>");
      assert.ok(first > 0 && first === html.indexOf('class="co-who"><strong>', html.indexOf("co-thread")) + 'class="co-who">'.length, "HN's top comment comes first");
      assert.ok(!/>reply</.test(html), "no reply links");
      assert.ok(!/>next</.test(html) && meta.next === "", "no next-chapter guess from HN's own 'next' links");
    });

    await test("Hacker News: an Ask HN keeps its question's text", async () => {
      const { meta, html } = await saveWith(browser, "https://news.ycombinator.com/item?id=50306776", [
        ["https://news.ycombinator.com/item?id=50306776", "hn-ask.html"],
      ]);
      assert.ok(meta.title.startsWith("Ask HN: What's it like working at Google nowadays?"), meta.title);
      const thread = html.indexOf("co-thread");
      assert.ok(plain(html.slice(0, thread)).trim().length > 200, "the question's text above the comments");
    });

    await test("Stack Overflow: the question, the accepted answer first, then the best, five in all", async () => {
      const { meta, html } = await saveWith(browser, "https://stackoverflow.com/questions/1642028/what-is-the-operator-in-c-c", [
        [/^https:\/\/api\.stackexchange\.com\/2\.3\/questions\/1642028\/answers\?site=stackoverflow\.com&/, "se-a-other.json"],
        [/^https:\/\/api\.stackexchange\.com\/2\.3\/questions\/1642028\?site=stackoverflow\.com&/, "se-q-other.json"],
      ]);
      assert.strictEqual(meta.title, "What is the '-->' operator in C/C++?");
      assert.strictEqual(meta.site, "Stack Overflow");
      assert.strictEqual(meta.licence, "stackexchange");
      assert.strictEqual(count(html, /class="co-comment( co-accepted)?"/g), 5);
      assert.ok(/<article class="co-comment co-accepted"><p class="co-who"><strong>Charles Salvia<\/strong> · Accepted answer · 9,981 votes/.test(html), "the accepted answer, named, first");
      assert.ok(html.indexOf("Charles Salvia") < html.indexOf("unsynchronized"), "then by votes");
      assert.ok(/21 more answers on Stack Overflow/.test(html));
      assert.ok(/CC BY-SA, by the people named above/.test(html), "the licence line");
      assert.ok(/<pre><code>/.test(html), "code blocks kept");
    });

    await test("Stack Overflow: a browser check in front of the page doesn't matter, the API answers", async () => {
      const { meta } = await saveWith(browser, "https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array", [
        [/^https:\/\/api\.stackexchange\.com\/2\.3\/questions\/11227809\/answers\?/, "se-a-sorted.json"],
        [/^https:\/\/api\.stackexchange\.com\/2\.3\/questions\/11227809\?/, "se-q-sorted.json"],
        ["https://stackoverflow.com/", "so-challenge.html"],
      ]);
      assert.strictEqual(meta.title, "Why is conditional processing of a sorted array faster than of an unsorted array?");
      assert.ok(meta.minutes >= 5, "the answers are long: " + meta.minutes);
    });

    await test("Reddit: the post's picture, then the comment tree, best first", async () => {
      const { meta, html, asked } = await saveWith(browser, "https://www.reddit.com/r/starcitizen/comments/1xlzyn3/olli_says_hes_departing_from_cig/", [
        ["https://www.reddit.com/comments/1xlzyn3/.json?raw_json=1", "reddit-post.json"],
      ]);
      assert.strictEqual(meta.title, "Olli says he's departing from CIG");
      assert.strictEqual(meta.site, "Reddit");
      assert.ok(meta.byline.startsWith("r/starcitizen · u/"), meta.byline);
      assert.ok(!asked.some((u) => u.startsWith("https://www.reddit.com/r/")), "the page itself isn't fetched");
      assert.ok(/<img[^>]*>/.test(html.slice(0, html.indexOf("co-thread"))), "the picture above the comments");
      assert.ok(count(html, /class="co-comment"/g) > 100, "comments: " + count(html, /class="co-comment"/g));
      assert.ok(count(html, /class="co-replies"/g) > 20, "replies nested");
      assert.ok(!/&lt;div class="md"/.test(html), "comment HTML isn't shown as text");
      assert.ok(/class="co-who"><strong>u\/[^<]+<\/strong> · [\d,]+ points?/.test(html), "who and points over each comment");
    });

    await test("Discourse: a forum known by its page saves the topic's posts from its JSON", async () => {
      const page = "https://users.rust-lang.org/t/official-way-to-read-the-raw-bytes-of-a-struct-i-didnt-define/143341";
      const { meta, html } = await saveWith(browser, page, [
        ["https://users.rust-lang.org/t/143341.json", "discourse-topic.json"],
        [page, "discourse-topic.html"],
      ]);
      assert.strictEqual(meta.title, "“Official” way to read the raw bytes of a `struct` I didn’t define");
      assert.strictEqual(meta.site, "users.rust-lang.org");
      assert.strictEqual(count(html, /class="co-comment"/g), 39);
      assert.ok(/<h2[^>]*>Replies \(39\)<\/h2>/.test(html));
      assert.ok(!/\d+×\d+ [\d.]+ [KM]B/.test(plain(html)), "no picture size captions");
    });

    await test("Bluesky: the post and its replies, from the public API", async () => {
      const { meta, html } = await saveWith(browser, "https://bsky.app/profile/bsky.app/post/3l6oveex3ii2l", [
        ["https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle", "bsky-handle.json"],
        ["https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread", "bsky-thread.json"],
      ]);
      assert.strictEqual(meta.site, "Bluesky");
      assert.ok(meta.title.startsWith("👋 Bluesky is an open social network"), meta.title);
      assert.ok(meta.title.length <= 81, "a post's title is its first words");
      assert.ok(meta.byline.includes("@bsky.app"), meta.byline);
      assert.ok(count(html, /class="co-comment"/g) >= 10, "replies: " + count(html, /class="co-comment"/g));
    });

    await test("Mastodon: any server's post, known by its address, with the replies as a tree", async () => {
      const { meta, html } = await saveWith(browser, "https://mastodon.social/@Gargron/117547414168269934", [
        ["https://mastodon.social/api/v1/statuses/117547414168269934/context", "mastodon-context.json"],
        ["https://mastodon.social/api/v1/statuses/117547414168269934", "mastodon-status.json"],
      ]);
      assert.strictEqual(meta.site, "mastodon.social");
      assert.ok(meta.byline.includes("@Gargron"), meta.byline);
      assert.strictEqual(count(html, /class="co-comment"/g), 20);
      assert.ok(count(html, /class="co-replies"/g) >= 1, "replies to replies nested");
    });

    await test("arXiv: an abstract link saves the paper's own web version, formulas as LaTeX", async () => {
      const { meta, html } = await saveWith(browser, "https://arxiv.org/abs/1706.03762", [
        ["https://arxiv.org/html/1706.03762", "arxiv-html.html"],
        ["https://arxiv.org/abs/1706.03762", "arxiv-abs.html"],
      ]);
      assert.strictEqual(meta.title, "Attention Is All You Need");
      assert.strictEqual(meta.site, "arXiv");
      assert.strictEqual(meta.url, "https://arxiv.org/abs/1706.03762");
      assert.ok(meta.byline.startsWith("Ashish Vaswani"), meta.byline);
      assert.ok(meta.minutes > 15, "the whole paper: " + meta.minutes);
      assert.ok(/softmax/.test(html) && /<code>[^<]*\\/.test(html), "formulas as LaTeX");
    });

    await test("arXiv: a paper with no web version is its abstract page, as before", async () => {
      const { meta } = await saveWith(browser, "https://arxiv.org/abs/hep-th/9711200", [
        ["https://arxiv.org/html/hep-th/9711200", null],
        ["https://arxiv.org/abs/hep-th/9711200", "arxiv-old-abs.html"],
      ]);
      assert.ok(/Large N Limit/.test(meta.title), meta.title);
    });

    await test("Lobsters: the story link and the comment tree", async () => {
      const { meta, html } = await saveWith(browser, "https://lobste.rs/s/lt44rt/introducing_kwi_new_kde", [
        ["https://lobste.rs/s/lt44rt.json", "lobsters-story.json"],
      ]);
      assert.strictEqual(meta.title, "Introducing Kwi, a new KDE terminal emulator");
      assert.strictEqual(meta.site, "Lobsters");
      assert.ok(count(html, /class="co-comment"/g) >= 45, "comments: " + count(html, /class="co-comment"/g));
      assert.ok(count(html, /class="co-replies"/g) > 3);
      assert.ok(/The article, on /.test(html));
    });

    await test("Lemmy: the post, its link and the comment tree, from any server's API", async () => {
      const { meta, html } = await saveWith(browser, "https://lemmy.world/post/4242", [
        ["https://lemmy.world/api/v3/post?id=4242", "lemmy-post.json"],
        ["https://lemmy.world/api/v3/comment/list?post_id=4242", "lemmy-comments.json"],
      ]);
      assert.strictEqual(meta.title, "What's the best offline reader?");
      assert.strictEqual(meta.site, "Books · lemmy.world");
      assert.match(meta.byline, /Frequent Flyer · 128 points/);
      assert.strictEqual(count(html, /class="co-comment"/g), 3);
      assert.strictEqual(count(html, /class="co-replies"/g), 1, "Bob's reply sits under Alice's comment");
      assert.match(html, /<strong>something<\/strong>/, "Markdown becomes HTML");
      assert.match(plain(html), /The link, on example\.org/);
      assert.match(plain(html), /\[deleted\]/);
    });

    await test("Substack: the post from its API, on the publication's own domain, with comments", async () => {
      const { meta, html, asked } = await saveWith(browser, "https://www.example-letters.com/p/why-we-read-on-paper", [
        ["https://www.example-letters.com/api/v1/posts/why-we-read-on-paper", "substack-post.json"],
        ["https://www.example-letters.com/api/v1/post/987/comments", "substack-comments.json"],
      ]);
      assert.strictEqual(meta.title, "Why we read on paper");
      assert.match(meta.byline, /^Rosa Field · /);
      assert.ok(!meta.cut);
      assert.match(plain(html), /And why screens are catching up/);
      assert.match(plain(html), /Where screens win/);
      assert.strictEqual(count(html, /class="co-comment"/g), 2);
      assert.match(plain(html), /5 likes/);
      assert.ok(!asked.includes("https://www.example-letters.com/p/why-we-read-on-paper"), "the page itself isn't fetched");
    });

    await test("LessWrong: the post and its comments from the forum's GraphQL API", async () => {
      const { meta, html, asked } = await saveWith(browser, "https://www.lesswrong.com/posts/AbCdEfGhIjKlMnOpQ/notes-on-careful-reading", [
        [/^https:\/\/www\.lesswrong\.com\/graphql\?query=/, "lesswrong.json"],
      ]);
      assert.strictEqual(meta.title, "Notes on careful reading");
      assert.strictEqual(meta.site, "LessWrong");
      assert.match(meta.byline, /^Quill · 87 points/);
      assert.strictEqual(count(html, /class="co-comment"/g), 2);
      assert.strictEqual(count(html, /class="co-replies"/g), 1);
      assert.ok(decodeURIComponent(asked[0]).includes('postId:"AbCdEfGhIjKlMnOpQ"'));
    });

    await test("SpaceBattles: a threadmarked post is a chapter, its thread's threadmarks the contents", async () => {
      const { meta, html } = await saveWith(browser, "https://forums.spacebattles.com/posts/1002/", [
        ["https://forums.spacebattles.com/posts/1002/", "xf-post.html"],
      ]);
      assert.strictEqual(meta.title, "Arc 1.2");
      assert.strictEqual(meta.series, "A Quiet Hive (Worm AU)");
      assert.strictEqual(meta.site, "SpaceBattles");
      assert.strictEqual(meta.byline, "Ashwin");
      assert.strictEqual(meta.next, "https://forums.spacebattles.com/posts/1003/");
      assert.strictEqual(meta.prev, "https://forums.spacebattles.com/posts/1001/");
      assert.match(plain(html), /The bugs were quiet/);
      assert.ok(!/Great chapter/.test(plain(html)), "only the marked post, not the replies under it");
      const { got } = await inPage(browser, [
        [/\/threads\/112233\/threadmarks$/, "xf-threadmarks.html"],
        [/\/threads\/a-quiet-hive-worm-au\.112233\/$/, "xf-post.html"],
      ], async () => {
        const found = await Waypage.save.findChapters("https://forums.spacebattles.com/threads/a-quiet-hive-worm-au.112233/");
        let thrown = null;
        try { await Waypage.save.save("https://forums.spacebattles.com/threads/a-quiet-hive-worm-au.112233/"); } catch (e) { thrown = e.contents ? e.contents.links.length : String(e.message); }
        return { found, thrown };
      });
      assert.strictEqual(got.found.title, "A Quiet Hive (Worm AU)");
      assert.deepStrictEqual(got.found.links, [1001, 1002, 1003].map((n) => "https://forums.spacebattles.com/posts/" + n + "/"));
      assert.strictEqual(got.thrown, 3, "a thread's own link opens its chapters to check");
    });

    await test("Wikisource: a work's subpages are its chapters; a chapter keeps its text and next part", async () => {
      const { meta, html } = await saveWith(browser, "https://en.wikisource.org/wiki/The_Time_Machine_(Wells)/Chapter_2", [
        ["https://en.wikisource.org/wiki/The_Time_Machine_(Wells)/Chapter_2", "ws-chapter.html"],
      ]);
      assert.strictEqual(meta.title, "Chapter 2");
      assert.strictEqual(meta.series, "The Time Machine");
      assert.strictEqual(meta.byline, "H. G. Wells");
      assert.strictEqual(meta.next, "https://en.wikisource.org/wiki/The_Time_Machine_(Wells)/Chapter_3");
      assert.match(plain(html), /none of us quite believed/);
      assert.ok(!/public domain/.test(plain(html)), "the licence box goes");
      const { got } = await inPage(browser, [["https://en.wikisource.org/wiki/The_Time_Machine_(Wells)", "ws-work.html"]],
        () => Waypage.save.findChapters("https://en.wikisource.org/wiki/The_Time_Machine_(Wells)"));
      assert.deepStrictEqual(got.links.map((u) => decodeURIComponent(u).replace(/^.*\//, "")), ["Chapter_1", "Chapter_2", "Chapter_3"]);
    });

    await test("Royal Road behind Cloudflare's browser check: read through the hidden browser", async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const p = await ctx.newPage();
      await p.goto(ROOT);
      await p.waitForFunction(() => window.Waypage && window.Waypage.save);
      const found = await p.evaluate(() => {
        const P = Waypage.platform;
        P.fetchText = async (url) => ({ status: 403, url, text: "<html><head><title>Just a moment...</title></head></html>" });
        Object.defineProperty(P, "canRender", { get: () => true, configurable: true });
        window.drawn = [];
        const rows = Array.from({ length: 8 }, (_, i) => '<tr class="chapter-row"><td><a href="/fiction/1/s/chapter/' + (i + 1) + '/c">Chapter ' + (i + 1) + "</a></td></tr>").join("");
        P.render = async (url) => { window.drawn.push(url); return { url, text: "<html><head><title>A Story | Royal Road</title></head><body><h1>A Story</h1><table id=\"chapters\"><tbody>" + rows + "</tbody></table></body></html>" }; };
        return Waypage.save.findChapters("https://www.royalroad.com/fiction/1/a-story");
      });
      assert.strictEqual(found.links.length, 8);
      assert.deepStrictEqual(await p.evaluate(() => window.drawn), ["https://www.royalroad.com/fiction/1/a-story"]);
      await ctx.close();
    });

    // Website sync reads a collection's chapters from any site's contents
    // page, not only the ones with rules of their own.
    await test("Website sync: a contents page with each chapter in a block of its own", async () => {
      const { got } = await inPage(browser, [["https://wanderinginn.example/table-of-contents/", "toc-divs.html"]],
        () => Waypage.save.findChapters("https://wanderinginn.example/table-of-contents/"));
      assert.strictEqual(got.links.length, 24, "every volume's chapters, not the book links or the side's");
      assert.match(got.links[0], /\/01\/01\/1-01\/$/);
      assert.match(got.links[23], /\/02\/24\/2-24\/$/);
      assert.ok(got.links.some((u) => /interlude/.test(u)), "an interlude without a number keeps its place");
      assert.strictEqual(got.cover, "https://wanderinginn.example/cover.jpg");
    });

    await test("Website sync: arcs in paragraphs of their own are one list", async () => {
      const { got } = await inPage(browser, [["https://parahumans.example/table-of-contents/", "toc-arcs.html"]],
        () => Waypage.save.findChapters("https://parahumans.example/table-of-contents/"));
      assert.strictEqual(got.links.length, 24);
      assert.match(got.links[0], /gestation-1-1\/$/);
      assert.match(got.links[23], /interlude-4\/$/);
      assert.ok(!got.links.some((u) => /donate/.test(u)));
    });

    await test("Website sync: a chapter list over several pages is read to its end", async () => {
      const { got, asked } = await inPage(browser, [
        ["https://novels.example/a-tale.html?page=2", "toc-paged-2.html"],
        ["https://novels.example/a-tale.html?page=3", "toc-paged-3.html"],
        ["https://novels.example/a-tale.html", "toc-paged-1.html"],
      ], () => Waypage.save.findChapters("https://novels.example/a-tale.html"));
      assert.deepStrictEqual(got.links, Array.from({ length: 16 }, (_, i) => "https://novels.example/a-tale/chapter-" + (i + 1) + ".html"));
      assert.strictEqual(asked.length, 3, "each page once");
    });

    await test("Website sync: a chapter's own link finds its contents page", async () => {
      const { got } = await inPage(browser, [
        ["https://wanderinginn.example/table-of-contents/", "toc-divs.html"],
        ["https://wanderinginn.example/2017/01/02/1-01/", "toc-chapter.html"],
      ], () => Waypage.save.findChapters("https://wanderinginn.example/2017/01/02/1-01/"));
      assert.strictEqual(got.links.length, 24);
      assert.strictEqual(got.page, "https://wanderinginn.example/table-of-contents/", "says which page it read");
    });

    await test("Website sync: chapters with names and no numbers", async () => {
      const { got } = await inPage(browser, [["https://serial.example/story/", "toc-named.html"]],
        () => Waypage.save.findChapters("https://serial.example/story/"));
      assert.deepStrictEqual(got.links.map((u) => u.split("/")[4]), ["prologue", "the-long-road", "ashes", "a-quiet-town", "the-well", "strangers", "night-market", "embers", "homecoming"]);
    });

    await test("a page's release date: meta, JSON-LD, Royal Road's unixtime, never a comment's", async () => {
      const ctx = await browser.newContext({ serviceWorkers: "block" });
      const p = await ctx.newPage();
      await p.goto(ROOT);
      await p.waitForFunction(() => window.Waypage && window.Waypage.save);
      const got = await p.evaluate(() => {
        const at = (html) => Waypage.save.publishedAt(new DOMParser().parseFromString(html, "text/html"), html);
        return [
          at('<meta property="article:published_time" content="2026-03-01T10:00:00Z"><p>x</p>'),
          at('<script type="application/ld+json">{"datePublished":"2025-12-24T08:00:00Z"}</script>'),
          at('<div class="fic-header"><time unixtime="1700000000">x</time></div>'),
          at('<div class="comments"><time unixtime="1700000000">x</time></div>'),
          at('<meta property="article:published_time" content="2999-01-01T00:00:00Z">'),
        ];
      });
      assert.deepStrictEqual(got, [Date.parse("2026-03-01T10:00:00Z"), Date.parse("2025-12-24T08:00:00Z"), 1700000000000, 0, 0]);
      await ctx.close();
    });

  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
