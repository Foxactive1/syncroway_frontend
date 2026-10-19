/* ═══════════════════════════════════════════════════════════════
   SyncroWay — home.js
   Catálogo público: busca, filtros por categoria/tipo e carrinho.

   Correções em relação à versão anterior:
   • syncUrl preserva a rota ("/" em produção, não "/index.html")
   • Categoria inválida é detectada e resetada
   • Categorias cacheadas (1× por sessão)
   • Falha de categorias não apaga o "Tudo"
   • type/q/category nunca vão como string vazia à API
   • aria-busy volta a false DEPOIS do conteúdo
   • add/reset por delegação (1 listener no grid)
   • add dispara refreshCartBadge({ force: true })
   • 401 → redirect para /entrar.html
   • AbortSeq descarta respostas fora de ordem
   • Estado vazio com botão "Limpar filtros"
   ═══════════════════════════════════════════════════════════════ */

import { api, session, ApiError } from "./api.js";
import { CATEGORY_ICONS } from "./config.js";
import {
  renderHeader,
  renderFooter,
  money,
  escapeHtml,
  productImage,
  skeletonCards,
  alertBox,
  toast,
  refreshCartBadge,
} from "./ui.js";

// ═══════════════════════════════════════════════════════════
// Estado
// ═══════════════════════════════════════════════════════════

const params = new URLSearchParams(window.location.search);

const state = {
  q: (params.get("q") || "").trim(),
  category: params.get("category") || "",
  type: params.get("type") || "",
};

let cachedCategories = null;
let requestSeq = 0;

// ═══════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════

renderHeader("home");
renderFooter();

const searchInput = document.getElementById("sw-search-input");
const grid = document.getElementById("sw-grid");
const chips = document.getElementById("sw-categories");
const heading = document.getElementById("sw-heading");
const typeButtons = document.querySelectorAll("[data-type]");

if (searchInput) searchInput.value = state.q;

// ═══════════════════════════════════════════════════════════
// URL sync
// ═══════════════════════════════════════════════════════════

/**
 * Reflete o estado na barra de endereço sem forçar "index.html".
 * Em produção a home é "/" — forçar "/index.html" quebra canonical
 * e gera URL duplicada para SEO.
 */
function syncUrl() {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value) next.set(key, value);
  }

  const qs = next.toString();
  const basePath =
    window.location.pathname.replace(/\/?index\.html$/, "/") || "/";

  window.history.replaceState({}, "", `${basePath}${qs ? `?${qs}` : ""}`);
}

// ═══════════════════════════════════════════════════════════
// Templates de cartão
// ═══════════════════════════════════════════════════════════

const MODALITY_LABEL = {
  at_shop: "Na loja",
  in_person: "No local",
  remote: "Remoto",
};

function productCard(item) {
  const url = `./produto.html?type=product&id=${item.id}`;
  const out = item.stock_status === "out";
  const low = item.stock_status === "low";

  return `<div class="col-6 col-md-4 col-lg-3">
    <div class="card sw-card h-100">
      <a href="${url}">${productImage(item)}</a>
      <div class="card-body d-flex flex-column gap-1">
        ${
          low || out
            ? `<span class="badge text-bg-${out ? "danger" : "warning"} align-self-start">
                 ${out ? "Sem estoque" : `Últimas ${item.stock}`}
               </span>`
            : `<span class="badge text-bg-light align-self-start">${escapeHtml(item.badge || "Disponível")}</span>`
        }
        <div class="sw-price">${money(item.price)}</div>
        <span class="sw-free">Frete combinado com a loja</span>
        <a href="${url}" class="sw-title-clamp">${escapeHtml(item.name)}</a>
        <small class="text-muted">${escapeHtml(item.store || item.store_name || "")}</small>
        <div class="mt-auto pt-2">
          <button
            class="btn btn-sm btn-soft-primary w-100"
            data-add="${item.id}"
            aria-label="${out ? "Indisponível" : `Adicionar ${escapeHtml(item.name)} ao carrinho`}"
            ${out ? "disabled" : ""}
          >
            <i class="bi bi-cart-plus me-1" aria-hidden="true"></i>${out ? "Indisponível" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function serviceCard(item) {
  const url = `./produto.html?type=service&id=${item.id}`;
  const duration = item.duration_minutes ? `${item.duration_minutes} min` : "a combinar";
  const modality = MODALITY_LABEL[item.modality] || item.modality || "a combinar";

  return `<div class="col-6 col-md-4 col-lg-3">
    <div class="card sw-card h-100">
      <a href="${url}">${productImage(item)}</a>
      <div class="card-body d-flex flex-column gap-1">
        <span class="badge text-bg-light align-self-start">${escapeHtml(item.badge || "Agendável")}</span>
        <div class="sw-price">${money(item.price)}</div>
        <span class="sw-free">${escapeHtml(duration)} · ${escapeHtml(modality)}</span>
        <a href="${url}" class="sw-title-clamp">${escapeHtml(item.name)}</a>
        <small class="text-muted">${escapeHtml(item.store || item.store_name || "")}</small>
        <div class="mt-auto pt-2">
          <a class="btn btn-sm btn-soft-primary w-100" href="${url}">
            <i class="bi bi-calendar-check me-1" aria-hidden="true"></i>Agendar
          </a>
        </div>
      </div>
    </div>
  </div>`;
}

function itemCard(item) {
  return item.type === "service" ? serviceCard(item) : productCard(item);
}

// ═══════════════════════════════════════════════════════════
// Categorias
// ═══════════════════════════════════════════════════════════

/**
 * Renderiza os chips a partir de uma lista já carregada.
 * Se `state.category` não existe mais (URL antiga, loja removida),
 * reseta para "Tudo" — sem isso o usuário fica sem chip ativo
 * e sem forma de "destravar" a home.
 */
function renderChips(categories) {
  if (!chips) return;

  if (state.category) {
    const valid = new Set(categories.map((c) => c.slug));
    if (!valid.has(state.category)) {
      state.category = "";
      syncUrl();
    }
  }

  const allActive = !state.category;

  const all = `<button
    type="button"
    class="sw-catchip ${allActive ? "active" : ""}"
    aria-pressed="${allActive}"
    data-cat=""
  >
    <i class="bi bi-grid me-1" aria-hidden="true"></i>Tudo
  </button>`;

  chips.innerHTML =
    all +
    categories
      .map((c) => {
        const active = state.category === c.slug;
        const icon = c.icon || CATEGORY_ICONS[c.slug] || "bi-tag";
        return `<button
          type="button"
          class="sw-catchip ${active ? "active" : ""}"
          aria-pressed="${active}"
          data-cat="${escapeHtml(c.slug)}"
        >
          <i class="bi ${icon} me-1" aria-hidden="true"></i>
          ${escapeHtml(c.name)}
        </button>`;
      })
      .join("");
}

/**
 * Carrega categorias 1× por sessão. Falha não derruba a barra —
 * mantém "Tudo" renderizado para o usuário conseguir filtrar.
 */
async function loadCategories() {
  if (cachedCategories) {
    renderChips(cachedCategories);
    return;
  }

  try {
    cachedCategories = await api.categories();
    renderChips(cachedCategories);
  } catch {
    if (state.category) {
      state.category = "";
      syncUrl();
    }
    renderChips([]);
  }
}

// Delegação: registrada 1×, sobrevive a innerHTML de renderChips.
chips?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cat]");
  if (!button) return;

  const nextCategory = button.dataset.cat || "";
  if (nextCategory === state.category) return;

  state.category = nextCategory;
  syncUrl();
  if (cachedCategories) renderChips(cachedCategories);
  loadCatalog();
});

// ═══════════════════════════════════════════════════════════
// Catálogo
// ═══════════════════════════════════════════════════════════

function emptyStateHtml() {
  const hasFilters = Boolean(state.q || state.category || state.type);

  if (!hasFilters) {
    return alertBox(
      "O catálogo está vazio no momento. Volte em breve.",
      "info"
    );
  }

  return `<div class="alert alert-warning d-flex flex-column gap-2">
    <div>
      <i class="bi bi-search me-2" aria-hidden="true"></i>
      Nada encontrado com esses filtros. Tente outra categoria ou busca.
    </div>
    <button
      type="button"
      class="btn btn-sm btn-outline-dark align-self-start"
      data-reset-filters
    >
      <i class="bi bi-x-circle me-1" aria-hidden="true"></i>Limpar filtros
    </button>
  </div>`;
}

function buildHeadingText(data) {
  if (state.q) return `Resultados para "${state.q}" (${data.total})`;
  if (state.type === "product") return `Produtos disponíveis (${data.total})`;
  if (state.type === "service") return `Serviços disponíveis (${data.total})`;
  return `Ofertas de hoje (${data.total})`;
}

async function loadCatalog() {
  if (!grid || !heading) return;

  // Sequência: descarta respostas que chegam fora de ordem.
  const mySeq = ++requestSeq;

  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = skeletonCards();
  heading.textContent = "Carregando catálogo...";

  let data;

  try {
    // undefined remove o parâmetro da query string.
    data = await api.catalog({
      q: state.q || undefined,
      category: state.category || undefined,
      type: state.type || undefined,
    });
  } catch (error) {
    if (mySeq !== requestSeq) return;

    if (error instanceof ApiError && error.status === 401) {
      session.clear?.();
      window.location.href = "./entrar.html";
      return;
    }

    const message =
      error instanceof ApiError
        ? error.message
        : "Erro inesperado ao carregar o catálogo.";

    grid.innerHTML = `<div class="col-12">${alertBox(message)}</div>`;
    grid.setAttribute("aria-busy", "false");
    heading.textContent = "Ofertas de hoje";
    return;
  }

  if (mySeq !== requestSeq) return;

  // Conteúdo ANTES de aria-busy=false: o SR anuncia o conteúdo
  // final, não um "done" prematuro seguido de cards.
  heading.textContent = buildHeadingText(data);
  grid.innerHTML = data.items.length
    ? data.items.map(itemCard).join("")
    : `<div class="col-12">${emptyStateHtml()}</div>`;
  grid.setAttribute("aria-busy", "false");
}

// ═══════════════════════════════════════════════════════════
// Ações do cartão (delegação única no grid)
// ═══════════════════════════════════════════════════════════

function resetFilters() {
  state.q = "";
  state.category = "";
  state.type = "";
  if (searchInput) searchInput.value = "";
  syncUrl();
  if (cachedCategories) renderChips(cachedCategories);
  syncTypeButtons();
  loadCatalog();
}

async function handleAddClick(button) {
  if (button.disabled) return;

  if (session.role !== "customer") {
    if (!session.user) {
      window.location.href = "./entrar.html";
      return;
    }
    toast(
      `Sua conta "${session.role}" não compra pelo marketplace.`,
      "warning"
    );
    return;
  }

  button.disabled = true;
  const original = button.innerHTML;
  button.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Adicionando...`;

  try {
    await api.addToCart(Number(button.dataset.add), 1);
    toast("Produto adicionado ao carrinho", "success");
    // force: true — ignora TTL de 5s; senão o badge fica atrás do estado real.
    refreshCartBadge({ force: true });
  } catch (error) {
    toast(error.message, "danger");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

grid?.addEventListener("click", (event) => {
  if (event.target.closest("[data-reset-filters]")) {
    resetFilters();
    return;
  }
  const addButton = event.target.closest("[data-add]");
  if (addButton) handleAddClick(addButton);
});

// ═══════════════════════════════════════════════════════════
// Filtros de tipo (hero)
// ═══════════════════════════════════════════════════════════

function syncTypeButtons() {
  typeButtons.forEach((button) => {
    const active = (button.dataset.type || "") === state.type;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function initTypeButtons() {
  typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextType = button.dataset.type || "";
      if (nextType === state.type) return;
      state.type = nextType;
      syncUrl();
      syncTypeButtons();
      loadCatalog();
    });
  });
  syncTypeButtons();
}

// ═══════════════════════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════════════════════

initTypeButtons();

(async function boot() {
  await loadCategories();
  loadCatalog();
})();