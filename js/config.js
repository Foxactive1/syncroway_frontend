// Deployment can inject SYNCROWAY_API through runtime-config.js.
// Public deployments never read an API override from localStorage.
const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const configured = (local && localStorage.getItem("syncroway_api")) || window.SYNCROWAY_API;
const fallback = local ? "http://127.0.0.1:5000/api" : `${window.location.origin}/api`;
const url = new URL(configured || fallback, window.location.origin);
if (!local && url.protocol !== "https:") throw new Error("A API pública exige HTTPS");
export const API_BASE = url.href.replace(/\/$/, "");
export const CATEGORY_ICONS = { alimentacao: "bi-egg-fried", "veterinaria-pet": "bi-heart-pulse", eletronicos: "bi-phone", mercado: "bi-cart4", servicos: "bi-tools", "casa-manutencao": "bi-house", automotivo: "bi-car-front", moda: "bi-bag-heart", beleza: "bi-scissors" };
