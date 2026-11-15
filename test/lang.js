// For tests that load src/ files in Node: what src/language.js gives a
// page, in English (t, tn and i18n, from keel's i18n.js).
const path = require("path");
const keep = { window: global.window, document: global.document };
global.window = global.window || {};
global.document = { documentElement: {} };
require(path.join(__dirname, "../src/keel/i18n.js"));
global.i18n = global.window.Keel.i18n.create({ langs: ["en"] });
global.t = global.i18n.t;
global.tn = global.i18n.tn;
if (keep.document) global.document = keep.document; else delete global.document;
