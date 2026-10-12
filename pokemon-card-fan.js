/* =====================================================================
   PokemonCardFan · éventail de cartes Pokémon qui tournent automatiquement
   JavaScript vanilla, sans dépendance. Utilisable plusieurs fois sur une même page.

   Intégration minimale :
     <div data-pokemon-fan data-cards='[{"image":"carte-1.webp","name":"Carte 1"}, …]'></div>
     <link rel="stylesheet" href="pokemon-card-fan.css">
     <script src="pokemon-card-fan.js" defer></script>

   Ou en JavaScript :
     const fan = new PokemonCardFan(document.querySelector("#mon-eventail"), {
       cards: window.pokemonCards, interval: 1800, duration: 900
     });
     fan.next(); fan.previous(); fan.stop(); fan.start(); fan.destroy();
   ===================================================================== */
(function (root) {
  "use strict";

  var uid = 0;
  var SVG_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
  var SVG_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

  /* Position de chaque rang, exprimée en fraction de la largeur d'une carte (x, y) :
     c'est ce qui garde la même forme d'éventail à 220 px comme à 130 px.
     Valeurs de départ de la maquette (±125 px, ±65 px, 25 px, 8 px pour une carte de 220 px). */
  var DEFAULT_SLOTS = {
    "-2": { x: -0.568, y: 0.114, r: -24, s: 0.88, z: 1 },
    "-1": { x: -0.295, y: 0.036, r: -12, s: 0.95, z: 3 },
    "0":  { x: 0,      y: 0,     r: 0,   s: 1.08, z: 5 },
    "1":  { x: 0.295,  y: 0.036, r: 12,  s: 0.95, z: 3 },
    "2":  { x: 0.568,  y: 0.114, r: 24,  s: 0.88, z: 1 }
  };

  var DEFAULTS = {
    cards: null,               // [{ id, image, name, alt?, fit? ("cover" | "contain") }]
    interval: 1800,            // ms entre deux changements automatiques
    duration: 900,             // ms d'une transition
    easing: "cubic-bezier(.22,.9,.24,1)",
    autoplay: true,
    direction: 1,              // 1 : la carte suivante vient au centre ; -1 : la précédente
    pauseOnHover: true,
    resumeDelay: 1400,         // ms d'attente après une interaction avant de reprendre
    spread: 1,                 // multiplicateur de l'écartement horizontal
    tilt: 1,                   // multiplicateur des inclinaisons
    fit: "cover",              // "cover" pour de vraies cartes, "contain" pour des visuels détourés
    controls: true,            // boutons précédent / suivant
    dots: true,                // pastilles
    startIndex: 0,
    slots: null,               // remplace tout ou partie de DEFAULT_SLOTS
    label: "Éventail de cartes",
    labels: { prev: "Carte précédente", next: "Carte suivante", show: "Afficher : ", status: "Carte {n} sur {t} : {name}" }
  };

  function merge(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) if (b[k] !== undefined && b[k] !== null) o[k] = b[k];
    return o;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function reducedMotion() {
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function PokemonCardFan(container, options) {
    if (!(this instanceof PokemonCardFan)) return new PokemonCardFan(container, options);
    if (!container || container.nodeType !== 1) throw new Error("PokemonCardFan : conteneur introuvable.");
    if (container.__pokemonFan) container.__pokemonFan.destroy();

    var opt = merge(DEFAULTS, options || {});
    opt.labels = merge(DEFAULTS.labels, (options && options.labels) || {});
    var cards = opt.cards || readCards(container);
    if (!cards || cards.length < 3) throw new Error("PokemonCardFan : au moins 3 cartes sont nécessaires.");

    this.el = container;
    this.opt = opt;
    this.cards = cards;
    this.n = cards.length;
    this.active = clamp(opt.startIndex | 0, 0, this.n - 1);
    this.id = "pokemon-fan-" + (++uid);
    this._timer = null;
    this._resumeTimer = null;
    this._holds = {};            // raisons de pause en cours (survol, focus, doigt, page masquée…)
    this._running = !!opt.autoplay;
    this._destroyed = false;
    this._anims = [];
    this._cw = 220;
    this._k = 1;
    this._drag = null;
    this._suppressClick = false;
    this._listeners = [];
    container.__pokemonFan = this;
    this._build();
    this._measure();
    this._place(false);
    this._bind();
    if (this._running) this._schedule();
  }

  /* lit la configuration : data-cards (JSON), balise <script type="application/json">, ou window.pokemonCards */
  function readCards(c) {
    var raw = c.getAttribute("data-cards");
    if (!raw) { var s = c.querySelector('script[type="application/json"]'); raw = s && s.textContent; }
    if (raw) { try { return JSON.parse(raw); } catch (e) { if (root.console) console.error("PokemonCardFan : data-cards invalide", e); } }
    return root.pokemonCards || null;
  }

  var P = PokemonCardFan.prototype;

  P._on = function (target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  };

  P._build = function () {
    var self = this, o = this.opt, c = this.el;
    c.classList.add("pokemon-fan");
    c.textContent = "";

    var stage = el("div", "pokemon-fan-stage", {
      role: "group", "aria-roledescription": "carrousel", "aria-label": o.label, tabindex: "0"
    });
    var track = el("div", "pokemon-fan-track");
    stage.appendChild(track);
    this.stage = stage; this.track = track;

    this.nodes = this.cards.map(function (card, i) {
      var b = el("button", "pokemon-fan-card", { type: "button", tabindex: "-1", "data-index": String(i) });
      b.setAttribute("data-fit", card.fit || o.fit);
      var inner = el("span", "pokemon-fan-inner");
      var img = el("img", "pokemon-fan-img", { alt: card.alt || card.name || "", decoding: "async", draggable: "false" });
      var fb = el("span", "pokemon-fan-fallback");
      fb.textContent = card.name || "";
      img.addEventListener("error", function () { b.classList.add("is-error"); });
      img.src = card.image;
      inner.appendChild(img); inner.appendChild(fb);
      b.appendChild(inner);
      track.appendChild(b);
      return b;
    });
    c.appendChild(stage);

    this.status = el("p", "pokemon-fan-sr", { role: "status", "aria-live": "polite" });
    c.appendChild(this.status);

    if (o.controls || o.dots) {
      var bar = el("div", "pokemon-fan-controls");
      if (o.controls) {
        this.btnPrev = el("button", "pokemon-fan-btn", { type: "button", "aria-label": o.labels.prev });
        this.btnPrev.innerHTML = SVG_PREV;
        bar.appendChild(this.btnPrev);
      }
      if (o.dots) {
        var dots = el("div", "pokemon-fan-dots");
        this.dots = this.cards.map(function (card, i) {
          var d = el("button", "pokemon-fan-dot", { type: "button", "aria-label": o.labels.show + (card.name || (i + 1)) });
          dots.appendChild(d);
          return d;
        });
        bar.appendChild(dots);
      }
      if (o.controls) {
        this.btnNext = el("button", "pokemon-fan-btn", { type: "button", "aria-label": o.labels.next });
        this.btnNext.innerHTML = SVG_NEXT;
        bar.appendChild(this.btnNext);
      }
      c.appendChild(bar);
    }
  };

  /* ---------- géométrie ---------- */
  P._slot = function (off) {
    var key = String(clamp(off, -2, 2));
    var base = (this.opt.slots && this.opt.slots[key]) || DEFAULT_SLOTS[key];
    /* au-delà de 5 cartes, les rangs supplémentaires restent cachés derrière les cartes extrêmes */
    return { x: base.x, y: base.y, r: base.r, s: base.s, z: base.z, hidden: Math.abs(off) > 2 };
  };

  P._measure = function () {
    var w = this.nodes[0].offsetWidth || 220, h = w * 88 / 63, o = this.opt;
    this._cw = w;
    var stageW = this.stage.clientWidth || this.el.clientWidth || 0;
    /* l'éventail ne doit jamais dépasser la largeur disponible : on calcule l'emprise réelle des cartes
       extrêmes (rotation autour du bas de la carte, échelle, décalage) et on resserre l'écartement au besoin */
    var reach = 0;
    for (var off = -2; off <= 2; off++) {
      var sl = this._slot(off), a = sl.r * o.tilt * Math.PI / 180, sn = Math.sin(a), cs = Math.cos(a);
      var ox = 0, oy = 0.35 * h;                 // point de pivot (transform-origin 50 % 85 %)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        var px = c[0] * w / 2 - ox, py = c[1] * h / 2 - oy;
        px *= sl.s; py *= sl.s;
        var rx = px * cs - py * sn + ox;
        reach = Math.max(reach, Math.abs(rx + sl.x * w * o.spread));
      });
    }
    this._k = stageW > 0 ? Math.min(1, (stageW / 2 - 6) / reach) : 1;
  };

  P._pose = function (off) {
    var sl = this._slot(off), w = this._cw, o = this.opt, k = this._k;
    return {
      x: sl.x * w * o.spread * k,
      y: sl.y * w,
      r: sl.r * o.tilt,
      s: sl.s,
      z: sl.z,
      hidden: sl.hidden
    };
  };
  function tf(p) {
    return "translate3d(" + p.x.toFixed(2) + "px," + p.y.toFixed(2) + "px,0) rotate(" + p.r.toFixed(2) + "deg) scale(" + p.s.toFixed(4) + ")";
  }
  P._offset = function (i) {
    var half = Math.floor(this.n / 2);
    return ((i - this.active + this.n + half) % this.n) - half;
  };

  /* applique les positions ; animate=true : transition de la durée configurée */
  P._place = function (animate, prevOffsets) {
    var self = this, o = this.opt;
    var anim = animate && !reducedMotion() && o.duration > 0 && !!this.nodes[0].animate;
    this._cancelAnims();
    this.nodes.forEach(function (node, i) {
      var off = self._offset(i), pose = self._pose(off);
      var from = anim ? root.getComputedStyle(node).transform : null;
      var wrapped = prevOffsets && Math.abs(off - prevOffsets[i]) > 1;
      node.style.zIndex = String(wrapped ? 0 : pose.z + (off === 0 ? 1 : 0));
      node.style.opacity = pose.hidden ? "0" : "";
      node.style.pointerEvents = pose.hidden ? "none" : "";
      node.classList.toggle("is-center", off === 0);
      node.setAttribute("aria-current", off === 0 ? "true" : "false");
      node.setAttribute("aria-label", (off === 0 ? "" : o.labels.show) + (self.cards[i].name || (i + 1)));
      var to = tf(pose);
      node.style.transform = to;
      if (anim && from && from !== "none") {
        var frames;
        if (wrapped) {
          /* la carte qui change de côté passe derrière les autres, en arc, au lieu de traverser l'éventail */
          var mid = { x: 0, y: -self._cw * 0.16, r: 0, s: 0.74, z: 0 };
          frames = [{ transform: from }, { transform: tf(mid), offset: 0.5 }, { transform: to }];
        } else {
          frames = [{ transform: from }, { transform: to }];
        }
        var a = node.animate(frames, { duration: o.duration, easing: o.easing });
        self._anims.push(a);
      }
    });
    if (this.dots) this.dots.forEach(function (d, i) { d.setAttribute("aria-current", i === self.active ? "true" : "false"); });
  };
  P._cancelAnims = function () {
    this._anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* déjà terminée */ } });
    this._anims = [];
  };

  /* ---------- navigation ---------- */
  P._go = function (index, announce) {
    if (this._destroyed) return;
    var prev = [], self = this;
    for (var i = 0; i < this.n; i++) prev.push(this._offset(i));
    this.active = ((index % this.n) + this.n) % this.n;
    this._place(true, prev);
    if (announce) {
      var t = this.opt.labels.status;
      this.status.textContent = t.replace("{n}", this.active + 1).replace("{t}", this.n).replace("{name}", this.cards[this.active].name || "");
    }
    this.el.dispatchEvent(new CustomEvent("pokemon-fan:change", { detail: { index: this.active, card: this.cards[this.active] } }));
  };
  P.next = function () { this._go(this.active + 1, this._user); return this; };
  P.previous = function () { this._go(this.active - 1, this._user); return this; };
  P.goTo = function (i) { this._go(i, true); return this; };

  /* navigation déclenchée par l'utilisateur : annoncée aux lecteurs d'écran et suivie d'une pause */
  P._userNav = function (fn) {
    this._user = true; fn.call(this); this._user = false;
    this._hold("nav", true); this._release("nav");
  };

  /* ---------- rotation automatique ---------- */
  P._canRun = function () {
    if (!this._running || this._destroyed || reducedMotion()) return false;
    for (var k in this._holds) if (this._holds[k]) return false;
    return true;
  };
  P._schedule = function () {
    var self = this;
    clearTimeout(this._timer);
    this._timer = null;
    if (!this._canRun()) return;
    this._timer = setTimeout(function () {
      self._timer = null;
      if (!self._canRun()) return;
      if (self.opt.direction < 0) self.previous(); else self.next();
      self._schedule();
    }, this.opt.interval);
  };
  P._hold = function (why, on) {
    clearTimeout(this._resumeTimer);
    this._holds[why] = on;
    if (on) { clearTimeout(this._timer); this._timer = null; }
  };
  P._release = function (why, immediate) {
    var self = this;
    clearTimeout(this._resumeTimer);
    var go = function () { self._holds[why] = false; self._schedule(); };
    if (immediate) go(); else this._resumeTimer = setTimeout(go, this.opt.resumeDelay);
  };
  P.start = function () { this._running = true; this._schedule(); return this; };
  P.stop = function () { this._running = false; clearTimeout(this._timer); clearTimeout(this._resumeTimer); this._timer = null; return this; };

  /* ---------- événements ---------- */
  P._bind = function () {
    var self = this, st = this.stage, o = this.opt;

    if (this.btnPrev) this._on(this.btnPrev, "click", function () { self._userNav(self.previous); });
    if (this.btnNext) this._on(this.btnNext, "click", function () { self._userNav(self.next); });
    if (this.dots) this.dots.forEach(function (d, i) { self._on(d, "click", function () { self._userNav(function () { this.goTo(i); }); }); });

    this._on(st, "keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); self._userNav(self.next); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); self._userNav(self.previous); }
      else if (e.key === "Home") { e.preventDefault(); self._userNav(function () { this.goTo(0); }); }
      else if (e.key === "End") { e.preventDefault(); self._userNav(function () { this.goTo(this.n - 1); }); }
    });

    /* survol et focus : pause, reprise après l'interaction */
    if (o.pauseOnHover) {
      this._on(st, "pointerenter", function (e) { if (e.pointerType === "mouse") self._hold("hover", true); });
      this._on(st, "pointerleave", function (e) { if (e.pointerType === "mouse") self._release("hover"); });
    }
    /* pause au focus clavier uniquement (un clic souris ne doit pas figer la rotation) */
    this._on(this.el, "focusin", function (e) {
      var kb = false; try { kb = e.target.matches(":focus-visible"); } catch (x) { kb = false; }
      if (kb) self._hold("focus", true);
    });
    this._on(this.el, "focusout", function (e) { if (!self.el.contains(e.relatedTarget)) self._release("focus"); });

    /* glisser (souris ou doigt) : le défilement vertical de la page n'est jamais bloqué (touch-action: pan-y) */
    this._on(st, "pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      self._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, type: e.pointerType };
      if (e.pointerType !== "mouse") self._hold("touch", true);
    });
    this._on(st, "pointermove", function (e) {
      var d = self._drag; if (!d || d.id !== e.pointerId || d.done) return;
      var dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        d.moved = true; st.classList.add("is-dragging");
        try { st.setPointerCapture(e.pointerId); } catch (x) { /* ignoré */ }
      }
      if (d.moved && Math.abs(dx) > 48) {
        d.done = true;
        self._suppressClick = true;
        self._userNav(dx < 0 ? self.next : self.previous);
      }
    });
    var end = function (e) {
      var d = self._drag; if (!d || d.id !== e.pointerId) return;
      self._drag = null; st.classList.remove("is-dragging");
      if (d.moved) setTimeout(function () { self._suppressClick = false; }, 0);
      if (d.type !== "mouse") self._release("touch");
    };
    this._on(st, "pointerup", end);
    this._on(st, "pointercancel", end);
    this._on(st, "lostpointercapture", end);

    /* clic sur une carte latérale : elle vient au centre */
    this._on(this.track, "click", function (e) {
      if (self._suppressClick) { self._suppressClick = false; return; }
      var b = e.target.closest && e.target.closest(".pokemon-fan-card");
      if (!b) return;
      var i = +b.getAttribute("data-index");
      if (i !== self.active) self._userNav(function () { this.goTo(i); });
    });

    /* page masquée ou éventail hors écran : pause (économie de batterie, aucun cumul de timers) */
    this._on(document, "visibilitychange", function () {
      if (document.hidden) self._hold("hidden", true); else self._release("hidden", true);
    });
    if ("IntersectionObserver" in root) {
      this._io = new IntersectionObserver(function (en) {
        var vis = en[0].isIntersecting;
        if (vis) self._release("offscreen", true); else self._hold("offscreen", true);
      }, { threshold: 0.05 });
      this._io.observe(this.el);
    }
    if ("ResizeObserver" in root) {
      var last = 0;
      this._ro = new ResizeObserver(function () {
        var w = self.stage.clientWidth;
        if (w === last) return; last = w;
        self._measure(); self._place(false);
      });
      this._ro.observe(this.stage);
    } else {
      this._on(root, "resize", function () { self._measure(); self._place(false); });
    }
    /* changement de préférence « réduire les animations » en cours de visite */
    if (root.matchMedia) {
      var mq = root.matchMedia("(prefers-reduced-motion: reduce)");
      var fn = function () { if (mq.matches) { clearTimeout(self._timer); self._cancelAnims(); } else self._schedule(); };
      if (mq.addEventListener) { mq.addEventListener("change", fn); this._listeners.push([mq, "change", fn]); }
    }
  };

  /* ---------- nettoyage complet : timers, animations, observateurs, écouteurs, DOM ---------- */
  P.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stop();
    this._cancelAnims();
    if (this._io) this._io.disconnect();
    if (this._ro) this._ro.disconnect();
    this._listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    this._listeners = [];
    this.el.classList.remove("pokemon-fan");
    this.el.textContent = "";
    this.el.__pokemonFan = null;
  };

  /* initialisation automatique de tous les éléments [data-pokemon-fan] */
  PokemonCardFan.init = function (scope) {
    var list = (scope || document).querySelectorAll("[data-pokemon-fan]");
    var out = [];
    Array.prototype.forEach.call(list, function (e) {
      if (e.__pokemonFan) return;
      var d = e.dataset, op = {};
      if (d.interval) op.interval = +d.interval;
      if (d.duration) op.duration = +d.duration;
      if (d.autoplay) op.autoplay = d.autoplay !== "false";
      if (d.fit) op.fit = d.fit;
      if (d.spread) op.spread = +d.spread;
      if (d.tilt) op.tilt = +d.tilt;
      if (d.direction) op.direction = +d.direction;
      if (d.label) op.label = d.label;
      if (d.controls) op.controls = d.controls !== "false";
      if (d.dots) op.dots = d.dots !== "false";
      try { out.push(new PokemonCardFan(e, op)); } catch (err) { if (root.console) console.error(err); }
    });
    return out;
  };

  root.PokemonCardFan = PokemonCardFan;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { PokemonCardFan.init(); });
  else PokemonCardFan.init();
})(window);
