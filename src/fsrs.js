// Waypage: the scheduler behind the Anki extension (2026-11). FSRS-5, the
// free spaced-repetition scheduler Anki has used since 23.10 (open-spaced-
// repetition, MIT), written out here in plain JS with its default weights.
// A card is { state, step, due, stability, difficulty, last, reps, lapses };
// nothing here reads a clock or storage, so the same log always gives the
// same cards.
//
//   next(card, grade, now, opts)   the card after an answer (1 Again .. 4 Easy)
//   preview(card, now, opts)       [{ grade, card, label }] for the four buttons
//   apply(card, grade, now, opts)  the card after the button of that grade
//   fresh()                        a card nobody has answered
//   retrievability(days, stability)
//   interval(stability, retention) whole days
//   label(ms)                      "10m", "3d", "2.5mo"
//
// opts: { steps: [minutes], relearn: [minutes], retention }. Deliberately
// no fuzz, so a replayed log is exact.
(function () {
  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
    1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, FACTOR = 19 / 81;
  const MIN = 60000, DAY = 86400000;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  const retrievability = (days, s) => Math.pow(1 + FACTOR * days / s, DECAY);
  const interval = (s, r) => Math.max(1, Math.round(s / FACTOR * (Math.pow(r || 0.9, 1 / DECAY) - 1)));

  const d0 = (g) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
  const nextD = (d, g) => {
    const moved = d + (-W[6] * (g - 3)) * (10 - d) / 9;
    return clamp(W[7] * d0(4) + (1 - W[7]) * moved, 1, 10);
  };
  const recall = (d, s, r, g) =>
    s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
  const forget = (d, s, r) =>
    Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]));
  const sameDay = (s, g) => s * Math.exp(W[17] * (g - 3 + W[18]));

  const fresh = () => ({ state: "new", step: 0, due: 0, stability: 0, difficulty: 0, last: 0, reps: 0, lapses: 0 });

  const steps = (o, key, dflt) => (Array.isArray(o && o[key]) ? o[key] : dflt);

  // A learning card's wait after an answer at `step`: Again goes back to the
  // first step, Hard repeats this one (the first waits half as long again
  // as it is from the second), Good moves on, and past the last step the
  // card graduates (null).
  function afterStep(list, step, g) {
    if (g === 1) return { step: 0, min: list[0] };
    if (g === 2) return { step, min: step === 0 ? (list.length > 1 ? (list[0] + list[1]) / 2 : list[0] * 1.5) : list[step] };
    return step + 1 < list.length ? { step: step + 1, min: list[step + 1] } : null;
  }

  function graduate(c, now, o) {
    const days = interval(c.stability, o && o.retention);
    return { ...c, state: "review", step: 0, due: now + days * DAY, last: now };
  }

  function next(card, grade, now, opts) {
    const g = clamp(Math.round(grade), 1, 4);
    const learn = steps(opts, "steps", [1, 10]), relearn = steps(opts, "relearn", [10]);
    const days = card.last ? Math.max(0, (now - card.last) / DAY) : 0;
    let c = { ...card, reps: card.reps + 1 };

    if (card.state === "new") {
      c.stability = W[g - 1];
      c.difficulty = d0(g);
      c.last = now;
      const w = g === 4 || !learn.length ? null : afterStep(learn, 0, g);
      return w ? { ...c, state: "learn", step: w.step, due: now + w.min * MIN } : graduate(c, now, opts);
    }

    if (card.state === "learn" || card.state === "relearn") {
      const list = card.state === "learn" ? learn : relearn;
      c.stability = Math.max(0.01, sameDay(card.stability, g));
      c.difficulty = nextD(card.difficulty, g);
      c.last = now;
      const w = g === 4 ? null : afterStep(list, card.step, g);
      if (!w) return graduate(c, now, opts);
      return { ...c, step: w.step, due: now + w.min * MIN };
    }

    // review
    const r = retrievability(days, card.stability);
    c.difficulty = nextD(card.difficulty, g);
    c.last = now;
    if (g === 1) {
      c.stability = Math.max(0.01, forget(card.difficulty, card.stability, r));
      c.lapses = card.lapses + 1;
      if (!relearn.length) return graduate(c, now, opts);
      return { ...c, state: "relearn", step: 0, due: now + relearn[0] * MIN };
    }
    c.stability = recall(card.difficulty, card.stability, r, g);
    return graduate(c, now, opts);
  }

  // The four buttons' outcomes. A review's Hard, Good and Easy never land
  // on the same day: each is at least a day past the one before.
  function preview(card, now, opts) {
    const out = [1, 2, 3, 4].map((g) => ({ grade: g, card: next(card, g, now, opts) }));
    if (card.state === "review") {
      const days = (c) => Math.round((c.due - now) / DAY);
      const set = (o, d) => { o.card = { ...o.card, due: now + d * DAY }; };
      const [, hard, good, easy] = out;
      const h = days(hard.card), gd = Math.max(days(good.card), h + 1), e = Math.max(days(easy.card), gd + 1);
      set(hard, h); set(good, gd); set(easy, e);
    }
    for (const o of out) o.label = label(o.card.due - now);
    return out;
  }

  // The answer as the buttons promised it: what a log is replayed with.
  const apply = (card, grade, now, opts) => preview(card, now, opts)[clampG(grade) - 1].card;
  const clampG = (g) => clamp(Math.round(g), 1, 4);

  function label(ms) {
    const m = ms / MIN;
    if (m < 1) return "<1m";
    if (m < 60) return Math.round(m) + "m";
    if (m < 1440) return Math.round(m / 60) + "h";
    const d = ms / DAY;
    if (d < 30) return Math.round(d) + "d";
    if (d < 365) return (Math.round(d / 3.04) / 10) + "mo";
    return (Math.round(d / 36.5) / 10) + "y";
  }

  window.Waypage = window.Waypage || {};
  window.Waypage.fsrs = { next, preview, apply, fresh, retrievability, interval, label, weights: W, DAY, MIN };
})();
