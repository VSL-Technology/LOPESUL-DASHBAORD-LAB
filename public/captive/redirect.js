(function redirectToCaptivePortal() {
  var body = document.body;
  var mac = body && body.dataset ? body.dataset.mac || "" : "";
  var ip = body && body.dataset ? body.dataset.ip || "" : "";
  var baseUrl = "https://cativo.lopesuldashboardwifi.com/";

  if (mac && ip) {
    window.location.replace(
      baseUrl + "?mac=" + encodeURIComponent(mac) + "&ip=" + encodeURIComponent(ip)
    );
    return;
  }

  window.location.replace(baseUrl);
})();
