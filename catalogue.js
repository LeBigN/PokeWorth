(function () {
  "use strict";
  var root = document.getElementById("cat-root");
  if (!root) return;
  var Q = new URLSearchParams(location.search);
  var state = { lang: Q.get("lang") === "jp" ? "jp" : "fr", tab: ["cartes", "scelles", "pokedex"].indexOf(Q.get("tab")) > -1 ? Q.get("tab") : "cartes", q: "", serie: "", type: "" };
  var DATA = { series: [], produits: [] };

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function fmt(d) { var x = new Date(d + "T12:00:00"); return isNaN(x) ? d : x.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function typeOf(nom) {
    var n = norm(nom);
    var map = [["display", "Display"], ["etb", "ETB"], ["dresseur d'elite", "ETB"], ["tripack", "Tripack"], ["blister", "Blister"], ["bundle", "Bundle"], ["pokebox", "Pokébox"], ["deck", "Deck"], ["coffret", "Coffret"], ["booster", "Booster"]];
    for (var i = 0; i < map.length; i++) if (n.indexOf(map[i][0]) > -1) return map[i][1];
    return "Autre";
  }
  function build(json) {
    var seriesById = {};
    (json.actualites || []).forEach(function (a) {
      if (a.type !== "sortie") return;
      var name = (a.titre || "").replace(/^Sortie\s*:\s*/, "");
      if (a.serie && a.produits && a.produits.length) {
        seriesById[a.serie] = { id: a.serie, nom: name.replace(/^Méga-Évolution\s+/, ""), date: a.date, image: a.image, alt: a.image_alt, nb: a.produits.length, lang: "fr" };
        a.produits.forEach(function (p) {
          DATA.produits.push({ nom: p.nom, detail: p.detail || "", image: p.image, alt: p.alt || p.nom, serie: a.serie, serieNom: seriesById[a.serie].nom, date: a.date, type: typeOf(p.nom), lang: "fr" });
        });
      } else {
        DATA.produits.push({ nom: name, detail: "", image: a.image, alt: a.image_alt || name, serie: "", serieNom: "Série non renseignée", date: a.date, type: typeOf(name), lang: "fr" });
      }
    });
    DATA.series = Object.keys(seriesById).map(function (k) { return seriesById[k]; });
  }

  // ---------- éléments communs
  function empty(title, lines) {
    var b = el("div", "cat-empty"); b.setAttribute("role", "status");
    b.appendChild(el("h3", "", title));
    lines.forEach(function (l) { b.appendChild(el("p", "", l)); });
    return b;
  }
  function imgBox(src, alt, cls) {
    var box = el("div", cls || "cat-img");
    if (!src) { box.appendChild(el("span", "cat-noimg", "Image indisponible")); return box; }
    var i = el("img"); i.src = src; i.alt = alt || ""; i.loading = "lazy"; i.decoding = "async";
    i.onerror = function () { box.textContent = ""; box.appendChild(el("span", "cat-noimg", "Image indisponible")); };
    box.appendChild(i); return box;
  }
  function search(ph, onInput) {
    var w = el("div", "cat-search"), l = el("label", "sr", ph); l.setAttribute("for", "cat-q");
    var i = el("input"); i.type = "search"; i.id = "cat-q"; i.placeholder = ph; i.value = state.q; i.autocomplete = "off";
    i.addEventListener("input", function () { state.q = i.value; onInput(); });
    w.appendChild(l); w.appendChild(i); return w;
  }
  function chips(label, options, key, onChange) {
    var g = el("div", "cat-chips"); g.setAttribute("role", "group"); g.setAttribute("aria-label", label);
    options.forEach(function (o) {
      var b = el("button", "cat-chip", o[1]); b.type = "button"; b.setAttribute("aria-pressed", String(state[key] === o[0]));
      b.addEventListener("click", function () { state[key] = o[0]; onChange(); });
      g.appendChild(b);
    });
    return g;
  }

  // ---------- onglets
  function panelCartes(p) {
    if (state.lang === "jp") {
      p.appendChild(empty("Aucune série japonaise importée", ["Aucune source de données japonaise n'est connectée à Pokéworth pour le moment. Les séries et cartes japonaises ne sont donc pas affichées, plutôt que de présenter un catalogue incomplet."]));
      return;
    }
    var list = el("div", "cat-list");
    function draw() {
      list.textContent = "";
      var res = DATA.series.filter(function (s) { return !state.q || norm(s.nom).indexOf(norm(state.q)) > -1; });
      if (!res.length) { list.appendChild(empty("Aucun résultat", ["Aucune série ne correspond à « " + state.q + " »."])); return; }
      var grid = el("div", "cat-grid");
      res.forEach(function (s) {
        var a = el("a", "card cat-serie"); a.href = "serie.html?s=" + encodeURIComponent(s.id);
        a.appendChild(imgBox(s.image, s.alt, "cat-img cat-logo"));
        var b = el("div", "cat-body");
        b.appendChild(el("h3", "", "Méga-Évolution " + s.nom));
        b.appendChild(el("p", "cat-meta", "Sortie le " + fmt(s.date) + " · Français"));
        b.appendChild(el("p", "cat-meta", s.nb + " produits scellés · Cartes : non importées"));
        a.appendChild(b); grid.appendChild(a);
      });
      list.appendChild(grid);
    }
    p.appendChild(search("Rechercher une série", draw));
    var nt = el("p", "note", "Une seule série française est renseignée dans les données du site. Les cartes individuelles ne sont pas encore importées : la grille de cartes d'une série s'affichera dès qu'une source autorisée sera connectée. "); var sl = el("a", "", "Voir les sources."); sl.href = "sources-des-donnees.html"; nt.appendChild(sl); p.appendChild(nt);
    p.appendChild(list); draw();
    var det = el("details", "cat-missing"); det.appendChild(el("summary", "", "Éléments manquants"));
    var ul = el("ul");
    ["Cartes françaises : aucune importée (aucune source autorisée connectée).", "Séries et cartes japonaises : aucune donnée.", "Images de cartes : aucune (droits non vérifiés).", "Séries françaises antérieures à Règne Delta : non renseignées."].forEach(function (t) { ul.appendChild(el("li", "", t)); });
    det.appendChild(ul); var more = el("p"); var a = el("a", "", "Voir les sources des données"); a.href = "sources-des-donnees.html"; more.appendChild(a); det.appendChild(more); p.appendChild(det);
  }
  function panelScelles(p) {
    if (state.lang === "jp") {
      p.appendChild(empty("Aucun produit japonais importé", ["Aucun produit scellé japonais n'est présent dans les données du site pour le moment."]));
      return;
    }
    var list = el("div", "cat-list"), fwrap = el("div", "cat-filters");
    var types = [["", "Tous les types"]]; var seen = {};
    DATA.produits.forEach(function (x) { if (!seen[x.type]) { seen[x.type] = 1; types.push([x.type, x.type]); } });
    var series = [["", "Toutes les séries"]]; var s2 = {};
    DATA.produits.forEach(function (x) { if (!s2[x.serie]) { s2[x.serie] = 1; series.push([x.serie, x.serie ? "Méga-Évolution " + x.serieNom : "Hors série"]); } });
    function draw() {
      fwrap.textContent = "";
      fwrap.appendChild(chips("Filtrer par série", series, "serie", draw));
      fwrap.appendChild(chips("Filtrer par type de produit", types, "type", draw));
      list.textContent = "";
      var res = DATA.produits.filter(function (x) {
        return (!state.q || norm(x.nom + " " + x.detail).indexOf(norm(state.q)) > -1) && (!state.serie || x.serie === state.serie) && (!state.type || x.type === state.type);
      });
      if (!res.length) { list.appendChild(empty("Aucun résultat", ["Aucun produit ne correspond à ces filtres."])); return; }
      var grid = el("div", "cat-grid cat-grid-prod");
      res.forEach(function (x) {
        var c = el("article", "card cat-prod");
        c.appendChild(imgBox(x.image, x.alt));
        var b = el("div", "cat-body"); b.appendChild(el("span", "tag", x.type));
        b.appendChild(el("h3", "", x.nom));
        if (x.detail) b.appendChild(el("p", "cat-meta", x.detail));
        b.appendChild(el("p", "cat-meta", (x.serie ? "Méga-Évolution " + x.serieNom : "Série non renseignée") + " · " + fmt(x.date)));
        b.appendChild(el("p", "cat-meta", "Prix : consultez l'app"));
        c.appendChild(b); grid.appendChild(c);
      });
      list.appendChild(grid);
    }
    p.appendChild(search("Rechercher un produit", draw));
    p.appendChild(fwrap);
    p.appendChild(el("p", "note", "Ces produits sont ceux annoncés dans les actualités du site (français). Le type est déduit du nom du produit. Aucun prix n'est affiché ici : les prix sont dans l'app."));
    p.appendChild(list); draw();
  }
  function panelPokedex(p) {
    p.appendChild(empty("Pokédex non disponible", [
      "Aucune base de Pokémon n'est importée dans Pokéworth. Le Pokédex (noms français et japonais, numéro national) sera affiché dès qu'une source dont la licence autorise cet usage sera connectée.",
      "Poképédia et Bulbapedia sont publiées sous licence non commerciale : leur contenu n'est pas importé."
    ]));
    var a = el("a", "cta ghost", "Voir les sources des données"); a.href = "sources-des-donnees.html"; p.appendChild(a);
  }

  // ---------- squelette
  var TABS = [["cartes", "Cartes", panelCartes], ["scelles", "Produits scellés", panelScelles], ["pokedex", "Pokédex", panelPokedex]];
  function sync() { var u = new URLSearchParams(); u.set("tab", state.tab); u.set("lang", state.lang); history.replaceState(null, "", "?" + u.toString()); }
  function render() {
    root.textContent = "";
    var bar = el("div", "cat-bar");
    var tl = el("div", "cat-tabs"); tl.setAttribute("role", "tablist"); tl.setAttribute("aria-label", "Sections du catalogue");
    TABS.forEach(function (t, i) {
      var b = el("button", "cat-tab", t[1]); b.type = "button"; b.setAttribute("role", "tab"); b.id = "tab-" + t[0];
      b.setAttribute("aria-selected", String(state.tab === t[0])); b.setAttribute("aria-controls", "panel"); b.tabIndex = state.tab === t[0] ? 0 : -1;
      b.addEventListener("click", function () { state.tab = t[0]; state.q = ""; state.serie = ""; state.type = ""; sync(); render(); document.getElementById("tab-" + t[0]).focus(); });
      b.addEventListener("keydown", function (e) {
        var j = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!j) return; e.preventDefault();
        var n = TABS[(i + j + TABS.length) % TABS.length][0]; state.tab = n; state.q = ""; state.serie = ""; state.type = ""; sync(); render(); document.getElementById("tab-" + n).focus();
      });
      tl.appendChild(b);
    });
    var lg = el("div", "cat-lang"); lg.setAttribute("role", "group"); lg.setAttribute("aria-label", "Langue du catalogue");
    [["fr", "Français"], ["jp", "日本語 Japonais"]].forEach(function (l) {
      var b = el("button", "cat-chip", l[1]); b.type = "button"; b.setAttribute("aria-pressed", String(state.lang === l[0]));
      b.addEventListener("click", function () { state.lang = l[0]; state.q = ""; state.serie = ""; state.type = ""; sync(); render(); });
      lg.appendChild(b);
    });
    bar.appendChild(tl); bar.appendChild(lg); root.appendChild(bar);
    var p = el("div", "cat-panel"); p.id = "panel"; p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", "tab-" + state.tab);
    TABS.filter(function (t) { return t[0] === state.tab; })[0][2](p);
    root.appendChild(p);
  }

  function load(ok, ko) {
    if (location.protocol === "file:") {
      var sc = document.createElement("script"); sc.src = "actualites-data.js";
      sc.onload = function () { window.POKEWORTH_ACTUS ? ok(window.POKEWORTH_ACTUS) : ko(); }; sc.onerror = ko; document.head.appendChild(sc); return;
    }
    fetch("actualites.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(ok).catch(ko);
  }
  root.appendChild(el("p", "note", "Chargement du catalogue…"));
  load(function (j) { build(j); render(); }, function () {
    root.textContent = ""; root.appendChild(empty("Catalogue indisponible", ["Les données n'ont pas pu être chargées. Rechargez la page ; si le problème continue, écrivez-nous depuis la page Support."]));
  });
})();
