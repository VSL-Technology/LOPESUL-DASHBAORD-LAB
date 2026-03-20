document.addEventListener('DOMContentLoaded', () => {
      const API = ""; // mesmo domínio

      const get = (n) => new URLSearchParams(location.search).get(n);
      const sanitizeRedirect = (url) => {
        if (!url) return null;
        try {
          const parsed = new URL(url, window.location.origin);
          const allowedProtocols = new Set(['http:', 'https:']);
          if (!allowedProtocols.has(parsed.protocol)) return null;
          return parsed.href;
        } catch {
          return null;
        }
      };
      let mac = get("mac") || null;
      let ip = get("ip") || null;
      const linkOrig = sanitizeRedirect(get("link_orig") || get("link-orig") || "");
      const normalize = (value) => (typeof value === 'string' ? value.trim() : '');
      const sanitizeId = (value) => {
        const trimmed = normalize(value);
        if (!trimmed) return '';
        if (/^\$\(.+\)$/.test(trimmed)) return '';
        return trimmed;
      };
      let deviceId = sanitizeId(
        get("deviceId") || get("device") || get("dispositivoId") || ""
      );
      let mikId = sanitizeId(get("mikId") || get("mikID") || "");
      let deviceIdentifier = deviceId || mikId || null;

      // Função para detectar dispositivo automaticamente
      async function detectarDispositivo() {
        try {
          const res = await fetch('/api/detect-client');
          const data = await res.json();

          if (!ip && data.ip) {
            ip = data.ip;
            console.log('[Portal] IP detectado:', ip);
          }

          // Se não tem deviceIdentifier na URL, tenta usar o detectado pela API
          if (!deviceIdentifier && data.deviceIdentifier) {
            deviceId = data.deviceId || null;
            mikId = data.mikId || null;
            deviceIdentifier = data.deviceIdentifier;
            console.log('[Portal] Dispositivo detectado automaticamente:', { deviceId, mikId, deviceIdentifier });
          }

          // Tenta buscar MAC via ARP do Mikrotik (se IP está disponível)
          if (ip && !mac && deviceIdentifier) {
            try {
              const params = new URLSearchParams({ ip });
              if (deviceId) params.set('deviceId', deviceId);
              else if (mikId) params.set('mikId', mikId);
              const arpRes = await fetch(`/api/mikrotik/arp?${params.toString()}`);
              const arpData = await arpRes.json();
              if (arpData.mac) {
                mac = arpData.mac;
                console.log('[Portal] MAC encontrado via ARP:', mac);
              }
            } catch (e) {
              console.warn('[Portal] Não foi possível buscar MAC via ARP:', e);
            }
          }

          return { deviceId, mikId, deviceIdentifier, ip, mac };
        } catch (e) {
          console.error('[Portal] Erro ao detectar cliente:', e);
          return { deviceId, mikId, deviceIdentifier, ip, mac };
        }
      }

      // Detecta automaticamente ao carregar a página
      detectarDispositivo();

      if (!deviceIdentifier) {
        console.warn('[Portal] Sem identificador do dispositivo (deviceId/mikId). Aguardando detecção automática...');
      }

      // VERIFICAÇÃO CRÍTICA: Verificar se cliente já tem acesso (resolve problema de MAC aleatório)
      async function verificarAcessoExistente() {
        // Não verificar se estiver em processo de checkout ou já verificando
        if (emCheckout || verificandoAcesso) {
          console.log('[Portal] Em checkout ou já verificando, pulando verificação de acesso');
          return false;
        }

        verificandoAcesso = true;

        try {
          // Aguardar um pouco para garantir que IP foi detectado
          await new Promise(resolve => setTimeout(resolve, 500));

          // Se não tem IP ainda, tentar detectar
          if (!ip) {
            const res = await fetch('/api/detect-client');
            const data = await res.json();
            if (data.ip && data.ip !== 'unknown') {
              ip = data.ip;
            }
          }

          // Se ainda não tem IP, não pode verificar
          if (!ip || ip === 'unknown') {
            console.log('[Portal] IP não disponível para verificação de acesso');
            return false;
          }

          console.log('[Portal] Verificando se já tem acesso para IP:', ip, mac ? `MAC: ${mac}` : '');

          // Buscar pedidoCode do cookie/localStorage (para identificar cliente mesmo quando IP/MAC mudarem)
          const pedidoCodeCookie = document.cookie.match(/pedidoCode=([^;]+)/)?.[1];
          const pedidoCodeLocalStorage = localStorage.getItem('pedidoCode');
          const pedidoCode = pedidoCodeCookie || pedidoCodeLocalStorage || null;

          if (pedidoCode) {
            console.log('[Portal] PedidoCode encontrado (cookie/localStorage):', pedidoCode);
          }

          // Verificar se há pedido pago recente ou sessão ativa para aquele IP, MAC, pedidoCode ou deviceId/mikId
          const params = new URLSearchParams({ ip: encodeURIComponent(ip) });
          if (mac) {
            params.set('mac', encodeURIComponent(mac));
          }
          if (pedidoCode) {
            params.set('pedidoCode', encodeURIComponent(pedidoCode));
          }
          // Incluir deviceId/mikId para buscar pedidos do mesmo dispositivo mesmo quando IP/MAC mudam
          if (deviceId) {
            params.set('deviceId', encodeURIComponent(deviceId));
          }
          if (mikId) {
            params.set('mikId', encodeURIComponent(mikId));
          }
          const verificarRes = await fetch(`/api/verificar-acesso-por-ip?${params.toString()}`);
          const verificarData = await verificarRes.json();

          if (verificarData.temAcesso) {
            console.log('[Portal] ✅ Cliente já tem acesso!', verificarData);

            // Verificar se há parâmetro ?novo=true na URL (permite fazer novo pagamento mesmo tendo acesso)
            const urlParams = new URLSearchParams(window.location.search);
            const forcarNovo = urlParams.get('novo') === 'true';

            // Se o cliente está na página de escolha (não em checkout), não redirecionar automaticamente
            // Permite que ele escolha fazer um novo pagamento
            const viewEscolha = document.getElementById('view-escolha');
            const viewCheckout = document.getElementById('view-checkout');
            const estaNaEscolha = viewEscolha && viewEscolha.style.display !== 'none';

            if (forcarNovo || estaNaEscolha) {
              console.log('[Portal] Cliente tem acesso mas está na página de escolha ou forçou novo pagamento. Não redirecionando.');
              verificandoAcesso = false;
              return false; // Permite fazer novo pagamento
            }

            // Só redirecionar se estiver em checkout ou se não estiver na página de escolha
            // Mostrar mensagem e redirecionar
            if (viewEscolha) viewEscolha.style.display = 'none';
            if (viewCheckout) viewCheckout.style.display = 'none';

            // Criar mensagem de sucesso
            const card = document.querySelector('.card');
            if (card) {
              card.innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                  <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
                  <h1 style="color: #63b245; margin-bottom: 10px;">Acesso Liberado!</h1>
                  <p style="color: #fff; font-size: 18px; margin-bottom: 30px;">
                    Você já possui acesso à internet.<br>
                    Redirecionando...
                  </p>
                  <div class="pill ok" style="display: inline-block; padding: 15px 25px;">
                    Aproveite sua conexão!
                  </div>
                </div>
              `;
            }

            // Redirecionar após 2 segundos
              setTimeout(() => {
                try {
                  const fallback = 'http://clients3.google.com/generate_204';
                  const candidate = linkOrig || fallback;
                  window.location.href = candidate;
                } catch {
                  window.location.href = '/';
                }
              }, 2000);

            return true;
          }

          console.log('[Portal] Cliente não tem acesso, mostrando página de pagamento');
          verificandoAcesso = false;
          return false;
        } catch (error) {
          console.error('[Portal] Erro ao verificar acesso existente:', error);
          // Em caso de erro, continua mostrando a página de pagamento
          verificandoAcesso = false;
          return false;
        }
      }

      // Flag para evitar verificação durante checkout
      let emCheckout = false;
      let verificandoAcesso = false; // Flag para evitar múltiplas verificações simultâneas

      // Verificar acesso ao carregar a página (apenas uma vez, com delay para evitar loop)
      setTimeout(() => {
        if (!emCheckout && !verificandoAcesso) {
          verificandoAcesso = true;
          verificarAcessoExistente().finally(() => {
            verificandoAcesso = false;
          });
        }
      }, 1000); // Delay de 1 segundo para evitar loop

      async function iniciarTrialSeNecessario() {
        const trialActive = sessionStorage.getItem('trialActive');
        const trialExpiration = sessionStorage.getItem('trialExpiresAt');
        if (trialActive && trialExpiration && new Date(trialExpiration) > new Date()) {
          console.log('[Portal] Trial já ativo até', trialExpiration);
          atualizarTimerTrial(new Date(trialExpiration));
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 800));
        await detectarDispositivo();
        const payload = {
          ip,
          mac,
          deviceId,
          mikId,
          minutos: 5,
        };

        try {
          const res = await fetch('/api/trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok || !data?.ok) {
            console.warn('[Portal] Falha ao iniciar trial', data);
            return;
          }

          sessionStorage.setItem('trialActive', '1');
          sessionStorage.setItem('trialToken', data.token || '');
          sessionStorage.setItem('trialExpiresAt', data.expiresAt || '');
          atualizarTimerTrial(new Date(data.expiresAt));
          exibirPopupTrial();
        } catch (err) {
          console.error('[Portal] Erro ao iniciar trial', err);
        }
      }

      function atualizarTimerTrial(expiraEm) {
        if (!expiraEm || Number.isNaN(expiraEm.getTime())) return;
        const trialBanner = document.createElement('div');
        trialBanner.id = 'trial-banner';
        trialBanner.style.position = 'fixed';
        trialBanner.style.bottom = '20px';
        trialBanner.style.right = '20px';
        trialBanner.style.background = '#1d3a5a';
        trialBanner.style.color = '#fff';
        trialBanner.style.padding = '12px 18px';
        trialBanner.style.borderRadius = '12px';
        trialBanner.style.boxShadow = '0 10px 25px rgba(0,0,0,.35)';
        trialBanner.style.zIndex = '9999';
        trialBanner.innerHTML = `
          <strong>Acesso temporário</strong><br/>
          <span id="trial-countdown">5:00</span>
        `;
        document.body.appendChild(trialBanner);

        function tick() {
          const diff = expiraEm.getTime() - Date.now();
          if (diff <= 0) {
            document.getElementById('trial-countdown').textContent = 'Expirado';
            trialBanner.style.background = '#721c24';
            trialBanner.innerHTML += '<div style="margin-top:6px;font-size:12px;">Conexão será bloqueada.</div>';
            clearInterval(timerHandle);
            return;
          }
          const min = Math.floor(diff / 1000 / 60);
          const sec = Math.floor((diff / 1000) % 60);
          document.getElementById('trial-countdown').textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        }

        tick();
        timerHandle = setInterval(tick, 1000);
      }

      function exibirPopupTrial() {
        const popup = document.createElement('div');
        popup.id = 'trial-popup';
        popup.style.position = 'fixed';
        popup.style.top = '0';
        popup.style.left = '0';
        popup.style.right = '0';
        popup.style.bottom = '0';
        popup.style.background = 'rgba(0,0,0,0.65)';
        popup.style.display = 'flex';
        popup.style.alignItems = 'center';
        popup.style.justifyContent = 'center';
        popup.style.zIndex = '10000';
        popup.innerHTML = `
          <div style="background:#fff; color:#1a2233; padding:30px; border-radius:16px; max-width:380px; width:90%; text-align:center; box-shadow:0 40px 70px rgba(0,0,0,.35);">
            <h2 style="margin-top:0;">Acesso temporário</h2>
            <p style="line-height:1.5;">Você está navegando com acesso de demonstração por 5 minutos. Antes do tempo terminar, escolha um plano para manter a conexão.</p>
            <button id="trial-ver-planos" style="margin-top:12px; background:#1d3a5a; color:#fff; border:none; border-radius:8px; padding:10px 18px; font-weight:700; cursor:pointer;">Ver planos</button>
          </div>`;
        document.body.appendChild(popup);

        document.getElementById('trial-ver-planos').addEventListener('click', () => {
          popup.remove();
          const viewEscolha = document.getElementById('view-escolha');
          const viewCheckout = document.getElementById('view-checkout');
          if (viewEscolha) viewEscolha.style.display = 'block';
          if (viewCheckout) viewCheckout.style.display = 'none';
        });
      }

      iniciarTrialSeNecessario();

      let nomeCli = get("nome") || get("name") || "";
      let docCli  = get("doc")  || get("document") || "";

      let REF = null;
      let tempoLivre = 120;
      let pollingHandle = null;
      let timerHandle = null;

      const elEscolha  = document.getElementById('view-escolha');
      const elCheckout = document.getElementById('view-checkout');
      const elClienteForm = document.getElementById('cliente-form');
      const elCliNome = document.getElementById('cli-nome');
      const elCliDoc  = document.getElementById('cli-doc');
      const elCliErro = document.getElementById('cli-erro');
      const elBtnGerar = document.getElementById('btn-gerar-pix');

      const onlyDigits = (s) => (s || '').replace(/\D/g, '');

      document.querySelectorAll('.btn-plano').forEach(btn => {
        btn.addEventListener('click', () => {
          const valor = parseFloat(btn.dataset.valor);
          const descricao = btn.dataset.desc;
          iniciarCheckout({ valor, descricao, minutos: 120 });
        });
      });

      document.getElementById('btn-voltar').addEventListener('click', voltarEscolha);

      function voltarEscolha() {
        emCheckout = false; // Resetar flag ao voltar para permitir verificação novamente
        limparFluxo();
        elCheckout.style.display = 'none';
        elEscolha.style.display  = 'block';
        document.getElementById('pix-code').textContent = '';
        const ctx = document.getElementById('qrcode')?.getContext('2d');
        ctx && ctx.clearRect(0,0,220,220);
        document.getElementById('status').className = 'pill info';
        document.getElementById('status').textContent = '🔄 Aguardando pagamento...';
        document.getElementById('timer').className = 'pill warn';
        document.getElementById('timer').textContent = '⏰ Tempo livre: 2:00';
        elCliErro.style.display = 'none';
        elCliErro.textContent = '';
        // Ocultar aviso de conexão ao voltar
        const avisoConexao = document.getElementById('aviso-conexao');
        if (avisoConexao) {
          avisoConexao.style.display = 'none';
        }
      }

      function limparFluxo() {
        if (pollingHandle) clearInterval(pollingHandle);
        if (timerHandle) clearInterval(timerHandle);
        pollingHandle = null; timerHandle = null; REF = null;
      }

      function iniciarTimer() {
        const el = document.getElementById('timer');
        const fmt = (t) => `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
        el.textContent = `⏰ Tempo livre: ${fmt(tempoLivre)}`;
        timerHandle = setInterval(() => {
          tempoLivre = Math.max(tempoLivre-1, 0);
          el.textContent = `⏰ Tempo livre: ${fmt(tempoLivre)}`;
          if (tempoLivre === 0) {
            clearInterval(timerHandle);
            el.className = 'pill err';
            el.textContent = '⏰ Tempo esgotado! Faça o pagamento para continuar.';
          }
        }, 1000);
      }

      function iniciarPolling() {
        pollingHandle = setInterval(async () => {
          if (!REF) return;
          try {
            const r = await fetch(`${API}/api/verificar-pagamento`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                externalId: REF,
                deviceId: deviceId || null,
                mikId: mikId || null
              })
            });
            if (!r.ok) return;
            const j = await r.json();
            const status = j?.status;
            if (status === 'pago' || j?.pago) {
              limparFluxo();
              clearInterval(pollingHandle); // Parar polling para evitar loop
              pollingHandle = null;

              const s = document.getElementById('status');
              s.className = 'pill ok';
              s.textContent = '✅ Pagamento confirmado! Aguardando liberação do acesso...';

              // Mostrar aviso sobre "Sem conexão"
              const avisoConexao = document.getElementById('aviso-conexao');
              if (avisoConexao) {
                avisoConexao.style.display = 'block';
              }

              // Salvar código do pedido no cookie/localStorage para identificar cliente mesmo quando IP/MAC mudarem
              if (REF) {
                // Cookie válido por 3 horas (mesmo tempo da verificação no backend)
                const expires = new Date(Date.now() + 3 * 60 * 60 * 1000).toUTCString();
                document.cookie = `pedidoCode=${REF}; expires=${expires}; path=/; SameSite=Lax`;
                localStorage.setItem('pedidoCode', REF);
                console.log('[Portal] ✅ PedidoCode salvo para identificação futura:', REF);
              }

              // Aguardar um pouco para o webhook processar e liberar acesso
              // Verificar acesso antes de redirecionar
              let tentativas = 0;
              const maxTentativas = 10; // 30 segundos (10 * 3s)

              const verificarEAguardar = async () => {
                tentativas++;
                console.log(`[Portal] Verificando acesso (tentativa ${tentativas}/${maxTentativas})...`);

                // Aguardar um pouco antes de verificar
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Verificar se o acesso foi liberado
                const temAcesso = await verificarAcessoExistente();

                if (temAcesso) {
                  console.log('[Portal] ✅ Acesso confirmado! Redirecionando...');
                  s.textContent = '✅ Acesso liberado! Redirecionando...';

                  setTimeout(() => {
                    try {
                      const fallback = 'http://clients3.google.com/generate_204';
                      const candidate = linkOrig || fallback;
                      window.location.href = candidate;
                    } catch {
                      window.location.href = '/';
                    }
                  }, 1000);
                } else if (tentativas < maxTentativas) {
                  console.log(`[Portal] Acesso ainda não liberado, aguardando... (${tentativas}/${maxTentativas})`);
                  s.textContent = `✅ Pagamento confirmado! Aguardando liberação... (${tentativas}/${maxTentativas})`;
                  setTimeout(verificarEAguardar, 3000);
                } else {
                  console.error('[Portal] ⚠️ Acesso não foi liberado após várias tentativas');
                  s.className = 'pill err';
                  s.textContent = '⚠️ Pagamento confirmado, mas acesso ainda não liberado. Aguarde alguns segundos e recarregue a página.';

                  // Tentar redirecionar mesmo assim após 5 segundos
                  setTimeout(() => {
                    try {
                      const fallback = 'http://clients3.google.com/generate_204';
                      const candidate = linkOrig || fallback;
                      window.location.href = candidate;
                    } catch {
                      window.location.href = '/';
                    }
                  }, 5000);
                }
              };

              // Iniciar verificação
              verificarEAguardar();
            }
            if (status === 'expirado' || status === 'cancelado') {
              limparFluxo();
              const s = document.getElementById('status');
              s.className = 'pill err';
              s.textContent = status === 'expirado'
                ? '⏳ Pagamento expirado. Gere um novo QR.'
                : '❌ Pagamento cancelado.';
            }
          } catch {}
        }, 3000);
      }

      async function iniciarCheckout({ valor, descricao, minutos }) {
        // Limpar pedidoCode antigo ao iniciar novo checkout (para evitar loop)
        document.cookie = 'pedidoCode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        localStorage.removeItem('pedidoCode');
        console.log('[Portal] PedidoCode antigo removido ao iniciar novo checkout');

        // NÃO verificar acesso ao iniciar checkout - permite fazer novo pagamento mesmo tendo acesso
        // O cliente pode querer comprar mais tempo
        emCheckout = true; // Marcar que está em checkout para evitar verificações durante preenchimento
        elEscolha.style.display = 'none';
        elCheckout.style.display = 'block';
        tempoLivre = Number(minutos) || 120;
        document.getElementById('desc-plano').textContent =
          `${descricao} — R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        const setErro = (msg) => {
          const s = document.getElementById('status');
          s.className = 'pill err';
          s.textContent = msg;
        };

        // Se não tem deviceIdentifier, tenta detectar automaticamente (aguarda a resposta)
        if (!deviceIdentifier) {
          try {
            console.log('[Portal] Tentando detectar dispositivo antes do checkout...');
            const resultado = await detectarDispositivo();
            deviceId = resultado.deviceId;
            mikId = resultado.mikId;
            deviceIdentifier = resultado.deviceIdentifier;
            ip = resultado.ip || ip;
            mac = resultado.mac || mac;

            if (deviceIdentifier) {
              console.log('[Portal] ✅ Dispositivo detectado na hora do checkout:', { deviceId, mikId, deviceIdentifier, ip, mac });
            } else {
              console.warn('[Portal] ⚠️ Dispositivo não detectado. Resultado:', resultado);
            }
          } catch (e) {
            console.error('[Portal] ❌ Erro ao detectar dispositivo:', e);
          }
        }

        if (!deviceIdentifier) {
          setErro('Dispositivo não identificado. Atualize a página ou tente novamente no Wi-Fi do ônibus.');
          console.error('[Portal] ❌ Não foi possível identificar o dispositivo. deviceId:', deviceId, 'mikId:', mikId, 'ip:', ip);
          return;
        }

        console.log('[Portal] ✅ Prosseguindo com checkout. deviceId:', deviceId, 'mikId:', mikId, 'deviceIdentifier:', deviceIdentifier);

        if (!onlyDigits(docCli)) {
          elClienteForm.style.display = 'block';
          elCliNome.value = nomeCli || '';
          elCliDoc.value  = docCli  || '';

          elBtnGerar.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            elCliErro.style.display = 'none';
            elCliErro.textContent = '';
            const n  = (elCliNome.value || '').trim();
            const d0 = onlyDigits(elCliDoc.value);

            // Validar nome (obrigatório e não pode ser apenas "Cliente")
            if (!n || n.length < 3) {
              elCliErro.style.display = 'block';
              elCliErro.textContent = 'Informe seu nome completo (mínimo 3 caracteres).';
              return;
            }

            if (n.toLowerCase() === 'cliente' || n.toLowerCase() === 'nome') {
              elCliErro.style.display = 'block';
              elCliErro.textContent = 'Informe seu nome real, não use "Cliente" ou "Nome".';
              return;
            }

            // Validar CPF/CNPJ
            if (!d0 || (d0.length !== 11 && d0.length !== 14)) {
              elCliErro.style.display = 'block';
              elCliErro.textContent = 'Informe CPF (11 dígitos) ou CNPJ (14 dígitos).';
              return;
            }

            if ((d0.length === 11 && !validarCPF(d0)) || (d0.length === 14 && !validarCNPJ(d0))) {
              elCliErro.style.display = 'block';
              elCliErro.textContent = d0.length === 11 ? 'CPF inválido.' : 'CNPJ inválido.';
              return;
            }

            nomeCli = n; docCli = d0;
            elClienteForm.style.display = 'none';

            // Desabilitar botão durante o processamento
            elBtnGerar.disabled = true;
            elBtnGerar.textContent = 'Gerando QR Code...';

            try {
              await gerarPix({ valor, descricao, setErro });
            } catch (error) {
              console.error('[Portal] Erro ao gerar PIX:', error);
              elCliErro.style.display = 'block';
              elCliErro.textContent = 'Erro ao gerar QR Code. Tente novamente.';
              elClienteForm.style.display = 'block';
            } finally {
              elBtnGerar.disabled = false;
              elBtnGerar.textContent = 'Gerar QR Pix';
            }
          };

          elCliDoc.addEventListener('input', (e) => {
            const input = e.target;
            const pos = input.selectionStart;
            const oldLength = input.value.length;
            input.value = formatarDoc(input.value);
            const newLength = input.value.length;
            const diff = newLength - oldLength;
            input.setSelectionRange(pos + diff, pos + diff);
          });

          return;
        }

        await gerarPix({ valor, descricao, setErro });
      }

      async function gerarPix({ valor, descricao, setErro }) {
        try {
          console.log('[Portal] Gerando PIX...', { valor, descricao, nomeCli, docCli, ip, mac, deviceId, mikId });

          const res  = await fetch(`${API}/api/pagamentos/checkout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              valor,
              descricao,
              clienteIp: ip,
              clienteMac: mac,
              deviceId: deviceId || null,
              mikId: mikId || null,
              customer: { name: nomeCli, document: docCli }
            })
          });

          const data = await res.json().catch((err) => {
            console.error('[Portal] Erro ao parsear resposta JSON:', err);
            return {};
          });

          if (!res.ok) {
            const errorMsg = data?.error || `HTTP ${res.status}`;
            console.error('[Portal] Erro na API checkout:', errorMsg, data);
            setErro('❌ ' + errorMsg);
            return;
          }

          const copiaECola = data?.copiaECola || data?.payloadPix || null;
          REF = data?.externalId || null;

          if (!REF) {
            console.error('[Portal] Resposta sem externalId:', data);
            setErro('Resposta sem referência (externalId).');
            return;
          }

          if (!copiaECola) {
            console.error('[Portal] Resposta sem copiaECola:', data);
            setErro('Resposta sem "copia-e-cola" Pix.');
            return;
          }

          console.log('[Portal] ✅ QR Code gerado com sucesso:', REF);

          document.getElementById("pix-code").textContent = copiaECola;
          new QRious({ element: document.getElementById('qrcode'), value: copiaECola, size: 220, background: 'white', foreground: 'black' });
          iniciarTimer();
          iniciarPolling();
        } catch (e) {
          console.error('[Portal] Erro ao gerar PIX:', e);
          setErro('❌ Não foi possível iniciar o pagamento: ' + (e.message || 'Erro desconhecido'));
        }
      }

      function copiarPix() {
        const code = document.getElementById('pix-code').textContent;
        if (!code) return;
        navigator.clipboard.writeText(code).then(() => {
          const s = document.getElementById('status');
          const orig = s.textContent;
          s.textContent = '📋 Código Pix copiado!';
          setTimeout(() => { s.textContent = orig; }, 1800);
        });
      }

      async function verificarPagamentoManual() {
        if (!REF) return;
        const btn = document.getElementById('btn-ja-paguei');
        const s = document.getElementById('status');
        const origBtn = btn.textContent;
        const origStatus = s.textContent;

        btn.disabled = true;
        btn.textContent = '🔄 Verificando...';
        s.className = 'pill info';
        s.textContent = '🔍 Consultando status do pagamento...';

        try {
          const r = await fetch(`${API}/api/verificar-pagamento`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              externalId: REF,
              deviceId: deviceId || null,
              mikId: mikId || null
            })
          });

          if (!r.ok) {
            s.className = 'pill err';
            s.textContent = '❌ Erro ao verificar pagamento. Tente novamente.';
            btn.disabled = false;
            btn.textContent = origBtn;
            return;
          }

          const j = await r.json();
          const status = j?.status;

          if (status === 'pago' || j?.pago) {
            limparFluxo();
            s.className = 'pill ok';
            s.textContent = '✅ Pagamento confirmado! Liberando acesso...';
            btn.textContent = '✅ Pago';

            // Mostrar aviso sobre "Sem conexão"
            const avisoConexao = document.getElementById('aviso-conexao');
            if (avisoConexao) {
              avisoConexao.style.display = 'block';
            }
            setTimeout(() => {
              try {
                const fallback = 'http://clients3.google.com/generate_204';
                const candidate = linkOrig || fallback;
                window.location.href = candidate;
              } catch { window.location.href = '/'; }
            }, 1200);
          } else if (status === 'pendente') {
            s.className = 'pill warn';
            s.textContent = '⏳ Pagamento ainda não identificado. Aguarde alguns instantes.';
            btn.disabled = false;
            btn.textContent = origBtn;
          } else if (status === 'expirado') {
            s.className = 'pill err';
            s.textContent = '⏳ Pagamento expirado. Gere um novo QR.';
            btn.disabled = false;
            btn.textContent = origBtn;
          } else if (status === 'cancelado') {
            s.className = 'pill err';
            s.textContent = '❌ Pagamento cancelado.';
            btn.disabled = false;
            btn.textContent = origBtn;
          } else {
            s.className = 'pill info';
            s.textContent = origStatus;
            btn.disabled = false;
            btn.textContent = origBtn;
          }
        } catch (e) {
          s.className = 'pill err';
          s.textContent = '❌ Erro de conexão. Tente novamente.';
          btn.disabled = false;
          btn.textContent = origBtn;
        }
      }

      function formatarDoc(value){
        let d = onlyDigits(value);
        if (d.length <= 11){
          d = d.replace(/(\d{3})(\d{3})?(\d{3})?(\d{2})?/, (_, a,b,c,d)=> a + (b?'.'+b:'') + (c?'.'+c:'') + (d?'-'+d:''));
        } else {
          d = d.replace(/(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{2})?/, (_, a,b,c,d,e)=> a + (b?'.'+b:'') + (c?'.'+c:'') + (d?'/'+d:'') + (e?'-'+e:''));
        }
        return d;
      }

      function validarCPF(cpf) {
        if (!cpf || cpf.length !== 11) return false;
        let sum = 0;
        if (/^(\d)\1+$/.test(cpf)) return false;
        for(let i=0;i<9;i++) sum += Number(cpf[i])*(10-i);
        let r = (sum*10)%11; if(r===10) r=0; if(r!==Number(cpf[9])) return false;
        sum=0; for(let i=0;i<10;i++) sum+=Number(cpf[i])*(11-i);
        r=(sum*10)%11; if(r===10) r=0; return r===Number(cpf[10]);
      }

      function validarCNPJ(cnpj) {
        if (!cnpj || cnpj.length!==14) return false;
        if (/^(\d)\1+$/.test(cnpj)) return false;
        let t=cnpj.length-2, d=cnpj.substring(t), d1=parseInt(d.charAt(0)), d2=parseInt(d.charAt(1)), sum=0, pos=t-7;
        for(let i=0;i<t;i++){sum+=parseInt(cnpj.charAt(i))*pos; pos--; if(pos<2) pos=9;}
        let r = sum%11; r = r<2?0:11-r; if(r!==d1) return false;
        t+=1; sum=0; pos=t-7; for(let i=0;i<t;i++){sum+=parseInt(cnpj.charAt(i))*pos; pos--; if(pos<2) pos=9;}
        r=sum%11; r=r<2?0:11-r; return r===d2;
      }

      // Registrar event listeners para botões sem onclick (evita inline JS no HTML)
      const btnCopiar = document.getElementById('btn-copiar-pix');
      if (btnCopiar) btnCopiar.addEventListener('click', copiarPix);

      const btnJaPaguei = document.getElementById('btn-ja-paguei');
      if (btnJaPaguei) btnJaPaguei.addEventListener('click', verificarPagamentoManual);
    });
