# Dropped

Decided against, with the reason, so an idea can come back if the reason
stops being true.

- **A server that scrapes and stores pages.** Datacenter IPs get blocked
  by the sites people most want to save, it can't see pages behind the
  reader's login, it makes the operator the one copying and hosting the
  pages (DMCA duties), and it sees every URL everyone saves. On-device
  fetching has none of these. A stateless worker for a desktop browser
  version is still possible (TODO.md).
- **Downloading videos.** Apple guideline 5.2.3 and Play's IP policy
  reject saving media from YouTube and similar sites. Videos are a
  thumbnail and a link.
- **React, Tailwind and shadcn/ui.** Considered from the design reference
  guide. The app is a library list, a reader and settings; a build step
  and a framework cost more than they give. The guide's principles (HIG,
  8-point grid, springs, WCAG AA) are kept in DESIGN.md.
- **Syncing saved pages through a GitHub repo, as LifeLog syncs its
  data.** Fine for a JSON index, wrong for megabytes of images, and asking
  other people for a GitHub token is a non-starter. v1 is per device with
  export and import. *Revived 2 Oct 2026:* Daniel wants it for his own
  devices; it's in TODO.md under Sync, with the image question open.
- **Exporting a clip that reads from a file (Daniel, 6 Oct 2026).** Its
  pictures stay in the original file, so an export would need them pulled
  back out; the original is already on the device and can be shared as
  it is. Export stays hidden on those clips.
- **A focus trap instead of `inert` on the library (Daniel, 7 Oct
  2026).** Setting `inert` restyles every card, 30 to 60 ms on a 4x
  slowed CPU, but it runs after the animation where it isn't seen
  (NOTES.md, 1.2.0 and 1.2.1). A focus trap would have to keep every card
  out of the reading order by hand. Worth another look only if a phone
  shows a stall when a screen opens.
- **A PDF attached to an email as its own clip (Daniel, 10 Oct 2026).**
  Not needed: an .eml opens as its text, attachments left out.
- **"Sign in with Google" in the sign-in browser.** Google refuses sign-in
  in embedded browsers; the way around is against Google's terms. Email
  and password sign-ins work.
- **An "I have 15 minutes" filter (Daniel, 17 Oct 2026).** Showing only
  clips you can finish in the time you have. Not needed.
