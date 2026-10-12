import { api, session } from "./api.js";
import { renderHeader, renderFooter, escapeHtml, money, toast, alertBox } from "./ui.js";
renderHeader(); renderFooter();
const host = document.getElementById("sw-payments");
const ids = [...new Set((new URLSearchParams(location.search).get("ids") || "").split(",").map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 20);
let loading = false;
function invoiceLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return `<a class="btn btn-primary" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">Abrir cobrança segura</a>`;
  } catch { return ""; }
}
async function renderOrder(id) {
  const order = await api.order(id);
  const online = ["pix", "card_online"].includes(order.payment_method);
  let pay = null;
  if (online) {
    try { pay = await api.payment(id); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  const paid = order.payment_status === "paid";
  const cancelled = order.status === "cancelled";
  const panel = document.createElement("section");
  panel.className = "sw-panel p-3 mb-3";
  panel.innerHTML = `<h2 class="h5">Pedido ${escapeHtml(order.code)} — ${money(order.total)}</h2>
    <p>Status: <strong>${escapeHtml(order.status)}</strong> · Pagamento: <strong>${escapeHtml(order.payment_status)}</strong></p>
    ${paid ? alertBox("Pagamento confirmado.", "success") : ""}
    ${cancelled ? alertBox("Pedido cancelado.", "warning") : ""}
    ${!online && !cancelled && !paid ? alertBox("Pagamento será recebido na entrega.", "info") : ""}
    ${pay ? `<p>Cobrança: ${escapeHtml(pay.state)}</p>` : ""}
    ${pay && !paid && !cancelled && ["pending", "overdue"].includes(pay.state) ? invoiceLink(pay.invoice_url) : ""}
    ${pay && !["paid", "pending", "overdue", "cancelled", "refunded"].includes(pay.state) ? alertBox("Cobrança precisa de conciliação pelo suporte. Não gere outro pagamento.", "warning") : ""}
    ${online && !pay && !paid && !cancelled ? `<form class="mt-3" data-pay>
       <label class="form-label">CPF/CNPJ do pagador</label>
       <input class="form-control mb-2" name="cpf" inputmode="numeric" autocomplete="off" required maxlength="18" placeholder="Usado pelo gateway; não salvo neste navegador">
       <button class="btn btn-primary" type="submit">Gerar cobrança</button>
     </form>` : ""}
    <div data-qr class="mt-3"></div>
    <div class="d-flex gap-2 mt-3"><button class="btn btn-outline-primary" data-refresh>Atualizar status</button>
    ${!paid && !cancelled && (!pay || pay.state === "cancelled") ? '<button class="btn btn-outline-danger" data-cancel>Cancelar pedido</button>' : ""}</div>`;
  panel.querySelector("[data-refresh]").onclick = load;
  panel.querySelector("[data-pay]")?.addEventListener("submit", async e => {
    e.preventDefault();
    const button = e.currentTarget.querySelector("button"); button.disabled = true;
    try { await api.createPayment(id, new FormData(e.currentTarget).get("cpf")); await load(); }
    catch (error) { toast(error.message, "danger"); await load(); }
  });
  panel.querySelector("[data-cancel]")?.addEventListener("click", async e => {
    e.currentTarget.disabled = true;
    try { await api.cancelOrder(id); await load(); }
    catch (error) { toast(error.message, "danger"); e.currentTarget.disabled = false; }
  });
  if (pay?.billing_type === "PIX" && pay.state === "pending" && !paid && !cancelled) {
    try {
      const qr = await api.pix(id);
      const target = panel.querySelector("[data-qr]");
      if (qr.encodedImage && /^[A-Za-z0-9+/=]+$/.test(qr.encodedImage)) {
        const img = document.createElement("img"); img.src = `data:image/png;base64,${qr.encodedImage}`;
        img.alt = "QR Code para pagamento Pix"; img.width = 220; img.className = "d-block mb-2"; target.append(img);
      }
      if (qr.payload) {
        const label = document.createElement("label"); label.textContent = "Pix copia e cola";
        const field = document.createElement("textarea"); field.readOnly = true;
        field.className = "form-control"; field.value = qr.payload;
        target.append(label, field);
      }
    } catch (error) { panel.querySelector("[data-qr]").textContent = error.message; }
  }
  return panel;
}
async function load() {
  if (loading) return;
  if (session.role !== "customer") {
    host.innerHTML = `${alertBox("Entre como cliente para acessar seus pedidos.", "info")}<a href="./entrar.html">Entrar</a>`; return;
  }
  if (!ids.length) { host.innerHTML = alertBox("Selecione um pedido no painel.", "info"); return; }
  loading = true;
  try {
    const panels = await Promise.all(ids.map(async id => {
      try { return await renderOrder(id); }
      catch (error) { const el = document.createElement("div"); el.innerHTML = alertBox(error.message); return el; }
    }));
    host.replaceChildren(...panels);
  } finally { loading = false; }
}
load();
const timer = setInterval(() => { if (!document.hidden && !document.querySelector("[data-pay] input:focus")) load(); }, 15000);
window.addEventListener("pagehide", () => clearInterval(timer));
