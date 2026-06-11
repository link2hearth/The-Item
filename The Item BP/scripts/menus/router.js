// ── Menu Router ──────────────────────────────────────────────────────────────
// Resolves circular dependencies between menus.
// Each menu file registers its menus here at import time.
// Any module can navigate via openMenu("name", player).

const _menus = {};

export function registerMenu(name, fn) {
    _menus[name] = fn;
}

export function openMenu(name, player, ...args) {
    const fn = _menus[name];
    if (fn) fn(player, ...args);
    else console.warn(`[Router] Unknown menu: ${name}`);
}
