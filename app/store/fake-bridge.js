// A stand-in for the Capacitor bridge, injected into every frame when rendering screenshots or running the
// smoke test in a desktop browser, so the pages take their native layout (tab bar, sheets, You tab).
// Nothing here is shipped in the app.
window.__calls = [];
window.Capacitor = {
  isNativePlatform: function () { return true; },
  registerPlugin: function (n) { return window.Capacitor.Plugins[n]; },
  Plugins: {
    StatusBar: { setStyle: function (o) { window.__calls.push("StatusBar:" + o.style); } },
    Browser: { open: function (o) { window.__calls.push("Browser:" + o.url); } },
    SplashScreen: { hide: function () { window.__calls.push("Splash:hide"); } },
    Haptics: { impact: function (o) { window.__calls.push("impact:" + o.style); }, selectionStart: function () {}, selectionChanged: function () { window.__calls.push("select"); }, selectionEnd: function () {}, notification: function (o) { window.__calls.push("notify:" + o.type); } },
    Preferences: {
      get: function (o) { return Promise.resolve({ value: sessionStorage.getItem("pref:" + o.key) }); },
      set: function (o) { sessionStorage.setItem("pref:" + o.key, o.value); return Promise.resolve(); },
      remove: function (o) { sessionStorage.removeItem("pref:" + o.key); return Promise.resolve(); },
      clear: function () { return Promise.resolve(); }
    },
    Purchases: {
      getProducts: function () { return Promise.resolve({ products: [{ id: "lol.iamra.chladni.plus.yearly", price: "$7.99", kind: "subscription", period: "year", trial: "7 day" }, { id: "lol.iamra.chladni.tip.small", price: "$0.99", kind: "consumable" }] }); },
      entitlements: function () { return Promise.resolve({ plus: sessionStorage.getItem("fakeplus") === "1", lifetime: false, expires: Date.now() + 86400000 * 30, productIds: [] }); },
      purchase: function (o) { window.__calls.push("buy:" + o.id); sessionStorage.setItem("fakeplus", "1"); return Promise.resolve({ state: "purchased", id: o.id, entitlements: { plus: true, expires: Date.now() + 86400000 * 365, productIds: [o.id] } }); },
      restore: function () { return Promise.resolve({ plus: sessionStorage.getItem("fakeplus") === "1" }); },
      manageSubscriptions: function () { window.__calls.push("manage"); return Promise.resolve(); },
      addListener: function () {}
    },
    SocialLogin: {
      initialize: function (o) { window.__calls.push("social:init:" + Object.keys(o).join("+")); return Promise.resolve(); },
      login: function (o) { window.__calls.push("social:login:" + o.provider); return Promise.resolve({ provider: o.provider, result: { profile: { user: "001", email: "matt@example.com", givenName: "Matt", familyName: "Finley" }, idToken: "x" } }); },
      logout: function () { return Promise.resolve(); }
    },
    Share: { share: function (o) { window.__calls.push("share:" + (o.files || []).length); return Promise.resolve(); } },
    Filesystem: { writeFile: function (o) { window.__calls.push("write:" + o.path + ":" + o.data.length); return Promise.resolve({ uri: "file:///cache/" + o.path }); } }
  }
};
