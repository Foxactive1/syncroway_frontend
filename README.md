# SyncroWay Frontend

HTML, Bootstrap e JavaScript modular. Não exige migração para React para funcionar. Backend: https://github.com/Foxactive1/syncroway_backend.

## Local

```bash
python -m http.server 5500
```

Abra http://localhost:5500. API local padrão: http://127.0.0.1:5000/api. Configuração manual da API disponível apenas em localhost.

## Vercel

Importe este repositório; `vercel.json` define build e diretório `dist`. Configure variável **SYNCROWAY_API=https://seu-backend/api**. O build recusa URL sem HTTPS. A variável é pública e não pode conter credenciais. Inclua a origem exata do frontend em CORS_ORIGINS no backend. Todos os links e assets são relativos à raiz; não dependem de `/app/`.

```bash
npm test
SYNCROWAY_API=https://seu-backend/api npm run build
```

`runtime-config.js` é gerado no build. Em outro host estático, publique `dist`. Não há dependências npm externas. Cabeçalhos de segurança estão em vercel.json; em outro host, configure os equivalentes.

## Pagamento

Métodos disponíveis e frete vêm de `/api/public-config`. Cada loja gera um pedido. Pagamento online segue para `pagamento.html`, que gera a cobrança por ação do usuário, mostra QR Pix/fatura hospedada e consulta o estado confirmado por webhook. O painel permite retomar o pagamento ou cancelar pedido sem cobrança. Cobrança inconclusiva exige suporte; não é emitida outra automaticamente.

Sessão permanece em localStorage: CSP, escape de HTML e validação de URLs reduzem exposição, mas não equivalem a cookies HttpOnly. Uma futura mudança para cookies exige revisão conjunta de CORS/CSRF no backend.

Antes do lançamento, valide em desktop e celular: cadastro/login, compra multi-loja, pagamento, cancelamento, estoque, motorista e agendas. Configure e teste Asaas na sandbox antes de ativar cobranças reais. Não há deploy ou contratação de serviços automática neste repositório.
