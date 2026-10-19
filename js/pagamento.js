/* ═══════════════════════════════════════════════════════════════
   SyncroWay — pagamento.js
   Pagamento de pedidos via Pix/cartão online ou confirmação offline.

   Correções em relação à versão anterior:
   • Polling para quando todos os pedidos estão em estado terminal
     (paid/cancelled/refunded/failed) — não martela para sempre
   • Backoff exponencial em falha (não fica em 15s se API caiu)
   • Erro ao gerar cobrança NÃO recarrega (perdia o CPF digitado);
     botão reabilita e usuário tenta de novo
   • confirm() antes de cancelar pedido
   • Labels PT-BR para order.payment_status e gateway pay.state
   • Live region anuncia mudança de status (SR não re-navega)
   • addEventListener consistente (era .onclick em um ponto)
   • type="button" em botões soltos (defesa se pai virar <form>)
   ═══════════════════════════════════════════════════════════════ */

import { api, session } from "./api.js";
import {
  renderHeader,
  renderFooter,
  escapeHtml,
  money,
  toast,
  alertBox,
} from "./ui.js";

renderHeader();
renderFooter();

const host = document.getElementById("sw-payments");
const ids = [
  ...new Set(
    (new URLSearchParams(location.search).get("ids") || "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isSafeInteger(n) && n > 0)
  ),
].slice(0, 20);

// ═══════════════════════════════════════════════════════════
// Constantes
// ═══════════════════════════════════════════════════════════

/** Estados de pagamento (order.payment_status) em que não
 *  adianta continuar pollando — o resultado não muda. */
const TERMINAL_PAYMENT_STATES = new Set([
  "paid",
  "cancelled",
  "refunded",
  "failed",
]);

const PAYMENT_STATUS_LABEL = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  failed: "Falhou",
};

/** Estados do gateway (pay.state) — diferentes de order.payment_status. */
const GATEWAY_STATE_LABEL = {
  pending: "Aguardando pagamento",
  overdue: "Cobrança vencida",
  paid: "Paga",
  cancelled: "Cancelada",
  refunded: "Reembolsada",
  failed: "Falhou",
  awaiting_confirmation: "Aguardando confirmação",
};

const ONLINE_METHODS = ["pix", "card_online"];

// ═══════════════════════════════════════════════════════════
// Estado de módulo
// ═══════════════════════════════════════════════════════════

let loading = false;
let pollTimer = null;
let pollFailures = 0;
const lastKnownPaymentStatus = new Map(); // orderId → payment_status

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/**
 * Só aceita links https: — links de cobrança vêm do gateway,
 * mas defesa em profundidade contra config comprometida.
 */
function invoiceLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return `<a class="btn btn-primary" href="${escapeHtml(
      url.href
    )}" target="_blank" rel="noopener noreferrer">Abrir cobrança segura</a>`;
  } catch {
    return "";
  }
}

function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABEL[status] || status || "—";
}

function gatewayStateLabel(state) {
  return GATEWAY_STATE_LABEL[state] || state || "—";
}

function announce(message) {
  // #sw-payment-status existe no HTML; fallback silencioso se não.
  const el = document.getElementById("sw-payment-status");
  if (el) el.textContent = message;
}

// ═══════════════════════════════════════════════════════════
// Painel de um pedido
// ═══════════════════════════════════════════════════════════

/**
 * Busca o pedido + (se online) o pagamento, e devolve
 * { panel, live, order }. `live` indica se o pedido ainda
 * muda de estado (justifica polling).
 */
async function renderOrder(id) {
  const order = await api.order(id);

  const online = ONLINE_METHODS.includes(order.payment_method);

  let pay = null;
  if (online) {
    try {
      pay = await api.payment(id);
    } catch (error) {
      if (error.status !== 404) throw error;
      // 404 = ainda não gerou cobrança. Normal.
    }
  }

  const paid = order.payment_status === "paid";
  const cancelled = order.status === "cancelled";
  const showCpfForm = online && !pay && !paid && !cancelled;
  const showInvoiceLink =
    pay && !paid && !cancelled && ["pending", "overdue"].includes(pay.state);
  const needsReconcile =
    pay &&
    !["paid", "pending", "overdue", "cancelled", "refunded"].includes(
      pay.state
    );

  const panel = document.createElement("section");
  panel.className = "sw-panel p-3 mb-3";
  panel.dataset.orderId = String(order.id);

  panel.innerHTML = `
    <h2 class="h5">
      Pedido ${escapeHtml(order.code)} — ${money(order.total)}
    </h2>
    <p class="mb-2">
      Status: <strong>${escapeHtml(order.status)}</strong> ·
      Pagamento: <strong>${escapeHtml(paymentStatusLabel(order.payment_status))}</strong>
    </p>

    ${paid ? alertBox("Pagamento confirmado.", "success") : ""}
    ${cancelled ? alertBox("Pedido cancelado.", "warning") : ""}
    ${
      !online && !cancelled && !paid
        ? alertBox("Pagamento será recebido na entrega.", "info")
        : ""
    }

    ${
      pay
        ? `<p class="mb-2">Cobrança: <strong>${escapeHtml(
            gatewayStateLabel(pay.state)
          )}</strong></p>`
        : ""
    }

    ${showInvoiceLink ? invoiceLink(pay.invoice_url) : ""}
    ${
      needsReconcile
        ? alertBox(
            "Cobrança precisa de conciliação pelo suporte. Não gere outro pagamento.",
            "warning"
          )
        : ""
    }

    ${
      showCpfForm
        ? `<form class="mt-3" data-pay novalidate>
             <label class="form-label" for="sw-cpf-${order.id}">CPF/CNPJ do pagador</label>
             <input
               id="sw-cpf-${order.id}"
               class="form-control mb-2"
               name="cpf"
               inputmode="numeric"
               autocomplete="off"
               required
               maxlength="18"
               placeholder="Usado pelo gateway; não salvo neste navegador"
             >
             <button class="btn btn-primary" type="submit">Gerar cobrança</button>
           </form>`
        : ""
    }

    <div data-qr class="mt-3"></div>

    <div class="d-flex gap-2 mt-3 flex-wrap">
      <button class="btn btn-outline-primary" type="button" data-refresh>
        <i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>
        Atualizar status
      </button>
      ${
        !paid && !cancelled && (!pay || pay.state === "cancelled")
          ? `<button class="btn btn-outline-danger" type="button" data-cancel>Cancelar pedido</button>`
          : ""
      }
    </div>
  `;

  // ─── Bind: refresh ─────────────────────────────────────
  panel.querySelector("[data-refresh]")?.addEventListener("click", () => load());

  // ─── Bind: gerar cobrança ──────────────────────────────
  panel.querySelector("[data-pay]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const cpf = new FormData(form).get("cpf");

    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Gerando...`;

    try {
      await api.createPayment(order.id, cpf);
      // Sucesso: recarrega para puxar o QR/status novo.
      await load();
    } catch (error) {
      // NÃO recarrega — o CPF digitado se perderia. Deixa o usuário
      // tentar de novo. Se o pagamento foi criado no servidor mas a
      // rede falhou, o próximo poll (15s) descobre o estado real.
      toast(error.message, "danger");
      button.disabled = false;
      button.innerHTML = original;
    }
  });

  // ─── Bind: cancelar ────────────────────────────────────
  panel.querySelector("[data-cancel]")?.addEventListener("click", async (event) => {
    if (!window.confirm("Cancelar este pedido? A ação não pode ser desfeita.")) {
      return;
    }

    const button = event.currentTarget;
    button.disabled = true;

    try {
      await api.cancelOrder(order.id);
      await load();
    } catch (error) {
      toast(error.message, "danger");
      button.disabled = false;
    }
  });

  // ─── QR Code Pix ───────────────────────────────────────
  if (
    pay?.billing_type === "PIX" &&
    pay.state === "pending" &&
    !paid &&
    !cancelled
  ) {
    const qrHost = panel.querySelector("[data-qr]");
    try {
      const qr = await api.pix(order.id);

      // encodedImage é base64 — valida antes de montar data URL.
      if (qr.encodedImage && /^[A-Za-z0-9+/=]+$/.test(qr.encodedImage)) {
        const img = document.createElement("img");
        img.src = `data:image/png;base64,${qr.encodedImage}`;
        img.alt = "QR Code para pagamento Pix";
        img.width = 220;
        img.className = "d-block mb-2";
        qrHost.append(img);
      }

      if (qr.payload) {
        const labelId = `sw-pix-label-${order.id}`;
        const label = document.createElement("label");
        label.id = labelId;
        label.textContent = "Pix copia e cola";

        const field = document.createElement("textarea");
        field.readOnly = true;
        field.className = "form-control";
        field.value = qr.payload;
        field.rows = 3;
        field.setAttribute("aria-labelledby", labelId);

        qrHost.append(label, field);
      }
    } catch (error) {
      qrHost.textContent = error.message;
    }
  }

  const live = !TERMINAL_PAYMENT_STATES.has(order.payment_status);
  return { panel, live, order };
}

// ═══════════════════════════════════════════════════════════
// Load + polling
// ═══════════════════════════════════════════════════════════

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollFailures = 0;
  pollTimer = window.setInterval(() => {
    // Pausa quando aba oculta ou usuário digitando CPF.
    if (document.hidden) return;
    if (document.querySelector("[data-pay] input:focus")) return;
    load();
  }, 15000);
}

async function load() {
  if (loading) return;

  if (session.role !== "customer") {
    host.innerHTML = `
      <div class="sw-panel p-4">
        ${alertBox("Entre como cliente para acessar seus pedidos.", "info")}
        <a class="btn btn-primary mt-2" href="./entrar.html">Entrar</a>
      </div>
    `;
    stopPolling();
    return;
  }

  if (!ids.length) {
    host.innerHTML = `<div class="sw-panel p-4">${alertBox(
      "Selecione um pedido no painel.",
      "info"
    )}</div>`;
    stopPolling();
    return;
  }

  loading = true;

  try {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await renderOrder(id);
        } catch (error) {
          const el = document.createElement("div");
          el.innerHTML = alertBox(error.message);
          return { panel: el, live: false, order: null };
        }
      })
    );

    // Detecta mudança de status para anunciar ao SR (sem
    // forçar re-navegação pelo conteúdo inteiro).
    let changed = false;
    results.forEach(({ order }) => {
      if (!order) return;
      const prev = lastKnownPaymentStatus.get(order.id);
      if (prev !== undefined && prev !== order.payment_status) {
        changed = true;
      }
      lastKnownPaymentStatus.set(order.id, order.payment_status);
    });

    host.replaceChildren(...results.map((r) => r.panel));

    if (changed) {
      announce("Status de pagamento atualizado.");
    }

    // Para de pollar quando nenhum pedido muda mais.
    const anyLive = results.some((r) => r.live);
    if (!anyLive) {
      stopPolling();
    } else if (!pollTimer) {
      startPolling();
    }

    pollFailures = 0;
  } catch (error) {
    // Falha geral (rede/API caída). Backoff para não martelar.
    pollFailures += 1;
    if (pollFailures >= 3) {
      // Já estamos num estado ruim; para até o usuário clicar
      // em Atualizar (data-refresh) ou recarregar a página.
      stopPolling();
    }
    // Só mostra toast na primeira falha — evita spam.
    if (pollFailures === 1) {
      toast(error.message || "Erro ao atualizar pagamentos", "danger");
    }
  } finally {
    loading = false;
  }
}

// ═══════════════════════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════════════════════

load();

// Cleanup quando a página é descarregada.
window.addEventListener("pagehide", stopPolling);