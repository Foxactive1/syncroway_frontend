/* ═══════════════════════════════════════════════════════════════
   SyncroWay — entrar.js
   Login, cadastro e configuração de API (apenas em dev local).

   Correções em relação à versão anterior:
   • getElementById("sw-api-form")?.addEventListener (sem crash
     se o HTML não tiver o form)
   • Botão desabilitado durante login/register (evita duplo submit)
   • Loading state visual no botão (spinner + texto)
   • session.user guard antes de session.user.name
   • Preserva ?next=… no redirect após login (deep link)
   • #sw-api-base com ?. (sem crash se faltar no HTML)
   ═══════════════════════════════════════════════════════════════ */

import { api, session } from "./api.js";
import { renderHeader, renderFooter, toast, alertBox } from "./ui.js";
import { API_BASE } from "./config.js";

renderHeader();
renderFooter();

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/**
 * Valida ?next=… para evitar open redirect.
 * Só aceita caminhos relativos do próprio site.
 */
function safeNext(value) {
  if (!value) return "./painel.html";
  // Rejeita esquema (http:, javascript:, //evil.com).
  if (/^[a-z]+:/i.test(value) || value.startsWith("//")) {
    return "./painel.html";
  }
  // Rejeita escape para fora do diretório (../).
  if (value.includes("..")) return "./painel.html";
  return value;
}

function setButtonLoading(button, message) {
  if (!button) return () => {};
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${message}`;
  return () => {
    button.disabled = false;
    button.innerHTML = original;
  };
}

// ═══════════════════════════════════════════════════════════
// Diagnóstico de API (só em localhost)
// ═══════════════════════════════════════════════════════════

const apiBaseEl = document.getElementById("sw-api-base");
if (apiBaseEl) apiBaseEl.textContent = API_BASE;

const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const apiForm = document.getElementById("sw-api-form");

if (!isLocal && apiForm) {
  // Em produção o form de override não faz sentido.
  apiForm.hidden = true;
}

apiForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector("input");
  const value = input?.value?.trim() || "";

  try {
    if (value) {
      localStorage.setItem("syncroway_api", value.replace(/\/$/, ""));
    } else {
      localStorage.removeItem("syncroway_api");
    }
    window.location.reload();
  } catch (error) {
    toast(`Não foi possível salvar a configuração: ${error.message}`, "danger");
  }
});

// ═══════════════════════════════════════════════════════════
// Já logado
// ═══════════════════════════════════════════════════════════

if (session.user) {
  const forms = document.getElementById("sw-forms");
  if (forms) {
    const name = String(session.user.name || "você").trim();
    forms.innerHTML = `<div class="sw-panel p-4">
      ${alertBox(`Você já está conectado como ${name}.`, "success")}
      <a class="btn btn-primary mt-2" href="./painel.html">Ir para o painel</a>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// Login
// ═══════════════════════════════════════════════════════════

document.getElementById("sw-login")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const restore = setButtonLoading(button, "Entrando...");

  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");

  try {
    const result = await api.login(email, password);
    session.set(result);

    const next = safeNext(
      new URLSearchParams(window.location.search).get("next")
    );
    window.location.href = next;
  } catch (error) {
    toast(error.message || "Erro ao entrar.", "danger");
    restore();
  }
});

// ═══════════════════════════════════════════════════════════
// Cadastro
// ═══════════════════════════════════════════════════════════

document.getElementById("sw-register")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const restore = setButtonLoading(button, "Criando conta...");

  const data = new FormData(form);

  try {
    const result = await api.register({
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      password: String(data.get("password") || ""),
      phone: String(data.get("phone") || "").trim() || null,
    });
    session.set(result);

    // Cadastro novo → dashboard, a menos que exista ?next.
    const next = safeNext(
      new URLSearchParams(window.location.search).get("next") ||
        "./painel.html"
    );
    window.location.href = next;
  } catch (error) {
    toast(error.message || "Erro ao criar conta.", "danger");
    restore();
  }
});