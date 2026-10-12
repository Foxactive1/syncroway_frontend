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

function render(cart, cfg = {}) {
  const groups = groupByStore(cart.items);
  const gatewayActive = Boolean(cfg?.asaas_enabled);

  const fee = Number(cfg.delivery_fee_per_store || 0);
  const feeSection = `<div class="col-12"><div class="alert alert-info small mb-0">
    Entrega: ${money(fee)} por loja. Total de frete: ${money(fee * groups.length)}.
  </div></div>`;
  const methods = cfg.payment_methods || ["cash", "card_on_delivery"];
  const labels = {pix: "Pix", card_online: "Cartão online", cash: "Dinheiro na entrega", card_on_delivery: "Cartão na entrega"};
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
              ${methods.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(labels[m] || m)}</option>`).join("")}
            </select>
          </div>
          <div class="col-12">
            <label class="form-label small">Observações (opcional)</label>
            <textarea name="notes" class="form-control" rows="2"
              placeholder="Ponto de referência, troco, instruções..."></textarea>
          </div>

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

    try {
      const result = await api.checkout(payload);
      refreshCartBadge({ force: true });
      if (["pix", "card_online"].includes(payload.payment_method)) {
        const ids = (result.orders || []).map(o => o.id).join(",");
        window.location.href = `./pagamento.html?ids=${encodeURIComponent(ids)}`;
        return;
      }
      const orders = result.orders || (result.order ? [result.order] : []);
      host.innerHTML = `<div class="sw-panel p-4 text-center">
        <i class="bi bi-check-circle-fill text-success fs-1"></i>
        <h1 class="h5 mt-3">Pedido criado!</h1>
        <p class="text-muted small">${
          orders.length
            ? `Foram gerados ${orders.length} pedido(s): ${orders
                .map((o) => escapeHtml(o.code || o.id))
                .join(", ")}`
            : "O pagamento será recebido na entrega. Acompanhe no painel."
        }</p>
        <a class="btn btn-primary" href="./painel.html">Ver meus pedidos</a>
        <a class="btn btn-link" href="./index.html">Continuar comprando</a>
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
    )}<a class="btn btn-primary" href="./entrar.html">Entrar</a></div>`;
    return;
  }
  try {
    const [cart, cfg] = await Promise.all([
      api.cart(),
      api.publicConfig(),
    ]);
    if (!cart.items.length) {
      host.innerHTML = `<div class="sw-panel p-5 text-center">
        <h1 class="h5">Carrinho vazio</h1>
        <a class="btn btn-primary mt-2" href="./index.html">Ver ofertas</a>
      </div>`;
      return;
    }
    render(cart, cfg);
  } catch (error) {
    host.innerHTML = alertBox(error.message);
  }
}

load();
