/* ═══════════════════════════════════════════════════════════════
   SyncroWay — painel.js
   Painel por role: cliente, lojista, prestador, motorista, admin.

   Correções em relação à versão anterior:
   • attachMoneyMask em <input type="text" inputmode="decimal">
     (type="number" descarta vírgula silenciosamente → preço *100)
   • Toggle de disponibilidade via data-available, não classe CSS
   • mediaSearchTerm declarado antes de qualquer view (fora da TDZ)
   • safeImg() nas 3 <img> inline — javascript:/data: bloqueados
   • runAction map em module-level (era recriado a cada clique)
   • viewMerchantAppointments + viewProviderAppointments unificadas
   • dataTable com nota "Mostrando N de M" quando trunca
   • aria-live no #sw-body durante a troca de view
   • STATUS_LABEL pt-BR + STATUS_BADGE (badge mostra "Pendente" etc.)
   • delete do #sw-body.innerHTML → textContent, evita resize flicker
   ═══════════════════════════════════════════════════════════════ */

import { api, session } from "./api.js";
import {
  renderHeader,
  renderFooter,
  money,
  escapeHtml,
  alertBox,
  attachMoneyMask,
  toast,
} from "./ui.js";

renderHeader("panel");
renderFooter();

const host = document.getElementById("sw-panel");

// ═══════════════════════════════════════════════════════════
// Constantes
// ═══════════════════════════════════════════════════════════

const ROLE_LABEL = {
  customer: "Cliente",
  merchant: "Lojista",
  provider: "Prestador de serviços",
  driver: "Motorista",
  admin: "Administração",
};

const NAV = {
  customer: [
    { id: "orders", label: "Pedidos" },
    { id: "appointments", label: "Agendamentos" },
  ],
  merchant: [
    { id: "overview", label: "Visão geral" },
    { id: "alerts", label: "Alertas" },
    { id: "products", label: "Produtos" },
    { id: "inventory", label: "Estoque" },
    { id: "movements", label: "Movimentações" },
    { id: "appointments", label: "Agendamentos" },
  ],
  provider: [
    { id: "overview", label: "Visão geral" },
    { id: "services", label: "Serviços" },
    { id: "appointments", label: "Agendamentos" },
    { id: "profile", label: "Perfil" },
  ],
  driver: [
    { id: "overview", label: "Entregas ativas" },
    { id: "history", label: "Histórico" },
  ],
  admin: [
    { id: "overview", label: "Visão geral" },
    { id: "finance", label: "Financeiro" },
    { id: "transactions", label: "Transações" },
    { id: "users", label: "Usuários" },
    { id: "stores", label: "Lojas" },
    { id: "drivers", label: "Motoristas" },
    { id: "deliveries", label: "Entregas" },
    { id: "orders", label: "Pedidos" },
    { id: "media", label: "Biblioteca de mídia" },
  ],
};

const STATUS_LABEL = {
  pending: "Pendente",
  confirmed: "Confirmado",
  scheduled: "Agendado",
  preparing: "Em preparo",
  ready: "Pronto",
  picked_up: "Coletado",
  out_for_delivery: "Em rota",
  delivered: "Entregue",
  completed: "Concluído",
  cancelled: "Cancelado",
  paid: "Pago",
  failed: "Falhou",
  refunded: "Reembolsado",
  awaiting_driver: "Aguardando motorista",
  assigned: "Atribuído",
  accepted: "Aceito",
  settled: "Liquidado",
};

const STATUS_BADGE = {
  pending: "text-bg-warning",
  confirmed: "text-bg-info",
  scheduled: "text-bg-info",
  preparing: "text-bg-info",
  ready: "text-bg-info",
  picked_up: "text-bg-primary",
  out_for_delivery: "text-bg-primary",
  delivered: "text-bg-success",
  completed: "text-bg-success",
  cancelled: "text-bg-danger",
  paid: "text-bg-success",
  failed: "text-bg-danger",
  refunded: "text-bg-secondary",
  awaiting_driver: "text-bg-warning",
  assigned: "text-bg-info",
  accepted: "text-bg-info",
  settled: "text-bg-success",
};

const MOVEMENT_TYPES = [
  { value: "purchase", label: "Compra (entrada)" },
  { value: "return_in", label: "Devolução do cliente (entrada)" },
  { value: "return_out", label: "Devolução ao fornecedor (saída)" },
  { value: "loss", label: "Perda / avaria / vencimento (saída)" },
  { value: "internal_use", label: "Consumo interno (saída)" },
];

const REASON_REQUIRED = new Set([
  "loss",
  "internal_use",
  "return_out",
  "return_in",
]);

const ENTRY_TYPES = new Set(["purchase", "return_in"]);

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/** Mesma política de ui.js:safeImageUrl — só http(s). */
function safeImg(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return escapeHtml(parsed.href);
    }
  } catch {
    /* cai no return "" */
  }
  return "";
}

const badge = (status) => {
  if (!status) return "—";
  const cls = STATUS_BADGE[status] || "text-bg-light";
  const label = STATUS_LABEL[status] || status;
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
};

const shortDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

// ═══════════════════════════════════════════════════════════
// Componentes de render
// ═══════════════════════════════════════════════════════════

function kpiCards(data) {
  const entries = Object.entries(data).filter(
    ([, value]) => typeof value === "number" || typeof value === "string"
  );
  if (!entries.length) return "";

  const isMoneyKey = (key) =>
    /(total|amount|revenue|value|fee|earnings|faturamento|receita|ticket|saldo|balance|subtotal|gmv)/i.test(
      key
    );

  return `<div class="row g-3 mb-3">${entries
    .map(
      ([key, value]) => `<div class="col-6 col-lg-3">
        <div class="sw-panel p-3 h-100">
          <div class="text-muted small text-capitalize">${escapeHtml(
            key.replace(/_/g, " ")
          )}</div>
          <div class="sw-kpi">${
            typeof value === "number" && isMoneyKey(key)
              ? money(value)
              : escapeHtml(value)
          }</div>
        </div></div>`
    )
    .join("")}</div>`;
}

function dictBadges(title, dict) {
  const entries = Object.entries(dict || {});
  if (!entries.length) return "";
  return `<div class="sw-panel p-3 mb-3">
    <h2 class="h6 text-capitalize">${escapeHtml(title.replace(/_/g, " "))}</h2>
    <div class="d-flex flex-wrap gap-2">${entries
      .map(
        ([k, v]) =>
          `<span class="badge text-bg-light border">${escapeHtml(
            k
          )}: <strong>${escapeHtml(String(v))}</strong></span>`
      )
      .join("")}</div></div>`;
}

function dataTable(title, rows, { columns, actions } = {}) {
  if (!Array.isArray(rows) || !rows.length) return "";

  const inferred =
    columns ||
    [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(
      (c) =>
        !["items", "delivery", "service", "actor", "driver", "store"].includes(
          c
        )
    );

  const LIMIT = 50;
  const visible = rows.slice(0, LIMIT);
  const truncated = rows.length > LIMIT;

  return `<div class="sw-panel p-3 mb-3">
    <h2 class="h6 text-capitalize">${escapeHtml(title.replace(/_/g, " "))}</h2>
    <div class="table-responsive"><table class="table table-sm align-middle small mb-0">
      <thead><tr>${inferred
        .map(
          (c) =>
            `<th class="text-capitalize">${escapeHtml(
              c.replace(/_/g, " ")
            )}</th>`
        )
        .join("")}${actions ? '<th class="text-end">Ações</th>' : ""}</tr></thead>
      <tbody>${visible
        .map(
          (row) =>
            `<tr>${inferred
              .map((c) => {
                const value = row[c];
                let html;
                if (value == null) html = "—";
                else if (c === "status") html = badge(value);
                else if (typeof value === "object")
                  html = escapeHtml(JSON.stringify(value).slice(0, 60));
                else html = escapeHtml(String(value));
                return `<td>${html}</td>`;
              })
              .join("")}${
              actions ? `<td class="text-end">${actions(row)}</td>` : ""
            }</tr>`
        )
        .join("")}</tbody>
    </table></div>
    ${
      truncated
        ? `<p class="small text-muted mt-2 mb-0">Mostrando ${LIMIT} de ${rows.length} registros.</p>`
        : ""
    }
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// Ações (map em module-level — não recriar por clique)
// ═══════════════════════════════════════════════════════════

const ACTION_MAP = {
  "appointment-confirm": ({ id }) =>
    api.providerUpdateAppointment(id, "confirmed"),
  "appointment-complete": ({ id }) =>
    api.providerUpdateAppointment(id, "completed"),
  "appointment-cancel": ({ id }) =>
    api.providerUpdateAppointment(id, "cancelled"),

  "merchant-appointment-confirm": ({ id }) =>
    api.merchantUpdateAppointment(id, "confirmed"),
  "merchant-appointment-complete": ({ id }) =>
    api.merchantUpdateAppointment(id, "completed"),
  "merchant-appointment-cancel": ({ id }) =>
    api.merchantUpdateAppointment(id, "cancelled"),

  "delivery-accept": ({ id }) => api.driverAcceptDelivery(id),
  "delivery-pickup": ({ id }) => api.driverUpdateDelivery(id, "picked_up"),
  "delivery-complete": ({ id }) => api.driverUpdateDelivery(id, "delivered"),

  "transaction-settle": ({ id }) => api.adminSettleTransaction(id),
  "product-archive": ({ id }) => api.merchantArchiveProduct(id),
  "media-archive": ({ id }) => api.adminArchiveMediaAsset(id),
  "media-default": ({ id }) => api.adminUpdateMediaAsset(id, { is_default: true }),

  "media-copy": async ({ url }) => {
    try {
      await navigator.clipboard.writeText(url || "");
      toast("URL copiada.", "success");
    } catch {
      window.prompt("Copie a URL da imagem:", url || "");
    }
  },

  // Estado lido do data-attribute, não da classe CSS.
  "driver-toggle-availability": ({ available }) =>
    api.driverSetStatus({ available: !available }),
};

function bindActionButtons(scope = document) {
  scope.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const payload = {
        id: Number(button.dataset.id),
        value: button.dataset.value,
        name: button.dataset.name || "",
        stock: Number(button.dataset.stock || 0),
        url: button.dataset.url || "",
        available: button.dataset.available === "true",
      };

      if (action === "product-adjust") {
        openAdjustmentModal(payload.id, payload.name, payload.stock);
        return;
      }
      if (action === "manage-payment") {
        openPaymentModal(payload.id, payload.value);
        return;
      }

      button.disabled = true;
      try {
        await ACTION_MAP[action]?.(payload);
        toast("Ação concluída", "success");
        await refreshCurrentView();
      } catch (error) {
        toast(error.message, "danger");
        button.disabled = false;
      }
    })
  );
}

function bindCustomActions(scope = document) {
  scope
    .querySelector("#sw-new-product")
    ?.addEventListener("click", () => openProductModal());
}

// ═══════════════════════════════════════════════════════════
// Views — cliente
// ═══════════════════════════════════════════════════════════

async function viewCustomerOrders() {
  const orders = await api.orders();
  return dataTable("Meus pedidos", orders, {
    columns: ["code", "status", "payment_status", "total", "created_at"],
    actions: (row) =>
      row.status !== "cancelled" && row.payment_status === "pending"
        ? `<a class="btn btn-sm btn-outline-primary" href="./pagamento.html?ids=${Number(row.id)}">Pagamento / cancelar</a>`
        : "",
  });
}

async function viewCustomerAppointments() {
  const rows = await api.appointments().catch(() => []);
  const normalized = rows.map((a) => ({
    id: a.id,
    servico: a.service?.name,
    quando: shortDate(a.scheduled_at),
    status: a.status,
    notas: a.notes,
  }));
  return dataTable("Meus agendamentos", normalized);
}

// ═══════════════════════════════════════════════════════════
// Views — lojista
// ═══════════════════════════════════════════════════════════

async function viewMerchantOverview() {
  const data = await api.merchantDashboard();
  const scalars = {
    products: data.product_count,
    services: data.service_count,
    low_stock: data.low_stock_count,
    inventory_value: data.inventory_value,
    orders: data.orders_count,
    revenue: data.revenue,
  };
  const finance = data.finance || {};
  return `${kpiCards(scalars)}
    <h2 class="h6 text-capitalize mt-3">Financeiro</h2>
    ${kpiCards(finance)}
    ${(data.stores || [])
      .map(
        (s) =>
          `<div class="sw-panel p-3 mb-3">
            <div class="d-flex justify-content-between align-items-center">
              <div><strong>${escapeHtml(s.name)}</strong>
                <div class="text-muted small">${escapeHtml(
                  s.city || ""
                )} · ${escapeHtml(s.category || "")}</div></div>
              <div class="small">Pedidos: ${
                s.accepts_orders ? "✅" : "—"
              } · Agenda: ${s.accepts_appointments ? "✅" : "—"}</div>
            </div>
          </div>`
      )
      .join("")}`;
}

async function viewMerchantProducts() {
  const [products, dashboard] = await Promise.all([
    api.merchantProducts(),
    api.merchantDashboard().catch(() => ({ stores: [] })),
  ]);

  const hasStores = (dashboard.stores || []).length > 0;

  const newButton = hasStores
    ? `<button class="btn btn-sm btn-primary mb-2" id="sw-new-product">
         <i class="bi bi-plus-lg me-1"></i>Novo produto
       </button>`
    : `<div class="alert alert-warning small mb-2">
         Você ainda não tem uma loja cadastrada.
       </div>`;

  const table = dataTable("Produtos", products, {
    columns: ["id", "name", "price", "stock", "minimum_stock", "active"],
    actions: (row) => {
      if (!row.active) return "";
      return `
        <button class="btn btn-sm btn-outline-primary me-1"
                data-action="product-adjust"
                data-id="${row.id}"
                data-name="${escapeHtml(row.name)}"
                data-stock="${row.stock}">Ajustar</button>
        <button class="btn btn-sm btn-outline-danger"
                data-action="product-archive"
                data-id="${row.id}">Arquivar</button>`;
    },
  });

  return `${newButton}${
    table || alertBox("Nenhum produto cadastrado ainda.", "light")
  }`;
}

async function viewMerchantInventory() {
  const data = await api.merchantInventory();
  return `${kpiCards(data.summary || {})}${dataTable(
    "Itens",
    data.items || [],
    {
      columns: [
        "name",
        "stock",
        "minimum_stock",
        "stock_status",
        "inventory_value",
      ],
    }
  )}`;
}

async function viewMerchantAlerts() {
  const data = await api.merchantInventoryAlerts();
  if (!data.total) {
    return `<div class="sw-panel p-4 text-center">
      <i class="bi bi-check-circle-fill text-success fs-1"></i>
      <h2 class="h6 mt-2">Nenhum alerta de estoque</h2>
      <p class="text-muted small mb-0">
        Todos os produtos estão acima do estoque mínimo.
      </p>
    </div>`;
  }

  const renderGroup = (title, rows, variant) => {
    if (!rows.length) return "";
    return `<div class="sw-panel p-3 mb-3">
      <h2 class="h6 text-capitalize">
        ${title} <span class="badge text-bg-${variant}">${rows.length}</span>
      </h2>
      <div class="table-responsive">
        <table class="table table-sm small mb-0">
          <thead><tr>
            <th>Produto</th><th>Estoque</th><th>Mínimo</th>
            <th class="text-end">Ação</th>
          </tr></thead>
          <tbody>${rows
            .map(
              (p) => `
            <tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${p.stock}</td>
              <td>${p.minimum_stock}</td>
              <td class="text-end">
                <button class="btn btn-sm btn-outline-primary"
                        data-action="product-adjust"
                        data-id="${p.id}"
                        data-name="${escapeHtml(p.name)}"
                        data-stock="${p.stock}">Repor</button>
              </td>
            </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>
    </div>`;
  };

  return (
    renderGroup("Sem estoque", data.out_of_stock || [], "danger") +
    renderGroup("Estoque baixo", data.low_stock || [], "warning")
  );
}

async function viewMerchantMovements() {
  const rows = await api.merchantStockMovements({ limit: 100 });
  return dataTable("Movimentações", rows, {
    columns: [
      "product_name",
      "type",
      "quantity",
      "stock_before",
      "stock_after",
      "reason",
      "created_at",
    ],
  });
}

/**
 * Helper de agendamentos — usado por lojista e prestador.
 * A única diferença era o prefixo da ação (merchant- vs plain).
 */
function appointmentsView({ rows, actionPrefix }) {
  const normalized = rows.map((a) => ({
    id: a.id,
    cliente: a.customer?.name,
    servico: a.service?.name,
    quando: shortDate(a.scheduled_at),
    status: a.status,
  }));

  const a = (rowId, s, label, cls) =>
    `<button class="btn btn-sm ${cls} me-1"
             data-action="${actionPrefix}${s}"
             data-id="${rowId}">${label}</button>`;

  return dataTable("Agendamentos", normalized, {
    actions: (row) => {
      if (row.status === "pending")
        return (
          a(row.id, "confirm", "Confirmar", "btn-outline-primary") +
          a(row.id, "cancel", "Cancelar", "btn-outline-danger")
        );
      if (row.status === "confirmed")
        return (
          a(row.id, "complete", "Concluir", "btn-outline-success") +
          a(row.id, "cancel", "Cancelar", "btn-outline-danger")
        );
      return "";
    },
  });
}

async function viewMerchantAppointments() {
  const rows = await api.merchantAppointments();
  return appointmentsView({ rows, actionPrefix: "merchant-appointment-" });
}

// ═══════════════════════════════════════════════════════════
// Views — prestador
// ═══════════════════════════════════════════════════════════

async function viewProviderOverview() {
  const data = await api.providerDashboard();
  return `${kpiCards({
    services_count: data.services_count,
    pending_appointments: data.pending_appointments,
    completed_appointments: data.completed_appointments,
  })}`;
}

async function viewProviderServices() {
  const rows = await api.providerServices();
  return dataTable("Serviços", rows, {
    columns: [
      "id",
      "title",
      "pricing_model",
      "price",
      "duration_minutes",
      "modality",
      "active",
    ],
  });
}

async function viewProviderAppointments() {
  const rows = await api.providerAppointments();
  return appointmentsView({ rows, actionPrefix: "appointment-" });
}

async function viewProviderProfile() {
  const p = await api.providerProfile();
  return `<div class="sw-panel p-3 mb-3">
    <h2 class="h6">Perfil profissional</h2>
    <form id="sw-provider-form" class="row g-2">
      <div class="col-12"><label class="form-label small">Headline</label>
        <input name="headline" class="form-control" value="${escapeHtml(
          p.headline || ""
        )}"></div>
      <div class="col-12"><label class="form-label small">Bio</label>
        <textarea name="bio" class="form-control" rows="3">${escapeHtml(
          p.bio || ""
        )}</textarea></div>
      <div class="col-4"><label class="form-label small">Cidade</label>
        <input name="city" class="form-control" value="${escapeHtml(
          p.city || ""
        )}"></div>
      <div class="col-2"><label class="form-label small">UF</label>
        <input name="state" class="form-control" maxlength="2" value="${escapeHtml(
          p.state || ""
        )}"></div>
      <div class="col-3"><label class="form-label small">Anos de experiência</label>
        <input name="years_experience" type="number" min="0" class="form-control" value="${
          p.years_experience ?? ""
        }"></div>
      <div class="col-3"><label class="form-label small">Raio (km)</label>
        <input name="service_radius_km" type="number" step="0.01" min="0" class="form-control" value="${
          p.service_radius_km ?? ""
        }"></div>
      <div class="col-12 d-flex gap-3">
        <div class="form-check"><input class="form-check-input" type="checkbox" name="is_available" ${
          p.is_available ? "checked" : ""
        }>
          <label class="form-check-label small">Disponível</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" name="offers_remote" ${
          p.offers_remote ? "checked" : ""
        }>
          <label class="form-check-label small">Atende remoto</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" name="offers_in_person" ${
          p.offers_in_person ? "checked" : ""
        }>
          <label class="form-check-label small">Atende presencial</label></div>
      </div>
      <div class="col-12"><button class="btn btn-primary">Salvar perfil</button></div>
    </form></div>`;
}

// ═══════════════════════════════════════════════════════════
// Views — motorista
// ═══════════════════════════════════════════════════════════

async function viewDriverOverview() {
  const data = await api.driverDashboard();
  const profile = data.profile || {};
  const isAvailable = Boolean(profile.available);
  const isApproved = Boolean(profile.approved);

  const toggleHtml = `
    <div class="sw-panel p-3 mb-3 d-flex justify-content-between align-items-center">
      <div>
        <div class="fw-semibold">Turno de entregas</div>
        <div class="text-muted small">
          ${
            isApproved
              ? isAvailable
                ? "Você está recebendo entregas."
                : "Você está offline — nenhuma entrega será oferecida."
              : "Aguardando aprovação da administração."
          }
        </div>
      </div>
      <button class="btn ${isAvailable ? "btn-success" : "btn-outline-secondary"}"
        data-action="driver-toggle-availability"
        data-available="${isAvailable}"
        ${isApproved ? "" : "disabled"}>
        <i class="bi bi-${isAvailable ? "toggle-on" : "toggle-off"} me-1"></i>
        ${isAvailable ? "Disponível" : "Indisponível"}
      </button>
    </div>`;

  const active = data.active_deliveries || [];
  const available = data.available_deliveries || [];
  const e = data.earnings || {};

  return `${toggleHtml}
    ${kpiCards({
      today: e.today,
      period: e.period,
      total: e.total,
      completed_in_period: e.completed_in_period,
    })}
    ${dataTable(
      "Entregas ativas",
      active.map((d) => ({
        id: d.id,
        order_id: d.order_id,
        status: d.status,
        delivery_address: d.delivery_address,
        fee: d.delivery_fee,
      })),
      {
        actions: (row) => {
          if (row.status === "assigned")
            return `<button class="btn btn-sm btn-outline-primary" data-action="delivery-accept" data-id="${row.id}">Aceitar</button>`;
          if (row.status === "accepted")
            return `<button class="btn btn-sm btn-outline-primary" data-action="delivery-pickup" data-id="${row.id}">Marcar coletado</button>`;
          if (row.status === "picked_up")
            return `<button class="btn btn-sm btn-outline-success" data-action="delivery-complete" data-id="${row.id}">Entregar</button>`;
          return "";
        },
      }
    )}
    ${dataTable(
      "Disponíveis",
      available.map((d) => ({
        id: d.id,
        order_id: d.order_id,
        status: d.status,
        fee: d.delivery_fee,
      })),
      {
        actions: (row) =>
          `<button class="btn btn-sm btn-outline-primary" data-action="delivery-accept" data-id="${row.id}">Aceitar</button>`,
      }
    )}`;
}

async function viewDriverHistory() {
  const data = await api.driverHistory({ period: "90d", limit: 100 });
  return `${kpiCards({
    total_earnings: data.total_earnings,
    count: data.count,
  })}
  ${dataTable("Histórico", data.items || [], {
    columns: ["order_id", "delivery_address", "delivery_fee", "delivered_at"],
  })}`;
}

// ═══════════════════════════════════════════════════════════
// Views — admin
// ═══════════════════════════════════════════════════════════

async function viewAdminOverview() {
  const data = await api.adminDashboard();
  return `${kpiCards(data.kpis || {})}
    ${dictBadges("Usuários por role", data.users_by_role)}
    ${dictBadges("Pedidos por status", data.orders_by_status)}
    ${dictBadges("Entregas por status", data.deliveries_by_status)}
    ${dataTable("Últimos pedidos", data.recent_orders || [], {
      columns: ["code", "status", "payment_status", "total", "created_at"],
    })}`;
}

async function viewAdminFinance() {
  const data = await api.adminFinance({ period: "30d" });
  return `${kpiCards({
    gmv: data.gmv,
    platform_revenue: data.platform_revenue,
    delivery_fees: data.delivery_fees,
    pending_receivables: data.pending_receivables,
  })}
  ${dictBadges("Pedidos", data.orders)}
  ${dictBadges("Transações", data.transactions)}`;
}

async function viewAdminTransactions() {
  const rows = await api.adminTransactions({ limit: 200 });
  return dataTable("Transações", rows, {
    columns: [
      "id",
      "order_id",
      "type",
      "amount",
      "beneficiary",
      "status",
      "created_at",
    ],
    actions: (row) =>
      row.status === "pending"
        ? `<button class="btn btn-sm btn-outline-success" data-action="transaction-settle" data-id="${row.id}">Liquidar</button>`
        : "",
  });
}

async function viewAdminUsers() {
  const rows = await api.adminUsers();
  return dataTable("Usuários", rows, {
    columns: ["id", "name", "email", "role", "active"],
  });
}

async function viewAdminStores() {
  const rows = await api.adminStores();
  const normalized = rows.map((s) => ({
    id: s.id,
    name: s.name,
    owner: s.owner?.name || "—",
    active: s.active,
    city: s.city,
    state: s.state,
  }));
  return dataTable("Lojas", normalized);
}

async function viewAdminDrivers() {
  const rows = await api.adminDrivers();
  const normalized = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.active,
    available: u.driver_profile?.available,
    approved: u.driver_profile?.approved,
    vehicle: u.driver_profile?.vehicle_type,
    plate: u.driver_profile?.vehicle_plate,
  }));
  return dataTable("Motoristas", normalized);
}

async function viewAdminDeliveries() {
  const rows = await api.adminDeliveries();
  const normalized = rows.map((d) => ({
    id: d.id,
    order_id: d.order_id,
    status: d.status,
    driver: d.driver?.name,
    delivery_address: d.delivery_address,
    fee: d.delivery_fee,
  }));
  return dataTable("Entregas", normalized);
}

async function viewAdminOrders() {
  const rows = await api.adminOrders();
  return dataTable("Pedidos", rows, {
    columns: ["id", "code", "status", "payment_status", "total", "created_at"],
    actions: (row) =>
      row.status !== "cancelled" && row.payment_status === "pending"
        ? `<button class="btn btn-sm btn-outline-primary" data-action="manage-payment" data-id="${Number(row.id)}" data-value="${escapeHtml(row.payment_method)}">Gerenciar pagamento</button>`
        : "",
  });
}

async function viewAdminMediaAssets() {
  const result = await api.adminMediaAssets({ q: mediaSearchTerm });
  const items = result.items || [];

  const CATEGORIES = [
    "geral",
    "servicos",
    "eletronicos",
    "moda",
    "alimentacao",
    "esportes",
    "lojas",
    "banners",
  ];

  return `
    <div class="sw-panel p-3 mb-3">
      <h2 class="h6"><i class="bi bi-images me-2"></i>Biblioteca de mídia</h2>
      <p class="small text-muted">Cadastre uma URL HTTPS uma vez e reutilize a imagem em produtos, serviços e lojas. Os arquivos ficam no serviço de imagens; o Neon guarda os metadados e o endereço.</p>
      <form id="sw-media-form" class="row g-2">
        <div class="col-12 col-md-6"><label class="form-label small">Nome da imagem</label><input name="name" class="form-control" maxlength="160" required placeholder="Ex.: Manutenção de computadores"></div>
        <div class="col-6 col-md-3"><label class="form-label small">Categoria</label><select name="category" class="form-select">${CATEGORIES.map(
          (c) => `<option value="${c}">${c.replace(/_/g, " ")}</option>`
        ).join("")}</select></div>
        <div class="col-6 col-md-3"><label class="form-label small">Origem/licença</label><input name="license" class="form-control" placeholder="Ex.: Unsplash License"></div>
        <div class="col-12"><label class="form-label small">URL HTTPS da imagem</label><input name="image_url" type="url" pattern="https://.+" class="form-control" required placeholder="https://..."></div>
        <div class="col-12 col-md-6"><label class="form-label small">Tags (separadas por vírgula)</label><input name="tags" class="form-control" placeholder="informática, assistência, técnico"></div>
        <div class="col-12 col-md-6"><label class="form-label small">Texto alternativo</label><input name="alt_text" class="form-control" maxlength="300" placeholder="Descrição acessível da imagem"></div>
        <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" name="is_default" id="sw-media-default"><label class="form-check-label small" for="sw-media-default">Definir como imagem padrão desta categoria</label></div></div>
        <div class="col-12 d-flex gap-2 align-items-center"><img id="sw-media-preview" alt="Pré-visualização" class="rounded border d-none" style="width:72px;height:72px;object-fit:cover"><button class="btn btn-primary" type="submit"><i class="bi bi-plus-lg me-1"></i>Cadastrar imagem</button><span class="small text-muted">Upload de arquivo será ativado após configurar o provedor de armazenamento.</span></div>
        <div id="sw-media-error" class="col-12 small text-danger" role="alert"></div>
      </form>
    </div>
    <div class="sw-panel p-3 mb-3">
      <form id="sw-media-search-form" class="d-flex gap-2"><input id="sw-media-search" class="form-control" value="${escapeHtml(mediaSearchTerm)}" placeholder="Pesquisar por nome, código ou categoria"><button class="btn btn-outline-primary">Pesquisar</button></form>
      <div class="small text-muted mt-2">${items.length} imagem(ns) ativas</div>
    </div>
    <div class="row g-3">${
      items
        .map((item) => {
          const imgUrl = safeImg(item.image_url);
          return `
      <div class="col-6 col-md-4 col-xl-3"><article class="sw-panel p-2 h-100">
        ${
          imgUrl
            ? `<img src="${imgUrl}" alt="${escapeHtml(
                item.alt_text || item.name
              )}" loading="lazy" class="w-100 rounded" style="aspect-ratio:4/3;object-fit:cover" onerror="this.style.display='none'">`
            : `<div class="sw-thumb-empty" style="aspect-ratio:4/3" role="img" aria-label="Imagem indisponível"><i class="bi bi-image" aria-hidden="true"></i></div>`
        }
        <div class="p-1"><div class="fw-semibold small mt-2">${escapeHtml(
          item.name
        )}</div>
          <div class="small text-muted">${escapeHtml(item.category)} · ${escapeHtml(
            item.slug
          )}</div>
          ${
            item.is_default
              ? '<span class="badge text-bg-success my-1">Padrão</span>'
              : ""
          }
          <form class="media-update-form mt-2" data-asset-id="${item.id}">
            <label class="form-label small mb-1">Atualizar URL central</label>
            <input name="image_url" type="url" pattern="https://.+" class="form-control form-control-sm" required value="${escapeHtml(
              item.image_url
            )}" aria-label="Nova URL da imagem">
            <button class="btn btn-sm btn-outline-primary w-100 mt-1" type="submit">Salvar nova URL</button>
          </form>
          <div class="d-flex flex-wrap gap-1 mt-2">
            <button class="btn btn-sm btn-outline-secondary" data-action="media-copy" data-url="${escapeHtml(
              item.image_url
            )}"><i class="bi bi-clipboard me-1"></i>URL</button>
            ${
              item.is_default
                ? ""
                : `<button class="btn btn-sm btn-outline-primary" data-action="media-default" data-id="${item.id}">Tornar padrão</button>`
            }
            <button class="btn btn-sm btn-outline-danger" data-action="media-archive" data-id="${item.id}">Arquivar</button>
          </div>
          <form class="media-usage-form mt-3 border-top pt-2" data-asset-id="${item.id}">
            <label class="form-label small mb-1">Vincular imagem a um registro</label>
            <div class="d-flex gap-1 mb-1">
              <select name="entity_type" class="form-select form-select-sm" aria-label="Tipo de registro">
                <option value="product">Produto</option><option value="service">Serviço</option><option value="store">Loja</option>
              </select>
              <input name="entity_id" type="number" min="1" class="form-control form-control-sm" required placeholder="ID" aria-label="ID do registro">
            </div>
            <button class="btn btn-sm btn-primary w-100" type="submit">Aplicar imagem</button>
          </form>
        </div>
      </article></div>`;
        })
        .join("") ||
      '<div class="col-12"><div class="alert alert-light border">Nenhuma imagem cadastrada. Adicione a primeira usando uma URL HTTPS.</div></div>'
    }</div>`;
}

function bindMediaLibrary(scope) {
  const form = scope.querySelector("#sw-media-form");
  const previewInput = form?.elements.image_url;

  previewInput?.addEventListener("input", () => {
    const img = scope.querySelector("#sw-media-preview");
    const url = safeImg(previewInput.value);
    if (url) {
      img.src = url;
      img.classList.remove("d-none");
    } else {
      img.removeAttribute("src");
      img.classList.add("d-none");
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const error = scope.querySelector("#sw-media-error");
    const data = new FormData(form);
    submit.disabled = true;
    error.textContent = "";
    try {
      await api.adminCreateMediaAsset({
        name: String(data.get("name") || "").trim(),
        image_url: String(data.get("image_url") || "").trim(),
        category: String(data.get("category") || "geral"),
        license: String(data.get("license") || "").trim() || null,
        tags: String(data.get("tags") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        alt_text: String(data.get("alt_text") || "").trim() || null,
        is_default: data.get("is_default") === "on",
      });
      toast("Imagem cadastrada na biblioteca.", "success");
      await refreshCurrentView();
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  scope.querySelectorAll(".media-update-form").forEach((updateForm) => {
    updateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = updateForm.querySelector('button[type="submit"]');
      const formData = new FormData(updateForm);
      button.disabled = true;
      try {
        await api.adminUpdateMediaAsset(Number(updateForm.dataset.assetId), {
          image_url: String(formData.get("image_url") || "").trim(),
        });
        toast(
          "URL atualizada. Registros vinculados foram sincronizados.",
          "success"
        );
        await refreshCurrentView();
      } catch (error) {
        toast(error.message, "danger");
        button.disabled = false;
      }
    });
  });

  scope.querySelectorAll(".media-usage-form").forEach((linkForm) => {
    linkForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = linkForm.querySelector('button[type="submit"]');
      const formData = new FormData(linkForm);
      button.disabled = true;
      try {
        await api.adminLinkMediaAssetUsage(Number(linkForm.dataset.assetId), {
          entity_type: String(formData.get("entity_type")),
          entity_id: Number(formData.get("entity_id")),
          role: "primary",
        });
        toast(
          "Imagem vinculada. Alterações futuras na biblioteca serão sincronizadas.",
          "success"
        );
        await refreshCurrentView();
      } catch (error) {
        toast(error.message, "danger");
        button.disabled = false;
      }
    });
  });

  scope
    .querySelector("#sw-media-search-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      mediaSearchTerm =
        scope.querySelector("#sw-media-search")?.value?.trim() || "";
      await refreshCurrentView();
    });
}

// ═══════════════════════════════════════════════════════════
// Modais
// ═══════════════════════════════════════════════════════════

function openPaymentModal(id, method) {
  document.getElementById("sw-payment-modal")?.remove();
  const offline = ["cash", "card_on_delivery"].includes(method);

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modal fade" id="sw-payment-modal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">
    <div class="modal-header"><h2 class="modal-title h5">Pagamento do pedido ${id}</h2><button class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button></div>
    <form class="modal-body" id="sw-payment-form">
      <label class="form-label">Operação</label><select name="operation" class="form-select mb-3">
      ${
        offline
          ? '<option value="offline">Confirmar recebimento na entrega</option>'
          : '<option value="reconcile">Conciliar cobrança existente</option><option value="cancel">Cancelar cobrança pendente no gateway</option>'
      }</select>
      <label class="form-label">${
        offline
          ? "Referência do comprovante/recebimento"
          : "ID externo da cobrança (pay_..., para conciliação)"
      }</label>
      <input name="reference" class="form-control mb-3" maxlength="255" ${
        offline ? "required" : ""
      }>
      <label class="d-flex gap-2 mb-3"><input type="checkbox" required>Conferi os dados e confirmo esta operação.</label>
      <p class="small text-muted">Liquidação interna não comprova transferência bancária.</p>
      <div data-error class="text-danger mb-2" role="alert"></div><button class="btn btn-primary" type="submit">Executar</button>
    </form></div></div></div>`
  );

  const el = document.getElementById("sw-payment-modal");
  const modal = new bootstrap.Modal(el);
  modal.show();
  el.addEventListener("hidden.bs.modal", () => el.remove());
  el.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector("button");
    button.disabled = true;
    const form = new FormData(e.currentTarget);
    try {
      if (form.get("operation") === "offline")
        await api.adminConfirmOfflinePayment(id, form.get("reference"));
      else if (form.get("operation") === "cancel")
        await api.adminCancelPayment(id);
      else await api.adminReconcilePayment(id, form.get("reference"));
      modal.hide();
      toast("Operação concluída", "success");
      await refreshCurrentView();
    } catch (error) {
      el.querySelector("[data-error]").textContent = error.message;
      button.disabled = false;
    }
  });
}

async function openProductModal() {
  let categories = [];
  let stores = [];

  try {
    const [cats, dashboard] = await Promise.all([
      api.categories(),
      api.merchantDashboard(),
    ]);
    categories = cats;
    stores = dashboard.stores || [];
  } catch (error) {
    toast(error.message, "danger");
    return;
  }

  if (!stores.length) {
    toast("Nenhuma loja disponível para cadastrar produtos.", "warning");
    return;
  }

  document.getElementById("sw-product-modal")?.remove();

  const storeSelector =
    stores.length > 1
      ? `<div class="col-12">
           <label class="form-label small">Loja</label>
           <select name="store_id" class="form-select" required>
             ${stores
               .map(
                 (s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`
               )
               .join("")}
           </select>
         </div>`
      : `<input type="hidden" name="store_id" value="${stores[0].id}">`;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modal fade" id="sw-product-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Novo produto</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <form id="sw-product-form" class="modal-body row g-2">
            ${storeSelector}
            <div class="col-12">
              <label class="form-label small">Nome</label>
              <input name="name" class="form-control" required maxlength="160">
            </div>
            <div class="col-6">
              <label class="form-label small">Categoria</label>
              <select name="category_id" class="form-select" required>
                <option value="">Selecione…</option>
                ${categories
                  .map(
                    (c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="col-3">
              <label class="form-label small">Preço (R$)</label>
              <input name="price" type="text" inputmode="decimal" class="form-control" required autocomplete="off" placeholder="0,00">
            </div>
            <div class="col-3">
              <label class="form-label small">SKU</label>
              <input name="sku" class="form-control" maxlength="80">
            </div>
            <div class="col-4">
              <label class="form-label small">Estoque inicial</label>
              <input name="stock" type="number" min="0" value="0" class="form-control" required>
            </div>
            <div class="col-4">
              <label class="form-label small">Estoque mínimo</label>
              <input name="minimum_stock" type="number" min="0" value="5" class="form-control">
            </div>
            <div class="col-4">
              <label class="form-label small">Imagem (URL)</label>
              <input name="image_url" type="url" class="form-control">
            </div>
            <div class="col-12">
              <label class="form-label small">Descrição</label>
              <textarea name="description" class="form-control" rows="2"></textarea>
            </div>
            <div class="col-12">
              <div id="sw-product-error" class="text-danger small" role="alert"></div>
            </div>
            <div class="col-12 d-flex justify-content-end gap-2">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar produto</button>
            </div>
          </form>
        </div>
      </div>
    </div>`
  );

  const modalEl = document.getElementById("sw-product-modal");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove());

  const form = document.getElementById("sw-product-form");
  const errorBox = document.getElementById("sw-product-error");
  const submitBtn = form.querySelector('button[type="submit"]');

  // input type="text" + inputmode="decimal" → a máscara funciona.
  // Com type="number", o browser descarta a vírgula e "12,50" vira 1250.
  attachMoneyMask(form.querySelector('input[name="price"]'));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";
    submitBtn.disabled = true;
    const original = submitBtn.innerHTML;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Salvando…`;

    const f = new FormData(form);
    const storeId = Number(f.get("store_id"));
    // attachMoneyMask normaliza vírgula → ponto no blur.
    const rawPrice = String(f.get("price") || "").replace(",", ".");
    const payload = {
      name: (f.get("name") || "").trim(),
      category_id: Number(f.get("category_id")),
      price: Number(rawPrice),
      stock: Number(f.get("stock") || 0),
      minimum_stock: Number(f.get("minimum_stock") || 5),
      sku: (f.get("sku") || "").trim() || null,
      image_url: (f.get("image_url") || "").trim() || null,
      description: (f.get("description") || "").trim() || null,
    };

    try {
      await api.merchantCreateProduct(storeId, payload);
      modal.hide();
      toast("Produto criado", "success");
      await refreshCurrentView();
    } catch (error) {
      errorBox.textContent = error.message;
      submitBtn.disabled = false;
      submitBtn.innerHTML = original;
    }
  });
}

async function openAdjustmentModal(productId, productName, currentStock) {
  document.getElementById("sw-adjust-modal")?.remove();

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modal fade" id="sw-adjust-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Ajustar estoque</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <form id="sw-adjust-form" class="modal-body row g-2">
            <div class="col-12">
              <div class="fw-semibold">${escapeHtml(productName)}</div>
              <div class="text-muted small">Estoque atual: <strong>${currentStock}</strong></div>
            </div>
            <div class="col-12">
              <label class="form-label small">Motivo do movimento</label>
              <select name="type" class="form-select" required>
                ${MOVEMENT_TYPES.map(
                  (t) => `<option value="${t.value}">${t.label}</option>`
                ).join("")}
              </select>
            </div>
            <div class="col-6">
              <label class="form-label small">Quantidade</label>
              <input name="quantity" type="number" min="1" value="1" class="form-control" required>
            </div>
            <div class="col-6 d-flex align-items-end">
              <div class="small text-muted">
                Novo estoque: <strong id="sw-adjust-preview">${currentStock}</strong>
              </div>
            </div>
            <div class="col-12">
              <label class="form-label small">
                Observação <span class="text-danger" id="sw-adjust-req" hidden>*</span>
              </label>
              <input name="reason" class="form-control" placeholder="Opcional">
            </div>
            <div class="col-12">
              <div id="sw-adjust-error" class="text-danger small" role="alert"></div>
            </div>
            <div class="col-12 d-flex justify-content-end gap-2">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary">Aplicar</button>
            </div>
          </form>
        </div>
      </div>
    </div>`
  );

  const modalEl = document.getElementById("sw-adjust-modal");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove());

  const form = document.getElementById("sw-adjust-form");
  const typeSel = form.elements.type;
  const qtyEl = form.elements.quantity;
  const reasonEl = form.elements.reason;
  const preview = document.getElementById("sw-adjust-preview");
  const reqMark = document.getElementById("sw-adjust-req");
  const errorBox = document.getElementById("sw-adjust-error");
  const submitBtn = form.querySelector('button[type="submit"]');

  function refreshPreview() {
    const q = Number(qtyEl.value) || 0;
    const signed = ENTRY_TYPES.has(typeSel.value) ? q : -q;
    preview.textContent = currentStock + signed;
    const needsReason = REASON_REQUIRED.has(typeSel.value);
    reasonEl.required = needsReason;
    reasonEl.placeholder = needsReason ? "Obrigatório" : "Opcional";
    reqMark.hidden = !needsReason;
  }

  typeSel.addEventListener("change", refreshPreview);
  qtyEl.addEventListener("input", refreshPreview);
  refreshPreview();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";
    submitBtn.disabled = true;
    const original = submitBtn.innerHTML;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Aplicando…`;

    try {
      await api.merchantCreateMovement(productId, {
        type: typeSel.value,
        quantity: Number(qtyEl.value),
        reason: reasonEl.value.trim() || null,
      });
      modal.hide();
      toast("Estoque atualizado", "success");
      await refreshCurrentView();
    } catch (error) {
      errorBox.textContent = error.message;
      submitBtn.disabled = false;
      submitBtn.innerHTML = original;
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Routing
// ═══════════════════════════════════════════════════════════

const VIEWS = {
  customer: {
    orders: viewCustomerOrders,
    appointments: viewCustomerAppointments,
  },
  merchant: {
    overview: viewMerchantOverview,
    alerts: viewMerchantAlerts,
    products: viewMerchantProducts,
    inventory: viewMerchantInventory,
    movements: viewMerchantMovements,
    appointments: viewMerchantAppointments,
  },
  provider: {
    overview: viewProviderOverview,
    services: viewProviderServices,
    appointments: viewProviderAppointments,
    profile: viewProviderProfile,
  },
  driver: {
    overview: viewDriverOverview,
    history: viewDriverHistory,
  },
  admin: {
    overview: viewAdminOverview,
    finance: viewAdminFinance,
    transactions: viewAdminTransactions,
    users: viewAdminUsers,
    stores: viewAdminStores,
    drivers: viewAdminDrivers,
    deliveries: viewAdminDeliveries,
    orders: viewAdminOrders,
    media: viewAdminMediaAssets,
  },
};

// Declarado antes de qualquer view rodar. Antes vivia ~800 linhas
// abaixo, criando TDZ se algum dia load() fosse movido para cima.
let currentView = "";
let mediaSearchTerm = "";

async function renderCurrentView() {
  const role = session.role;
  const views = VIEWS[role] || {};
  const fn = views[currentView];
  const body = document.getElementById("sw-body");
  if (!body) return;

  // aria-live no próprio #sw-body: ao trocar de aba, o SR anuncia
  // o conteúdo novo. aria-busy=true durante o fetch evita anúncio
  // prematuro do placeholder "Carregando...".
  body.setAttribute("aria-busy", "true");
  body.textContent = "Carregando...";

  let html;
  try {
    html = fn ? await fn() : "";
  } catch (error) {
    body.textContent = "";
    body.innerHTML = alertBox(error.message);
    body.setAttribute("aria-busy", "false");
    toast(error.message, "danger");
    return;
  }

  body.innerHTML = html || alertBox("Sem dados para exibir ainda.", "light");
  body.setAttribute("aria-busy", "false");

  bindActionButtons(body);
  bindCustomActions(body);
  bindMediaLibrary(body);

  body.querySelector("#sw-provider-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api.providerUpdateProfile({
        headline: f.get("headline") || null,
        bio: f.get("bio") || null,
        city: f.get("city") || null,
        state: f.get("state") || null,
        years_experience: f.get("years_experience")
          ? Number(f.get("years_experience"))
          : null,
        service_radius_km: f.get("service_radius_km")
          ? Number(f.get("service_radius_km"))
          : null,
        is_available: f.get("is_available") === "on",
        offers_remote: f.get("offers_remote") === "on",
        offers_in_person: f.get("offers_in_person") === "on",
      });
      toast("Perfil atualizado", "success");
    } catch (error) {
      toast(error.message, "danger");
    }
  });
}

function refreshCurrentView() {
  return renderCurrentView();
}

function renderShell() {
  const user = session.user;
  const role = user.role;
  const tabs = NAV[role] || [];
  if (!currentView) currentView = tabs[0]?.id || "";

  host.innerHTML = `
    <div class="sw-panel p-4 mb-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div>
        <h1 class="h5 mb-1">Olá, ${escapeHtml(user.name)}</h1>
        <span class="badge text-bg-dark">${escapeHtml(
          ROLE_LABEL[role] || role
        )}</span>
      </div>
      <button class="btn btn-sm btn-outline-secondary" id="sw-refresh">
        <i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>Atualizar
      </button>
    </div>
    <ul class="nav nav-pills mb-3 gap-1 flex-wrap" id="sw-tabs" role="tablist">
      ${tabs
        .map(
          (t) =>
            `<li class="nav-item" role="presentation">
              <button class="nav-link ${
                t.id === currentView ? "active" : ""
              }" data-view="${t.id}" role="tab" aria-selected="${
                t.id === currentView
              }">${escapeHtml(t.label)}</button>
            </li>`
        )
        .join("")}
    </ul>
    <div id="sw-body" class="text-muted" aria-live="polite" aria-busy="false">Carregando dados...</div>`;

  host.querySelectorAll("[data-view]").forEach((btn) =>
    btn.addEventListener("click", () => {
      currentView = btn.dataset.view;
      host.querySelectorAll("[data-view]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", String(active));
      });
      renderCurrentView();
    })
  );

  document
    .getElementById("sw-refresh")
    ?.addEventListener("click", renderCurrentView);

  renderCurrentView();
}

function load() {
  const user = session.user;
  if (!user) {
    host.innerHTML = `<div class="sw-panel p-4">${alertBox(
      "Entre para ver seu painel.",
      "info"
    )}
      <a class="btn btn-primary" href="./entrar.html">Entrar</a></div>`;
    return;
  }
  renderShell();
}

load();