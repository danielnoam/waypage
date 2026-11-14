// Waypage: the Anki extension's engine, loaded only once Anki is turned on
// in Settings › Extensions (src/extensions.js). Decks, cards and their
// scheduling come in the next steps; for now it is the empty place.
//
//   empty()          what the Anki place shows while there are no decks
(function () {
  const empty = () => ({
    title: "No decks yet",
    text: "Decks you make from the words you pick in a clip gather here to practise.",
  });
  window.Waypage = window.Waypage || {};
  window.Waypage.anki = { empty };
})();
