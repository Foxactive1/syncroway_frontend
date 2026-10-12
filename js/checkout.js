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

// A própria página mostra o carrinho — não gastar GET /cart só para o badge.
renderHeader("cart", { skipBadge: true });
renderFooter();

const host = document.getElementById("sw-checkout");

function groupByStore(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.store_id ?? "unknown";
    if (!map.has(key))
      map.set(key, { store_id: key, store_name: item.store_name, items: [] });
    map.get(key).items.push(item);
  }
  return [...map.values()];
}

function storeFeeRow(group) {
  return `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div>
        <div class="fw-semibold small">${escapeHtml(group.store_name || "Loja")}</div>
        <div class="text-muted small">${group.items.length} item(ns)</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="small text-muted">Taxa</span>
        <input type="number" min="0" step="0.01" value="0" class="form-control form-control-sm"
               style="width:110px" data-fee-store="${group.store_id}">
      </div>
    </div>`;
}

function render(cart, cfg = {}) {
  const groups = groupByStore(cart.items);
  const gatewayActive = Boolean(cfg?.asaas_enabled);

  const feeSection = gatewayActive
    ? `<div class="col-12">
         <div class="alert alert-info small mb-0">
           A taxa de entrega é calculada automaticamente pelo sistema.
         </div>
       </div>`
    : `<div class="col-12">
         <div class="border rounded p-2">
           <div class="small text-muted mb-2">Taxa de entrega por loja</div>
           ${groups.map(storeFeeRow).join("")}
         </div>
       </div>`;

  host.innerHTML = `
  <div class="row g-3">
    <div class="col-12 col-lg-7">
      <div class="sw-panel p-3 p-md-4">
        <h1 class="h5 mb-3">Entrega e pagamento</h1>
        <form id="sw-form" class="row g-3">
          <div class="col-12">
            <label class="form-label small">Endereço completo</label>
            <input name="address" class="form-control" required
                   placeholder="Rua, número, bairro, cidade">
          </div>
          <div class="col-12">
            <label class="form-label small">Forma de pagamento</label>
            <select name="payment_method" class="form-select">
              <option value="pix">Pix</option>
              <option value="card_online">Cartão online</option>
              <option value="card_on_delivery">Cartão na entrega</option>
              <option value="cash">Dinheiro</option>
            </select>
          </div>
          <div class="col-12">
            <label class="form-label small">Observações (opcional)</label>
            <textarea name="notes" class="form-control" rows="2"
              placeholder="Ponto de referência, troco, instruções..."></textarea>
          </div>

          ${
            !gatewayActive && groups.length > 1
              ? `<div class="col-12">
                   <div class="alert alert-light small mb-2">
                     Seu carrinho tem itens de <strong>${groups.length} lojas</strong>.
                     Cada loja gera um pedido e uma entrega — informe a taxa por loja.
                   </div>
                 </div>`
              : ""
          }

          ${feeSection}

          <div class="col-12">
            <button class="btn btn-primary w-100 py-2" type="submit">
              Confirmar pedido
            </button>
          </div>
        </form>
      </div>
    </div>
    <div class="col-12 col-lg-5">
      <div class="sw-panel p-3">
        <h2 class="h6">Itens (${cart.item_count})</h2>
        ${cart.items
          .map(
            (item) =>
              `<div class="d-flex justify-content-between small py-1">
                 <span>${item.quantity}× ${escapeHtml(item.name)}</span>
                 <span>${money(item.line_total)}</span>
               </div>`
          )
          .join("")}
        <hr>
        <div class="d-flex justify-content-between">
          <span>Subtotal</span><strong>${money(cart.subtotal)}</strong>
        </div>
        <div class="text-muted small mt-1">
          ${
            gatewayActive
              ? "A taxa de entrega será incluída automaticamente."
              : "Taxas de entrega são somadas no total final."
          }
        </div>
      </div>
    </div>
  </div>`;

  document.getElementById("sw-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    const form = new FormData(event.currentTarget);

    const payload = {
      address: form.get("address"),
      payment_method: form.get("payment_method"),
      notes: form.get("notes") || null,
    };

    // Só envia taxas quando o backend realmente as aceita.
    if (!gatewayActive) {
      const delivery_fees = {};
      let aggregateFee = 0;
      event.currentTarget
        .querySelectorAll("[data-fee-store]")
        .forEach((input) => {
          const value = Number(input.value) || 0;
          delivery_fees[input.dataset.feeStore] = value;
          aggregateFee += value;
        });
      payload.delivery_fees = delivery_fees;
      payload.delivery_fee = aggregateFee;
    }

    try {
      const result = await api.checkout(payload);
      refreshCartBadge({ force: true });
      const orders = result.orders || (result.order ? [result.order] : []);
      host.innerHTML = `<div class="sw-panel p-4 text-center">
        <i class="bi bi-check-circle-fill text-success fs-1"></i>
        <h1 class="h5 mt-3">Pedido confirmado!</h1>
        <p class="text-muted small">${
          orders.length
            ? `Foram gerados ${orders.length} pedido(s): ${orders
                .map((o) => escapeHtml(o.code || o.id))
                .join(", ")}`
            : "Acompanhe o andamento no seu painel."
        }</p>
        <a class="btn btn-primary" href="/app/painel.html">Ver meus pedidos</a>
        <a class="btn btn-link" href="/app/index.html">Continuar comprando</a>
      </div>`;
    } catch (error) {
      toast(error.message, "danger");
      button.disabled = false;
    }
  });
}

async function load() {
  if (session.role !== "customer") {
    host.innerHTML = `<div class="sw-panel p-4">${alertBox(
      "Entre como cliente para finalizar a compra.",
      "info"
    )}<a class="btn btn-primary" href="/app/entrar.html">Entrar</a></div>`;
    return;
  }
  try {
    const [cart, cfg] = await Promise.all([
      api.cart(),
      api.publicConfig().catch(() => ({ asaas_enabled: false })),
    ]);
    if (!cart.items.length) {
      host.innerHTML = `<div class="sw-panel p-5 text-center">
        <h1 class="h5">Carrinho vazio</h1>
        <a class="btn btn-primary mt-2" href="/app/index.html">Ver ofertas</a>
      </div>`;
      return;
    }
    render(cart, cfg);
  } catch (error) {
    host.innerHTML = alertBox(error.message);
  }
}

load();