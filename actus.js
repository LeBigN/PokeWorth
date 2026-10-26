(function () {
  "use strict";
  var TYPES = { sortie: "Sortie Pokémon", app: "Mise à jour de l'app" };

  function fmt(d) {
    var x = new Date(d + "T12:00:00");
    if (isNaN(x)) return d;
    return x.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt) e.textContent = txt;
    return e;
  }
  function tm(n, txt) { var t = el("time", "news-date", txt); t.dateTime = n.date; return t; }
  function isFuture(d) { return daysTo(d) > 0; }
  // jour courant en heure de Paris, puis écart en jours calendaires (fiable au changement de mois, d'année et d'heure)
  function parisDay() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
    catch (e) { var t = new Date(); return t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2); }
  }
  function dayNum(d) { var p = d.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000; }
  function daysTo(d) { return Math.round(dayNum(d) - dayNum(parisDay())); }
  var STATUT = { confirme: "Confirmé", a_confirmer: "À confirmer", report: "Report possible" };
  function stChip(n) { return n.type === "sortie" && STATUT[n.statut] ? el("span", "tag", STATUT[n.statut]) : null; }
  function dateTxt(n) { return n.date_label ? n.date_label : fmt(n.date); }
  function chip(n) {
    if (n.type !== "sortie") return null;
    var k = daysTo(n.date);
    if (k === 0) return el("span", "chip chip-now", "Aujourd'hui");
    if (k > 0) return el("span", "chip", "J-" + k);
    return null;
  }
  function visual(n, cls) {
    var box = el("div", cls);
    var img = el("img");
    // miniature légère (…-thumb.webp) pour les lignes de la liste ; repli sur l'image HD si elle n'existe pas
    var thumb = (cls === "nr-thumb" || cls === "serie-logo") && /-hd\.webp$/.test(n.image) ? n.image.replace(/-hd\.webp$/, "-thumb.webp") : n.image;
    if (thumb !== n.image) img.onerror = function () { img.onerror = null; img.src = n.image; };
    img.src = thumb; img.alt = n.image_alt || ""; img.decoding = "async";
    // visuel principal visible dès l'ouverture (page Actualités, page série) : chargement immédiat ; le reste en différé
    img.loading = (cls === "serie-logo" || (cls === "nh-visual" && !document.getElementById("home-news"))) ? "eager" : "lazy";
    box.appendChild(img);
    return box;
  }
  function addPoints(parent, n) {
    if (!(n.points && n.points.length)) return;
    var ul = el("ul", "news-points np-inline");
    n.points.forEach(function (p) { ul.appendChild(el("li", "", p)); });
    parent.appendChild(ul);
  }
  function addProduits(parent, n) {
    if (!(n.produits && n.produits.length)) return;
    var g = el("div", "prod-grid");
    n.produits.forEach(function (p) {
      var t = el("figure", "prod" + (p.large ? " prod-wide" : ""));
      var im = el("img"); im.src = p.image; im.alt = p.alt || p.nom || ""; im.loading = "lazy"; im.decoding = "async";
      var v = el("div", "prod-img"); v.appendChild(im); t.appendChild(v);
      var c = el("figcaption");
      c.appendChild(el("strong", "", p.nom || ""));
      if (p.detail) c.appendChild(el("span", "", p.detail));
      t.appendChild(c); g.appendChild(t);
    });
    parent.appendChild(g);
  }
  function serieUrl(n) { return "serie.html?s=" + encodeURIComponent(n.serie); }
  function moreLink(n) {
    var a = el("a", "serie-link", "Voir les " + n.produits.length + " produits de la série");
    a.href = serieUrl(n);
    return a;
  }
  function hasSerie(n) { return !!(n.serie && n.produits && n.produits.length); }
  function titleEl(n, lvl) {
    var h = el(lvl || "h3");
    if (hasSerie(n)) { var a = el("a", "", n.titre || ""); a.href = serieUrl(n); h.appendChild(a); }
    else h.textContent = n.titre || "";
    return h;
  }
  function hero(n, lvl) {
    var c = el("article", "news-hero");
    c.appendChild(visual(n, "nh-visual"));
    var b = el("div", "nh-body");
    var left = el("div", "nh-text");
    left.appendChild(tm(n, dateTxt(n)));
    left.appendChild(titleEl(n, lvl));
    b.appendChild(left);
    var ch = chip(n); if (ch) b.appendChild(ch);
    var sc = stChip(n); if (sc) b.appendChild(sc);
    c.appendChild(b);
    if (n.texte) c.appendChild(el("p", "nh-desc", n.texte));
    addPoints(c, n);
    if (hasSerie(n)) { var w = el("div", "serie-more"); w.appendChild(moreLink(n)); c.appendChild(w); }
    else addProduits(c, n);
    return c;
  }
  function row(n, lvl) {
    var c = el("article", "news-row");
    c.appendChild(visual(n, "nr-thumb"));
    var t = el("div", "nr-text");
    t.appendChild(tm(n, dateTxt(n)));
    t.appendChild(titleEl(n, lvl));
    if (n.texte) t.appendChild(el("p", "", n.texte));
    addPoints(t, n);
    c.appendChild(t);
    var ch = chip(n); if (ch) c.appendChild(ch);
    var sc = stChip(n); if (sc) c.appendChild(sc);
    // bouton « Voir les produits » sur sa propre ligne, pour ne pas être écrasé dans la colonne de texte
    if (hasSerie(n)) { var m = el("div", "nr-more"); m.appendChild(moreLink(n)); c.appendChild(m); }
    if (!hasSerie(n)) addProduits(c, n);
    return c;
  }
  function build(items, lvl) {
    var frag = document.createDocumentFragment(), first = true;
    items.forEach(function (n) {
      if (n.image) { frag.appendChild(first ? hero(n, lvl) : row(n, lvl)); first = false; }
      else frag.appendChild(card(n, lvl));
    });
    return frag;
  }
  function card(n, lvl) {
    var c = el("article", "card news");
    var meta = el("div", "news-meta");
    var future = n.type === "sortie" && isFuture(n.date);
    meta.appendChild(el("span", "tag" + (n.type === "sortie" ? " t-sortie" : " t-app"), TYPES[n.type] || "Actualité"));
    if (future) meta.appendChild(el("span", "tag t-soon", "À venir"));
    if (n.version) meta.appendChild(el("span", "tag", "Version " + n.version));
    meta.appendChild(tm(n, (future ? "Sortie le " : "") + fmt(n.date)));
    c.appendChild(meta);
    c.appendChild(el(lvl || "h3", "", n.titre || ""));
    if (n.texte) c.appendChild(el("p", "", n.texte));
    if (n.points && n.points.length) {
      var ul = el("ul", "news-points");
      n.points.forEach(function (p) { ul.appendChild(el("li", "", p)); });
      c.appendChild(ul);
    }
    if (n.lien) {
      var a = el("a", "news-link", n.lien_texte || "En savoir plus");
      a.href = n.lien; a.rel = "noopener";
      c.appendChild(a);
    }
    return c;
  }
  function sortDesc(list) {
    function up(n) { return n.type === "sortie" && daysTo(n.date) >= 0; }
    return list.map(function (n, i) { return { n: n, i: i }; }).sort(function (a, b) {
      var ua = up(a.n), ub = up(b.n);
      if (ua !== ub) return ua ? -1 : 1;
      if (a.n.date !== b.n.date) return ua ? (a.n.date < b.n.date ? -1 : 1) : (a.n.date < b.n.date ? 1 : -1);
      return a.i - b.i;
    }).map(function (x) { return x.n; });
  }
  // une sortie passée disparaît des listes dès le lendemain ; elle reste dans les données et sur sa page série
  function visible(list) { return list.filter(function (n) { return !(n.type === "sortie" && daysTo(n.date) < 0); }); }

  function renderSerie(all) {
    var root = document.getElementById("serie-root");
    var slug = new URLSearchParams(location.search).get("s");
    var n = all.filter(function (x) { return x.serie && x.serie === slug; })[0];
    if (!n) {
      root.appendChild(el("p", "note", "Cette série est introuvable."));
      return;
    }
    document.title = n.titre.replace(/^Sortie : /, "") + " · Pokéworth";
    var head = el("header", "serie-head");
    head.appendChild(visual(n, "serie-logo"));
    var t = el("div", "serie-title");
    t.appendChild(el("p", "serie-kicker", "Série Pokémon"));
    t.appendChild(el("h1", "", n.titre.replace(/^Sortie : /, "")));
    var dl = daysTo(n.date);
    t.appendChild(tm(n, (dl > 0 ? "Sortie officielle le " : "Sortie le ") + fmt(n.date)));
    head.appendChild(t);
    var ch = chip(n); if (ch) head.appendChild(ch);
    root.appendChild(head);
    if (n.texte) root.appendChild(el("p", "serie-intro", n.texte));
    root.appendChild(el("h2", "serie-count", n.produits.length + " produits annoncés"));
    var list = el("div", "prod-list");
    n.produits.forEach(function (p) {
      var r = el("article", "prod-row");
      var im = el("img"); im.src = p.image; im.alt = p.alt || p.nom || ""; im.loading = "lazy"; im.decoding = "async";
      var v = el("div", "pr-img"); v.appendChild(im); r.appendChild(v);
      var x = el("div", "pr-text");
      x.appendChild(el("h3", "", p.nom || ""));
      if (p.detail) x.appendChild(el("p", "", p.detail));
      r.appendChild(x); list.appendChild(r);
    });
    root.appendChild(list);
  }

  // Ouverture locale (double-clic sur un fichier .html) : le navigateur bloque fetch() en file://,
  // on charge alors la copie actualites-data.js générée par build.py. En ligne, ce fichier n'est jamais chargé.
  function loadLocalCopy() {
    return new Promise(function (ok, ko) {
      if (location.protocol !== "file:") return ko(new Error("hors ligne"));
      var sc = document.createElement("script");
      sc.src = "actualites-data.js";
      sc.onload = function () { window.POKEWORTH_ACTUS ? ok(window.POKEWORTH_ACTUS) : ko(new Error("vide")); };
      sc.onerror = ko;
      document.head.appendChild(sc);
    });
  }

  (location.protocol === "file:" ? loadLocalCopy() :
    fetch("actualites.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }))
    .then(function (data) {
      var full = sortDesc(data.actualites || []);
      var all = visible(full);

      if (document.getElementById("serie-root")) renderSerie(full);

      // accueil : dernières actualités
      var home = document.getElementById("home-news");
      if (home) {
        var box = home.querySelector(".news-grid");
        box.appendChild(build(all.slice(0, 3)));
        if (all.length) home.hidden = false;
      }

      // page actualités : filtres + liste
      var root = document.getElementById("news-root");
      if (root) {
        var list = document.getElementById("news-list");
        var empty = document.getElementById("news-empty");
        var btns = root.querySelectorAll("[data-filter]");
        function render(f) {
          list.textContent = "";
          var items = all.filter(function (n) { return f === "all" || n.type === f; });
          list.appendChild(build(items, "h2"));
          empty.hidden = items.length > 0;
          if (!items.length) {
            empty.textContent = f === "sortie" ? "Aucune sortie Pokémon annoncée pour le moment."
              : f === "app" ? "Aucune mise à jour à signaler pour le moment."
              : "Aucune actualité pour le moment.";
          }
        }
        btns.forEach(function (b) {
          b.addEventListener("click", function () {
            btns.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
            render(b.getAttribute("data-filter"));
          });
        });
        render("all");
      }
    })
    .catch(function () {
      var e = document.getElementById("news-empty");
      if (e) { e.hidden = false; e.textContent = "Les actualités sont momentanément indisponibles."; }
      var sr = document.getElementById("serie-root");
      if (sr && !sr.firstChild) sr.appendChild(el("p", "note", "Cette série est momentanément indisponible."));
    });
})();
