/* ═══════════════════════════════════════════════════════════════
   SyncroWay — ui.js
   Componentes globais da interface
   ═══════════════════════════════════════════════════════════════ */

import { api, session } from "./api.js";


/* ═══════════════════════════════════════════════════════════════
   01. FORMATADORES
   ═══════════════════════════════════════════════════════════════ */

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});


export const money = (value) => {
  const number = Number(value);

  return BRL_FORMATTER.format(
    Number.isFinite(number)
      ? number
      : 0
  );
};


export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]
  );


/**
 * Aceita apenas URLs http(s). Bloqueia javascript:, data:, vbscript:
 * e similares que poderiam executar em cliques.
 */
function safeImageUrl(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, window.location.origin);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}


/* ═══════════════════════════════════════════════════════════════
   02. CONFIGURAÇÕES INTERNAS
   ═══════════════════════════════════════════════════════════════ */

const TOAST_VARIANTS = new Set([
  "dark",
  "success",
  "danger",
  "warning",
  "info",
  "primary",
]);


const ALERT_ICONS = {
  success: "bi-check-circle-fill",
  danger: "bi-exclamation-triangle-fill",
  warning: "bi-exclamation-circle-fill",
  info: "bi-info-circle-fill",
  primary: "bi-info-circle-fill",
  light: "bi-info-circle-fill",
};


const ROLE_SHORTCUT = {
  merchant: {
    label: "Painel lojista",
    href: "./painel.html",
  },

  provider: {
    label: "Painel prestador",
    href: "./painel.html",
  },

  driver: {
    label: "Painel motorista",
    href: "./painel.html",
  },

  admin: {
    label: "Painel administrativo",
    href: "./painel.html",
  },
};


/* ═══════════════════════════════════════════════════════════════
   03. HELPERS
   ═══════════════════════════════════════════════════════════════ */

function firstName(user) {
  const name = String(
    user?.name || "Usuário"
  ).trim();

  return (
    name.split(/\s+/)[0] ||
    "Usuário"
  );
}


function clampInteger(
  value,
  min,
  max
) {
  const parsed =
    Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(
    max,
    Math.max(min, parsed)
  );
}


function safeVariant(
  variant,
  fallback = "dark"
) {
  return TOAST_VARIANTS.has(variant)
    ? variant
    : fallback;
}


/* ═══════════════════════════════════════════════════════════════
   04. TOAST
   ═══════════════════════════════════════════════════════════════ */

export function toast(
  message,
  variant = "dark",
  duration = 4500
) {
  let host =
    document.getElementById(
      "sw-toasts"
    );


  if (!host) {
    host =
      document.createElement(
        "div"
      );

    host.id = "sw-toasts";

    host.className =
      "toast-container position-fixed bottom-0 end-0 p-3";

    host.setAttribute(
      "aria-live",
      "polite"
    );

    host.setAttribute(
      "aria-atomic",
      "false"
    );

    document.body.appendChild(host);
  }


  const safeType =
    safeVariant(variant);


  const el =
    document.createElement(
      "div"
    );


  el.className =
    `toast align-items-center text-bg-${safeType} border-0 show`;


  el.setAttribute(
    "role",
    safeType === "danger"
      ? "alert"
      : "status"
  );


  el.setAttribute(
    "aria-live",
    safeType === "danger"
      ? "assertive"
      : "polite"
  );


  el.setAttribute(
    "aria-atomic",
    "true"
  );


  el.innerHTML = `
    <div class="d-flex">

      <div class="toast-body">
        ${escapeHtml(message)}
      </div>

      <button
        type="button"
        class="btn-close ${
          safeType !== "warning"
            ? "btn-close-white"
            : ""
        } me-2 m-auto"
        aria-label="Fechar notificação"
      ></button>

    </div>
  `;


  host.appendChild(el);


  const close =
    el.querySelector(
      ".btn-close"
    );


  let timeoutId = null;


  const remove = () => {
    if (timeoutId) {
      window.clearTimeout(
        timeoutId
      );
    }

    el.remove();

    if (
      host &&
      !host.children.length
    ) {
      host.remove();
    }
  };


  close?.addEventListener(
    "click",
    remove
  );


  timeoutId =
    window.setTimeout(
      remove,
      clampInteger(
        duration,
        1500,
        30000
      )
    );


  return el;
}


/* ═══════════════════════════════════════════════════════════════
   05. IMAGEM DE PRODUTO / SERVIÇO
   ═══════════════════════════════════════════════════════════════ */

export function productImage(
  item = {}
) {
  const name =
    escapeHtml(
      item.name ||
      (
        item.type === "service"
          ? "Serviço"
          : "Produto"
      )
    );


  const safeUrl =
    safeImageUrl(item.image_url);


  if (safeUrl) {
    return `
      <img
        src="${escapeHtml(safeUrl)}"
        alt="${name}"
        class="sw-thumb-img"
        loading="lazy"
        decoding="async"
      >
    `;
  }


  const icon =
    item.type === "service"
      ? "bi-tools"
      : "bi-box-seam";


  return `
    <div
      class="sw-thumb-empty"
      role="img"
      aria-label="${name} sem imagem"
    >

      <i
        class="bi ${icon}"
        aria-hidden="true"
      ></i>

    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   06. HEADER
   ═══════════════════════════════════════════════════════════════ */

export function renderHeader(
  active = "",
  { skipBadge = false } = {}
) {
  const host =
    document.getElementById(
      "sw-header"
    );


  if (!host) {
    return;
  }


  const user =
    session.user;


  const shortcut =
    user
      ? ROLE_SHORTCUT[user.role]
      : null;


  const displayName =
    escapeHtml(
      firstName(user)
    );


  host.innerHTML = `
    <header class="sw-header">

      <div class="sw-header-top">

        <div
          class="
            container
            d-flex
            align-items-center
            gap-3
            py-2
          "
        >

          <a
            class="sw-brand"
            href="./index.html"
            aria-label="SyncroWay — página inicial"
          >

            <i
              class="bi bi-lightning-charge-fill"
              aria-hidden="true"
            ></i>

            <span>
              SyncroWay
            </span>

          </a>


          <form
            class="sw-search flex-grow-1"
            id="sw-search-form"
            role="search"
            autocomplete="off"
          >

            <label
              for="sw-search-input"
              class="sw-sr-only"
            >
              Buscar no marketplace
            </label>


            <div class="input-group">

              <input
                class="form-control"
                type="search"
                name="q"
                id="sw-search-input"
                placeholder="Buscar produtos, serviços e lojas..."
                aria-label="Buscar produtos, serviços e lojas"
                enterkeyhint="search"
              >


              <button
                class="btn btn-light"
                type="submit"
                aria-label="Pesquisar"
                title="Pesquisar"
              >

                <i
                  class="bi bi-search"
                  aria-hidden="true"
                ></i>

              </button>

            </div>

          </form>


          <div
            class="
              d-none
              d-lg-flex
              align-items-center
              gap-3
              sw-header-links
            "
          >

            ${
              user
                ? renderDesktopUserMenu(
                    shortcut,
                    displayName
                  )
                : renderGuestLinks()
            }


            ${renderCartLink({
              mobile: false,
            })}


            ${
              user
                ? renderLogoutButton({
                    mobile: false,
                  })
                : ""
            }

          </div>


          ${renderMobileUserLink(user)}


          ${renderCartLink({
            mobile: true,
          })}


          ${
            user
              ? renderLogoutButton({
                  mobile: true,
                })
              : ""
          }

        </div>

      </div>


      ${renderNavigation(active)}

    </header>
  `;


  bindHeaderSearch();

  bindHeaderLogout();

  if (!skipBadge) refreshCartBadge();
}


/* ═══════════════════════════════════════════════════════════════
   07. MENU DO USUÁRIO
   ═══════════════════════════════════════════════════════════════ */

function renderDesktopUserMenu(
  shortcut,
  displayName
) {
  const dashboard =
    shortcut || {
      label: "Meu painel",
      href: "./painel.html",
    };


  return `
    <div class="dropdown">

      <button
        class="
          btn
          btn-link
          sw-link
          dropdown-toggle
          p-0
        "
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        aria-label="Abrir menu de ${displayName}"
      >

        <i
          class="bi bi-person-circle me-1"
          aria-hidden="true"
        ></i>

        <span>
          ${displayName}
        </span>

      </button>


      <ul
        class="
          dropdown-menu
          dropdown-menu-end
        "
      >

        <li>

          <a
            class="dropdown-item"
            href="${escapeHtml(
              dashboard.href
            )}"
          >

            <i
              class="
                bi
                bi-speedometer2
                me-2
              "
              aria-hidden="true"
            ></i>

            ${escapeHtml(
              dashboard.label
            )}

          </a>

        </li>


        <li>
          <hr
            class="dropdown-divider"
          >
        </li>


        <li>

          <button
            class="dropdown-item"
            id="sw-logout"
            type="button"
          >

            <i
              class="
                bi
                bi-box-arrow-right
                me-2
              "
              aria-hidden="true"
            ></i>

            Sair

          </button>

        </li>

      </ul>

    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   08. LINKS VISITANTE
   ═══════════════════════════════════════════════════════════════ */

function renderGuestLinks() {
  return `
    <a
      class="sw-link"
      href="./entrar.html"
    >
      Entrar
    </a>


    <a
      class="sw-link"
      href="./entrar.html#cadastro"
    >
      Criar conta
    </a>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   09. USUÁRIO MOBILE
   ═══════════════════════════════════════════════════════════════ */

function renderMobileUserLink(
  user
) {
  if (!user) {
    return `
      <a
        class="
          sw-link
          d-lg-none
        "
        href="./entrar.html"
        aria-label="Entrar na conta"
        title="Entrar"
      >

        <i
          class="bi bi-person-circle fs-4"
          aria-hidden="true"
        ></i>

      </a>
    `;
  }


  return `
    <a
      class="
        sw-link
        d-lg-none
      "
      href="./painel.html"
      aria-label="Abrir meu painel"
      title="Painel"
    >

      <i
        class="bi bi-person-circle fs-4"
        aria-hidden="true"
      ></i>

    </a>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   10. CARRINHO
   ═══════════════════════════════════════════════════════════════ */

function renderCartLink({
  mobile = false,
} = {}) {
  const badgeId =
    mobile
      ? "sw-cart-count-mobile"
      : "sw-cart-count";


  return `
    <a
      class="
        sw-link
        position-relative
        ${mobile
          ? "d-lg-none"
          : ""}
      "
      href="./carrinho.html"
      aria-label="Abrir carrinho"
      title="Carrinho"
    >

      <i
        class="
          bi
          bi-cart3
          ${mobile
            ? "fs-4"
            : "fs-5"}
        "
        aria-hidden="true"
      ></i>


      <span
        id="${badgeId}"
        class="
          badge
          rounded-pill
          sw-cart-badge
          d-none
        "
        aria-live="polite"
        aria-atomic="true"
      >
        0
      </span>

    </a>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   11. BOTÃO DE LOGOUT
   ═══════════════════════════════════════════════════════════════ */

function renderLogoutButton({
  mobile = false,
} = {}) {
  return `
    <button
      id="${
        mobile
          ? "sw-logout-mobile"
          : "sw-logout-header"
      }"
      class="
        btn
        btn-link
        sw-logout-button
        p-0
        ${mobile
          ? "d-lg-none"
          : ""}
      "
      type="button"
      aria-label="Sair da conta"
      title="Sair"
    >

      <i
        class="
          bi
          bi-box-arrow-right
          ${mobile
            ? "fs-4"
            : "fs-5"}
        "
        aria-hidden="true"
      ></i>

    </button>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   12. NAVEGAÇÃO
   ═══════════════════════════════════════════════════════════════ */

function renderNavigation(
  active
) {
  const navItems = [
    {
      id: "home",
      label: "Início",
      href: "./index.html",
    },

    {
      id: "products",
      label: "Produtos",
      href: "./index.html?type=product",
    },

    {
      id: "services",
      label: "Serviços",
      href: "./index.html?type=service",
    },

    {
      id: "cart",
      label: "Carrinho",
      href: "./carrinho.html",
    },

    {
      id: "panel",
      label: "Painel",
      icon: "bi-speedometer2",
      href: "./painel.html",
    },
  ];


  return `
    <nav
      class="sw-header-nav"
      aria-label="Navegação principal"
    >

      <div
        class="
          container
          d-flex
          gap-3
          overflow-auto
          py-2
          small
        "
      >

        ${navItems
          .map((item) =>
            renderNavItem(
              item,
              active
            )
          )
          .join("")}

      </div>

    </nav>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   13. ITEM DE NAVEGAÇÃO
   ═══════════════════════════════════════════════════════════════ */

function renderNavItem(
  item,
  active
) {
  const isActive =
    active === item.id;


  const isIcon =
    Boolean(item.icon);


  return `
    <a
      class="
        sw-navlink
        ${isIcon
          ? "sw-navlink-icon"
          : ""}
        ${isActive
          ? "active"
          : ""}
      "
      href="${item.href}"
      aria-label="${escapeHtml(item.label)}"
      title="${escapeHtml(item.label)}"
      ${
        isActive
          ? 'aria-current="page"'
          : ""
      }
    >

      ${
        isIcon
          ? `
            <i
              class="bi ${item.icon} fs-5"
              aria-hidden="true"
            ></i>
          `
          : escapeHtml(item.label)
      }

    </a>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   14. BUSCA
   ═══════════════════════════════════════════════════════════════ */

function bindHeaderSearch() {
  const form =
    document.getElementById(
      "sw-search-form"
    );


  const input =
    document.getElementById(
      "sw-search-input"
    );


  try {
    const url =
      new URL(
        window.location.href
      );


    const q =
      url.searchParams.get("q");


    if (
      input &&
      q &&
      !input.value
    ) {
      input.value = q;
    }

  } catch {
    // Ignora erro de URL.
  }


  form?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();


      const query =
        input?.value?.trim() ||
        "";


      const url =
        new URL(
          "./index.html",
          window.location.origin
        );


      if (query) {
        url.searchParams.set(
          "q",
          query
        );
      }


      window.location.href =
        `${url.pathname}${url.search}`;
    }
  );
}


/* ═══════════════════════════════════════════════════════════════
   15. LOGOUT
   ═══════════════════════════════════════════════════════════════ */

function bindHeaderLogout() {
  const buttons = [
    document.getElementById(
      "sw-logout"
    ),

    document.getElementById(
      "sw-logout-header"
    ),

    document.getElementById(
      "sw-logout-mobile"
    ),
  ].filter(Boolean);


  buttons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        () =>
          performLogout(button)
      );
    }
  );
}


async function performLogout(
  button
) {
  if (button?.disabled) {
    return;
  }


  const buttons = [
    document.getElementById(
      "sw-logout"
    ),

    document.getElementById(
      "sw-logout-header"
    ),

    document.getElementById(
      "sw-logout-mobile"
    ),
  ].filter(Boolean);


  buttons.forEach(
    (item) => {
      item.disabled = true;
    }
  );


  const original =
    button?.innerHTML;


  if (button) {
    button.innerHTML = `
      <span
        class="sw-spinner"
        aria-hidden="true"
      ></span>
      <span class="sw-sr-only">
        Saindo...
      </span>
    `;
  }


  try {
    await api.logout();

  } catch {
    // Mesmo que a API esteja offline, a sessão local deve ser encerrada.
  }


  session.clear();


  window.location.href =
    "./index.html";


  if (
    button &&
    original
  ) {
    button.innerHTML =
      original;
  }
}


/* ═══════════════════════════════════════════════════════════════
   16. BADGE DO CARRINHO
   ═══════════════════════════════════════════════════════════════ */

let lastBadgeFetch = 0;
const BADGE_TTL_MS = 5000;


export async function refreshCartBadge({ force = false } = {}) {
  const badges = getCartBadges();

  if (session.role !== "customer") {
    updateCartBadges(badges, 0);
    return;
  }

  const now = Date.now();
  // Evita GET /cart redundante em navegações rápidas.
  if (!force && now - lastBadgeFetch < BADGE_TTL_MS) return;
  lastBadgeFetch = now;

  try {
    const cart = await api.cart();
    const count = Math.max(0, Number(cart?.item_count || 0));
    updateCartBadges(badges, count);
  } catch {
    // Não deixa falha no carrinho quebrar o header.
  }
}


function getCartBadges() {
  return [
    document.getElementById(
      "sw-cart-count"
    ),

    document.getElementById(
      "sw-cart-count-mobile"
    ),
  ].filter(Boolean);
}


function updateCartBadges(
  badges,
  count
) {
  const safeCount =
    Math.max(
      0,
      Number(count) || 0
    );


  const display =
    safeCount > 99
      ? "99+"
      : String(safeCount);


  badges.forEach(
    (badge) => {
      badge.textContent =
        display;


      badge.classList.toggle(
        "d-none",
        safeCount <= 0
      );


      badge.setAttribute(
        "aria-label",
        safeCount === 1
          ? "1 item no carrinho"
          : `${safeCount} itens no carrinho`
      );
    }
  );
}


/* ═══════════════════════════════════════════════════════════════
   17. FOOTER
   ═══════════════════════════════════════════════════════════════ */

export function renderFooter() {
  const host =
    document.getElementById(
      "sw-footer"
    );


  if (!host) {
    return;
  }


  const year =
    new Date().getFullYear();


  host.innerHTML = `
    <footer
      class="
        sw-footer
        mt-5
        py-4
      "
    >

      <div
        class="
          container
          d-flex
          flex-column
          flex-md-row
          align-items-md-center
          justify-content-between
          gap-3
          small
        "
      >

        <div>

          <div
            class="
              fw-semibold
              text-body
            "
          >
            SyncroWay
          </div>

          <div class="text-muted">
            Marketplace regional
            de produtos e serviços
          </div>

        </div>


        <div
          class="
            text-muted
            text-md-end
          "
        >

          <div>
            Clientes • Lojistas •
            Prestadores • Motoristas
          </div>

          <div>
            © ${year} SyncroWay
          </div>

        </div>

      </div>

    </footer>
  `;
}


/* ═══════════════════════════════════════════════════════════════
   18. SKELETON CARDS
   ═══════════════════════════════════════════════════════════════ */

export function skeletonCards(
  count = 8
) {
  const total =
    clampInteger(
      count,
      1,
      24
    );


  return Array.from({
    length: total,
  })
    .map(
      () => `
        <div
          class="
            col-6
            col-md-4
            col-lg-3
          "
          aria-hidden="true"
        >

          <div
            class="
              card
              sw-card
              h-100
              placeholder-glow
            "
          >

            <div
              class="
                sw-thumb
                placeholder
              "
            ></div>


            <div class="card-body">

              <span
                class="
                  placeholder
                  col-4
                  d-block
                  mb-2
                "
              ></span>


              <span
                class="
                  placeholder
                  col-7
                  d-block
                  mb-2
                "
              ></span>


              <span
                class="
                  placeholder
                  col-10
                  d-block
                  mb-2
                "
              ></span>


              <span
                class="
                  placeholder
                  col-5
                  d-block
                "
              ></span>

            </div>

          </div>

        </div>
      `
    )
    .join("");
}
/**
 * Sanitiza input monetário. Equivalente moderno ao PICTURE "9999.99" do xBase.
 *
 * - Bloqueia letras e símbolos durante a digitação.
 * - Aceita vírgula OU ponto como separador decimal (pt-BR é vírgula).
 * - Normaliza vírgula → ponto no blur (backend espera ponto).
 * - Marca `.is-invalid` se o resultado exceder `max`.
 * - Preserva a posição do cursor ao reescrever o valor.
 */
export function attachMoneyMask(input, { max = 999999999.99 } = {}) {
  if (!input) return;

  input.setAttribute("inputmode", "decimal");
  input.setAttribute("autocomplete", "off");

  const sanitize = (raw) => {
    // Remove tudo que não é dígito, ponto ou vírgula.
    let cleaned = String(raw).replace(/[^\d.,]/g, "");

    // Mantém apenas o primeiro separador decimal.
    const firstSep = cleaned.search(/[.,]/);
    if (firstSep !== -1) {
      const head = cleaned.slice(0, firstSep + 1);
      const tail = cleaned.slice(firstSep + 1).replace(/[.,]/g, "");
      cleaned = head + tail;
    }

    // Limita a 2 casas decimais.
    const sep = cleaned.search(/[.,]/);
    if (sep !== -1) {
      cleaned = cleaned.slice(0, sep + 1) + cleaned.slice(sep + 1, sep + 3);
    }

    return cleaned;
  };

  input.addEventListener("input", () => {
    const cursorFromEnd = input.value.length - input.selectionStart;
    const cleaned = sanitize(input.value);

    if (cleaned !== input.value) {
      input.value = cleaned;
      const pos = Math.max(0, cleaned.length - cursorFromEnd);
      input.setSelectionRange(pos, pos);
    }

    const num = parseFloat(cleaned.replace(",", "."));
    const isBad = !Number.isFinite(num) || num > max;
    input.classList.toggle("is-invalid", isBad);
  });

  input.addEventListener("blur", () => {
    if (input.value.includes(",")) {
      input.value = input.value.replace(",", ".");
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   19. ALERT BOX
   ═══════════════════════════════════════════════════════════════ */

export function alertBox(
  message,
  variant = "danger"
) {
  const allowedVariants =
    new Set([
      "success",
      "danger",
      "warning",
      "info",
      "primary",
      "light",
    ]);


  const safeType =
    allowedVariants.has(variant)
      ? variant
      : "danger";


  const icon =
    ALERT_ICONS[safeType] ||
    ALERT_ICONS.danger;


  return `
    <div
      class="
        alert
        alert-${safeType}
        d-flex
        gap-2
        align-items-start
      "
      role="${
        safeType === "danger"
          ? "alert"
          : "status"
      }"
    >

      <i
        class="
          bi
          ${icon}
          flex-shrink-0
        "
        aria-hidden="true"
      ></i>


      <div class="sw-min-w-0">
        ${escapeHtml(message)}
      </div>

    </div>
  `;
}
