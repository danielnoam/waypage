// Waypage: backups in Google Drive (1.27.0), beside GitHub sync rather
// than instead of it. A backup is backup.exportLibrary's zip, put in a
// "Waypage" folder in the person's Drive; the last KEEP are kept.
//
// Sign-in, the folder, sending and keeping are keel's (src/keel/drive.js),
// shared with LifeLog. Here: what a backup carries, and the Android plugin's
// backup that runs with the app closed (1.47.0).
(function () {
  const C = window.Waypage;
  // From the Google Cloud project's Web client. Not a secret.
  const WEB_CLIENT = "713128219626-k0dbj8fk364sprduqon2o97a0bum8rst.apps.googleusercontent.com";
  const P = () => C.platform.plugin("Drive");

  const d = window.Keel.drive.create({
    name: "Waypage", tag: "wpdrive", mime: "application/zip", webClient: WEB_CLIENT,
    keys: { cfg: "waypage.drive", token: "waypage.driveToken", hand: "waypage.driveHand", ask: "waypage.driveAsk" },
    native: () => C.platform.native, desktop: () => false, plugin: P,
    fileBlob: (uri, size) => C.platform.files.blob(uri, size),
    fresh: () => ({ what: { clips: true, notes: true, feeds: true, newsletters: true } }),
  });

  C.drive = Object.defineProperties({
    DriveError: d.DriveError, KEEP: d.KEEP, DAY: d.DAY, EVERY: d.EVERY,
    connect: d.connect, disconnect: d.disconnect, download: d.download, remove: d.remove, getToken: d.getToken,
    // [{ id, name, size, at, from, clips }], newest first.
    async list() { return (await d.list()).map((f) => ({ ...f, clips: Number(f.props.clips) || 0 })); },
    // `out` is exportLibrary's { uri } in the app, { blob } in a browser.
    upload(out, info, onProgress, ctl) {
      return d.upload(out, { device: info.device, props: { clips: String(info.clips || 0) } }, onProgress, ctl);
    },
    handOver(plan) { return P() && P().background ? P().background(plan ? { plan: JSON.stringify(plan) } : {}).catch(() => {}) : Promise.resolve(); },
    hold(on) { if (P() && P().backgroundHold) P().backgroundHold({ hold: on }).catch(() => {}); },
    async backgroundDone() { try { return P() && P().backgroundState ? await P().backgroundState() : null; } catch (e) { return null; } },
    // What goes in a backup: clips (files copied in among them), feeds,
    // newsletter addresses (1.46.0; a Files switch until then).
    // `links` (1.47.0): clips that can be saved again go in as links only.
    // `notes` (2026-11): notes, a part of their own, whole.
    get what() { return d.on ? { clips: true, links: false, notes: true, feeds: true, newsletters: true, ...(d.get("what") || {}) } : null; },
    setWhat(k, v) { if (d.on) d.set("what", { ...this.what, [k]: !!v }); },
    // The backup that runs with the app closed (Android).
    get background() { return !!(P() && P().background); },
  }, Object.fromEntries(["available", "on", "email", "folder", "auto", "every", "last", "since", "signedIn", "closing", "resume"]
    .map((k) => [k, Object.getOwnPropertyDescriptor(d, k)])));
})();
