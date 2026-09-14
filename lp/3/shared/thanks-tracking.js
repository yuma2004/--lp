(function () {
  var marker = "leaseback_submission_pending";

  try {
    if (sessionStorage.getItem(marker) !== "1") return;
    sessionStorage.removeItem(marker);
  } catch (_) {
    return;
  }

  window.__leasebackConversionReady = true;

  [
    "/lp/3/shared/gtm.js?v=20260829",
    "/lp/3/shared/affilicode-tracking.js?v=20260914",
  ].forEach(function (src) {
    var script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.head.appendChild(script);
  });
})();
