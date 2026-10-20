/* ═══════════════════════════════════════════════════════════════
   SyncroWay — produto.js
   Detalhe de produto ou serviço + ações de compra/agendamento.

   Histórico de correções:
   • Busca direta (api.product/api.service) com fallback robusto
     para o catálogo em 404 — vide fetchItem()
   • host.aria-busy=true no início; false em TODOS os caminhos
   • <input type="number"> sanitizado em input+change+blur
   • Preço de serviço: "Sob orçamento" (on_quote) e "A combinar"
     (hourly sem rate)
   • JSON-LD: seller (não brand), availability, twitter:card dinâmico
   • Validação de URL única (isValidHttpsImage)
   • refreshCartBadge({ force: true }) após adicionar
   • Empty states com link "Voltar ao catálogo"
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

// ═══════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════

renderHeader();
renderFooter();

const params = new URLSearchParams(window.location.search);
const id = Number(params.get("id"));
const type = params.get("type") === "service" ? "service" : "product";
const host = document.getElementById("sw-detail");

if (host) host.setAttribute("aria-busy", "true");

// ═══════════════════════════════════════════════════════════
// Constantes de apresentação
// ═══════════════════════════════════════════════════════════

const MODALITY_LABEL = {
  at_shop: "Na loja",
  in_person: "No local do cliente",
  remote: "Remoto",
};

const PRICING_LABEL = {
  fixed: "Preço fixo",
  hourly: "Por hora",
  on_quote: "Sob orçamento",
};

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function localDate(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Mesma política de ui.js:safeImageUrl — só http(s). */
function isValidHttpsImage(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function backToCatalog() {
  return `<a class="btn btn-outline-primary btn-sm mt-2" href="./index.html">
    <i class="bi bi-arrow-left me-1" aria-hidden="true"></i>Voltar ao catálogo
  </a>`;
}

// ═══════════════════════════════════════════════════════════
// Template: detalhe
// ═══════════════════════════════════════════════════════════

function stockBadge(item) {
  if (item.stock_status === "out") {
    return `<span class="badge text-bg-danger">Sem estoque</span>`;
  }
  if (item.stock_status === "low") {
    return `<span class="badge text-bg-warning">Últimas ${item.stock} unidades</span>`;
  }
  return `<span class="badge text-bg-light">${item.stock} em estoque</span>`;
}

function priceBlock(item, isService) {
  if (isService && item.pricing_model === "on_quote") {
    return `<div class="sw-price fs-2 mb-0">Sob orçamento</div>`;
  }
  if (isService && item.pricing_model === "hourly") {
    if (item.hourly_rate) {
      return `<div class="sw-price fs-2 mb-0">${money(item.hourly_rate)}<small class="fs-6 text-muted">/hora</small></div>`;
    }
    return `<div class="sw-price fs-2 mb-0">A combinar</div>`;
  }
  return `<div class="sw-price fs-2 mb-0">${money(item.price)}</div>`;
}

function detailHtml(item) {
  const isService = item.type === "service";

  const meta = isService
    ? `
      <div class="d-flex flex-wrap gap-2 mb-2">
        <span class="badge text-bg-light">
          <i class="bi bi-clock me-1" aria-hidden="true"></i>${item.duration_minutes || 30} min
        </span>
        <span class="badge text-bg-light">
          <i class="bi bi-geo-alt me-1" aria-hidden="true"></i>${escapeHtml(MODALITY_LABEL[item.modality] || item.modality || "a combinar")}
        </span>
        <span class="badge text-bg-light">
          <i class="bi bi-tag me-1" aria-hidden="true"></i>${escapeHtml(PRICING_LABEL[item.pricing_model] || item.pricing_model || "—")}
        </span>
      </div>`
    : `
      <div class="d-flex flex-wrap gap-2 mb-2">
        ${stockBadge(item)}
        <span class="badge text-bg-light">
          <i class="bi bi-truck me-1" aria-hidden="true"></i>Entrega via motorista parceiro
        </span>
      </div>`;

  const visitFee =
    item.visit_fee && Number(item.visit_fee) > 0
      ? `<p class="small text-muted mb-0 mt-1">+ taxa de visita ${money(item.visit_fee)}</p>`
      : "";

  return `
  <div class="sw-panel p-3 p-md-4">
    <div class="row g-4">
      <div class="col-12 col-md-6">
        <div class="sw-detail-image">${productImage(item)}</div>
      </div>
      <div class="col-12 col-md-6">
        <span class="badge text-bg-dark mb-2">
          ${isService ? "Serviço agendável" : "Produto"}
        </span>
        <h1 class="h4 fw-semibold">${escapeHtml(item.name)}</h1>
        <p class="text-muted small mb-2">
          Oferecido por <strong>${escapeHtml(item.store || item.store_name || "SyncroWay")}</strong>
        </p>
        ${meta}
        ${priceBlock(item, isService)}
        ${visitFee}
        <p class="mt-3">${escapeHtml(item.description || "Sem descrição informada.")}</p>
        <div id="sw-action" class="mt-4"></div>
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// Ações: produto
// ═══════════════════════════════════════════════════════════

function productAction(item) {
  const out = item.stock_status === "out";
  const maxQty = Math.max(1, Number(item.stock) || 1);

  return `
    <div class="row g-2 align-items-stretch">
      <div class="col-12 col-sm-auto">
        <div class="input-group" style="max-width:10rem">
          <button
            class="btn btn-outline-secondary"
            id="sw-minus"
            type="button"
            aria-label="Diminuir quantidade"
            ${out ? "disabled" : ""}
          >−</button>
          <input
            id="sw-qty"
            type="number"
            class="form-control text-center"
            value="1"
            min="1"
            max="${maxQty}"
            inputmode="numeric"
            aria-label="Quantidade do produto"
            ${out ? "disabled" : ""}
          >
          <button
            class="btn btn-outline-secondary"
            id="sw-plus"
            type="button"
            aria-label="Aumentar quantidade"
            ${out ? "disabled" : ""}
          >+</button>
        </div>
      </div>
      <div class="col-12 col-sm">
        <button class="btn btn-primary w-100 py-2" id="sw-add" ${out ? "disabled" : ""}>
          <i class="bi bi-cart-plus me-1" aria-hidden="true"></i>${out ? "Sem estoque" : "Adicionar ao carrinho"}
        </button>
      </div>
      <div class="col-12">
        <a class="btn btn-outline-primary w-100" href="./carrinho.html">
          <i class="bi bi-cart3 me-1" aria-hidden="true"></i>Ir ao carrinho
        </a>
      </div>
    </div>`;
}

function bindProductAction(item) {
  const qtyInput = document.getElementById("sw-qty");
  const minus = document.getElementById("sw-minus");
  const plus = document.getElementById("sw-plus");
  const add = document.getElementById("sw-add");

  if (!qtyInput || !add) return;

  const max = Math.max(1, Number(item.stock) || 1);

  const sanitize = () => {
    qtyInput.value = String(clampInt(qtyInput.value, 1, max));
  };

  minus?.addEventListener("click", () => {
    qtyInput.value = String(clampInt(qtyInput.value, 1, max) - 1 || 1);
    sanitize();
  });

  plus?.addEventListener("click", () => {
    qtyInput.value = String(clampInt(qtyInput.value, 1, max) + 1);
    sanitize();
  });

  // input + change + blur garantem que o valor nunca sai do range,
  // mesmo se o usuário digitar "abc" ou "0" e clicar direto em Adicionar.
  qtyInput.addEventListener("input", sanitize);
  qtyInput.addEventListener("change", sanitize);
  qtyInput.addEventListener("blur", sanitize);

  add.addEventListener("click", async () => {
    if (add.disabled) return;
    sanitize();

    add.disabled = true;
    const original = add.innerHTML;
    add.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Adicionando...`;

    try {
      await api.addToCart(item.id, Number(qtyInput.value) || 1);
      toast("Produto adicionado ao carrinho", "success");
      refreshCartBadge({ force: true });
    } catch (error) {
      toast(error.message, "danger");
    } finally {
      add.disabled = false;
      add.innerHTML = original;
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Ações: serviço
// ═══════════════════════════════════════════════════════════

function serviceAction(item) {
  const tomorrow = localDate(1);
  const isInPerson = item.modality === "in_person";

  return `
    <form id="sw-appt" class="row g-2" novalidate>
      <div class="col-6">
        <label class="form-label small" for="sw-appt-date">Data</label>
        <input
          id="sw-appt-date"
          type="date"
          name="date"
          class="form-control"
          min="${tomorrow}"
          value="${tomorrow}"
          required
        >
      </div>
      <div class="col-6">
        <label class="form-label small" for="sw-appt-time">Hora</label>
        <input
          id="sw-appt-time"
          type="time"
          name="time"
          class="form-control"
          value="09:00"
          required
        >
      </div>
      ${
        isInPerson
          ? `<div class="col-12">
               <label class="form-label small" for="sw-appt-address">Endereço do atendimento</label>
               <input
                 id="sw-appt-address"
                 name="address"
                 class="form-control"
                 placeholder="Rua, número, bairro, cidade"
                 required
               >
             </div>`
          : ""
      }
      <div class="col-12">
        <label class="form-label small" for="sw-appt-notes">Observações (opcional)</label>
        <textarea
          id="sw-appt-notes"
          name="notes"
          class="form-control"
          rows="2"
          placeholder="Detalhes úteis para o prestador..."
        ></textarea>
      </div>
      <div class="col-12">
        <button class="btn btn-primary w-100 py-2" type="submit">
          <i class="bi bi-calendar-check me-1" aria-hidden="true"></i>Solicitar agendamento
        </button>
      </div>
      <div class="col-12">
        <p class="small text-muted mb-0">
          O prestador ainda precisa confirmar o horário. Você acompanha tudo no painel.
        </p>
      </div>
    </form>`;
}

function bindServiceAction(item) {
  const form = document.getElementById("sw-appt");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const submit = form.querySelector('button[type="submit"]');
    const original = submit.innerHTML;
    submit.disabled = true;
    submit.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Enviando...`;

    const formData = new FormData(form);
    const address = String(formData.get("address") || "").trim();
    const rawNotes = String(formData.get("notes") || "").trim();

    // Contrato atual do backend só aceita `notes`. Endereço é
    // concatenado com prefixo legível — se o backend passar a
    // aceitar `address` separado, basta trocar aqui.
    const notes = [address && `Endereço: ${address}`, rawNotes]
      .filter(Boolean)
      .join(" | ");

    try {
      await api.createAppointment({
        service_id: item.id,
        date: formData.get("date"),
        time: formData.get("time"),
        notes: notes || null,
      });
      toast("Agendamento solicitado! Acompanhe no painel.", "success");
      form.reset();
    } catch (error) {
      toast(error.message, "danger");
    } finally {
      submit.disabled = false;
      submit.innerHTML = original;
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Bloqueio por role
// ═══════════════════════════════════════════════════════════

function renderLoginPrompt() {
  const verb = type === "service" ? "agendar" : "comprar";
  return `<a class="btn btn-primary px-4 py-2" href="./entrar.html">
    <i class="bi bi-box-arrow-in-right me-1" aria-hidden="true"></i>Entre para ${verb}
  </a>`;
}

function renderRoleBlocked() {
  return `<div class="alert alert-info small mb-0">
    Sua conta <strong>${escapeHtml(session.role || "")}</strong> não compra nem agenda pelo marketplace.
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// Meta / SEO
// ═══════════════════════════════════════════════════════════

function setMeta(selector, attribute, value) {
  const element = document.querySelector(selector);
  if (!element) return;
  if (value) element.setAttribute(attribute, value);
  else element.removeAttribute(attribute);
}

function updateItemMetadata(item) {
  const name = String(item.name || "Item SyncroWay").trim();
  const store = String(item.store || item.store_name || "SyncroWay").trim();
  const rawDescription = String(
    item.description ||
      `${name} — consulte preço, disponibilidade e informações no SyncroWay.`
  );
  const description = rawDescription.replace(/\s+/g, " ").trim().slice(0, 300);

  const canonical = new URL(window.location.href);
  canonical.hash = "";
  const canonicalUrl = canonical.href;

  const image = isValidHttpsImage(item.image_url)
    ? String(item.image_url).trim()
    : "";

  const isProduct = item.type !== "service";
  const price = Number(item.price);
  const hasPrice = Number.isFinite(price) && price > 0;

  // Cria <link rel="canonical"> se não existir (produto.html foi
  // reformulado sem canonical estático para evitar shell-canônico).
  let canonicalLink = document.querySelector("link[rel='canonical']");
  if (!canonicalLink) {
    canonicalLink = document.createElement("link");
    canonicalLink.rel = "canonical";
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.href = canonicalUrl;

  document.title = `${name} — SyncroWay`;

  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[property="og:type"]', "content", isProduct ? "product" : "website");
  setMeta('meta[property="og:title"]', "content", `${name} — SyncroWay`);
  setMeta('meta[property="og:description"]', "content", description);
  setMeta('meta[property="og:url"]', "content", canonicalUrl);
  setMeta('meta[property="og:image"]', "content", image);
  setMeta('meta[name="twitter:title"]', "content", `${name} — SyncroWay`);
  setMeta('meta[name="twitter:description"]', "content", description);
  setMeta('meta[name="twitter:image"]', "content", image);
  setMeta(
    'meta[name="twitter:card"]',
    "content",
    image ? "summary_large_image" : "summary"
  );

  document.getElementById("sw-item-jsonld")?.remove();

  if (isProduct && hasPrice) {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name,
      description,
      url: canonicalUrl,
      offers: {
        "@type": "Offer",
        priceCurrency: "BRL",
        price: price.toFixed(2),
        url: canonicalUrl,
        availability:
          item.stock_status === "out"
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
        seller: { "@type": "Organization", name: store },
      },
    };

    if (image) schema.image = image;

    const script = document.createElement("script");
    script.id = "sw-item-jsonld";
    script.type = "application/ld+json";
    // textContent (não innerHTML): imune a injeção via campos do item.
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  }
}

// ═══════════════════════════════════════════════════════════
// Load
// ═══════════════════════════════════════════════════════════

/**
 * Busca o item. Preferência: endpoint dedicado (api.product(id) /
 * api.service(id)) — evita baixar o catálogo inteiro e resolve o
 * falso 404 de itens fora da página 1.
 *
 * FALLBACK: se o backend responder 404, pode significar:
 *   (a) endpoint dedicado não existe (backend antigo sem
 *       /products/:id e /services/:id — o Flask devolve 404 genérico)
 *   (b) item realmente não existe/arquivado
 * Nos dois casos, tentamos o catálogo antes de desistir:
 *   (a) catálogo encontra → retorna item
 *   (b) catálogo não encontra → null → estado "não encontrado"
 *
 * Erros 5xx/401/0 (rede) NÃO caem no fallback — sobem para o
 * caller, que mostra alerta. Não mascarar falha de servidor.
 */
async function fetchItem() {
  const dedicated = type === "service" ? api.service : api.product;

  if (typeof dedicated === "function") {
    try {
      return await dedicated(id);
    } catch (error) {
      if (error?.status !== 404) throw error;
      // 404 → tenta o catálogo abaixo.
    }
  }

  const data = await api.catalog({ type });
  return data.items.find((entry) => entry.id === id) || null;
}

async function load() {
  if (!host) return;

  if (!id || Number.isNaN(id)) {
    host.innerHTML =
      alertBox(
        "Item inválido. Volte ao catálogo e escolha outro.",
        "warning"
      ) + backToCatalog();
    host.setAttribute("aria-busy", "false");
    return;
  }

  let item;
  try {
    item = await fetchItem();
  } catch (error) {
    host.innerHTML =
      alertBox(error.message || "Erro ao carregar o item.") + backToCatalog();
    host.setAttribute("aria-busy", "false");
    return;
  }

  if (!item) {
    host.innerHTML =
      alertBox("Item não encontrado ou fora do ar.", "warning") +
      backToCatalog();
    host.setAttribute("aria-busy", "false");
    document
      .querySelector('meta[name="robots"]')
      ?.setAttribute("content", "noindex,follow");
    return;
  }

  updateItemMetadata(item);
  host.innerHTML = detailHtml(item);

  const action = document.getElementById("sw-action");
  if (!action) {
    host.setAttribute("aria-busy", "false");
    return;
  }

  if (!session.user) {
    action.innerHTML = renderLoginPrompt();
    host.setAttribute("aria-busy", "false");
    return;
  }

  if (session.role !== "customer") {
    action.innerHTML = renderRoleBlocked();
    host.setAttribute("aria-busy", "false");
    return;
  }

  if (item.type === "product") {
    action.innerHTML = productAction(item);
    bindProductAction(item);
  } else {
    action.innerHTML = serviceAction(item);
    bindServiceAction(item);
  }

  host.setAttribute("aria-busy", "false");
}

load();