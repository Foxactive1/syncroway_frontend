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
  q: params.get("q") || "",
  category: params.get("category") || "",
  type: params.get("type") || "",
};

// Render a small first batch to keep the initial DOM and layout work lightweight.
const CATALOG_PAGE_SIZE = 8;
let catalogItems = [];
let visibleItemCount = CATALOG_PAGE_SIZE;

renderHeader("home");
renderFooter();

const searchInput = document.getElementById("sw-search-input");
if (searchInput) searchInput.value = state.q;

const grid = document.getElementById("sw-grid");
const chips = document.getElementById("sw-categories");
const heading = document.getElementById("sw-heading");

// ═══════════════════════════════════════════════════════════
// URL sync
// ═══════════════════════════════════════════════════════════

function syncUrl() {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value) next.set(key, value);
  }
  const qs = next.toString();
  window.history.replaceState({}, "", `./index.html${qs ? `?${qs}` : ""}`);
}

// ═══════════════════════════════════════════════════════════
// Helpers de render
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
          <button class="btn btn-sm btn-soft-primary w-100" data-add="${item.id}" aria-label="${out ? "Indisponível" : "Adicionar " + escapeHtml(item.name) + " ao carrinho"}" ${out ? "disabled" : ""}>
            <i class="bi bi-cart-plus me-1"></i>${out ? "Indisponível" : "Adicionar"}
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
            <i class="bi bi-calendar-check me-1"></i>Agendar
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

async function loadCategories() {
  try {
    const categories = await api.categories();
    const all = `<button type="button" class="sw-catchip ${!state.category ? "active" : ""}" aria-pressed="${!state.category}" data-cat="">
      <i class="bi bi-grid me-1" aria-hidden="true"></i>Tudo</button>`;
    chips.innerHTML =
      all +
      categories
        .map(
          (c) =>
            `<button type="button" class="sw-catchip ${state.category === c.slug ? "active" : ""}"
              aria-pressed="${state.category === c.slug}" data-cat="${escapeHtml(c.slug)}">
              <i class="bi ${c.icon || CATEGORY_ICONS[c.slug] || "bi-tag"} me-1" aria-hidden="true"></i>
              ${escapeHtml(c.name)}
            </button>`
        )
        .join("");

    chips.querySelectorAll("[data-cat]").forEach((button) =>
      button.addEventListener("click", () => {
        state.category = button.dataset.cat;
        syncUrl();
        loadCategories();
        loadCatalog();
      })
    );
  } catch {
    chips.innerHTML = "";
  }
}

// ═══════════════════════════════════════════════════════════
// Catálogo
// ═══════════════════════════════════════════════════════════

function renderCatalogItems() {
  const visibleItems = catalogItems.slice(0, visibleItemCount);
  const remaining = Math.max(0, catalogItems.length - visibleItems.length);
  const moreButton = remaining
    ? `<div class="col-12 text-center pt-2">
         <button type="button" class="btn btn-outline-primary px-4" data-show-more>
           Mostrar mais (${remaining}) <i class="bi bi-chevron-down ms-1" aria-hidden="true"></i>
         </button>
       </div>`
    : "";

  grid.innerHTML = visibleItems.length
    ? visibleItems.map(itemCard).join("") + moreButton
    : `<div class="col-12">${alertBox(
        "Nada encontrado com esses filtros. Tente outra categoria ou busca.",
        "warning"
      )}</div>`;

  grid.setAttribute("aria-busy", "false");
  bindAddButtons();

  const more = grid.querySelector("[data-show-more]");
  more?.addEventListener("click", () => {
    visibleItemCount = Math.min(
      visibleItemCount + CATALOG_PAGE_SIZE,
      catalogItems.length
    );
    renderCatalogItems();
  });
}

async function loadCatalog() {
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = skeletonCards();
  heading.textContent = "Carregando catálogo...";

  try {
    const data = await api.catalog({
      q: state.q,
      category: state.category,
      type: state.type,
    });

    heading.textContent = state.q
      ? `Resultados para "${state.q}" (${data.total})`
      : state.type === "product"
        ? `Produtos disponíveis (${data.total})`
        : state.type === "service"
          ? `Serviços disponíveis (${data.total})`
          : `Ofertas de hoje (${data.total})`;
    catalogItems = Array.isArray(data.items) ? data.items : [];
    visibleItemCount = CATALOG_PAGE_SIZE;
    renderCatalogItems();
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Erro inesperado ao carregar o catálogo.";
    grid.innerHTML = `<div class="col-12">${alertBox(message)}</div>`;
    grid.setAttribute("aria-busy", "false");
    heading.textContent = "Ofertas de hoje";
  }
}

// ═══════════════════════════════════════════════════════════
// Ações de cartão
// ═══════════════════════════════════════════════════════════

function handleNonCustomerClick() {
  if (!session.user) {
    window.location.href = "./entrar.html";
    return true;
  }
  // Usuário logado, mas não é customer (merchant/provider/driver/admin)
  toast(
    `Sua conta "${session.role}" não compra pelo marketplace.`,
    "warning"
  );
  return true;
}

function bindAddButtons() {
  grid.querySelectorAll("[data-add]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (session.role !== "customer") {
        if (handleNonCustomerClick()) return;
      }
      button.disabled = true;
      const original = button.innerHTML;
      button.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Adicionando...`;
      try {
        await api.addToCart(Number(button.dataset.add), 1);
        toast("Produto adicionado ao carrinho", "success");
        refreshCartBadge();
      } catch (error) {
        toast(error.message, "danger");
      } finally {
        button.disabled = false;
        button.innerHTML = original;
      }
    })
  );
}

// ═══════════════════════════════════════════════════════════
// Filtros de tipo (hero buttons)
// ═══════════════════════════════════════════════════════════

function initTypeButtons() {
  const buttons = document.querySelectorAll("[data-type]");
  buttons.forEach((button) => {
    if (button.dataset.type === state.type) button.classList.add("active");
    button.setAttribute("aria-pressed", String(button.dataset.type === state.type));
    button.addEventListener("click", () => {
      state.type = button.dataset.type;
      buttons.forEach((b) => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
      syncUrl();
      loadCatalog();
    });
  });
}

// ═══════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════

initTypeButtons();
loadCategories();
loadCatalog();
