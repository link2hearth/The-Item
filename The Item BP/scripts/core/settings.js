import { world } from "@minecraft/server"

// ── Server-wide Settings Manager ────────────────────────────────────────────
// Stores configurable values in a world dynamic property as JSON.
// Modules register their setting definitions at import time.
// The admin menu auto-generates a config UI from these definitions.

const SETTINGS_KEY = "fabmod:serverConfig";
const _definitions = [];
let _cache = null;

// Register one or more setting definitions
// Definition format: { key, label, type, category, default, [min, max, step, options] }
// Types: "slider", "toggle", "dropdown", "text"
export function defineSettings(defs) {
    _definitions.push(...defs);
}

function load() {
    if (_cache !== null) return _cache;
    const raw = world.getDynamicProperty(SETTINGS_KEY);
    if (!raw) { _cache = {}; return _cache; }
    try { _cache = JSON.parse(raw); } catch { _cache = {}; }
    return _cache;
}

function save() {
    world.setDynamicProperty(SETTINGS_KEY, JSON.stringify(_cache ?? {}));
}

// Get a setting value (returns default if not set)
export function getSetting(key) {
    const data = load();
    if (key in data) return data[key];
    const def = _definitions.find(d => d.key === key);
    return def?.default;
}

// Set a setting value
export function setSetting(key, value) {
    const data = load();
    data[key] = value;
    save();
}

// Get all registered definitions (for building the admin config UI)
export function getAllDefinitions() {
    return _definitions;
}

// Get unique categories
export function getCategories() {
    return [...new Set(_definitions.map(d => d.category))];
}

// Get definitions for a specific category
export function getDefinitionsByCategory(category) {
    return _definitions.filter(d => d.category === category);
}

// Force reload from world property (call after external changes)
export function invalidateCache() {
    _cache = null;
}
