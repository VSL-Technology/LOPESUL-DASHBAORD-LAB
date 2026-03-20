function simular() {
    var mac = document.getElementById('mac').value.trim();
    var ip = document.getElementById('ip').value.trim();
    var link = document.getElementById('link').value.trim();

    if (!mac || !ip) {
        alert('Por favor, preencha MAC e IP!');
        return;
    }

    var params = new URLSearchParams();
    params.append('mac', mac);
    params.append('ip', ip);
    if (link) params.append('link-orig', link);

    var url = '/pagamento.html?' + params.toString();
    console.log('Redirecionando para:', url);
    window.location.href = url;
}

document.addEventListener('DOMContentLoaded', function () {
    var btnSimular = document.getElementById('btn-simular');
    if (btnSimular) btnSimular.addEventListener('click', simular);

    // Atalho Enter
    document.querySelectorAll('input').forEach(function (input) {
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') simular();
        });
    });
});
