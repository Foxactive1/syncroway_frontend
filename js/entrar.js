import { api, session } from "./api.js";
import { renderHeader, renderFooter, toast, alertBox } from "./ui.js";
import { API_BASE } from "./config.js";

renderHeader();
renderFooter();

document.getElementById("sw-api-base").textContent = API_BASE;

if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) {
  document.getElementById("sw-api-form").hidden = true;
}
document.getElementById("sw-api-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = event.currentTarget.querySelector("input").value.trim();
  if (value) localStorage.setItem("syncroway_api", value.replace(/\/$/, ""));
  else localStorage.removeItem("syncroway_api");
  window.location.reload();
});

if (session.user) {
  document.getElementById("sw-forms").innerHTML = `<div class="sw-panel p-4">
    ${alertBox(`Você já está conectado como ${session.user.name}.`, "success")}
    <a class="btn btn-primary" href="./painel.html">Ir para o painel</a></div>`;
}

document.getElementById("sw-login")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api.login(form.get("email"), form.get("password"));
    session.set(data);
    window.location.href = "./painel.html";
  } catch (error) {
    toast(error.message, "danger");
  }
});

document.getElementById("sw-register")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api.register({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      phone: form.get("phone") || null,
    });
    session.set(data);
    window.location.href = "./index.html";
  } catch (error) {
    toast(error.message, "danger");
  }
});

