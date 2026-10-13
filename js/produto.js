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

function detailHtml(item) {
  const isService = item.type === "service";

  const meta = isService
    ? `
      <div class="d-flex flex-wrap gap-2 mb-2">
        <span class="badge text-bg-light">
          <i class="bi bi-clock me-1"></i>${item.duration_minutes || 30} min
        </span>
        <span class="badge text-bg-light">
          <i class="bi bi-geo-alt me-1"></i>${escapeHtml(MODALITY_LABEL[item.modality] || item.modality || "a combinar")}
        </span>
        <span class="badge text-bg-light">
          <i class="bi bi-tag me-1"></i>${escapeHtml(PRICING_LABEL[item.pricing_model] || item.pricing_model || "—")}
        </span>
      </div>`
    : `
      <div class="d-flex flex-wrap gap-2 mb-2">
        ${stockBadge(item)}
        <span class="badge text-bg-light">
          <i class="bi bi-truck me-1"></i>Entrega via motorista parceiro
        </span>
      </div>`;

  const priceBlock = isService && item.hourly_rate
    ? `<div class="sw-price fs-2 mb-0">${money(item.hourly_rate)}<small class="fs-6 text-muted">/hora</small></div>`
    : `<div class="sw-price fs-2 mb-0">${money(item.price)}</div>`;

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
        ${priceBlock}
        ${item.visit_fee ? `<p class="small text-muted mb-0 mt-1">+ taxa de visita ${money(item.visit_fee)}</p>` : ""}
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
  const maxQty = Math.max(1, item.stock || 1);
  return `
    <div class="row g-2 align-items-stretch">
      <div class="col-12 col-sm-auto">
        <div class="input-group" style="max-width:160px">
          <button class="btn btn-outline-secondary" id="sw-minus" type="button" aria-label="Diminuir quantidade" ${out ? "disabled" : ""}>−</button>
          <input id="sw-qty" type="number" class="form-control text-center"
            value="1" min="1" max="${maxQty}" aria-label="Quantidade do produto" ${out ? "disabled" : ""}>
          <button class="btn btn-outline-secondary" id="sw-plus" type="button" aria-label="Aumentar quantidade" ${out ? "disabled" : ""}>+</button>
        </div>
      </div>
      <div class="col-12 col-sm">
        <button class="btn btn-primary w-100 py-2" id="sw-add" ${out ? "disabled" : ""}>
          <i class="bi bi-cart-plus me-1"></i>${out ? "Sem estoque" : "Adicionar ao carrinho"}
        </button>
      </div>
      <div class="col-12">
        <a class="btn btn-outline-primary w-100" href="./carrinho.html">
          <i class="bi bi-cart3 me-1"></i>Ir ao carrinho
        </a>
      </div>
    </div>`;
}

function bindProductAction(item) {
  const qtyInput = document.getElementById("sw-qty");
  const minus = document.getElementById("sw-minus");
  const plus = document.getElementById("sw-plus");
  const add = document.getElementById("sw-add");

  minus?.addEventListener("click", () => {
    qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
  });
  plus?.addEventListener("click", () => {
    qtyInput.value = Math.min(Number(qtyInput.max), Number(qtyInput.value) + 1);
  });
  qtyInput?.addEventListener("change", () => {
    const v = Number(qtyInput.value);
    qtyInput.value = Math.max(1, Math.min(Number(qtyInput.max), isNaN(v) ? 1 : v));
  });

  add?.addEventListener("click", async () => {
    add.disabled = true;
    const original = add.innerHTML;
    add.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Adicionando...`;
    try {
      await api.addToCart(item.id, Number(qtyInput.value) || 1);
      toast("Produto adicionado ao carrinho", "success");
      refreshCartBadge();
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
  // Sugere amanhã às 09:00 como default.
  const tomorrow = localDate(1);
  const isInPerson = item.modality === "in_person";
  return `
    <form id="sw-appt" class="row g-2">
      <div class="col-6">
        <label class="form-label small">Data</label>
        <input type="date" name="date" class="form-control" min="${tomorrow}" value="${tomorrow}" required>
      </div>
      <div class="col-6">
        <label class="form-label small">Hora</label>
        <input type="time" name="time" class="form-control" value="09:00" required>
      </div>
      ${
        isInPerson
          ? `<div class="col-12">
               <label class="form-label small">Endereço do atendimento</label>
               <input name="address" class="form-control" placeholder="Rua, número, bairro, cidade" required>
             </div>`
          : ""
      }
      <div class="col-12">
        <label class="form-label small">Observações (opcional)</label>
        <textarea name="notes" class="form-control" rows="2"
          placeholder="Detalhes úteis para o prestador..."></textarea>
      </div>
      <div class="col-12">
        <button class="btn btn-primary w-100 py-2" type="submit">
          <i class="bi bi-calendar-check me-1"></i>Solicitar agendamento
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
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const original = submit.innerHTML;
    submit.disabled = true;
    submit.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Enviando...`;

    const formData = new FormData(form);
    const address = (formData.get("address") || "").trim();
    const rawNotes = (formData.get("notes") || "").trim();
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
    <i class="bi bi-box-arrow-in-right me-1"></i>Entre para ${verb}
  </a>`;
}

function renderRoleBlocked() {
  return `<div class="alert alert-info small mb-0">
    Sua conta <strong>${escapeHtml(session.role)}</strong> não compra nem agenda pelo marketplace.
  </div>`;
}


function setMeta(selector, attribute, value) {
  const element = document.querySelector(selector);
  if (element && value) element.setAttribute(attribute, value);
}

function updateItemMetadata(item) {
  const name = String(item.name || "Item SyncroWay").trim();
  const store = String(item.store || item.store_name || "SyncroWay").trim();
  const description = String(item.description || `${name} — consulte preço, disponibilidade e informações no SyncroWay.`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const canonical = new URL(window.location.href);
  canonical.hash = "";
  const canonicalUrl = canonical.href;
  const image = String(item.image_url || "").trim();
  const isProduct = item.type !== "service";
  const price = Number(item.price);
  document.querySelector("link[rel='canonical']")?.setAttribute("href", canonicalUrl);
  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[property="og:type"]', "content", isProduct ? "product" : "website");
  setMeta('meta[property="og:title"]', "content", `${name} — SyncroWay`);
  setMeta('meta[property="og:description"]', "content", description);
  setMeta('meta[property="og:url"]', "content", canonicalUrl);
  if (image.startsWith("https://") || image.startsWith("http://")) setMeta('meta[property="og:image"]', "content", image);
  setMeta('meta[name="twitter:title"]', "content", `${name} — SyncroWay`);
  setMeta('meta[name="twitter:description"]', "content", description);
  const old = document.getElementById("sw-item-jsonld");
  old?.remove();
  if (isProduct && Number.isFinite(price) && price > 0) {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name,
      description,
      url: canonicalUrl,
      brand: { "@type": "Brand", name: store },
      offers: {
        "@type": "Offer",
        priceCurrency: "BRL",
        price: price.toFixed(2),
        url: canonicalUrl,
      }
    };
    if (image.startsWith("https://") || image.startsWith("http://")) schema.image = image;
    const script = document.createElement("script");
    script.id = "sw-item-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  }
}

// ═══════════════════════════════════════════════════════════
// Load
// ═══════════════════════════════════════════════════════════
function localDate(daysAhead = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}
async function load() {
  if (!id) {
    host.innerHTML = alertBox("Item inválido. Volte ao catálogo e escolha outro.", "warning");
    host.setAttribute("aria-busy", "false");
    return;
  }

  try {
    const data = await api.catalog({ type });
    const item = data.items.find((entry) => entry.id === id);

    if (!item) {
      host.innerHTML = alertBox("Item não encontrado ou fora do ar.", "warning");
      host.setAttribute("aria-busy", "false");
      document.querySelector('meta[name="robots"]')?.setAttribute("content", "noindex,follow");
      return;
    }

    document.title = `${item.name} — SyncroWay`;
    updateItemMetadata(item);
    host.innerHTML = detailHtml(item);
    host.setAttribute("aria-busy", "false");

    const action = document.getElementById("sw-action");

    if (!session.user) {
      action.innerHTML = renderLoginPrompt();
      return;
    }
    if (session.role !== "customer") {
      action.innerHTML = renderRoleBlocked();
      return;
    }

    if (item.type === "product") {
      action.innerHTML = productAction(item);
      bindProductAction(item);
    } else {
      action.innerHTML = serviceAction(item);
      bindServiceAction(item);
    }
  } catch (error) {
    host.innerHTML = alertBox(error.message || "Erro ao carregar o item.");
    host.setAttribute("aria-busy", "false");
  }
}

load();
