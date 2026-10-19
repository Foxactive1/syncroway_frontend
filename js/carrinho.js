/* ═══════════════════════════════════════════════════════════════
   SyncroWay — carrinho.js
   Carrinho: listar itens, alterar quantidade, remover.

   Correções em relação à versão anterior:
   • Preserva foco e scroll após re-render de quantidade
   • Quantidade clampada em [1, 999]; no-op não dispara request
   • 401 → redirect para login (sessão expirada durante compra)
   • aria-label em inputs de qty e botões de remover
   • Anúncio via #sw-cart-status, não re-render + aria-live
   • type="button" nos botões de remover (defesa)
   • sw-min-w-0 (classe do projeto) em vez de min-w-0
   • Spinner visual na linha durante update/remove
   ═══════════════════════════════════════════════════════════════ */

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

// A própria página mostra o carrinho — não gastar GET /cart para o badge.
renderHeader("cart", { skipBadge: true });
renderFooter();

const host = document.getElementById("sw-cart");

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function announce(message) {
  const el = document.getElementById("sw-cart-status");
  if (el) el.textContent = message;
}

function clampQuantity(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(999, Math.max(1, parsed));
}

async function handleAuthError(error) {
  if (error?.status === 401) {
    session.clear?.();
    window.location.href = "./entrar.html?next=%2Fcarrinho.html";
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// Render
// ═══════════════════════════════════════════════════════════

function render(cart) {
  if (!cart.items.length) {
    host.innerHTML = `<div class="sw-panel p-5 text-center">
      <i class="bi bi-cart-x fs-1 text-muted" aria-hidden="true"></i>
      <h1 class="h5 mt-3">Seu carrinho está vazio</h1>
      <p class="text-muted small">Adicione itens para finalizar.</p>
      <a class="btn btn-primary mt-2" href="./index.html">Ver ofertas</a>
    </div>`;
    return;
  }

  host.innerHTML = `
  <div class="row g-3">
    <div class="col-12 col-lg-8">
      <div class="sw-panel p-3">
        <h1 class="h5 mb-3">
          Carrinho
          <span class="text-muted fw-normal small">
            (${cart.item_count} ${cart.item_count === 1 ? "item" : "itens"})
          </span>
        </h1>

        ${cart.items
          .map(
            (item) => `
          <div class="d-flex gap-3 border-bottom py-3 align-items-center"
               data-row="${item.id}">
            <div style="width:80px" class="flex-shrink-0">
              ${productImage(item)}
            </div>

            <div class="flex-grow-1 sw-min-w-0">
              <div class="fw-semibold small text-truncate">
                ${escapeHtml(item.name)}
              </div>
              <div class="text-muted small">
                ${escapeHtml(item.store_name || "")}
              </div>
              <div class="small">${money(item.unit_price)} cada</div>
            </div>

            <input
              type="number"
              class="form-control form-control-sm"
              style="width:80px"
              min="1"
              max="999"
              value="${Number(item.quantity)}"
              data-qty="${item.id}"
              inputmode="numeric"
              aria-label="Quantidade de ${escapeHtml(item.name)}"
            >

            <div class="text-end" style="min-width:90px">
              <div class="fw-semibold">${money(item.line_total)}</div>
              <button
                type="button"
                class="btn btn-link btn-sm text-danger p-0"
                data-remove="${item.id}"
                aria-label="Remover ${escapeHtml(item.name)} do carrinho"
              >Remover</button>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>

    <div class="col-12 col-lg-4">
      <div class="sw-panel p-3">
        <h2 class="h6">Resumo</h2>
        <div class="d-flex justify-content-between">
          <span>Subtotal</span>
          <strong>${money(cart.subtotal)}</strong>
        </div>
        <p class="text-muted small mt-2">
          A taxa de entrega é calculada por loja no checkout.
        </p>
        <a class="btn btn-primary w-100" href="./checkout.html">
          Finalizar compra
        </a>
      </div>
    </div>
  </div>`;

  bindQuantityInputs();
  bindRemoveButtons();
}

// ═══════════════════════════════════════════════════════════
// Ações
// ═══════════════════════════════════════════════════════════

function bindQuantityInputs() {
  host.querySelectorAll("[data-qty]").forEach((input) => {
    // Guarda o valor original para detectar no-op e restaurar em erro.
    input.dataset.original = input.value;

    input.addEventListener("change", async () => {
      const itemId = Number(input.dataset.qty);
      const originalQty = Number.parseInt(input.dataset.original, 10) || 1;
      const requested = clampQuantity(input.value);

      // Normaliza o que ficou visível antes de qualquer ação.
      input.value = String(requested);

      // No-op (clamp igual ao original ou apenas saiu do campo).
      if (requested === originalQty) return;

      // Feedback visual na linha inteira, não só no input.
      const row = input.closest("[data-row]");
      row?.classList.add("sw-loading");
      input.disabled = true;

      // Preserva foco e scroll — o render seguinte recria o DOM.
      const focusedQtyId = String(itemId);
      const scrollY = window.scrollY;

      try {
        const updated = await api.updateCartItem(itemId, requested);
        render(updated);
        refreshCartBadge({ force: true });
        announce("Quantidade atualizada.");

        // Restaura foco no MESMO input de quantidade (se ainda existir)
        // e o scroll da página.
        host
          .querySelector(`[data-qty="${focusedQtyId}"]`)
          ?.focus({ preventScroll: true });
        window.scrollTo(0, scrollY);
      } catch (error) {
        if (await handleAuthError(error)) return;

        toast(error.message || "Erro ao atualizar quantidade.", "danger");
        // Restaura o valor original sem re-render (evita perder mais estado).
        input.value = String(originalQty);
        row?.classList.remove("sw-loading");
        input.disabled = false;
      }
    });
  });
}

function bindRemoveButtons() {
  host.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      const itemId = Number(button.dataset.remove);
      const row = button.closest("[data-row]");
      row?.classList.add("sw-loading");
      button.disabled = true;

      const scrollY = window.scrollY;

      try {
        const updated = await api.removeCartItem(itemId);
        render(updated);
        refreshCartBadge({ force: true });
        announce("Item removido do carrinho.");
        window.scrollTo(0, scrollY);
      } catch (error) {
        if (await handleAuthError(error)) return;

        toast(error.message || "Erro ao remover item.", "danger");
        row?.classList.remove("sw-loading");
        button.disabled = false;
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// Load
// ═══════════════════════════════════════════════════════════

async function load() {
  if (!host) return;

  host.setAttribute("aria-busy", "true");

  if (session.role !== "customer") {
    host.innerHTML = `<div class="sw-panel p-4">
      ${alertBox("Entre com uma conta de cliente para usar o carrinho.", "info")}
      <a class="btn btn-primary mt-2" href="./entrar.html">Entrar</a>
    </div>`;
    host.setAttribute("aria-busy", "false");
    return;
  }

  try {
    render(await api.cart());
    host.setAttribute("aria-busy", "false");
  } catch (error) {
    if (await handleAuthError(error)) return;
    host.innerHTML = alertBox(error.message || "Erro ao carregar o carrinho.");
    host.setAttribute("aria-busy", "false");
  }
}

load();