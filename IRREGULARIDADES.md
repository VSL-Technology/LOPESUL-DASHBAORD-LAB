## Varredura rápida de irregularidades (lab)

Comandos executados:
- `npm run lint`
- `npm run type-check`
- `npm audit --json` (resumo abaixo)

Principais achados:
- `src/lib/prisma.js` está quebrado: blocos duplicados e chave de fechamento ausente. Isso derruba `tsc` e interrompe o carregamento do cliente Prisma.
- `src/lib/alerts/adapters/slack.js` declara `hasAllowedPath` duas vezes, gerando erro de lint (`no-redeclare`).
- `src/lib/relayFetch.js` redeclara a variável `url`, gerando erro de lint (`no-redeclare`).
- Dependência `next@15.5.4` vulnerável (RCE e exposição de Server Actions). `npm audit` aponta correção disponível (>=15.5.8).

Próximos passos sugeridos:
- Corrigir a estrutura de `src/lib/prisma.js` removendo duplicação e fechando o bloco.
- Ajustar as duplicações em `slack.js` e `relayFetch.js` para liberar o lint.
- Atualizar `next` para a versão corrigida recomendada pelo `npm audit` e repetir a varredura.
