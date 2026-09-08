// Native-app layer, loaded before the page scripts. Does nothing in an ordinary browser.
// Adds what an iPhone user expects and the website has no reason to carry: a tab bar, bottom sheets
// you can flick away, haptics on the moments that matter, Now Playing on the lock screen, a status bar
// that follows the theme, a welcome on first launch — and the hooks for saved mixes, sharing and Plus.
(function () {
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
  var root = document.documentElement;
  root.classList.add("native");
  var P = cap.Plugins || {};
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s) { return document.querySelector(s); };
  var CP = function () { return window.ChladniPlus; };

  /* ---- haptics: selection ticks for browsing, a light tap for starting something, success for the mic ---- */
  var H = P.Haptics;
  function hImpact(style) { try { if (H) H.impact({ style: style || "LIGHT" }); } catch (e) {} }
  function hSelect() { try { if (H) { H.selectionStart(); H.selectionChanged(); H.selectionEnd(); } } catch (e) {} }
  function hNotify(type) { try { if (H) H.notification({ type: type || "SUCCESS" }); } catch (e) {} }

  /* ---- status bar text follows the theme ---- */
  function statusBar() {
    var light = root.getAttribute("data-theme") === "light";
    try { if (P.StatusBar) P.StatusBar.setStyle({ style: light ? "LIGHT" : "DARK" }); } catch (e) {}
  }
  new MutationObserver(statusBar).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  statusBar();

  /* ---- outside links open in an in-app Safari sheet (Done button, no leaving the app) ---- */
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href)) return;
    ev.preventDefault();
    try { if (P.Browser) P.Browser.open({ url: href, presentationStyle: "popover" }); else window.open(href, "_blank"); } catch (e) { window.open(href, "_blank"); }
  }, true);

  /* ---- toast: a pill above the tab bar ---- */
  var toastTimer = null;
  function toast(text, opts) {
    opts = opts || {};
    var t = $("#cfToast"); if (!t) { t = document.createElement("div"); t.id = "cfToast"; t.className = "cf-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.innerHTML = "<span></span>" + (opts.action ? '<button type="button"></button>' : "");
    t.querySelector("span").textContent = text;
    if (opts.action) { var b = t.querySelector("button"); b.textContent = opts.action; b.addEventListener("click", function () { hide(); if (opts.onAction) opts.onAction(); }); }
    t.setAttribute("data-show", "1");
    clearTimeout(toastTimer); toastTimer = setTimeout(hide, opts.ms || (opts.action ? 6000 : 3200));
    function hide() { t.removeAttribute("data-show"); }
  }

  /* ---- tab bar: the sections, switched without piling up history (so the edge-swipe back gesture
          keeps its iOS meaning: back to the screen you came from, not the previous tab) ---- */
  var ICONS = {
    plates: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.25"/><path d="M12 4.5c1.6 3.2 1.6 4.8 0 7.5c-1.6-2.7-1.6-4.3 0-7.5ZM12 19.5c-1.6-3.2-1.6-4.8 0-7.5c1.6 2.7 1.6 4.3 0 7.5ZM4.5 12c3.2-1.6 4.8-1.6 7.5 0c-2.7 1.6-4.3 1.6-7.5 0ZM19.5 12c-3.2 1.6-4.8 1.6-7.5 0c2.7-1.6 4.3-1.6 7.5 0Z"/></svg>',
    room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2" opacity=".75"/><circle cx="12" cy="12" r="9.6" opacity=".45"/></svg>',
    law: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4M4.8 4.8l2.4 2.4M16.8 16.8l2.4 2.4M19.2 4.8l-2.4 2.4M7.2 16.8l-2.4 2.4"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>',
    you: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9.25"/><circle cx="12" cy="10" r="3.2"/><path d="M5.8 18.6c1.4-2.6 3.6-3.9 6.2-3.9s4.8 1.3 6.2 3.9"/></svg>'
  };
  var TABS = [
    { id: "plates", href: "index.html", label: "Plates" },
    { id: "room", href: "frequencies.html", label: "Resonance" },
    { id: "law", href: "law-of-one.html", label: "Law of One" },
    { id: "you", href: "you.html", label: "You" }
  ];
  function buildTabBar() {
    if ($(".tabbar")) return;
    var nav = document.createElement("nav"); nav.className = "tabbar"; nav.setAttribute("aria-label", "Sections");
    TABS.forEach(function (t) {
      var a = document.createElement("a"); a.href = t.href; a.setAttribute("data-tab", t.id);
      a.innerHTML = ICONS[t.id] + "<span>" + t.label + "</span>";
      if (page === t.href) a.setAttribute("aria-current", "page");
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (page === t.href) { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); return; }
        location.replace(t.href);
      });
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
    document.addEventListener("cf:plus", paintPlusDot); paintPlusDot();
  }
  function paintPlusDot() { var a = $('.tabbar a[data-tab="you"]'), cp = CP(); if (a) a.setAttribute("data-plus", cp && cp.has() ? "1" : "0"); }

  /* ---- bottom sheets: the site's dialogs, with a grabber and a flick-down to dismiss ---- */
  function sheetify(dlg) {
    if (dlg.getAttribute("data-sheet") === "1") return; dlg.setAttribute("data-sheet", "1");
    var startY = 0, dy = 0, dragging = false, scroller = null;
    function scrollable(el) {
      while (el && el !== dlg) { if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el; el = el.parentElement; }
      return null;
    }
    dlg.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      scroller = scrollable(e.target); startY = e.touches[0].clientY; dy = 0; dragging = true;
      dlg.style.transition = "none";
    }, { passive: true });
    dlg.addEventListener("touchmove", function (e) {
      if (!dragging) return;
      var y = e.touches[0].clientY - startY;
      if (scroller && scroller.scrollTop > 0) { dy = 0; return; }
      if (y < 0) { dy = 0; dlg.style.transform = ""; return; }
      dy = y; dlg.style.transform = "translateY(" + y + "px)";
      if (e.cancelable && y > 4) e.preventDefault();
    }, { passive: false });
    function settle() {
      if (!dragging) return; dragging = false;
      if (dy > 110) { hImpact("LIGHT"); dlg.close(); }
      else { dlg.style.transition = "transform 260ms cubic-bezier(.32,.72,0,1)"; dlg.style.transform = ""; }
      dy = 0;
    }
    dlg.addEventListener("touchend", settle, { passive: true });
    dlg.addEventListener("touchcancel", settle, { passive: true });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) { e.stopImmediatePropagation(); dlg.close(); } }, true);
    var nativeClose = dlg.close.bind(dlg);
    dlg.close = function (v) {
      if (dlg.getAttribute("data-closing") === "1" || !dlg.open) return nativeClose(v);
      dlg.setAttribute("data-closing", "1"); dlg.style.transform = "";
      var done = false; function finish() { if (done) return; done = true; dlg.removeAttribute("data-closing"); dlg.style.transition = ""; nativeClose(v); }
      dlg.addEventListener("animationend", finish, { once: true }); setTimeout(finish, 320);
    };
  }

  /* ---- first launch: three lines, one button ---- */
  function welcome() {
    var cp = CP(); if (!cp || cp.store.get("onboarded")) return;
    var d = document.createElement("dialog"); d.className = "info info--cf"; d.id = "cfWelcome";
    d.innerHTML = '<div class="info-head"><p class="eyebrow">Welcome</p><button class="info-close" type="button" data-close>Skip</button></div>' +
      '<div class="info-text cf-text"><h2>Sound you can <span class="amp">see</span>.</h2>' +
      '<ul class="cf-steps">' +
      '<li><span class="cf-ic">' + ICONS.plates + '</span><div><b>Pick a formation</b>Swipe the plates. Play its tone and watch the sand settle into the figure it raises.</div></li>' +
      '<li><span class="cf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></span><div><b>Sing into it</b>Your own tone, or the microphone: the free plate answers your voice, live.</div></li>' +
      '<li><span class="cf-ic">' + ICONS.room + '</span><div><b>Leave a tone on</b>The Resonance Room: 432, 528, brown noise, a timer. Save the mixes you like.</div></li>' +
      '</ul><div class="cf-row"><button class="cf-primary" type="button" data-close>Let\'s go</button></div>' +
      '<p class="cf-fine">No account needed. The microphone is analysed on your phone and never recorded.</p></div>';
    document.body.appendChild(d); sheetify(d);
    d.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
    d.addEventListener("close", function () { cp.store.set("onboarded", true); setTimeout(function () { d.remove(); }, 50); });
    setTimeout(function () { if (typeof d.showModal === "function") d.showModal(); }, 600);
  }

  /* ---- Plates: haptics, share ---- */
  function wirePlates() {
    var name = $(".field-caption .fc-name");
    if (name) new MutationObserver(function () { hSelect(); }).observe(name, { childList: true, characterData: true, subtree: true });
    var mic = $("#micBtn");
    if (mic) new MutationObserver(function () { if (mic.getAttribute("data-on") === "1") hNotify("SUCCESS"); }).observe(mic, { attributes: true, attributeFilter: ["data-on"] });
    var play = $("#playBtn"); if (play) play.addEventListener("click", function () { hImpact("LIGHT"); });
    var sel = $("#figureSel"); if (sel) sel.addEventListener("change", function () { hSelect(); });
    Array.prototype.forEach.call(document.querySelectorAll("dialog.info"), sheetify);
    // share: a still of the figure and its plate, ready for Stories
    var panel = $(".panel--plate");
    if (panel && P.Share && P.Filesystem) {
      var b = document.createElement("button"); b.type = "button"; b.className = "cf-share"; b.setAttribute("aria-label", "Share this plate");
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>';
      b.addEventListener("click", function () { hImpact("LIGHT"); sharePlate(b); });
      panel.appendChild(b);
    }
  }
  function sharePlate(btn) {
    var cp = CP(), clean = cp && cp.has();
    var field = $("#fieldCanvas"), plate = $("#plateCanvas"); if (!field || !plate) return;
    var name = ($("#fcName") || {}).textContent || "Chladni Fields", hz = (($("#readF") || {}).textContent || "").replace(/[^\d.]/g, "");
    var sym = ($("#readSym") || {}).textContent || "", span = ($("#readSpan") || {}).textContent || "";
    var W = 1080, Hh = 1350, c = document.createElement("canvas"); c.width = W; c.height = Hh; var x = c.getContext("2d");
    var cs = getComputedStyle(root), bg = cs.getPropertyValue("--bg").trim() || "#0d120e", ink = cs.getPropertyValue("--ink").trim() || "#e9e5d7", accent = cs.getPropertyValue("--accent").trim() || "#d3a851", muted = cs.getPropertyValue("--muted").trim() || "#8b9568", edge = cs.getPropertyValue("--edge").trim() || "#2c3326";
    x.fillStyle = bg; x.fillRect(0, 0, W, Hh);
    x.strokeStyle = edge; x.lineWidth = 2;
    for (var i = 1; i <= 6; i++) { x.beginPath(); x.arc(W / 2, 560, 90 * i, 0, Math.PI * 2); x.globalAlpha = .35; x.stroke(); } x.globalAlpha = 1;
    x.font = "500 26px 'IBM Plex Mono', monospace"; x.fillStyle = accent; x.textAlign = "left"; x.fillText("CHLADNI FIELDS · " + (hz ? hz + " HZ" : ""), 60, 96);
    x.drawImage(field, 60, 160, 460, 460); x.drawImage(plate, 560, 160, 460, 460);
    x.strokeStyle = edge; x.strokeRect(60, 160, 460, 460); x.strokeRect(560, 160, 460, 460);
    x.font = "700 78px 'Chakra Petch', sans-serif"; x.fillStyle = ink; x.fillText(name, 60, 760);
    x.font = "400 30px 'IBM Plex Mono', monospace"; x.fillStyle = muted; x.fillText([hz ? hz + " Hz fundamental" : "", sym && sym !== "—" ? sym + " symmetry" : "", span && span !== "—" ? span : ""].filter(Boolean).join("  ·  "), 60, 820);
    x.font = "italic 400 34px 'Spectral', Georgia, serif"; x.fillStyle = ink;
    wrap(x, "The pattern this tone raises in sand on a vibrating plate — the figure on the left, read as sound.", 60, 900, 960, 46);
    if (!clean) { x.font = "500 28px 'IBM Plex Mono', monospace"; x.fillStyle = accent; x.textAlign = "right"; x.fillText("iamra.lol", W - 60, Hh - 70); }
    var data = c.toDataURL("image/png").split(",")[1];
    btn.setAttribute("data-busy", "1");
    P.Filesystem.writeFile({ path: "chladni-" + name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".png", data: data, directory: "CACHE" })
      .then(function (r) { return P.Share.share({ title: name + " · Chladni Fields", text: name + (hz ? " sounds at " + hz + " Hz" : "") + " — iamra.lol", files: [r.uri] }); })
      .then(function () { if (!clean) toast("Shared with a small iamra.lol mark — Plus shares clean.", { action: "See Plus", onAction: function () { if (cp) cp.paywall("A clean share"); } }); })
      .catch(function () {}).then(function () { btn.removeAttribute("data-busy"); });
  }
  function wrap(x, text, left, top, width, lh) {
    var words = text.split(" "), line = "", y = top;
    words.forEach(function (w) { var t = line ? line + " " + w : w; if (x.measureText(t).width > width) { x.fillText(line, left, y); line = w; y += lh; } else line = t; });
    if (line) x.fillText(line, left, y);
  }

  /* ---- Resonance Room: haptics, Now Playing, saved mixes, sleep mode, long timers ---- */
  function wireRoom() {
    document.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest(".preset, .go, #stopAll, #miniStop, .mini-chip button") : null;
      if (b) hImpact(b.matches(".preset") ? "MEDIUM" : "LIGHT");
    }, true);
    var status = $("#status");
    // lock-screen Now Playing: the site's status line already says what sounds
    if (status && "mediaSession" in navigator) {
      var nowPlaying = function () {
        var live = status.getAttribute("data-live") === "1", text = status.textContent.replace(/^playing\s+/i, "");
        try {
          if (live) {
            navigator.mediaSession.metadata = new MediaMetadata({ title: text, artist: "Chladni Fields · Resonance Room", album: "iamra.lol", artwork: [{ src: "icon-512.png", sizes: "512x512", type: "image/png" }] });
            navigator.mediaSession.playbackState = "playing";
          } else { navigator.mediaSession.playbackState = "none"; }
        } catch (e) {}
      };
      try {
        navigator.mediaSession.setActionHandler("pause", function () { var s = $("#stopAll"); if (s) s.click(); });
        navigator.mediaSession.setActionHandler("stop", function () { var s = $("#stopAll"); if (s) s.click(); });
        navigator.mediaSession.setActionHandler("play", function () {});
      } catch (e) {}
      new MutationObserver(nowPlaying).observe(status, { attributes: true, childList: true, characterData: true, subtree: true });
    }
    // long timers (Plus)
    var timer = $("#timer");
    if (timer) {
      [[120, "2 h"], [240, "4 h"], [480, "8 h"]].forEach(function (o) { var op = document.createElement("option"); op.value = String(o[0]); op.textContent = o[1] + " · Plus"; op.setAttribute("data-plus", "1"); timer.appendChild(op); });
      var prev = timer.value;
      timer.addEventListener("change", function (ev) {
        var v = parseFloat(timer.value), cp = CP();
        if (v > 90 && cp && !cp.has()) {
          ev.stopImmediatePropagation(); timer.value = prev;
          cp.paywall("A timer longer than 90 minutes", function () { timer.value = String(v); timer.dispatchEvent(new Event("change", { bubbles: true })); });
          return;
        }
        prev = timer.value;
      }, true);
      document.addEventListener("cf:plus", function () { Array.prototype.forEach.call(timer.querySelectorAll("[data-plus]"), function (op) { var cp = CP(); op.textContent = op.textContent.replace(/ · Plus$/, "") + (cp && cp.has() ? "" : " · Plus"); }); });
    }
    // sleep mode: free plays while the app is open; Plus keeps sounding with the screen locked
    var pausedByLock = false;
    document.addEventListener("visibilitychange", function () {
      var cp = CP(), live = status && status.getAttribute("data-live") === "1";
      if (document.hidden) { if (live && cp && !cp.has()) { var s = $("#stopAll"); if (s) s.click(); pausedByLock = true; } }
      else if (pausedByLock) { pausedByLock = false; toast("Faded out when the screen locked. Plus keeps playing.", { action: "See Plus", onAction: function () { if (cp) cp.paywall("Playing with the screen locked"); } }); }
    });
    // saved mixes
    var presets = $(".presets-ctl");
    if (presets) {
      var box = document.createElement("div"); box.className = "cf-mixes"; box.id = "cfMixes";
      presets.insertBefore(box, presets.firstChild);
      paintMixes(); document.addEventListener("cf:mixes", paintMixes); document.addEventListener("cf:plus", paintMixes);
    }
    // deep link from the You tab: frequencies.html?mix=<id>
    var m = /[?&]mix=([^&]+)/.exec(location.search);
    if (m) { var cp0 = CP(); if (cp0) cp0.ready.then(function () { var mix = cp0.mixes.list().filter(function (x) { return x.id === decodeURIComponent(m[1]); })[0]; if (mix) setTimeout(function () { applyMix(mix); }, 400); }); }
  }
  function captureMix() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.tone[data-on="1"]'));
    var on = cards.map(function (c) { return c.id.replace(/^card-/, ""); });
    if (!on.length) return null;
    var names = cards.map(function (c) { var h = c.querySelector("h3"); return h ? (h.firstChild && h.firstChild.nodeType === 3 ? h.firstChild.textContent : h.textContent).trim().split(" · ")[0] : c.id; });
    var bin = ($("#binBtn") || {}).getAttribute && $("#binBtn").getAttribute("data-on") === "1";
    return { tones: on, timbre: ($("#timbre") || {}).value, beat: ($("#beat") || {}).value, bin: bin, breath: $("#breathBtn") ? $("#breathBtn").getAttribute("data-on") === "1" : true, master: ($("#master") || {}).value, timer: ($("#timer") || {}).value,
      summary: (names.length ? names : on).join(" + ") + (bin ? " · binaural " + ($("#beat") || {}).value + " Hz" : "") };
  }
  function applyMix(mix) {
    hImpact("MEDIUM");
    var set = function (id, v) { var el = $(id); if (el && v != null) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } };
    set("#timbre", mix.timbre); set("#beat", mix.beat); set("#master", mix.master); set("#timer", mix.timer);
    var mv = $("#masterVal"); if (mv && mix.master != null) mv.textContent = mix.master;
    [["#binBtn", mix.bin], ["#breathBtn", mix.breath]].forEach(function (p) { var b = $(p[0]); if (b && (b.getAttribute("data-on") === "1") !== !!p[1]) b.click(); });
    Array.prototype.forEach.call(document.querySelectorAll(".tone"), function (card) {
      var id = card.id.replace(/^card-/, ""), on = card.getAttribute("data-on") === "1", want = mix.tones.indexOf(id) >= 0, go = $("#go-" + id);
      if (go && on !== want) go.click();
    });
    var pl = $("#player"); if (pl && window.innerWidth < 900) pl.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }
  function paintMixes() {
    var box = $("#cfMixes"), cp = CP(); if (!box || !cp) return;
    var list = cp.mixes.list();
    box.innerHTML = '<div class="cf-mixes-head"><span class="lbl">My mixes</span><button class="cf-save" type="button" id="cfSaveMix">Save mix</button></div>' +
      (list.length ? '<div class="cf-mix-row">' + list.map(function (m) { return '<button class="cf-mix" type="button" data-mix="' + m.id + '"><b>' + escapeHtml(m.name) + '</b><small>' + escapeHtml(m.summary || "") + '</small></button>'; }).join("") + '</div>' : '<p class="cf-mixes-empty">Start a few tones, then save the mix to come back to it.</p>');
    $("#cfSaveMix").addEventListener("click", function () {
      var mix = captureMix();
      if (!mix) { toast("Start a tone first, then save."); return; }
      if (!cp.mixes.canSave()) { cp.paywall("More than one saved mix", function () { saveMix(mix); }); return; }
      saveMix(mix);
    });
    box.querySelectorAll("[data-mix]").forEach(function (b) {
      b.addEventListener("click", function () { var mix = list.filter(function (x) { return x.id === b.getAttribute("data-mix"); })[0]; if (mix) applyMix(mix); });
      var t = null;
      b.addEventListener("touchstart", function () { t = setTimeout(function () { hImpact("MEDIUM"); if (confirm("Delete “" + b.querySelector("b").textContent + "”?")) cp.mixes.remove(b.getAttribute("data-mix")); }, 650); }, { passive: true });
      ["touchend", "touchmove", "touchcancel"].forEach(function (n) { b.addEventListener(n, function () { clearTimeout(t); }, { passive: true }); });
    });
  }
  function saveMix(mix) {
    var cp = CP(), name = prompt("Name this mix", mix.summary.length > 28 ? "Evening mix" : mix.summary);
    if (name == null) return; mix.name = name.trim() || "My mix";
    cp.mixes.save(mix); hNotify("SUCCESS"); toast("Saved “" + mix.name + "”. Hold a mix to delete it.");
  }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* ---- boot ---- */
  function hideSplash() { try { if (P.SplashScreen) P.SplashScreen.hide({ fadeOutDuration: 220 }); } catch (e) {} }
  window.ChladniNative = { sheetify: sheetify, toast: toast, haptic: { impact: hImpact, select: hSelect, notify: hNotify } };
  function ready() {
    buildTabBar();
    if (page === "index.html") { wirePlates(); welcome(); }
    if (page === "frequencies.html") wireRoom();
    requestAnimationFrame(function () { requestAnimationFrame(hideSplash); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
  setTimeout(hideSplash, 2500);
})();
