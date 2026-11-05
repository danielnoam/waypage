// Waypage's shell (1.45.11 split): the Downloads screen and the app
// update card it carries. See app.js for how the parts share.
// ---- Downloads ----
// Its own screen, from the bar's Downloads button: what's downloading
// (a run of saves is one card, its failed pages inside it), single pages
// that couldn't be saved, and what finished this session. Kept up to
// date while hidden, so it's ready the moment it opens.
function renderDownloads() {
  const root = $("downloads");
  const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
  const nodes = [], fresh = [];
  const keep = (key, make, sig) => {
    let node = old.get(key);
    if (!node) { node = make(); node.dataset.key = key; fresh.push(node); }
    else if (sig != null && node.dataset.sig !== sig) { node = make(); node.dataset.key = key; }
    if (sig != null) node.dataset.sig = sig;
    nodes.push(node);
  };
  const going = state.saving.filter((s) => !s.error && !(s.run && !s.run.done));
  const app = updShown();
  const restoring = !!driveRun && driveRun.restore;
  if (runs.size || going.length || app || restoring) keep("h:going", () => sectionHead("Downloading"));
  if (app) keep("u:" + upd.latest, updateCard, upd.phase + upd.error);
  if (restoring) keep("d:drive", driveCard, [driveRun.restore, driveRun.paused, driveRun.stopped, !!driveRun.merging].join());
  for (const r of runs) keep("r:" + r.id, () => runCard(r), [r.paused, r.stopped, failedOf(r).length].join());
  for (const s of going) keep("s:" + s.key, () => savingCard(s));
  const shown = new Set(state.finished.map((e) => e.run).filter(Boolean));
  const lone = state.saving.filter((s) => s.error && (!s.run || (s.run.done && !shown.has(s.run))));
  if (lone.length) keep("h:failed", () => sectionHead("Couldn't be saved"));
  for (const s of lone) keep("f:" + s.key, () => failedCard(s));
  const done = state.finished.filter((e) => e.run || state.pages.some((p) => p.id === e.page));
  if (done.length) keep("h:done", () => sectionHead("Done", el("button", { class: "btn-text", type: "button", onclick: clearFinished }, "Clear")));
  for (const e of done) {
    if (e.run) keep(e.key, () => doneRunCard(e), [e.run.saved, failedOf(e.run).length, whenText(e.at), !!(e.run.folder && folderPages(e.run.folder).length)].join());
    else {
      const p = state.pages.find((x) => x.id === e.page);
      keep(e.key, () => donePageCard(p, e), [p.title, p.missing, whenText(e.at)].join());
    }
  }
  if (!nodes.length) {
    keep("empty", () => el("div", { class: "empty wide" },
      el("h2", { class: "empty-title" }, "Nothing downloading"),
      el("p", { class: "empty-text" }, "Clips you save show their progress here, and stay here once they're done until you close the app."),
      el("button", { class: "btn-quiet", type: "button", onclick: () => toSettings("saving") }, "Before you go offline")));
  }
  root.replaceChildren(...nodes);
  if (app) paintUpdateCard();
  for (const s of going) updateSavingCard(s);
  for (const r of runs) updateRunCard(r);
  if (state.downloads) fresh.forEach((node) => M.appear(node));
  paintDownloads();
}

// The app's own update (1.23.0): its download, Pause and Resume, then
// Install, like a clip being saved.
// The app update's phase: idle, checking, current, failed, available,
// downloading, paused, ready (app-start.js checks and downloads it).
// `tag` and `key` are set when what downloads is a preview build (1.48.0):
// the pre-release's tag and the APK's file name part; `latest` is then the
// words shown ("test build of <branch>").
const upd = { phase: "idle", latest: null, notes: "", pct: 0, bytes: 0, total: 0, apk: null, error: "", tag: null, key: null };
const UPD_OUT = ["available", "downloading", "paused", "ready"];
const updShown = () => C.platform.android && ["downloading", "paused", "ready"].includes(upd.phase) && !!upd.latest;
function updateCard() {
  const st = upd.phase;
  const act = st === "downloading" ? ["Pause", pauseUpdate] : st === "paused" ? ["Resume", startUpdate] : ["Install", install];
  return el("div", { class: "card saving app-update wide", role: "group", "aria-label": "Waypage " + upd.latest },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, "App update"),
      el("span", { class: "card-title" }, "Waypage " + upd.latest),
      st === "ready" ? null : el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(upd.pct) },
        el("span", { class: "progress-fill" })),
      el("span", { class: "card-status" + (st === "downloading" ? " accent" : upd.error ? " warn" : "") },
        st === "downloading" ? el("span", { class: "spinner", "aria-hidden": "true" }) : null,
        el("span", { class: "status-text" }, updStatus())),
      el("span", { class: "card-actions" },
        el("button", { class: st === "ready" ? "btn-small" : "btn-quiet", type: "button", onclick: act[1] }, act[0]))));
}
function updStatus() {
  if (upd.phase === "ready") return "Ready to install";
  if (upd.error) return upd.error;
  const size = upd.total > 0 ? " · " + formatSize(upd.bytes) + " of " + formatSize(upd.total) : "";
  return (upd.phase === "paused" ? "Paused at " : "") + upd.pct + "%" + size;
}
function paintUpdateCard() {
  paintDownloads();
  const card = $("downloads").querySelector(".app-update");
  if (!card) return;
  const bar = card.querySelector(".progress");
  if (bar) {
    bar.setAttribute("aria-valuenow", String(upd.pct));
    card.querySelector(".progress-fill").style.transform = "scaleX(" + upd.pct / 100 + ")";
  }
  card.querySelector(".status-text").textContent = updStatus();
}

function clearFinished() {
  state.finished = [];
  renderDownloads();
  $("downloadsBack").focus();
}

function doneRunCard(e) {
  const r = e.run;
  const name = r.folder && folderPages(r.folder).length ? folderPages(r.folder)[0].folder : null;
  const saved = r.files ? (r.saved === 1 ? "1 file added" : (r.saved || "No") + " files added")
    : r.saved ? countLine(r.saved) + (r.again ? " saved again" : " saved") : "Nothing saved";
  return el("div", { class: "card done-run wide", role: "group", "aria-label": (r.folder || "Several clips") + ", done" },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, r.site),
      el("span", { class: "card-title", dir: "auto" }, r.folder || r.label || "Several clips"),
      el("span", { class: "card-status" }, [saved, r.stopped ? "Stopped" : null, whenText(e.at)].filter(Boolean).join(" · ")),
      name ? el("span", { class: "card-actions" },
        el("button", { class: "btn-small", type: "button", onclick: () => toLibrary().then(() => openFolder(name)) }, "Open")) : null,
      failedList(r)));
}

function donePageCard(p, e) {
  const thumb = thumbUrl(p);
  return el("div", { class: "card done-page wide" },
    el("button", { class: "card-open", type: "button", "aria-label": p.title, onclick: () => toLibrary().then(() => openPage(p.id)) }),
    thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : siteMark(p),
    el("span", { class: "card-body" },
      el("span", { class: "card-site", dir: "auto" }, ...dotted(siteOf(p), p.folder)),
      el("span", { class: "card-title", dir: "auto" }, p.title),
      el("span", { class: "card-status" }, "Saved " + whenText(e.at),
        p.missing ? " · " : null, p.missing ? el("span", { class: "warn" }, p.missing + (p.missing === 1 ? " preview" : " previews") + " missing") : null)));
}

// The bar's Downloads button: a ring filling with everything being
// downloaded together, and a warning dot once only pages that couldn't
// be saved are left. The app's own notification (Android) says
// the same.
let toldNative = "";
function paintDownloads() {
  paintSync();
  const active = [...runs];
  const singles = state.saving.filter((s) => !s.error && !(s.run && !s.run.done));
  let units = 0, got = 0;
  for (const r of active) {
    if (r.total) { units += r.total; got += runShare(r) * r.total; }
    else { const page = r.current && !r.current.waiting ? savingShare(r.current) || 0 : 0; units += r.saved + r.failed + 1; got += r.saved + r.failed + page; }
  }
  for (const s of singles) { units += 1; got += s.waiting ? 0 : savingShare(s) || 0; }
  const app = upd.phase === "downloading";
  if (app) { units += 1; got += upd.pct / 100; }
  // A backup going up is on the Sync screen; only a restore downloads.
  const drive = !!driveRun && driveRun.restore;
  if (drive) { units += 1; got += driveRun.share || 0; }
  const busy = units > 0;
  const share = busy ? Math.min(1, got / units) : 0;
  const failed = !busy && state.saving.some((s) => s.error);
  const btn = $("downloadsBtn");
  btn.classList.toggle("busy", busy);
  btn.classList.toggle("failed", failed);
  btn.querySelector(".dl-ring-fill").style.strokeDashoffset = String(100 - share * 100);
  btn.setAttribute("aria-label", busy ? "Downloads, " + Math.round(share * 100) + "% done"
    : failed ? "Downloads, some clips couldn't be saved" : "Downloads");
  if (!busy) {
    // A sync (and its pictures) keeps the same notification while it
    // runs, so it goes on with the app in the background (0.30.4).
    const sync = driveRun ? { title: "Backing up to Google Drive", text: driveStatusText(), done: Math.round((driveRun.share || 0) * 1000), total: 1000 } : syncNote();
    if (sync) {
      const said = JSON.stringify(sync);
      if (said !== toldNative) { toldNative = said; C.platform.downloads.update(sync); }
      return;
    }
    if (toldNative) C.platform.downloads.stop();
    toldNative = "";
    return;
  }
  const one = active.length === 1 && !singles.length ? active[0] : null;
  const title = drive && units === 1 ? (driveRun.restore ? "Restoring from Google Drive" : "Backing up to Google Drive") : app && units === 1 ? "Downloading Waypage " + upd.latest : one ? (one.files ? "Adding " + one.label : (one.again ? "Saving again in " : "Saving into ") + (one.folder || "your library"))
    : !active.length && singles.length === 1 ? "Saving a clip from " + singles[0].site : "Saving " + Math.round(units) + " clips";
  const text = drive && units === 1 ? driveStatusText() : app && units === 1 ? upd.pct + "% done" : one ? (one.total ? one.saved + one.failed + " of " + one.total + " done" : countLine(one.saved) + " saved") + (one.paused ? " · Paused" : "")
    : Math.round(share * 100) + "% done";
  const o = { title, text, done: Math.round(share * 1000), total: 1000 };
  const said = JSON.stringify(o);
  if (said === toldNative) return;
  toldNative = said;
  C.platform.downloads.update(o);
}

function openDownloads(fromHistory) {
  if (state.downloads) return;
  // From Settings (the update's toast) it opened under them (1.28.0).
  if (!fromHistory && (state.settings || state.news || state.syncPage)) { toLibrary().then(() => openDownloads()); return; }
  state.downloads = true;
  renderDownloads();
  if (!fromHistory) history.pushState({ view: "downloads" }, "");
  $("downloadsBody").scrollTop = 0;
  pushScreen($("downloadsView")).then(() => $("downloadsBack").focus());
}

function closeDownloads() {
  if (!state.downloads) return;
  state.downloads = false;
  popScreen($("downloadsView"));
}

function savingCard(s) {
  return el("div", { class: "card saving wide", role: "group", "aria-label": "Saving " + s.site },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, s.site),
      el("span", { class: "card-title", dir: "auto" }, s.url),
      el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
        el("span", { class: "progress-fill" })),
      el("span", { class: "card-status accent" },
        s.waiting ? null : el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { class: "status-text" }, savingStatus(s))),
      s.offline ? el("span", { class: "card-actions" },
        el("button", { class: "btn-quiet", type: "button", onclick: () => dropLater(s) }, "Remove")) : null));
}

// Progress lands in the card that's already there, so the bar grows on
// its spring instead of being redrawn at each image.
function updateSavingCard(s) {
  if (s.run && !s.run.done) { updateRunCard(s.run); return; }
  paintDownloads();
  const card = $("downloads").querySelector('[data-key="' + CSS.escape("s:" + s.key) + '"]');
  if (!card || s.error) return;
  const share = savingShare(s);
  const bar = card.querySelector(".progress");
  bar.classList.toggle("busy", share == null && !s.waiting);
  if (share == null) bar.removeAttribute("aria-valuenow");
  else bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));
  card.querySelector(".progress-fill").style.transform = "scaleX(" + (share || 0) + ")";
  const status = card.querySelector(".card-status");
  if (!s.waiting && !status.querySelector(".spinner")) status.prepend(el("span", { class: "spinner", "aria-hidden": "true" }));
  status.querySelector(".status-text").textContent = savingStatus(s);
}

// The seconds on a slow save tick on their own.
setInterval(() => { for (const s of state.saving) if (!s.error && !s.waiting) updateSavingCard(s); }, 1000);
