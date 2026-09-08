// Account, Slowtide Plus and the tip jar. Loaded after native.js on every page; inert in a browser.
// Purchases go through the app's StoreKit plugin (Apple verifies and remembers them per Apple ID);
// sign-in is optional and, for now, an identity kept on this phone.
(function () {
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
  var P = cap.Plugins || {}, CFG = window.CHLADNI_CONFIG || {};
  var Purchases = P.Purchases || (cap.registerPlugin ? cap.registerPlugin("Purchases") : null);
  var Social = P.SocialLogin, Prefs = P.Preferences;
  var N = function () { return window.ChladniNative || {}; };
  var EULA = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

  /* ---- storage: localStorage for speed, Preferences as the durable copy ---- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("cf:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("cf:" + k, JSON.stringify(v)); } catch (e) {} try { if (Prefs) Prefs.set({ key: "cf:" + k, value: JSON.stringify(v) }); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem("cf:" + k); } catch (e) {} try { if (Prefs) Prefs.remove({ key: "cf:" + k }); } catch (e) {} },
    restore: function (keys) {
      if (!Prefs) return Promise.resolve();
      return Promise.all(keys.map(function (k) {
        var have = null; try { have = localStorage.getItem("cf:" + k); } catch (e) {}
        if (have != null) return null;
        return Prefs.get({ key: "cf:" + k }).then(function (r) { if (r && r.value != null) localStorage.setItem("cf:" + k, r.value); }).catch(function () {});
      }));
    },
    wipe: function () { try { Object.keys(localStorage).filter(function (k) { return k.indexOf("cf:") === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} try { if (Prefs) Prefs.clear(); } catch (e) {} }
  };

  /* ---- products ---- */
  var PLANS = [
    { id: "lol.iamra.chladni.plus.yearly", label: "Yearly", price: "$7.99", per: "per year", note: "two months free", best: true },
    { id: "lol.iamra.chladni.plus.monthly", label: "Monthly", price: "$0.99", per: "per month", note: "cancel any time" },
    { id: "lol.iamra.chladni.plus.lifetime", label: "Lifetime", price: "$14.99", per: "once", note: "yours for good" }
  ];
  var TIPS = [
    { id: "lol.iamra.chladni.tip.small", label: "A coffee", price: "$0.99" },
    { id: "lol.iamra.chladni.tip.medium", label: "A lunch", price: "$2.99" },
    { id: "lol.iamra.chladni.tip.large", label: "A dinner", price: "$9.99" }
  ];
  var productsLoaded = false, productsLoading = null, productsError = "";
  function loadProducts() {
    if (productsLoaded || !Purchases) return Promise.resolve();
    if (productsLoading) return productsLoading;
    productsLoading = Purchases.getProducts({}).then(function (r) {
      var by = {}; (r.products || []).forEach(function (p) { by[p.id] = p; });
      PLANS.concat(TIPS).forEach(function (x) { if (by[x.id]) { x.price = by[x.id].price; x.live = true; if (by[x.id].trial) x.trial = by[x.id].trial; } });
      productsLoaded = PLANS.concat(TIPS).some(function (x) { return x.live; });
      productsError = productsLoaded ? "" : "The App Store returned no products.";
    }).catch(function (e) { productsError = (e && e.message) || "Couldn't reach the App Store."; })
      .then(function () { productsLoading = null; });
    return productsLoading;
  }

  /* ---- entitlements ---- */
  var ent = store.get("ent", { plus: false, lifetime: false, expires: 0, productIds: [] });
  function setEnt(e) { if (!e) return; ent = { plus: !!e.plus, lifetime: !!e.lifetime, expires: e.expires || 0, productIds: e.productIds || [] }; store.set("ent", ent); document.dispatchEvent(new CustomEvent("cf:plus", { detail: ent })); }
  function refresh() { if (!Purchases) return Promise.resolve(ent); return Purchases.entitlements().then(function (e) { setEnt(e); return ent; }).catch(function () { return ent; }); }
  function has() { return !!ent.plus; }
  try { if (Purchases && Purchases.addListener) Purchases.addListener("entitlements", setEnt); } catch (e) {}

  /* ---- account ---- */
  var account = store.get("account", null), socialReady = false;
  function initSocial() {
    if (socialReady || !Social) return Promise.resolve();
    var opts = { apple: { clientId: "lol.iamra.chladni" } };
    if (CFG.googleIosClientId) opts.google = { iOSClientId: CFG.googleIosClientId, mode: "online" };
    return Social.initialize(opts).then(function () { socialReady = true; }).catch(function () { socialReady = true; });
  }
  function signIn(provider) {
    if (!Social) return Promise.reject(new Error("Sign-in isn't available in this build."));
    return initSocial().then(function () {
      return Social.login({ provider: provider, options: provider === "apple" ? { scopes: ["email", "name"] } : { scopes: ["email", "profile"] } });
    }).then(function (res) {
      var r = (res && res.result) || {}, pr = r.profile || {};
      var name = provider === "apple" ? [pr.givenName, pr.familyName].filter(Boolean).join(" ") : (pr.name || [pr.givenName, pr.familyName].filter(Boolean).join(" "));
      account = { provider: provider, id: pr.user || pr.id || "", name: name || "", email: pr.email || "", avatar: pr.imageUrl || "", at: Date.now() };
      store.set("account", account);
      document.dispatchEvent(new CustomEvent("cf:account", { detail: account }));
      return account;
    });
  }
  function signOut() {
    var p = account && Social ? Social.logout({ provider: account.provider }).catch(function () {}) : Promise.resolve();
    return p.then(function () { account = null; store.del("account"); document.dispatchEvent(new CustomEvent("cf:account", { detail: null })); });
  }
  function deleteData() { return signOut().then(function () { store.wipe(); ent = { plus: false, lifetime: false, expires: 0, productIds: [] }; return refresh(); }); }

  /* ---- mixes (the Resonance Room's saved states) ---- */
  var mixesApi = {
    list: function () { return store.get("mixes", []); },
    save: function (mix) { var l = mixesApi.list(); mix.id = mix.id || String(Date.now()); l.unshift(mix); store.set("mixes", l); document.dispatchEvent(new CustomEvent("cf:mixes")); return mix; },
    remove: function (id) { store.set("mixes", mixesApi.list().filter(function (m) { return m.id !== id; })); document.dispatchEvent(new CustomEvent("cf:mixes")); },
    canSave: function () { return has() || mixesApi.list().length < 1; }
  };

  /* ---- sheets ---- */
  function sheet(html, cls) {
    var old = document.getElementById("cfSheet"); if (old) { try { old.close(); } catch (e) {} old.remove(); }
    var d = document.createElement("dialog"); d.className = "info info--cf " + (cls || ""); d.id = "cfSheet";
    d.innerHTML = html;
    document.body.appendChild(d);
    var n = N(); if (n.sheetify) n.sheetify(d);
    d.addEventListener("close", function () { setTimeout(function () { d.remove(); }, 50); });
    d.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    return d;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function trialText(p) { return p.trial ? p.trial.replace(/^(\d+)\s+(\w+)$/, function (m, n, u) { return n + " " + u + (n === "1" ? "" : "s") + " free"; }) : ""; }
  function planButtons(selected) {
    return PLANS.map(function (p) {
      return '<button class="cf-plan' + (p.best ? " cf-plan--best" : "") + '" type="button" role="radio" aria-pressed="' + (p.id === selected ? "true" : "false") + '" data-plan="' + p.id + '"><b>' + esc(p.label) + '</b><span>' + esc(p.price) + ' <em>' + esc(p.per) + '</em></span><small>' + esc(p.trial ? trialText(p) + ", then " + p.price : p.note) + '</small>' + (p.best ? '<i>Best value</i>' : "") + '</button>';
    }).join("");
  }
  /* the paywall follows the iOS pattern: pick a plan, then one clear button does the buying; the button
     also says plainly when the App Store hasn't answered, instead of a tap that does nothing */
  function paywall(reason, onSuccess) {
    var n = N(); if (n.haptic) n.haptic.impact("LIGHT");
    var selected = PLANS[0].id;
    var d = sheet(
      '<div class="info-head"><p class="eyebrow">Slowtide Plus</p><button class="info-close" type="button" data-close>Not now</button></div>' +
      '<div class="info-text cf-text">' +
      '<h2>Keep the room <span class="amp">humming</span>.</h2>' +
      (reason ? '<p class="cf-reason">' + esc(reason) + ' is part of Plus.</p>' : "") +
      '<ul class="cf-perks">' +
      '<li><b>Sleep mode.</b> Rain, surf and every tone keep playing with the screen locked, with lock-screen controls and timers up to 8 hours.</li>' +
      '<li><b>Saved mixes.</b> Keep as many as you like. Free keeps one.</li>' +
      '<li><b>Clean shares.</b> Plate stills for Instagram without the iamra.lol mark.</li>' +
      '<li><b>A supporter mark,</b> and a solo project that stays free for everyone else.</li>' +
      '</ul>' +
      '<div class="cf-plans" role="radiogroup" aria-label="Plan">' + planButtons(selected) + '</div>' +
      '<button class="cf-cta" type="button" data-cta disabled><span>Connecting to the App Store…</span></button>' +
      (store.get("sleepTrialUsed") ? '<p class="cf-try cf-try--used">Your free lock has been used: the room played on with the screen off. Plus does that every night.</p>'
        : '<div class="cf-try"><b>Try sleep mode first, free.</b> Start a tone, lock your phone: your first lock keeps the room playing for twenty minutes. <button class="cf-link" type="button" data-try>Try it now</button></div>') +
      '<p class="cf-fine">Payment is charged to your Apple ID at confirmation. Subscriptions renew automatically at the same price until cancelled at least 24 hours before the end of the period, in Settings → Apple ID → Subscriptions. <a href="' + EULA + '">Terms of Use</a> · <a href="privacy.html">Privacy</a></p>' +
      '<div class="cf-row"><button class="cf-link" type="button" data-restore>Restore purchases</button></div>' +
      '</div>');
    var cta = d.querySelector("[data-cta]");
    function plan() { return PLANS.filter(function (p) { return p.id === selected; })[0]; }
    function paintCta() {
      var p = plan();
      cta.removeAttribute("data-error");
      if (!Purchases) { cta.disabled = true; cta.innerHTML = "<span>Purchases aren't available in this build</span>"; return; }
      if (productsLoading && !productsLoaded) { cta.disabled = true; cta.innerHTML = "<span>Connecting to the App Store…</span>"; return; }
      if (!p.live) { cta.disabled = false; cta.setAttribute("data-error", "1"); cta.innerHTML = "<span>App Store unavailable · tap to retry</span><small>" + esc(productsError || "Check your connection") + "</small>"; return; }
      cta.disabled = false;
      cta.innerHTML = p.trial ? "<span>Try " + esc(trialText(p)) + "</span><small>then " + esc(p.price) + " " + esc(p.per) + " · cancel any time</small>"
        : p.per === "once" ? "<span>Get Plus for " + esc(p.price) + "</span><small>one payment · yours for good</small>"
        : "<span>Start Plus · " + esc(p.price) + " " + esc(p.per) + "</span><small>cancel any time in Settings</small>";
    }
    function paintPlans() { var box = d.querySelector(".cf-plans"); if (box) box.innerHTML = planButtons(selected); paintCta(); }
    paintCta();
    loadProducts().then(paintPlans);
    d.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-plan]") : null;
      if (b) { selected = b.getAttribute("data-plan"); if (n.haptic) n.haptic.select(); paintPlans(); return; }
      if (ev.target.closest && ev.target.closest("[data-cta]")) {
        if (!plan().live) { cta.disabled = true; cta.innerHTML = "<span>Connecting to the App Store…</span>"; productsLoaded = false; loadProducts().then(paintPlans); return; }
        buy(selected, cta, function () { d.close(); if (onSuccess) onSuccess(); }, "<span>Waiting for the App Store…</span>");
        return;
      }
      if (ev.target.closest && ev.target.closest("[data-restore]")) restore(ev.target.closest("[data-restore]"));
      if (ev.target.closest && ev.target.closest("[data-try]")) {
        d.close();
        if (/frequencies\.html$/.test(location.pathname)) toast("Start a tone, then lock your phone. Your first lock plays free for 20 minutes.", { ms: 6000 });
        else location.href = "frequencies.html?preset=sleep&try=1";
      }
    });
    return d;
  }
  /* after the free lock: the room played on with the screen off, and this is what that was */
  function trialEnded(minutes) {
    var d = sheet(
      '<div class="info-head"><p class="eyebrow">Sleep mode</p><button class="info-close" type="button" data-close>Not now</button></div>' +
      '<div class="info-text cf-text">' +
      '<h2>That was <span class="amp">sleep mode</span>.</h2>' +
      '<p class="info-blurb">Your first lock was on us: the room kept playing with the screen off' + (minutes ? " for " + minutes + " minute" + (minutes === 1 ? "" : "s") : "") + '. Plus does that every night, with lock-screen controls and timers up to eight hours, from $0.99 a month.</p>' +
      '<div class="cf-row"><button class="cf-primary" type="button" data-see>See Plus</button></div>' +
      '<p class="cf-fine">From now on, free fades out when the screen locks.</p>' +
      '</div>');
    d.addEventListener("click", function (ev) { if (ev.target.closest && ev.target.closest("[data-see]")) { d.close(); setTimeout(function () { paywall("Playing with the screen locked"); }, 120); } });
    return d;
  }
  function buy(id, btn, done, busyHtml) {
    if (!Purchases) { toast("Purchases aren't available in this build."); return; }
    var n = N(); if (n.haptic) n.haptic.impact("LIGHT");
    var was = btn ? btn.innerHTML : "";
    if (btn) { btn.setAttribute("data-busy", "1"); btn.disabled = true; if (busyHtml) btn.innerHTML = busyHtml; }
    var restoreBtn = function () { if (btn) { btn.removeAttribute("data-busy"); btn.disabled = false; if (busyHtml) btn.innerHTML = was; } };
    var item = PLANS.concat(TIPS).filter(function (x) { return x.id === id; })[0];
    var ready = item && item.live ? Promise.resolve() : loadProducts();
    ready.then(function () {
      if (item && !item.live) { restoreBtn(); toast(productsError ? "App Store: " + productsError : "The App Store didn't return that product. Try again in a moment."); return; }
      return Purchases.purchase({ id: id }).then(function (r) {
        restoreBtn();
      if (btn) { btn.removeAttribute("data-busy"); btn.disabled = false; }
        if (r.state === "purchased") {
          if (r.entitlements) setEnt(r.entitlements); else refresh();
          if (TIPS.some(function (t) { return t.id === id; })) { store.set("tips", (store.get("tips", 0) || 0) + 1); document.dispatchEvent(new CustomEvent("cf:tips")); }
          else toast("Plus is on. Sleep mode, 8-hour timers, unlimited mixes and clean shares are unlocked.", { ms: 5000 });
          if (n.haptic) n.haptic.notify("SUCCESS");
          if (done) done(r);
        } else if (r.state === "pending") { toast("Waiting for approval — it unlocks once it's confirmed."); }
      });
    }).catch(function (e) {
      restoreBtn();
      toast((e && e.message) || "That didn't go through.");
    });
  }
  function restore(btn) {
    if (!Purchases) return;
    if (btn) btn.textContent = "Checking…";
    Purchases.restore().then(function (e) { setEnt(e); if (btn) btn.textContent = "Restore purchases"; toast(e && e.plus ? "Plus restored. Welcome back." : "No Plus purchase found for this Apple ID."); })
      .catch(function () { if (btn) btn.textContent = "Restore purchases"; toast("Couldn't reach the App Store."); });
  }
  function tipJar() {
    var d = sheet(
      '<div class="info-head"><p class="eyebrow">Tip jar</p><button class="info-close" type="button" data-close>Close</button></div>' +
      '<div class="info-text cf-text">' +
      '<h2>Buy the plates a <span class="amp">coffee</span>.</h2>' +
      '<p class="info-blurb">One-off, no subscription, nothing unlocks — it just keeps a solo project going. Thank you.</p>' +
      '<div class="cf-tips">' + TIPS.map(function (t) { return '<button class="cf-tip" type="button" data-buy="' + t.id + '"><b>' + esc(t.price) + '</b><span>' + esc(t.label) + '</span></button>'; }).join("") + '</div>' +
      '<p class="cf-fine">Charged to your Apple ID. <a href="' + EULA + '">Terms of Use</a></p>' +
      '</div>');
    loadProducts().then(function () { d.querySelectorAll(".cf-tip").forEach(function (b) { var t = TIPS.filter(function (x) { return x.id === b.getAttribute("data-buy"); })[0]; if (t) b.querySelector("b").textContent = t.price; }); });
    d.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-buy]") : null;
      if (b) buy(b.getAttribute("data-buy"), b, function () {
        d.querySelector(".info-text").innerHTML = '<div class="cf-thanks"><svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 7.4C6.4 3.2 17.6 3.2 21.6 7.4"/><path d="M1.8 12C6 6.4 18 6.4 22.2 12C18 17.6 6 17.6 1.8 12Z"/><circle cx="12" cy="12" r="2.9"/><path d="M22.2 12L24 11.2M15 17.4L15.5 22.6M9 17.3C7.8 19.7 5.7 21.7 3.4 21C2 20.5 2.2 18.7 3.6 18.6C4.6 18.4 4.9 19.3 4.5 19.6"/></g><circle cx="12" cy="12" r="1.1" fill="currentColor"/></svg><h2>Thank you.</h2><p class="info-blurb">That went straight into keeping the site and the app alive. You\'re a supporter now.</p><div class="cf-row"><button class="cf-primary" type="button" data-close>Back to the plates</button></div></div>';
        d.querySelector("[data-close]").addEventListener("click", function () { d.close(); });
      });
    });
    return d;
  }
  function accountSheet() {
    var d = sheet(
      '<div class="info-head"><p class="eyebrow">Account</p><button class="info-close" type="button" data-close>Close</button></div>' +
      '<div class="info-text cf-text">' +
      '<h2>Sign in, if you <span class="amp">like</span>.</h2>' +
      '<p class="info-blurb">Optional. It attaches your saved mixes and settings to you, ready for sync between devices. Everything works without it, and nothing is shared or sold.</p>' +
      '<div class="cf-signin">' +
      '<button class="cf-apple" type="button" data-provider="apple"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.365 12.79c-.026-2.62 2.14-3.88 2.237-3.94-1.22-1.78-3.115-2.024-3.79-2.052-1.615-.164-3.15.95-3.97.95-.82 0-2.08-.927-3.42-.902-1.76.026-3.38 1.024-4.29 2.6-1.83 3.17-.47 7.87 1.31 10.44.87 1.26 1.91 2.67 3.27 2.62 1.31-.052 1.81-.85 3.4-.85 1.58 0 2.03.85 3.42.82 1.41-.026 2.3-1.28 3.16-2.55 1-1.46 1.41-2.87 1.43-2.94-.031-.013-2.74-1.05-2.767-4.19zM13.76 5.1c.72-.88 1.21-2.1 1.08-3.32-1.04.043-2.3.694-3.05 1.57-.67.774-1.26 2.02-1.1 3.21 1.16.09 2.35-.59 3.07-1.46z"/></svg>Sign in with Apple</button>' +
      (CFG.googleIosClientId ? '<button class="cf-google" type="button" data-provider="google"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Continue with Google</button>' : "") +
      '</div>' +
      '<p class="cf-fine">With Apple you can hide your email. We keep only a name and email, on this phone. <a href="privacy.html">Privacy</a></p>' +
      '</div>');
    d.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-provider]") : null; if (!b) return;
      b.disabled = true; b.setAttribute("data-busy", "1");
      signIn(b.getAttribute("data-provider")).then(function (a) { var n = N(); if (n.haptic) n.haptic.notify("SUCCESS"); d.close(); toast("Signed in" + (a.name ? " as " + a.name : "") + "."); })
        .catch(function (e) { b.disabled = false; b.removeAttribute("data-busy"); var m = (e && e.message) || ""; if (!/cancel/i.test(m)) toast(m || "Sign-in didn't complete."); });
    });
    return d;
  }
  function toast(t, opts) { var n = N(); if (n.toast) n.toast(t, opts); }

  /* ---- boot ---- */
  var booted = store.restore(["ent", "account", "mixes", "tips", "onboarded", "sleepTrialUsed", "reminders", "sleepLog"]).then(function () {
    ent = store.get("ent", ent); account = store.get("account", account);
    return refresh();
  });
  // warm the price list so the paywall opens with real prices, and honour ?sheet=paywall|tips|account
  loadProducts();
  var want = /[?&]sheet=(paywall|tips|account)/.exec(location.search);
  if (want) booted.then(function () { setTimeout(function () { if (want[1] === "paywall") paywall(""); else if (want[1] === "tips") tipJar(); else accountSheet(); }, 500); });

  window.ChladniPlus = {
    ready: booted, has: has, ent: function () { return ent; }, refresh: refresh, paywall: paywall, tipJar: tipJar, restore: restore, trialEnded: trialEnded,
    manage: function () { try { if (Purchases) Purchases.manageSubscriptions(); } catch (e) {} },
    account: { get: function () { return account; }, sheet: accountSheet, signIn: signIn, signOut: signOut, deleteData: deleteData },
    mixes: mixesApi, store: store, plans: PLANS, tips: TIPS, loadProducts: loadProducts, tipCount: function () { return store.get("tips", 0) || 0; },
    version: CFG.version || ""
  };
})();
