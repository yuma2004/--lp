(function (window, document, tagName, dataLayerName, containerId) {
  window[dataLayerName] = window[dataLayerName] || [];
  window[dataLayerName].push({
    "gtm.start": new Date().getTime(),
    event: "gtm.js",
  });

  var firstScript = document.getElementsByTagName(tagName)[0];
  var script = document.createElement(tagName);
  var dataLayerQuery = dataLayerName !== "dataLayer" ? "&l=" + dataLayerName : "";

  script.async = true;
  script.src = "https://www.googletagmanager.com/gtm.js?id=" + containerId + dataLayerQuery;
  firstScript.parentNode.insertBefore(script, firstScript);
})(window, document, "script", "dataLayer", "GTM-KNK5T8S4");
