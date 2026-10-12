import { api, session } from "./api.js";
import {
  renderHeader,
  renderFooter,
  money,
  escapeHtml,
  productImage,
  alertBox,
  toast,
  refreshCartBadge,
} from "./ui.js";

// A própria página mostra o carrinho — não gastar GET /cart só para o badge.
renderHeader("cart", { skipBadge: true });
renderFooter();

const host = document.getElementById("sw-cart");

function render(cart) {
  if (!cart.items.length) {
    host.innerHTML = `<div class="sw-panel p-5 text-center">
      <i class="bi bi-cart-x fs-1 text-muted"></i>
      <h1 class="h5 mt-3">Seu carrinho está vazio</h1>
      <a class="btn btn-primary mt-2" href="/app/index.html">Ver ofertas</a></div>`;
    return;
  }
  host.innerHTML = `
  <div class="row g-3">
    <div class="col-12 col-lg-8">
      <div class="sw-panel p-3">
        <h1 class="h5 mb-3">Carrinho (${cart.item_count} itens)</h1>
        ${cart.items
          .map(
            (item) => `<div class="d-flex gap-3 border-bottom py-3 align-items-center">
            <div style="width:80px" class="flex-shrink-0">${productImage(item)}</div>
            <div class="flex-grow-1 min-w-0">
              <div class="fw-semibold small">${escapeHtml(item.name)}</div>
              <div class="text-muted small">${escapeHtml(item.store_name || "")}</div>
              <div class="small">${money(item.unit_price)} cada</div>
            </div>
            <input type="number" class="form-control form-control-sm" style="width:80px" min="1"
              value="${item.quantity}" data-qty="${item.id}">
            <div class="text-end" style="min-width:90px">
              <div class="fw-semibold">${money(item.line_total)}</div>
              <button class="btn btn-link btn-sm text-danger p-0" data-remove="${item.id}">Remover</button>
            </div>
          </div>`
          )
          .join("")}
      </div>
    </div>
    <div class="col-12 col-lg-4">
      <div class="sw-panel p-3">
        <h2 class="h6">Resumo</h2>
        <div class="d-flex justify-content-between"><span>Subtotal</span><strong>${money(cart.subtotal)}</strong></div>
        <p class="text-muted small mt-2">A taxa de entrega é calculada por loja no checkout.</p>
        <a class="btn btn-primary w-100" href="/app/checkout.html">Finalizar compra</a>
      </div>
    </div>
  </div>`;

  host.querySelectorAll("[data-qty]").forEach((input) =>
    input.addEventListener("change", async () => {
      input.disabled = true;
      try {
        render(
          await api.updateCartItem(Number(input.dataset.qty), Number(input.value))
        );
        refreshCartBadge({ force: true });
      } catch (error) {
        toast(error.message, "danger");
        load();
      }
    })
  );

  host.querySelectorAll("[data-remove]").forEach((button) =>
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        render(await api.removeCartItem(Number(button.dataset.remove)));
        refreshCartBadge({ force: true });
      } catch (error) {
        toast(error.message, "danger");
        button.disabled = false;
      }
    })
  );
}

async function load() {
  if (session.role !== "customer") {
    host.innerHTML = `<div class="sw-panel p-4">${alertBox(
      "Entre com uma conta de cliente para usar o carrinho.",
      "info"
    )}<a class="btn btn-primary" href="/app/entrar.html">Entrar</a></div>`;
    return;
  }
  try {
    render(await api.cart());
  } catch (error) {
    host.innerHTML = alertBox(error.message);
  }
}

load();