// Native-app layer, loaded before the page scripts. Does nothing in an ordinary browser.
(function () {
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
  document.documentElement.classList.add("native");
  var P = cap.Plugins || {};

  // status-bar text follows the page theme: light text on the dark theme, dark on the light one
  function statusBar() {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    try { if (P.StatusBar) P.StatusBar.setStyle({ style: light ? "LIGHT" : "DARK" }); } catch (e) {}
  }
  new MutationObserver(statusBar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  statusBar();

  // outside links (sources, the Law of One archive, studies) open in an in-app Safari sheet with a Done button
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href) || /^https?:\/\/iamra\.lol\/?$/i.test(href)) return;
    ev.preventDefault();
    try { if (P.Browser) P.Browser.open({ url: href, presentationStyle: "popover" }); else window.open(href, "_blank"); } catch (e) { window.open(href, "_blank"); }
  }, true);

  // once the page has painted, the splash can go
  window.addEventListener("load", function () { try { if (P.SplashScreen) P.SplashScreen.hide(); } catch (e) {} });
})();
