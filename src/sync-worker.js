// Waypage: sync's merge off the main thread (1.2.1). The app's sync.js and
// backup.js run here as they do in the page, with a window of their own;
// neither touches the page or storage while merging. Each message is one
// job: "merge" (every page as GitHub would hold it, the three-way merge)
// or "same" (whether the merge changed the library on GitHub).
self.window = self;
self.Waypage = {};
// ink.js for its stroke check (backup.cleanInk): without it every drawing
// on a clip dropped out of the merge.
importScripts("backup.js" + self.location.search, "sync.js" + self.location.search, "ink.js" + self.location.search);

const S = self.Waypage.sync;
const B = self.Waypage.backup;

self.onmessage = (e) => {
  const job = e.data || {};
  try {
    if (job.op === "merge") {
      const view = job.before.map((p) => S.share(B.cleanMeta(p, p.id) || p));
      const remoteDoc = job.remote ? S.clean(job.remote) : null;
      const merged = S.merge(job.base, { pages: view, waiting: job.waiting, feeds: job.feeds, feedsSeen: job.feedsSeen }, remoteDoc, job.now, S.sameUrl, S.urlKey);
      self.postMessage({ id: job.id, merged, remoteDoc });
    } else if (job.op === "same") {
      self.postMessage({ id: job.id, same: S.same(job.a, job.b) });
    } else throw new Error("unknown job");
  } catch (err) {
    self.postMessage({ id: job.id, error: String((err && err.message) || err) });
  }
};
