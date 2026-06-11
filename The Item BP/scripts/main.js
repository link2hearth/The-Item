// ═══════════════════════════════════════════════════════════════════════════════
// ── The Item — Entry Point ──────────────────────────────────────────────────
// Modular architecture with priority-based events and server-wide settings.
// ═══════════════════════════════════════════════════════════════════════════════

// Core systems (must load first)
import { eventBus } from "./core/eventBus.js"
import "./core/settings.js"
import "./core/tps.js"

// Menu router + menu registrations
import { registerMenu } from "./menus/router.js"
import "./menus/command.js"
import "./menus/settings.js"
import "./menus/upgrades.js"
import "./menus/admin.js"
import "./menus/combat.js"

// Modules (register their handlers with the eventBus)
import "./modules/achievements.js"
import "./modules/mining.js"
import "./modules/abilities.js"
import "./modules/waila.js"
import "./modules/backpack.js"
import "./modules/corpse.js"
import "./modules/chunks.js"
import "./modules/player.js"
import "./modules/combat.js"
import "./modules/fireball.js"
import "./modules/furnace.js"
import "./modules/crafting_table.js"
import "./modules/workstation.js"

// Register module menus that live in their own files
import { teleportMenu } from "./modules/teleport.js"
import { chunksMenu } from "./modules/chunks.js"
import { statsMenu } from "./modules/player.js"

registerMenu("teleport", teleportMenu);
registerMenu("chunks", chunksMenu);
registerMenu("stats", statsMenu);

// Initialize: subscribe all registered handlers to Minecraft events
eventBus.init();
