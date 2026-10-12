/* anciennes adresses d'ancres (index.html#a-propos…) : ces rubriques ont maintenant leur propre page */
(function () { var m = { "a-propos": "a-propos.html", "roadmap": "roadmap.html", "ressources": "ressources.html" }, h = location.hash.slice(1);
  if (m[h] && !document.getElementById(h)) location.replace(m[h]); })();
/* Pokéworth · site.js — navigation, page unique, actualités, FAQ, couleurs de marque.
   Sans dépendance. Chaque bloc ne s'active que si ses éléments existent sur la page. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  /* typographie française : espace insécable avant : ; ! ? % € » et après « */
  function nb(t) { return String(t).replace(/ ([:;!?%€»])/g, "\u00a0$1").replace(/« /g, "«\u00a0"); }
  function el(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = nb(txt); return e; }

  /* ---------------------------------------------------------------- barre de navigation */
  var nav = $("#site-nav");
  if (nav) {
    var toggle = $(".nav-toggle", nav), menu = $("#nav-menu"), dd = $(".nav-dd", nav), ddBtn = $("#nav-dd-btn");
    var mqMobile = matchMedia("(max-width: 959px)");
    function setMenu(open, focusBack) {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open && focusBack) toggle.focus();
    }
    var pinned = false;   // sous-menu ouvert par un clic ou au clavier (il reste ouvert jusqu'à un nouveau clic)
    function setDd(open) {
      if (!dd) return;
      if (!open) pinned = false;
      dd.classList.toggle("open", open);
      ddBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    toggle.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
    if (ddBtn) ddBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (dd.classList.contains("open") && pinned) setDd(false);
      else { setDd(true); pinned = true; }
    });
    /* survol souris : le menu À propos s'ouvre aussi au survol sur ordinateur */
    if (dd && matchMedia("(hover: hover) and (pointer: fine)").matches) {
      var t;
      dd.addEventListener("mouseenter", function () { if (!mqMobile.matches) { clearTimeout(t); setDd(true); } });
      dd.addEventListener("mouseleave", function () { if (!mqMobile.matches && !pinned) { t = setTimeout(function () { setDd(false); }, 160); } });
    }
    /* un clic sur un lien referme le menu compact et le sous-menu */
    nav.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      setDd(false);
      if (mqMobile.matches) setMenu(false);
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (dd && dd.classList.contains("open")) { setDd(false); ddBtn.focus(); }
      else if (nav.classList.contains("open")) setMenu(false, true);
    });
    doc.addEventListener("click", function (e) {
      if (!nav.contains(e.target)) { setDd(false); if (nav.classList.contains("open")) setMenu(false); }
    });
    if (dd) dd.addEventListener("focusout", function (e) { if (!dd.contains(e.relatedTarget)) setDd(false); });
    (mqMobile.addEventListener ? mqMobile.addEventListener.bind(mqMobile, "change") : mqMobile.addListener.bind(mqMobile))(function () { setMenu(false); setDd(false); });
  }

  /* ---------------------------------------------------------------- rubrique consultée (page d'accueil) */
  var ids = ["accueil", "fonctionnalites", "tarifs", "actualites", "a-propos", "roadmap", "web-app", "ressources", "faq", "support"];
  var secs = ids.map(function (i) { return doc.getElementById(i); }).filter(Boolean);
  if (secs.length > 5 && nav) {
    var ABOUT = ["a-propos", "roadmap", "ressources"];
    var links = $$("[data-sec]", nav), ticking = false, current = "";
    function setCurrent(id) {
      if (id === current) return;
      current = id;
      var group = ABOUT.indexOf(id) > -1 ? "about" : id;
      links.forEach(function (a) {
        var k = a.getAttribute("data-sec");
        var on = k === group || k === id;
        if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
    }
    function spy() {
      ticking = false;
      var off = (nav.getBoundingClientRect().bottom || 70) + 40, id = secs[0].id;
      secs.forEach(function (s) { if (s.getBoundingClientRect().top <= off) id = s.id; });
      if (window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 4) id = secs[secs.length - 1].id;
      setCurrent(id);
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }
    window.addEventListener("scroll", req, { passive: true });
    window.addEventListener("resize", req);
    window.addEventListener("hashchange", req);
    spy();
    /* lien direct (#section) : amène le focus sur la section pour les lecteurs d'écran */
    window.addEventListener("hashchange", function () {
      var t = doc.getElementById(location.hash.slice(1));
      if (t && t.tagName === "SECTION") { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
    });
  }

  /* ---------------------------------------------------------------- apparition douce des blocs */
  var rev = $$(".reveal");
  if (rev.length) {
    if (reduce || !("IntersectionObserver" in window)) rev.forEach(function (r) { r.classList.add("in"); });
    else {
      var io = new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
      rev.forEach(function (r) { io.observe(r); });
      /* filet de sécurité : rien ne reste invisible si l'observateur ne se déclenche pas */
      setTimeout(function () { rev.forEach(function (r) { r.classList.add("in"); }); }, 6000);
    }
  }

  /* ---------------------------------------------------------------- FAQ en accordéon */
  var qs = $$(".faq-q");
  qs.forEach(function (b, i) {
    b.addEventListener("click", function () {
      var open = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", open ? "false" : "true");
      var p = doc.getElementById(b.getAttribute("aria-controls"));
      if (p) p.hidden = open;
    });
    b.addEventListener("keydown", function (e) {
      var n = null;
      if (e.key === "ArrowDown") n = qs[(i + 1) % qs.length];
      else if (e.key === "ArrowUp") n = qs[(i - 1 + qs.length) % qs.length];
      else if (e.key === "Home") n = qs[0];
      else if (e.key === "End") n = qs[qs.length - 1];
      if (n) { e.preventDefault(); n.focus(); }
    });
  });

  /* ---------------------------------------------------------------- couleurs de marque : copie du code */
  var swMsg = $("#sw-msg");
  $$(".sw-chip").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-copy");
      function ok() { if (swMsg) swMsg.textContent = "Code " + v + " copié."; }
      function ko() { if (swMsg) swMsg.textContent = "Copie impossible : sélectionnez le code " + v + " affiché à côté de la pastille."; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, ko);
      else ko();
    });
  });

  /* ---------------------------------------------------------------- actualités : filtres, article à la une, grille */
  var dataEl = $("#news-data");
  if (dataEl) {
    var D; try { D = JSON.parse(dataEl.textContent); } catch (e) { D = null; }
    if (D) {
      var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
      var fmt = function (d) { var p = d.split("-"); return +p[2] + " " + MOIS[+p[1] - 1] + " " + p[0]; };
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var daysTo = function (d) { return Math.round((new Date(d + "T00:00:00") - today) / 864e5); };
      var upcoming = function (n) { return n.type === "sortie" && daysTo(n.date) >= 0; };
      var items = D.actualites.slice().sort(function (a, b) {
        if (upcoming(a) !== upcoming(b)) return upcoming(a) ? -1 : 1;
        if (upcoming(a)) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      });
      var catLabel = {}; D.categories.forEach(function (c) { catLabel[c.id] = c.label; });
      var readMin = function (n) {
        var t = [n.titre, n.texte].concat(n.points || []).concat((n.produits || []).map(function (p) { return (p.nom || "") + " " + (p.detail || ""); })).join(" ");
        return Math.max(1, Math.ceil(t.split(/\s+/).filter(Boolean).length / 200));
      };
      var href = function (n) { return n.serie && n.produits && n.produits.length ? "serie.html?s=" + encodeURIComponent(n.serie) : ""; };
      var thumb = function (n, big) { return !big && /-hd\.webp$/.test(n.image) ? n.image.replace(/-hd\.webp$/, "-thumb.webp") : n.image; };

      var filtersBox = $(".news-filters"), featBox = $("#news-feat"), grid = $("#news-grid"), empty = $("#news-empty");
      var status = el("p", "sr"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); $("#news").appendChild(status);
      var active = "all";

      var visual = function (n, big) {
        var box = el("div", "nc-img" + (n.image ? "" : " nc-ph"));
        if (n.image) {
          var im = el("img"); im.alt = n.image_alt || ""; im.decoding = "async"; im.loading = "lazy";
          if (thumb(n, big) !== n.image) im.onerror = function () { im.onerror = null; im.src = n.image; };
          im.src = thumb(n, big); box.appendChild(im);
        } else {
          var im2 = el("img"); im2.alt = ""; im2.src = "logo-cube-hd.webp"; im2.width = 64; im2.height = 74; box.appendChild(im2);
        }
        return box;
      };
      var meta = function (n) {
        var m = el("div", "nc-meta");
        m.appendChild(el("span", "tag" + (n.type === "sortie" ? " t-sortie" : ""), catLabel[n.type] || "Actualité"));
        var k = daysTo(n.date);
        if (n.type === "sortie" && k > 0) m.appendChild(el("span", "tag t-soon", "J-" + k));
        else if (n.type === "sortie" && k === 0) m.appendChild(el("span", "tag t-soon", "Aujourd'hui"));
        return m;
      };
      var foot = function (n) {
        var f = el("div", "nc-foot");
        var t = el("time", "", (n.type === "sortie" && daysTo(n.date) > 0 ? "Sortie le " : "") + fmt(n.date)); t.dateTime = n.date;
        f.appendChild(t); f.appendChild(el("span", "", readMin(n) + " min de lecture"));
        return f;
      };
      var title = function (n, lvl) {
        var h = el(lvl, "nc-title"), u = href(n);
        if (u) { var a = el("a", "", n.titre); a.href = u; h.appendChild(a); } else h.textContent = nb(n.titre);
        return h;
      };
      /* bandeau horizontal compact : visuel à gauche, texte au centre, date et lecture à droite */
      var card = function (n) {
        var c = el("article", "card nc nc-row");
        c.appendChild(visual(n, false));
        var b = el("div", "nc-body");
        b.appendChild(meta(n)); b.appendChild(title(n, "h3"));
        if (n.texte) b.appendChild(el("p", "nc-ex", n.texte));
        c.appendChild(b);
        var side = el("div", "nc-side");
        side.appendChild(foot(n));
        if (href(n)) { var l = el("a", "nc-more", "Voir les " + n.produits.length + " produits"); l.href = href(n); side.appendChild(l); }
        c.appendChild(side);
        return c;
      };
      var render = function () {
        var list = items.filter(function (n) { return active === "all" || n.type === active; });
        featBox.textContent = ""; grid.textContent = "";
        empty.hidden = list.length > 0;
        (expanded ? list : list.slice(0, 3)).forEach(function (n) { grid.appendChild(card(n)); });
        more.hidden = list.length <= 3;
        more.textContent = expanded ? "Voir moins" : "Tout voir (" + list.length + ")";
        more.setAttribute("aria-expanded", expanded ? "true" : "false");
      };
      var expanded = false;
      var more = el("button", "news-more", "Tout voir");
      more.type = "button";
      more.addEventListener("click", function () { expanded = !expanded; render(); if (!expanded) { grid.scrollIntoView({ block: "nearest" }); } });
      grid.parentNode.insertBefore(more, grid.nextSibling);
      var counts = { all: items.length };
      items.forEach(function (n) { counts[n.type] = (counts[n.type] || 0) + 1; });
      var cats = [["all", "Tout"]].concat(D.categories.filter(function (c) { return counts[c.id]; }).map(function (c) { return [c.id, c.label]; }));
      cats.forEach(function (c) {
        var b = el("button", "", c[1] + " (" + counts[c[0]] + ")");
        b.type = "button"; b.setAttribute("aria-pressed", c[0] === active ? "true" : "false"); b.setAttribute("data-filter", c[0]);
        b.addEventListener("click", function () {
          active = c[0]; expanded = false;
          $$("button", filtersBox).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          render();
          status.textContent = counts[active] + (counts[active] > 1 ? " articles affichés" : " article affiché") + " : " + c[1];
        });
        filtersBox.appendChild(b);
      });
      if (cats.length < 3) filtersBox.hidden = true;   /* une seule catégorie réelle : le filtre n'a pas d'intérêt */
      render();
    }
  }
})();
