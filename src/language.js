// Waypage in the reader's language, through keel's i18n.js: the English
// in t() is the key, src/lang/he.js has the Hebrew. Loaded in <head>, so
// <html> has its lang and dir (rtl for Hebrew) before the first paint,
// and t() and tn() are there for every script after it. The table is
// written in only when it's needed: English pays nothing for Hebrew.
// Settings → Language changes it (i18n.set) and the app starts again.
const i18n = Keel.i18n.create({ key: "waypage.lang", langs: ["en", "he"], load: false });
const t = i18n.t, tn = i18n.tn;
(window.Waypage = window.Waypage || {}).i18n = i18n;
// The same ?v= as this file's own tag, which a release moves on.
const LANG_V = (/\?v=[^&#]+/.exec((document.currentScript && document.currentScript.src) || "") || [""])[0];
if (i18n.lang !== "en") document.write('<script src="src/lang/' + i18n.lang + '.js' + LANG_V + '"><\/script>');
