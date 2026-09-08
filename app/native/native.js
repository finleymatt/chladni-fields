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
  // the app opens on the Resonance Room; the plates page stays the site's front door, so deep links keep working
  if (page === "index.html" && !location.search && !location.hash) {
    var launched = false; try { launched = sessionStorage.getItem("cf:launched") === "1"; sessionStorage.setItem("cf:launched", "1"); } catch (e) {}
    if (!launched) { location.replace("frequencies.html"); return; }
  }
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

  /* ---- toast: a pill above the tab bar. Shown as a popover so it stacks above an open sheet
          (a modal dialog lives in the top layer; anything plain in the body would be hidden beneath it) ---- */
  var toastTimer = null, toastHideTimer = null;
  function toast(text, opts) {
    opts = opts || {};
    var t = $("#cfToast");
    if (!t) { t = document.createElement("div"); t.id = "cfToast"; t.className = "cf-toast"; t.setAttribute("role", "status"); if ("popover" in t) t.setAttribute("popover", "manual"); document.body.appendChild(t); }
    t.innerHTML = "<span></span>" + (opts.action ? '<button type="button"></button>' : "");
    t.querySelector("span").textContent = text;
    if (opts.action) { var b = t.querySelector("button"); b.textContent = opts.action; b.addEventListener("click", function () { hide(); if (opts.onAction) opts.onAction(); }); }
    clearTimeout(toastHideTimer);
    try { if (t.showPopover && !t.matches(":popover-open")) t.showPopover(); } catch (e) {}
    requestAnimationFrame(function () { t.setAttribute("data-show", "1"); });
    clearTimeout(toastTimer); toastTimer = setTimeout(hide, opts.ms || (opts.action ? 6000 : 3200));
    function hide() { t.removeAttribute("data-show"); toastHideTimer = setTimeout(function () { try { if (t.hidePopover) t.hidePopover(); } catch (e) {} }, 260); }
  }

  /* ---- tab bar: the sections, switched without piling up history (so the edge-swipe back gesture
          keeps its iOS meaning: back to the screen you came from, not the previous tab) ---- */
  var ICONS = {
    plates: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.25"/><path d="M12 4.5c1.6 3.2 1.6 4.8 0 7.5c-1.6-2.7-1.6-4.3 0-7.5ZM12 19.5c-1.6-3.2-1.6-4.8 0-7.5c1.6 2.7 1.6 4.3 0 7.5ZM4.5 12c3.2-1.6 4.8-1.6 7.5 0c-2.7 1.6-4.3 1.6-7.5 0ZM19.5 12c-3.2 1.6-4.8 1.6-7.5 0c2.7-1.6 4.3-1.6 7.5 0Z"/></svg>',
    room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2" opacity=".75"/><circle cx="12" cy="12" r="9.6" opacity=".45"/></svg>',
    law: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 7.4C6.4 3.2 17.6 3.2 21.6 7.4"/><path d="M1.8 12C6 6.4 18 6.4 22.2 12C18 17.6 6 17.6 1.8 12Z"/><circle cx="12" cy="12" r="2.9"/><path d="M22.2 12L24 11.2M15 17.4L15.5 22.6M9 17.3C7.8 19.7 5.7 21.7 3.4 21C2 20.5 2.2 18.7 3.6 18.6C4.6 18.4 4.9 19.3 4.5 19.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>',
    you: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9.25"/><circle cx="12" cy="10" r="3.2"/><path d="M5.8 18.6c1.4-2.6 3.6-3.9 6.2-3.9s4.8 1.3 6.2 3.9"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>'
  };
  var SA = P.SleepAudio || (cap.registerPlugin ? cap.registerPlugin("SleepAudio") : null);
  var WB = P.WidgetBridge || (cap.registerPlugin ? cap.registerPlugin("WidgetBridge") : null);
  var TABS = [
    { id: "room", href: "frequencies.html", label: "Resonance" },
    { id: "plates", href: "index.html", label: "Plates" },
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
  function paintPlusDot() { var a = $('.tabbar a[data-tab="you"]'), cp = CP(); if (a) a.setAttribute("data-plus", cp && cp.has() ? "1" : "0"); root.classList.toggle("cf-plus", !!(cp && cp.has())); }

  /* ---- the Plus lock: one small pill on every gated feature, a padlock while locked and a check once
          Plus is active. The root carries .cf-plus so every badge flips at once on purchase. ---- */
  var LOCK = '<svg class="cf-lock-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  var CHECK = '<svg class="cf-check-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function lockBadge(locked, unlocked) { return '<span class="cf-lock">' + LOCK + CHECK + '<span class="cf-lock-l">' + escapeHtml(locked || "Plus") + '</span><span class="cf-lock-u">' + escapeHtml(unlocked || "Plus") + '</span></span>'; }
  function gate(reason, onSuccess) { var cp = CP(); if (!cp) return; if (cp.has()) { if (onSuccess) onSuccess(); return; } hImpact("LIGHT"); cp.paywall(reason, onSuccess); }

  /* ---- bottom sheets: the site's dialogs, with a grabber and a flick-down to dismiss ---- */
  var openSheets = 0;
  function lockPage(on) {
    openSheets = Math.max(0, openSheets + (on ? 1 : -1));
    root.classList.toggle("cf-locked", openSheets > 0);
  }
  function sheetify(dlg) {
    if (dlg.getAttribute("data-sheet") === "1") return; dlg.setAttribute("data-sheet", "1");
    var startY = 0, dy = 0, dragging = false, scroller = null;
    function scrollable(el) {
      while (el && el !== dlg) { if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el; el = el.parentElement; }
      return null;
    }
    // the page behind a sheet holds still: no scroll chaining out of the sheet, no rubber-banding the document
    var wasOpen = dlg.open; if (wasOpen) lockPage(true);
    new MutationObserver(function () { if (dlg.open !== wasOpen) { wasOpen = dlg.open; lockPage(wasOpen); } }).observe(dlg, { attributes: true, attributeFilter: ["open"] });
    dlg.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      scroller = scrollable(e.target); startY = e.touches[0].clientY; dy = 0; dragging = true;
      dlg.style.transition = "none";
    }, { passive: true });
    dlg.addEventListener("touchmove", function (e) {
      if (!dragging) return;
      var y = e.touches[0].clientY - startY;
      var atEnd = scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (scroller && scroller.scrollTop > 0) { dy = 0; if (y < 0 && atEnd && e.cancelable) e.preventDefault(); return; }
      if (y < 0) { dy = 0; dlg.style.transform = ""; if ((!scroller || atEnd) && e.cancelable) e.preventDefault(); return; }
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

  /* ---- explanations fold away: a small ⓘ opens a plain-language sheet with the full text underneath ---- */
  var INFO_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>';
  function infoSheet(title, html) {
    var old = document.getElementById("cfInfo"); if (old) { try { old.close(); } catch (e) {} old.remove(); }
    var d = document.createElement("dialog"); d.className = "info info--cf cf-infosheet"; d.id = "cfInfo";
    d.innerHTML = '<div class="info-head"><p class="eyebrow">' + escapeHtml(title) + '</p><button class="info-close" type="button" data-close>Close</button></div><div class="info-text cf-text">' + html + '</div>';
    document.body.appendChild(d); sheetify(d);
    d.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
    d.addEventListener("close", function () { setTimeout(function () { d.remove(); }, 50); });
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    hImpact("LIGHT");
    return d;
  }
  function infoButton(title, eli5, source, label) {
    var b = document.createElement("button"); b.type = "button"; b.className = "cf-info" + (label ? " cf-info--row" : ""); b.setAttribute("aria-label", title);
    b.innerHTML = INFO_I + (label ? "<span>" + escapeHtml(label) + "</span>" : "");
    b.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var body = (eli5 ? '<p class="cf-eli5">' + eli5 + '</p>' : "") + (source ? '<div class="cf-orig">' + source + '</div>' : "");
      infoSheet(title, body);
    });
    return b;
  }
  /* hide `els`, put one ⓘ after `anchor` that opens their text (with an ELI5 line on top) */
  function tuck(els, anchor, title, eli5, label) {
    els = Array.prototype.filter.call(els || [], Boolean); if (!els.length || !anchor) return;
    var html = els.map(function (el) { el.classList.add("cf-tucked"); return el.outerHTML; }).join("");
    var b = infoButton(title, eli5, html, label);
    anchor.insertAdjacentElement(label ? "afterend" : "beforeend", b);
    return b;
  }
  /* wrap a section in a closed disclosure */
  function fold(el, summary) {
    if (!el) return;
    var d = document.createElement("details"); d.className = "cf-fold";
    d.innerHTML = '<summary>' + INFO_I + '<span>' + escapeHtml(summary) + '</span></summary>';
    el.parentNode.insertBefore(d, el); d.appendChild(el);
    d.addEventListener("toggle", function () { hSelect(); });
    return d;
  }
  function simplifyRoom() {
    var head = $(".head"), h1 = head && head.querySelector("h1");
    tuck([head && head.querySelector(".lede"), head && head.querySelector(".legend")], h1, "The room, in short",
      "Pick a sound, tap <b>Play</b>, and leave it on. Tones are steady notes. Sleep sounds are rain, sea, wind and so on. Binaural beats only work with headphones. The timer fades everything out so you can fall asleep to it. The small labels on each sound say how much science is behind it: <b>studied</b> means several studies agree, <b>pilot</b> one or two small ones, <b>mixed</b> the studies disagree, <b>tradition</b> people have used it for a long time and nobody has tested it.");
    Array.prototype.forEach.call(document.querySelectorAll(".group-head"), function (g) {
      var h2 = g.querySelector("h2"), p = g.querySelector("p"); if (!h2 || !p) return;
      tuck([p], h2, h2.textContent.trim(), "", "");
    });
    Array.prototype.forEach.call(document.querySelectorAll(".tone"), function (card) {
      var p = card.querySelector("p"), h3 = card.querySelector("h3"), badge = card.querySelector(".badge"); if (!p || !h3) return;
      var tier = badge ? badge.textContent.trim() : "", why = { studied: "several studies point the same way", pilot: "one or two small studies, promising", mixed: "the studies disagree", tradition: "used for a long time, never properly tested" }[tier] || "";
      var name = (h3.firstChild && h3.firstChild.nodeType === 3 ? h3.firstChild.textContent : h3.textContent).trim();
      p.classList.add("cf-tucked");
      var b = infoButton(name, why ? "<b>" + escapeHtml(tier) + ":</b> " + why + "." : "", p.outerHTML, "What it is");
      p.insertAdjacentElement("afterend", b);
    });
    var pomoLbl = document.querySelector(".pomo-ctl .lbl"), pomoHelp = $(".pomo-help");
    if (pomoLbl && pomoHelp) tuck([pomoHelp], pomoLbl, "Pomodoro", "Work in sprints. The room plays while you work, goes quiet for the break, and chimes at each turn. Tap a sprint length to start; tap it again to stop.");
    fold($(".notes"), "The science and the safety notes");
  }
  function simplifyPlates() {
    var mast = $(".masthead"), h1 = mast && mast.querySelector("h1");
    tuck([mast && mast.querySelector(".premise")], h1, "What is this?",
      "Every crop circle here has been turned into a musical note. The plate next to it shows what that note does to a sprinkle of sand. Tap <b>Play tone</b> to hear it, or pick <b>Your own tone</b> and sing into the microphone to watch the sand follow your voice.");
    fold($(".lower .method"), "How a crop circle becomes a sound");
  }
  function simplifyLaw() {
    var head = $(".laws-head"), h1 = head && head.querySelector("h1");
    tuck([head && head.querySelector(".laws-intro")], h1, "About these readings", "Nine short passages from the Ra Material, a set of channelled sessions from the 1980s. Each one is a big idea in a few lines, with the session it came from. Read one when you want something to sit with.");
  }

  /* ---- first launch: a short swipeable tour of the app, ending on an optional sign-in ---- */
  function tour() {
    var cp = CP(); if (!cp || cp.store.get("onboarded")) return;
    var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>';
    var slides = [
      { ic: ICONS.law, eyebrow: "Welcome", h: 'Slow<span class="amp">tide</span>', p: "Sounds to help you sleep, settle and focus. Nothing to set up: pick a sound and press play." },
      { ic: ICONS.room, eyebrow: "Resonance Room", h: 'Tap a sound, <span class="amp">leave it on</span>.', p: "Presets for winding down, sleep and work. A timer fades everything out so you can drift off." },
      { ic: MOON, eyebrow: "Sleep mode", h: 'Lock the phone, it <span class="amp">keeps playing</span>.', p: "Your first lock is free. After that Plus keeps the room going every night, with lock-screen controls." },
      { ic: ICONS.plates, eyebrow: "Plates", h: 'Crop circles, as <span class="amp">notes</span>.', p: "Each formation becomes a tone, and sand on a plate shows what that tone does. Or sing into the mic and watch your own voice." },
      { ic: ICONS.law, eyebrow: "Law of One", h: 'Nine short <span class="amp">readings</span>.', p: "Big ideas from the Ra Material, a few lines each, for when you want something to think about." },
      { ic: ICONS.you, eyebrow: "You", h: 'Keep what you <span class="amp">like</span>.', p: "Save mixes, set a wind-down reminder, add a Home Screen widget. Signing in keeps your mixes with you; it's optional.", signin: true }
    ];
    var d = document.createElement("dialog"); d.className = "cf-tour"; d.id = "cfTour";
    var google = !!((window.CHLADNI_CONFIG || {}).googleIosClientId);
    d.innerHTML = '<button class="cf-tour-skip" type="button" data-skip>Skip</button>' +
      '<div class="cf-tour-track">' + slides.map(function (s, i) {
        return '<section class="cf-tour-slide" data-i="' + i + '"><span class="cf-tour-ic">' + s.ic + '</span><p class="eyebrow">' + s.eyebrow + '</p><h2>' + s.h + '</h2><p class="cf-tour-p">' + s.p + '</p>' +
          (s.signin ? '<div class="cf-signin"><button class="cf-apple" type="button" data-provider="apple"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.365 12.79c-.026-2.62 2.14-3.88 2.237-3.94-1.22-1.78-3.115-2.024-3.79-2.052-1.615-.164-3.15.95-3.97.95-.82 0-2.08-.927-3.42-.902-1.76.026-3.38 1.024-4.29 2.6-1.83 3.17-.47 7.87 1.31 10.44.87 1.26 1.91 2.67 3.27 2.62 1.31-.052 1.81-.85 3.4-.85 1.58 0 2.03.85 3.42.82 1.41-.026 2.3-1.28 3.16-2.55 1-1.46 1.41-2.87 1.43-2.94-.031-.013-2.74-1.05-2.767-4.19zM13.76 5.1c.72-.88 1.21-2.1 1.08-3.32-1.04.043-2.3.694-3.05 1.57-.67.774-1.26 2.02-1.1 3.21 1.16.09 2.35-.59 3.07-1.46z"/></svg>Sign in with Apple</button>' +
            (google ? '<button class="cf-google" type="button" data-provider="google">Continue with Google</button>' : "") + '</div>' : "") + '</section>';
      }).join("") + '</div>' +
      '<div class="cf-tour-foot"><div class="cf-tour-dots">' + slides.map(function (s, i) { return '<i data-dot="' + i + '"' + (i === 0 ? ' data-on="1"' : "") + '></i>'; }).join("") + '</div>' +
      '<button class="cf-primary cf-tour-next" type="button" data-next>Next</button></div>';
    document.body.appendChild(d);
    var track = d.querySelector(".cf-tour-track"), at = 0, n = slides.length;
    function paint() {
      d.querySelectorAll("[data-dot]").forEach(function (o) { o.setAttribute("data-on", parseInt(o.getAttribute("data-dot"), 10) === at ? "1" : "0"); });
      d.querySelector("[data-next]").textContent = at === n - 1 ? "Start listening" : "Next";
      d.querySelector("[data-skip]").hidden = at === n - 1;
    }
    function go(i) { at = Math.max(0, Math.min(n - 1, i)); track.scrollTo({ left: at * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" }); hSelect(); paint(); }
    track.addEventListener("scroll", function () { var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== at) { at = i; paint(); } }, { passive: true });
    function finish() { cp.store.set("onboarded", true); d.setAttribute("data-closing", "1"); setTimeout(function () { try { d.close(); } catch (e) {} d.remove(); lockPage(false); }, 260); }
    d.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-next]")) { if (at === n - 1) finish(); else go(at + 1); return; }
      if (ev.target.closest("[data-skip]")) { finish(); return; }
      var pb = ev.target.closest("[data-provider]");
      if (pb && cp.account) { pb.disabled = true; cp.account.signIn(pb.getAttribute("data-provider")).then(function (a) { hNotify("SUCCESS"); toast("Signed in" + (a && a.name ? " as " + a.name : "") + "."); finish(); }).catch(function (e) { pb.disabled = false; var m = (e && e.message) || ""; if (!/cancel/i.test(m)) toast(m || "Sign-in didn't complete."); }); }
    });
    d.addEventListener("cancel", function (ev) { ev.preventDefault(); finish(); });
    setTimeout(function () { if (typeof d.showModal === "function") d.showModal(); lockPage(true); paint(); }, 500);
  }
  /* a gentle word about signing in, on the third and eighth launch, if the account is still empty */
  function signInNudge() {
    var cp = CP(); if (!cp || !cp.store.get("onboarded")) return;
    var n = (cp.store.get("launches", 0) || 0) + 1; cp.store.set("launches", n);
    if ((n === 3 || n === 8) && !cp.account.get()) setTimeout(function () { toast("Sign in to keep your mixes with you. It's optional.", { action: "Sign in", ms: 7000, onAction: function () { cp.account.sheet(); } }); }, 2500);
  }

  /* ---- first launch: three lines, one button (kept for the ?sheet=welcome deep link) ---- */
  function welcome() {
    var cp = CP(); if (!cp || cp.store.get("onboarded")) return;
    var d = document.createElement("dialog"); d.className = "info info--cf"; d.id = "cfWelcome";
    d.innerHTML = '<div class="info-head"><p class="eyebrow">Welcome</p><button class="info-close" type="button" data-close>Skip</button></div>' +
      '<div class="info-text cf-text"><h2>Sound you can <span class="amp">see</span>.</h2>' +
      '<ul class="cf-steps">' +
      '<li><span class="cf-ic">' + ICONS.room + '</span><div><b>Leave a tone on</b>The Resonance Room: 432, 528, rain, surf, brown noise, a timer. Save the mixes you like.</div></li>' +
      '<li><span class="cf-ic">' + ICONS.plates + '</span><div><b>Pick a formation</b>Swipe the plates. Play its tone and watch the sand settle into the figure it raises.</div></li>' +
      '<li><span class="cf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></span><div><b>Sing into it</b>Your own tone, or the microphone: the free plate answers your voice, live.</div></li>' +
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
    var name = ($("#fcName") || {}).textContent || "Slowtide", hz = (($("#readF") || {}).textContent || "").replace(/[^\d.]/g, "");
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
      .then(function (r) { return P.Share.share({ title: name + " · Slowtide", text: name + (hz ? " sounds at " + hz + " Hz" : "") + " — iamra.lol", files: [r.uri] }); })
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
            navigator.mediaSession.metadata = new MediaMetadata({ title: text, artist: "Slowtide · Resonance Room", album: "iamra.lol", artwork: [{ src: "icon-512.png", sizes: "512x512", type: "image/png" }] });
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
      [[120, "2 h"], [240, "4 h"], [480, "8 h"]].forEach(function (o) { var op = document.createElement("option"); op.value = String(o[0]); op.setAttribute("data-plus", "1"); op.setAttribute("data-label", o[1]); timer.appendChild(op); });
      var paintTimer = function () { var cp = CP(), has = cp && cp.has(); Array.prototype.forEach.call(timer.querySelectorAll("[data-plus]"), function (op) { op.textContent = has ? op.getAttribute("data-label") : "🔒 " + op.getAttribute("data-label") + " · Plus"; }); };
      paintTimer();
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
      document.addEventListener("cf:plus", paintTimer);
      // the sleep-mode control sits beside the timer: the clearest place to say what Plus buys
      var timerCtl = timer.closest(".ctl");
      if (timerCtl) {
        var sleepCtl = document.createElement("div"); sleepCtl.className = "ctl cf-sleep-ctl";
        sleepCtl.innerHTML = '<span class="lbl">Sleep mode</span><button class="cf-sleep" type="button" id="cfSleep">' + LOCK + CHECK +
          '<span class="cf-sleep-t"><b class="cf-lock-l">Keeps playing with the screen locked</b><b class="cf-lock-u">On · plays with the screen locked</b>' +
          '<small class="cf-lock-l">Free fades out on lock · unlock with Plus</small><small class="cf-lock-u">Lock-screen controls, timers to 8 hours</small></span></button>';
        timerCtl.parentNode.insertBefore(sleepCtl, timerCtl.nextSibling);
        $("#cfSleep").addEventListener("click", function () { gate("Playing with the screen locked", function () { toast("Sleep mode is on. Lock the screen whenever you like."); }); });
      }
    }
    // the sticky now-playing bar carries the same lock while sounds are on
    var miniActions = $(".mini-actions");
    if (miniActions) {
      var chip = document.createElement("button"); chip.type = "button"; chip.className = "cf-lock-chip"; chip.innerHTML = LOCK + CHECK + '<span class="cf-lock-l">Sleep mode</span><span class="cf-lock-u">Sleep mode on</span>';
      chip.addEventListener("click", function () { gate("Playing with the screen locked", function () { toast("Sleep mode is on. Lock the screen whenever you like."); }); });
      miniActions.appendChild(chip);
    }
    // the sleep sounds are free to play; the note under the heading says what the lock is for
    var sleepHead = document.querySelector("#sleep .group-head");
    if (sleepHead) {
      var hint = document.createElement("button"); hint.type = "button"; hint.className = "cf-hint";
      hint.innerHTML = LOCK + CHECK + '<span class="cf-lock-l">Free to play · keep them playing with the screen locked with Plus</span><span class="cf-lock-u">Plus: these keep playing with the screen locked</span>';
      hint.addEventListener("click", function () { gate("Playing with the screen locked", function () { toast("Sleep mode is on. Lock the screen whenever you like."); }); });
      sleepHead.appendChild(hint);
    }
    /* ---- sleep mode. Web Audio is paused whenever the app leaves the screen, so the room renders its mix to a
            looping file ahead of time and, when the screen locks, hands that file to the native player (Plus,
            or the one free trial lock). Coming back, the native player stops and the engine resumes. ---- */
    var room = window.ChladniRoom;
    var hand = { file: "", key: "", rendering: null, active: false, trial: false, since: 0, timer: null, wasLive: false, armedEnds: 0 };
    function canSleep() { var cp = CP(); return !!(cp && (cp.has() || !cp.store.get("sleepTrial"))); }
    function slog(s) { var cp = CP(); if (!cp) return; var l = cp.store.get("sleepLog", []); l.push(new Date().toTimeString().slice(0, 8) + " js " + s); if (l.length > 40) l = l.slice(-40); cp.store.set("sleepLog", l); }
    function wavBase64(buf) {
      var ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bytes = 44 + n * ch * 2, ab = new ArrayBuffer(bytes), dv = new DataView(ab);
      function str(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
      str(0, "RIFF"); dv.setUint32(4, bytes - 8, true); str(8, "WAVE"); str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, n * ch * 2, true);
      var chans = []; for (var c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
      var o = 44; for (var i = 0; i < n; i++) for (var k = 0; k < ch; k++) { var s = Math.max(-1, Math.min(1, chans[k][i])); dv.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2; }
      var u8 = new Uint8Array(ab), parts = [], CH = 0x8000; for (var p = 0; p < u8.length; p += CH) parts.push(String.fromCharCode.apply(null, u8.subarray(p, p + CH)));
      return btoa(parts.join(""));
    }
    /* the native player is told about the file while the app is still in the foreground; it starts the file
       itself when the app goes to the background, so nothing here has to run at the moment of the lock */
    function armNative() {
      var cp = CP(); if (!SA || !cp || !hand.file || !room || !room.live()) return Promise.resolve();
      var plus = cp.has(), trial = !plus && !cp.store.get("sleepTrial");
      if (!plus && !trial) return disarmNative();
      var title = ((status && status.textContent) || "").replace(/^playing\s+/i, "").split(" · ")[0] || "Resonance Room";
      var endsAt = room.timerEnds() ? room.timerEnds() / 1000 : 0;
      return SA.arm({ path: hand.file, title: title, subtitle: trial ? "Sleep mode · your free lock" : "Sleep mode", volume: 1, endsAt: endsAt, maxSeconds: trial ? 1200 : 0, trial: trial })
        .then(function () { hand.armedEnds = endsAt; hand.trial = trial; }).catch(function (e) { slog("arm failed " + (e && e.message)); });
    }
    function disarmNative() { hand.trial = false; if (!SA) return Promise.resolve(); return SA.disarm().catch(function () {}); }
    function prerender() {
      if (!room || !SA || !P.Filesystem || !room.live()) { hand.file = ""; hand.key = ""; return disarmNative().then(function () { return false; }); }
      var key = room.key(); if (key === hand.key && hand.file) return armNative().then(function () { return true; });
      if (hand.rendering) return hand.rendering;
      var t0 = Date.now();
      hand.rendering = room.render(30).then(function (buf) {
        if (!buf) return false;
        var data = wavBase64(buf), name = "sleep-" + (hand.file.indexOf("sleep-a") >= 0 ? "b" : "a") + ".wav";
        return P.Filesystem.writeFile({ path: name, data: data, directory: "CACHE" }).then(function (r) { hand.file = r.uri; hand.key = key; slog("rendered " + name + " in " + (Date.now() - t0) + " ms"); return armNative(); }).then(function () { return true; });
      }).catch(function (e) { slog("render failed " + (e && e.message)); return false; }).then(function (ok) { hand.rendering = null; return ok; });
      return hand.rendering;
    }
    function schedulePrerender() {
      clearTimeout(hand.timer);
      var live = room ? room.live() : false;
      if (!live) { hand.wasLive = false; hand.file = ""; hand.key = ""; disarmNative(); return; }
      var first = !hand.wasLive; hand.wasLive = true;
      hand.timer = setTimeout(function () { if (canSleep()) prerender(); }, first ? 300 : 2000);
    }
    if (status) new MutationObserver(schedulePrerender).observe(status, { childList: true, characterData: true, subtree: true, attributes: true });
    document.addEventListener("input", function (e) { if (e.target && e.target.matches && e.target.matches("input[type=range], select")) schedulePrerender(); });
    var pausedByLock = false;
    document.addEventListener("visibilitychange", function () {
      var cp = CP(), live = room ? room.live() : (status && status.getAttribute("data-live") === "1");
      if (document.hidden) {
        if (!live || !cp) return;
        var plus = cp.has(), trial = !plus && !cp.store.get("sleepTrial");
        if ((plus || trial) && SA && room) {
          hand.active = true; hand.since = Date.now(); slog("hidden, armed=" + !!hand.file);
          room.suspend();
          if (!hand.file) prerender();
        } else {
          slog("hidden, fading (free)");
          if (room) room.stopAll(1.0); else { var s = $("#stopAll"); if (s) s.click(); }
          pausedByLock = true;
        }
      } else if (hand.active) {
        hand.active = false;
        SA.state().then(function (st) {
          try { if (st && st.log) { var cp2 = CP(); if (cp2) cp2.store.set("sleepLog", (cp2.store.get("sleepLog", [])).concat(st.log.map(function (x) { return x + " (native)"; })).slice(-40)); } } catch (e) {}
          var ran = !!(st && st.ran), by = (st && st.stoppedBy) || "", wasTrial = !!(st && st.trial);
          var mins = Math.max(1, Math.round(((st && st.elapsed) || (Date.now() - hand.since) / 1000) / 60));
          return (st && st.playing ? SA.stop({ fade: 0.4 }) : Promise.resolve()).then(function () {
            if (ran && (by === "timer" || by === "trial" || by === "remote" || by === "interrupted")) { room.stopAll(0); if (by === "timer") toast("Faded out while the screen was locked — the timer ended."); }
            else room.resume();
            if (ran && wasTrial) { cp.store.set("sleepTrial", Date.now()); disarmNative(); setTimeout(function () { if (cp.trialEnded) cp.trialEnded(mins); }, 700); }
            else if (!ran && wasTrial) toast("Sleep mode didn't start: " + ((st && st.error) || "the mix wasn't ready yet. Give it a few seconds after pressing play, then lock."), { ms: 7000 });
          });
        }).catch(function () { room.resume(); });
      } else if (pausedByLock) {
        pausedByLock = false;
        toast("Faded out when the screen locked. Plus keeps playing.", { action: "See Plus", onAction: function () { if (cp) cp.paywall("Playing with the screen locked"); } });
      }
    });
    if (/[?&]try=1/.test(location.search)) setTimeout(function () { toast("Now lock your phone. Your first lock keeps the room playing, free, for 20 minutes.", { ms: 7000 }); }, 1800);
    // pomodoro boundaries become notifications, so the turns land even with the screen off
    document.addEventListener("room:pomodoro", function (ev) { pomodoroNotify(ev.detail); });
    // saved mixes
    var presets = $(".presets-ctl");
    if (presets) {
      var box = document.createElement("div"); box.className = "cf-mixes"; box.id = "cfMixes";
      presets.insertBefore(box, presets.firstChild);
      paintMixes(); document.addEventListener("cf:mixes", paintMixes); document.addEventListener("cf:plus", paintMixes);
    }
    // deep links: frequencies.html?preset=<id> starts a preset; ?mix=<id> restores a saved mix from the You tab
    var pm = /[?&]preset=([a-z]+)/.exec(location.search);
    if (pm) setTimeout(function () { var b = document.querySelector('.preset[data-preset="' + pm[1] + '"]'); if (b) b.click(); }, 500);
    var m = /[?&]mix=([^&]+)/.exec(location.search);
    if (m) { var cp0 = CP(); if (cp0) cp0.ready.then(function () { var mix = cp0.mixes.list().filter(function (x) { return x.id === decodeURIComponent(m[1]); })[0]; if (mix) setTimeout(function () { applyMix(mix); }, 400); }); }
  }
  function captureMix() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.tone[data-on="1"]'));
    var on = cards.map(function (c) { return c.id.replace(/^card-/, ""); });
    if (!on.length) return null;
    var meta = {}; ((window.ChladniRoom || {}).tones || []).forEach(function (t) { meta[t.id] = t; });
    var names = cards.map(function (c) { var h = c.querySelector("h3"); return h ? (h.firstChild && h.firstChild.nodeType === 3 ? h.firstChild.textContent : h.textContent).trim().split(" · ")[0] : c.id; });
    var bin = ($("#binBtn") || {}).getAttribute && $("#binBtn").getAttribute("data-on") === "1";
    var voices = on.map(function (id) { var lv = $("#lvl-" + id), tn = $("#tn-" + id), m = meta[id] || {}; return { id: id, hz: m.hz || 0, kind: m.kind || "", lv: lv ? parseFloat(lv.value) : 60, tn: tn ? parseFloat(tn.value) : 0 }; });
    return { tones: on, voices: voices, timbre: ($("#timbre") || {}).value, beat: ($("#beat") || {}).value, bin: bin, breath: $("#breathBtn") ? $("#breathBtn").getAttribute("data-on") === "1" : true, master: ($("#master") || {}).value, timer: ($("#timer") || {}).value,
      summary: (names.length ? names : on).join(" + ") + (bin ? " · binaural " + ($("#beat") || {}).value + " Hz" : "") };
  }
  function applyMix(mix) {
    hImpact("MEDIUM");
    var set = function (id, v) { var el = $(id); if (el && v != null) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } };
    set("#timbre", mix.timbre); set("#beat", mix.beat); set("#master", mix.master); set("#timer", mix.timer);
    var mv = $("#masterVal"); if (mv && mix.master != null) mv.textContent = mix.master;
    [["#binBtn", mix.bin], ["#breathBtn", mix.breath]].forEach(function (p) { var b = $(p[0]); if (b && (b.getAttribute("data-on") === "1") !== !!p[1]) b.click(); });
    (mix.voices || []).forEach(function (v) { set("#lvl-" + v.id, v.lv); if (v.tn) set("#tn-" + v.id, v.tn); });
    Array.prototype.forEach.call(document.querySelectorAll(".tone"), function (card) {
      var id = card.id.replace(/^card-/, ""), on = card.getAttribute("data-on") === "1", want = mix.tones.indexOf(id) >= 0, go = $("#go-" + id);
      if (go && on !== want) go.click();
    });
    var pl = $("#player"); if (pl && window.innerWidth < 900) { var box = pl.getBoundingClientRect(); if (box.top < 0 || box.top > window.innerHeight * 0.55) pl.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); }
  }
  /* a mix as a picture: the room's rings, one per voice, sized by pitch (sounds sit on the outer ring) */
  function mixThumb(cv, mix) {
    var S = cv.width, x = cv.getContext("2d"), c = S / 2, R = S * 0.42;
    var cs = getComputedStyle(root), accent = cs.getPropertyValue("--accent").trim() || "#d3a851", sound = cs.getPropertyValue("--sound").trim() || "#64bac8", bg = cs.getPropertyValue("--plate-bg").trim() || "#090c09";
    x.fillStyle = bg; x.fillRect(0, 0, S, S);
    x.strokeStyle = sound; x.globalAlpha = 0.14; x.lineWidth = 1;
    for (var i = 1; i <= 4; i++) { x.beginPath(); x.arc(c, c, R * i / 4, 0, Math.PI * 2); x.stroke(); }
    x.globalAlpha = 1;
    var voices = mix.voices || (mix.tones || []).map(function (id) { return { id: id, hz: /^t(\d+)/.test(id) ? parseFloat(id.slice(1)) : 0, kind: /^t\d/.test(id) ? "" : id }; });
    voices.forEach(function (v) {
      var base = v.kind ? 0.95 : Math.min(0.95, Math.max(0.2, (Math.log(v.hz || 200) - Math.log(100)) / (Math.log(1000) - Math.log(100)) * 0.75 + 0.2));
      x.strokeStyle = v.kind ? accent : sound; x.lineWidth = v.kind ? S * 0.05 : S * 0.02;
      x.shadowColor = x.strokeStyle; x.shadowBlur = S * 0.06;
      x.beginPath(); x.arc(c, c, R * base, 0, Math.PI * 2); x.stroke(); x.shadowBlur = 0;
    });
    x.fillStyle = accent; x.beginPath(); x.arc(c, c, S * 0.05, 0, Math.PI * 2); x.fill();
  }
  function mixCard(m, href) {
    var tag = href ? "a" : "button", attrs = href ? ' href="' + href + '"' : ' type="button"';
    return '<' + tag + ' class="cf-mixcard"' + attrs + ' data-mix="' + escapeHtml(m.id) + '"><canvas width="144" height="144" data-mix-thumb="' + escapeHtml(JSON.stringify({ tones: m.tones, voices: m.voices || null })) + '"></canvas><b>' + escapeHtml(m.name) + '</b><small>' + escapeHtml(m.summary || "") + '</small><span class="cf-mixcard-play">' + ICONS.play + '</span></' + tag + '>';
  }
  function paintThumbs(scope) { Array.prototype.forEach.call((scope || document).querySelectorAll("canvas[data-mix-thumb]"), function (cv) { try { mixThumb(cv, JSON.parse(cv.getAttribute("data-mix-thumb"))); } catch (e) {} cv.removeAttribute("data-mix-thumb"); }); }
  function paintMixes() {
    var box = $("#cfMixes"), cp = CP(); if (!box || !cp) return;
    var list = cp.mixes.list(), canSave = cp.mixes.canSave();
    box.innerHTML = '<div class="cf-mixes-head"><span class="lbl">My mixes' + (cp.has() ? "" : ' <em class="cf-count">' + list.length + ' of 1 free</em>') + '</span><button class="cf-save' + (canSave ? "" : " cf-save--locked") + '" type="button" id="cfSaveMix">' + (canSave ? "" : LOCK) + 'Save mix</button></div>' +
      (list.length ? '<div class="cf-gallery">' + list.map(function (m) { return mixCard(m); }).join("") + '</div>' : '<p class="cf-mixes-empty">Start a few tones, then save the mix to come back to it. Saved mixes show here as a gallery, and on your Home Screen widget.</p>');
    paintThumbs(box);
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
    widgetSync();
  }

  /* ---- Home Screen widgets: the saved mixes and the presets, each a deep link the app plays on arrival ---- */
  var PRESET_LIST = [["winddown", "Wind down", "432 warm pad · theta beat"], ["sleep", "Deep sleep", "136.1 Om · brown noise"], ["rain", "Rainy night", "rain · 174 hum"], ["shore", "Shoreline", "ocean waves · 136.1 Om"], ["work", "Work", "stream · beta 15 beat"], ["focus", "Focus", "285 carrier · gamma 40"], ["reset", "Reset", "528 pad · 174 hum"]];
  function widgetSync() {
    var cp = CP(); if (!WB || !cp) return;
    var items = cp.mixes.list().map(function (m) { return { id: "m-" + m.id, name: m.name, summary: m.summary || "", url: "chladni://play?mix=" + encodeURIComponent(m.id), kind: "mix" }; })
      .concat(PRESET_LIST.map(function (p) { return { id: "p-" + p[0], name: p[1], summary: p[2], url: "chladni://play?preset=" + p[0], kind: "preset" }; })).slice(0, 8);
    try { WB.update({ items: items }).catch(function () {}); } catch (e) {}
  }
  function handleDeepLink(url) {
    var m = /chladni:\/\/play\?(preset|mix)=([^&]+)/.exec(url || ""); if (!m) return false;
    var target = "frequencies.html?" + m[1] + "=" + m[2];
    try { if (sessionStorage.getItem("cf:lastLink") === url + "|" + Date.now().toString().slice(0, -4)) return true; sessionStorage.setItem("cf:lastLink", url + "|" + Date.now().toString().slice(0, -4)); } catch (e) {}
    if (page === "frequencies.html" && window.ChladniRoom) {
      if (m[1] === "preset") window.ChladniRoom.preset(m[2]);
      else { var cp = CP(); if (cp) { var mix = cp.mixes.list().filter(function (x) { return x.id === decodeURIComponent(m[2]); })[0]; if (mix) applyMix(mix); } }
    } else location.href = target;
    return true;
  }

  /* ---- reminders: local notifications, scheduled on the phone, nothing sent anywhere ---- */
  var LN = P.LocalNotifications;
  function notifAllowed() { if (!LN) return Promise.resolve(false); return LN.checkPermissions().then(function (r) { return r.display === "granted"; }).catch(function () { return false; }); }
  function notifAsk() { if (!LN) return Promise.resolve(false); return LN.requestPermissions().then(function (r) { return r.display === "granted"; }).catch(function () { return false; }); }
  function scheduleReminders() {
    var cp = CP(); if (!LN || !cp) return;
    var r = cp.store.get("reminders", { bedtime: false, time: "22:00", nudges: true });
    notifAllowed().then(function (ok) {
      if (!ok) return;
      LN.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }] }).catch(function () {}).then(function () {
        var list = [];
        if (r.bedtime) { var hm = (r.time || "22:00").split(":"); list.push({ id: 1, title: "Time to wind down", body: "The room is ready: rain, 174 Hz, a timer. Sleep well.", schedule: { on: { hour: parseInt(hm[0], 10), minute: parseInt(hm[1], 10) }, allowWhileIdle: true }, extra: { url: "frequencies.html?preset=sleep" } }); }
        if (r.nudges !== false) {
          var d3 = new Date(Date.now() + 3 * 864e5); d3.setHours(20, 30, 0, 0);
          var d10 = new Date(Date.now() + 10 * 864e5); d10.setHours(20, 30, 0, 0);
          list.push({ id: 2, title: "The room has been quiet", body: "Rain and a low hum are a tap away. Ten minutes before bed.", schedule: { at: d3, allowWhileIdle: true }, extra: { url: "frequencies.html?preset=rain" } });
          list.push({ id: 3, title: "Your mixes are waiting", body: "Come and sit in the Resonance Room for a while.", schedule: { at: d10, allowWhileIdle: true }, extra: { url: "frequencies.html" } });
        }
        if (list.length) LN.schedule({ notifications: list }).catch(function () {});
      });
    });
  }
  var pomoIds = []; for (var pi = 10; pi < 30; pi++) pomoIds.push({ id: pi });
  function pomodoroNotify(st) {
    if (!LN) return;
    LN.cancel({ notifications: pomoIds }).catch(function () {});
    if (!st || !st.on) return;
    notifAllowed().then(function (ok) { return ok || notifAsk(); }).then(function (ok) {
      if (!ok) return;
      var list = [], t = st.ends, phase = st.phase, round = st.round, id = 10;
      for (var i = 0; i < 8; i++) {
        var next = phase === "work" ? "rest" : "work";
        list.push({ id: id++, title: next === "rest" ? "Sprint " + round + " done. Rest." : "Back to work", body: next === "rest" ? "The room dips for the break. A soft chime in the app." : "Sprint " + (round + 1) + ". The room comes back up.", schedule: { at: new Date(t), allowWhileIdle: true }, extra: { url: "frequencies.html" } });
        var mins = next === "work" ? st.work : ((round % 4 === 0) ? st.rest * 3 : st.rest);
        if (next === "work") round++;
        t += mins * 60000; phase = next;
      }
      LN.schedule({ notifications: list }).catch(function () {});
    });
  }
  function wireNotifications() {
    if (!LN) return;
    try { LN.addListener("localNotificationActionPerformed", function (e) { var url = e && e.notification && e.notification.extra && e.notification.extra.url; if (url) location.href = url; }); } catch (e) {}
    var cp = CP(); if (cp) cp.ready.then(scheduleReminders);
  }
  function wireDeepLinks() {
    var A = P.App; if (!A) return;
    try { A.addListener("appUrlOpen", function (e) { handleDeepLink(e && e.url); }); } catch (e) {}
    try { A.getLaunchUrl().then(function (r) { if (r && r.url) handleDeepLink(r.url); }).catch(function () {}); } catch (e) {}
  }
  function saveMix(mix) {
    var cp = CP(), name = prompt("Name this mix", mix.summary.length > 28 ? "Evening mix" : mix.summary);
    if (name == null) return; mix.name = name.trim() || "My mix";
    cp.mixes.save(mix); hNotify("SUCCESS"); toast("Saved “" + mix.name + "”. Hold a mix to delete it.");
  }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* ---- boot ---- */
  function hideSplash() { try { if (P.SplashScreen) P.SplashScreen.hide({ fadeOutDuration: 220 }); } catch (e) {} }
  window.ChladniNative = { sheetify: sheetify, toast: toast, haptic: { impact: hImpact, select: hSelect, notify: hNotify }, lockBadge: lockBadge, gate: gate, icons: { lock: LOCK, check: CHECK, play: ICONS.play },
    mixThumb: mixThumb, mixCard: mixCard, paintThumbs: paintThumbs, reminders: { schedule: scheduleReminders, ask: notifAsk, allowed: notifAllowed }, widgetSync: widgetSync };
  function ready() {
    buildTabBar();
    if (page === "index.html") { wirePlates(); simplifyPlates(); }
    if (page === "frequencies.html") { wireRoom(); simplifyRoom(); }
    if (page === "law-of-one.html") simplifyLaw();
    wireNotifications(); wireDeepLinks();
    var cp0 = CP(); if (cp0) cp0.ready.then(function () { widgetSync(); document.addEventListener("cf:mixes", widgetSync); if (!/[?&](sheet|snap)=/.test(location.search)) { tour(); signInNudge(); } });
    requestAnimationFrame(function () { requestAnimationFrame(hideSplash); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
  setTimeout(hideSplash, 2500);
})();
