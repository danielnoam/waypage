# The web copy's fetch proxy

A browser can't read most sites itself (CORS), so the web copy at
danielnoam.github.io/waypage fetches pages through this Cloudflare
Worker. The phone app never uses it: it fetches natively.

    GET https://waypage-fetch.<account>.workers.dev/?url=<address>[&accept=<Accept>][&ua=<User-Agent>]

It answers with the page's own status, body and Content-Type, and the
address it ended at in `X-Final-Url`. Its own refusals carry
`X-Proxy-Error`: `origin`, `method`, `bad address`, `private address`,
`port`, `not http`, `rate limited` (429), `too big` (413), `timed out`,
`unreachable`, `too many redirects`.

What it does and doesn't do:

- **Stores nothing.** No cache (`cache: "no-store"`), no logs or traces
  (`observability` off in `wrangler.toml`), no cookies either way.
- **Answers only the web copy** (Origin `https://danielnoam.github.io`, and
  `http://localhost` / `127.0.0.1` for working on it). Forks' copies on
  other origins are refused. The Origin header only binds browsers: a
  script can send any Origin it likes, and there's no secret a public web
  copy could hold, so the rate limit and the free plan's daily cap are what
  bound anyone else.
- **GET only, http(s) only, public addresses only.** Loopback, private,
  link-local and `.local`/`.internal` names are refused, on every redirect
  hop (it follows redirects itself, at most 5). Ports 80, 443, 8080, 8443.
- **15 MB at most** per answer, **25 s** per fetch, **120 requests a minute**
  per IP (counted at each Cloudflare location, so it's approximate).
- Sends the visitor's own browser string with "Waypage (offline reader; …)"
  after it, as the app does (Wikipedia's rule), and their Accept-Language.

## Setting it up (once)

1. Make a free Cloudflare account. Under Workers & Pages, pick a
   `workers.dev` subdomain: the address becomes
   `https://waypage-fetch.<subdomain>.workers.dev/`.
2. My Profile › API Tokens › Create Token › "Edit Cloudflare Workers"
   template, limited to this account. Copy the token.
3. In the repo's Settings › Secrets and variables › Actions, add
   `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (on the
   Workers & Pages overview, right side).
4. Run the **Worker** workflow (Actions › Worker › Run workflow). After
   that it deploys by itself whenever `worker/` changes on main.
5. Put the address in `PROXY_URL` in `src/platform.js`, and in the
   workflow's "Check the live worker" step.

Or deploy by hand from this folder: `npx wrangler@4.151.2 login`, then
`npx wrangler@4.151.2 deploy`.

On the free plan, past 100,000 requests a day the Worker stops answering
until the next day; it never bills.

`node test/worker.test.js` runs it in Node against a faked web.
