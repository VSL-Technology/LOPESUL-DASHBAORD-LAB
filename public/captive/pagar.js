function abrirViaWiFi() {
  // Usuário já está no WiFi, redireciona para captive portal
  window.location.href = 'http://api.67-211-212-18.sslip.io/pagamento.html';
}

function abrirVia4G() {
  // Mostra instruções e abre página de pagamento via HTTPS
  document.getElementById('instrucoes').style.display = 'block';
  setTimeout(() => {
    window.location.href = 'https://dashboard.67-211-212-18.sslip.io/pagamento.html';
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  var btnWifi = document.getElementById('btn-wifi');
  if (btnWifi) btnWifi.addEventListener('click', abrirViaWiFi);

  var btn4g = document.getElementById('btn-4g');
  if (btn4g) btn4g.addEventListener('click', abrirVia4G);
});
