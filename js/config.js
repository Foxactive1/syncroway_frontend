/* ═══════════════════════════════════════════════════════════════
   SyncroWay — config.js
   Boot config: resolve API base URL e ícones de categoria.

   Prioridade de resolução:
     1. localStorage (somente em localhost — override de dev)
     2. window.SYNCROWAY_API (injetado por runtime-config.js)
     3. fallback: http://127.0.0.1:5000/api em localhost,
                  same-origin /api em produção

   Política de erro:
     • Dev:  falha rápida (throw) — o desenvolvedor vê o problema
             no console em vez de debugar 404 estranhos.
     • Prod: console.error + fallback same-origin — o app continua
             tentando; as telas já tratam erro de API (401, 503,
             timeout). Melhor que tela em branco.

   Correções em relação à versão anterior:
   • throw em top-level matava TODOS os módulos importadores —
     agora só em dev
   • new URL() envolvido em try/catch (input malformado)
   • localStorage.getItem em try/catch (Safari privado, iframe)
   • CATEGORY_ICONS congelado (Object.freeze)
   • Multi-linha, consistente com o resto do projeto
   ═══════════════════════════════════════════════════════════════ */

const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);


/**
 * Lê override de dev. Só em localhost — em prod, o localStorage
 * não deve influenciar a API (segurança + previsibilidade).
 * try/catch porque Safari privado e iframes sandbox lançam.
 */
function readLocalOverride() {
  if (!isLocal) return null;
  try {
    return localStorage.getItem("syncroway_api");
  } catch {
    return null;
  }
}


const fallback = isLocal
  ? "http://127.0.0.1:5000/api"
  : `${window.location.origin}/api`;

const configured =
  readLocalOverride() ||
  window.SYNCROWAY_API ||
  null;

const raw = configured || fallback;


let parsedUrl;
try {
  parsedUrl = new URL(raw, window.location.origin);
} catch {
  // raw é sintaticamente inválido (nem relativo). Em dev, falha
  // rápida para o desenvolvedor ver; em prod, cai no fallback.
  if (isLocal) {
    throw new Error(`SYNCROWAY_API inválido: "${raw}"`);
  }
  console.error(
    `[config] SYNCROWAY_API inválido: "${raw}". Usando fallback same-origin.`
  );
  parsedUrl = new URL(fallback, window.location.origin);
}


// Em produção, API pública exige HTTPS. Se a URL configurada
// for http://, degrada para same-origin (que herda o protocolo
// do site, portanto https) em vez de derrubar o app.
if (!isLocal && parsedUrl.protocol !== "https:") {
  console.error(
    `[config] API pública exige HTTPS. Recebido: "${parsedUrl.href}". ` +
      `Usando fallback same-origin.`
  );
  parsedUrl = new URL(fallback, window.location.origin);
}


export const API_BASE = parsedUrl.href.replace(/\/$/, "");


export const CATEGORY_ICONS = Object.freeze({
  alimentacao: "bi-egg-fried",
  "veterinaria-pet": "bi-heart-pulse",
  eletronicos: "bi-phone",
  mercado: "bi-cart4",
  servicos: "bi-tools",
  "casa-manutencao": "bi-house",
  automotivo: "bi-car-front",
  moda: "bi-bag-heart",
  beleza: "bi-scissors",
});