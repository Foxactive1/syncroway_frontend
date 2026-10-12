// Endereço da API SyncroWay (Flask). Pode ser trocado em tempo de execução:
// localStorage.setItem('syncroway_api', 'https://minha-api.com/api')
const DEFAULT_API = "http://127.0.0.1:5000/api";

export const API_BASE = (
  localStorage.getItem("syncroway_api") ||
  window.SYNCROWAY_API ||
  DEFAULT_API
).replace(/\/$/, "");

export const CATEGORY_ICONS = {
  alimentacao: "bi-egg-fried",
  "veterinaria-pet": "bi-heart-pulse",
  eletronicos: "bi-phone",
  mercado: "bi-cart4",
  servicos: "bi-tools",
  "casa-manutencao": "bi-house",
  automotivo: "bi-car-front",
  moda: "bi-bag-heart",
  beleza: "bi-scissors",
};
