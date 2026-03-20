// Fallback CDN para QRious caso o arquivo local falhe ao carregar.
// Este script deve ser carregado SEM defer, logo após o <script> do qrious-main,
// para que o event listener de erro seja anexado antes do recurso ser buscado.
(function () {
  var el = document.getElementById('qrious-main') ||
    document.querySelector('script[src*="qrious"]');
  if (!el) return;
  el.addEventListener('error', function () {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';
    document.head.appendChild(s);
  });
})();
