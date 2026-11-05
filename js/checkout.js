/* ═══════════════════════════════════════════════════════════════
   SyncroWay — checkout.js
   Finalização do carrinho: endereço, pagamento e criação de pedido.

   Correções em relação à versão anterior:
   • Frete exibido como linha no resumo (era só "Subtotal",
     o usuário nunca via o total final antes de confirmar)
   • Total final explícito = subtotal + frete × nº de lojas
   • feeSection do form removida (redundante com o resumo)
   • Spinner no botão "Confirmar pedido" (era disabled sem feedback)
   • payment_method validado contra cfg.payment_methods (defesa
     contra DOM manipulado ou config desatualizada)
   • aria-busy no host + aria-live preparado para o anúncio de
     sucesso/erro (checkout.html deve ter #sw-checkout-status)
   • 401 no checkout → redirect para login (sessão expirada)
   • item_count com fallback para items.length
   ═══════════════════════════════════════════════════════════════ */

import { api, session } from "./api.js";
import {
  renderHeader,
  renderFooter,
  money,
  escapeHtml,
  alertBox,
  toast,
  refreshCartBadge,
} from "./ui.js";

// A própria página mostra o carrinho — não gastar GET /cart para o badge.
renderHeader("cart", { skipBadge: true });
renderFooter();

const host = document.getElementById("sw-checkout");

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function groupByStore(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.store_id ?? "unknown";
    if (!map.has(key)) {
      map.set(key, {
        store_id: key,
        store_name: item.store_name,
        items: [],
      });
    }
    map.get(key).items.push(item);
  }
  return [...map.values()];
}

function announce(message) {
  const el = document.getElementById("sw-checkout-status");
  if (el) el.textContent = message;
}

const PAYMENT_LABELS = {
  pix: "Pix",
  card_online: "Cartão online",
  cash: "Dinheiro na entrega",
  card_on_delivery: "Cartão na entrega",
};

const ONLINE_METHODS = new Set(["pix", "card_online"]);

// ═══════════════════════════════════════════════════════════
// Template principal
// ═══════════════════════════════════════════════════════════

function render(cart, cfg = {}) {
  const groups = groupByStore(cart.items);
  const itemCount = Number(cart.item_count ?? cart.items.length ?? 0);

  // Frete por loja + total. Nome do campo documentado:
  // `delivery_fee_per_store` — se o backend mudar para
  // `delivery_fee_total`, ajustar aqui.
  const feePerStore = Number(cfg.delivery_fee_per_store || 0);
  const storeCount = groups.length;
  const deliveryTotal = feePerStore * storeCount;
  const subtotal = Number(cart.subtotal || 0);
  const grandTotal = subtotal + deliveryTotal;

  const methods =
    Array.isArray(cfg.payment_methods) && cfg.payment_methods.length
      ? cfg.payment_methods
      : ["cash", "card_on_delivery"];

  host.innerHTML = `
  <div class="row g-3">
    <div class="col-12 col-lg-7">
      <div class="sw-panel p-3 p-md-4">
        <h1 class="h5 mb-3">Entrega e pagamento</h1>

        <form id="sw-form" class="row g-3" novalidate>

          <div class="col-12">
            <label class="form-label small" for="sw-address">
              Endereço completo
            </label>
            <input
              id="sw-address"
              name="address"
              class="form-control"
              required
              placeholder="Rua, número, bairro, cidade"
              autocomplete="street-address"
            >
          </div>

          <div class="col-12">
            <label class="form-label small" for="sw-payment-method">
              Forma de pagamento
            </label>
            <select
              id="sw-payment-method"
              name="payment_method"
              class="form-select"
            >
              ${methods
                .map(
                  (m) =>
                    `<option value="${escapeHtml(m)}">${escapeHtml(
                      PAYMENT_LABELS[m] || m
                    )}</option>`
                )
                .join("")}
            </select>
          </div>

          <div class="col-12">
            <label class="form-label small" for="sw-notes">
              Observações (opcional)
            </label>
            <textarea
              id="sw-notes"
              name="notes"
              class="form-control"
              rows="2"
              placeholder="Ponto de referência, troco, instruções..."
            ></textarea>
          </div>

          <div class="col-12">
            <button class="btn btn-primary w-100 py-2" type="submit">
              Confirmar pedido — ${money(grandTotal)}
            </button>
          </div>

          <div class="col-12">
            <p class="small text-muted mb-0">
              O valor final será recalculado no servidor.
              Diferenças de frete (por loja, distância) prevalecem.
            </p>
          </div>

        </form>
      </div>
    </div>

    <div class="col-12 col-lg-5">
      <div class="sw-panel p-3">

        <h2 class="h6 mb-3">Itens (${itemCount})</h2>

        <div class="d-flex flex-column gap-1">
          ${cart.items
            .map(
              (item) =>
                `<div class="d-flex justify-content-between small">
                   <span>${escapeHtml(String(item.quantity))}× ${escapeHtml(
                  item.name
                )}</span>
                   <span class="text-nowrap">${money(item.line_total)}</span>
                 </div>`
            )
            .join("")}
        </div>

        <hr>

        <div class="d-flex justify-content-between small">
          <span>Subtotal</span>
          <span>${money(subtotal)}</span>
        </div>

        <div class="d-flex justify-content-between small">
          <span>
            Frete
            ${
              storeCount > 1
                ? `<span class="text-muted">(${storeCount} lojas × ${money(
                    feePerStore
                  )})</span>`
                : ""
            }
          </span>
          <span>${money(deliveryTotal)}</span>
        </div>

        <hr class="my-2">

        <div class="d-flex justify-content-between sw-order-total">
          <span>Total</span>
          <span>${money(grandTotal)}</span>
        </div>

        ${
          deliveryTotal === 0
            ? `<p class="small text-success mb-0 mt-2">
                 <i class="bi bi-truck me-1" aria-hidden="true"></i>
                 Frete grátis
               </p>`
            : ""
        }

      </div>
    </div>
  </div>`;

  bindCheckoutForm(cart, methods);
}

// ═══════════════════════════════════════════════════════════
// Submit
// ═══════════════════════════════════════════════════════════

function bindCheckoutForm(cart, allowedMethods) {
  const form = document.getElementById("sw-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Confirmando...`;

    const data = new FormData(form);
    const method = String(data.get("payment_method") || "");

    // Defesa: se o backend mudou a config entre render e submit,
    // ou se o DOM foi manipulado, não enviar método inválido.
    if (!allowedMethods.includes(method)) {
      toast("Forma de pagamento indisponível. Atualize a página.", "danger");
      button.disabled = false;
      button.innerHTML = original;
      return;
    }

    const payload = {
      address: String(data.get("address") || "").trim(),
      payment_method: method,
      notes: String(data.get("notes") || "").trim() || null,
    };

    try {
      const result = await api.checkout(payload);
      refreshCartBadge({ force: true });

      // Gateway online: redireciona direto para a tela de pagamento.
      if (ONLINE_METHODS.has(payload.payment_method)) {
        const ids = (result.orders || [])
          .map((o) => o.id)
          .filter(Boolean)
          .join(",");

        if (ids) {
          announce("Pedido criado. Redirecionando para o pagamento.");
          window.location.href = `./pagamento.html?ids=${encodeURIComponent(
            ids
          )}`;
          return;
        }
        // Sem IDs → cai no fallback de sucesso genérico.
      }

      renderSuccess(result);
    } catch (error) {
      // Sessão expirada durante o checkout: manda para login com
      // retorno. Sem isso, o usuário vê só "Unauthorized".
      if (error?.status === 401) {
        session.clear?.();
        window.location.href = "./entrar.html?next=%2Fcheckout.html";
        return;
      }

      toast(error.message || "Erro ao finalizar pedido.", "danger");
      button.disabled = false;
      button.innerHTML = original;
    }
  });
}

function renderSuccess(result) {
  const orders = result.orders || (result.order ? [result.order] : []);

  announce(
    orders.length
      ? `Pedido${orders.length > 1 ? "s" : ""} criado${
          orders.length > 1 ? "s" : ""
        } com sucesso.`
      : "Pedido criado com sucesso."
  );

  host.innerHTML = `<div class="sw-panel p-4 text-center">
    <i class="bi bi-check-circle-fill text-success fs-1" aria-hidden="true"></i>
    <h2 class="h5 mt-3">Pedido criado!</h2>
    <p class="text-muted small">
      ${
        orders.length
          ? `Foram gerados ${orders.length} pedido(s): ${orders
              .map((o) => escapeHtml(String(o.code || o.id)))
              .join(", ")}`
          : "O pagamento será recebido na entrega. Acompanhe no painel."
      }
    </p>
    <div class="d-flex flex-wrap gap-2 justify-content-center mt-2">
      <a class="btn btn-primary" href="./painel.html">
        Ver meus pedidos
      </a>
      <a class="btn btn-link" href="./index.html">
        Continuar comprando
      </a>
    </div>
  </div>`;

  // Foco no novo heading para SR reposicionar contexto.
  document.querySelector("#sw-checkout h2")?.focus?.();
}

// ═══════════════════════════════════════════════════════════
// Load
// ═══════════════════════════════════════════════════════════

async function load() {
  if (!host) return;

  host.setAttribute("aria-busy", "true");

  if (session.role !== "customer") {
    host.innerHTML = `<div class="sw-panel p-4">
      ${alertBox("Entre como cliente para finalizar a compra.", "info")}
      <a class="btn btn-primary mt-2" href="./entrar.html">Entrar</a>
    </div>`;
    host.setAttribute("aria-busy", "false");
    return;
  }

  try {
    const [cart, cfg] = await Promise.all([api.cart(), api.publicConfig()]);

    if (!cart?.items?.length) {
      host.innerHTML = `<div class="sw-panel p-5 text-center">
        <h1 class="h5">Carrinho vazio</h1>
        <p class="text-muted small">Adicione itens para finalizar.</p>
        <a class="btn btn-primary mt-2" href="./index.html">Ver ofertas</a>
      </div>`;
      host.setAttribute("aria-busy", "false");
      return;
    }

    render(cart, cfg);
    host.setAttribute("aria-busy", "false");
  } catch (error) {
    host.innerHTML = alertBox(error.message || "Erro ao carregar o checkout.");
    host.setAttribute("aria-busy", "false");
  }
}

load();