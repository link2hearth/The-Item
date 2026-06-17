import { world } from "@minecraft/server"
import { gdp, sdp, prettyName } from "../core/utils.js"
import { isUnlocked, backpackIDs } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { defineSettings, getSetting } from "../core/settings.js"

// ── Settings ────────────────────────────────────────────────────────────────

defineSettings([
    { key: "waila_entityDist",  labelKey: "fabmod.cfg.lbl.waila_entityDist",  tooltipKey: "fabmod.cfg.tip.waila_entityDist",  type: "slider", min: 4, max: 35, step: 1, default: 10,  category: "WAILA",     categoryKey: "fabmod.cfg.cat.waila"    },
    { key: "waila_blockDist",   labelKey: "fabmod.cfg.lbl.waila_blockDist",   tooltipKey: "fabmod.cfg.tip.waila_blockDist",   type: "slider", min: 4, max: 35, step: 1, default: 6,   category: "WAILA",     categoryKey: "fabmod.cfg.cat.waila"    },
    { key: "itemName_distance", labelKey: "fabmod.cfg.lbl.itemName_distance", tooltipKey: "fabmod.cfg.tip.itemName_distance", type: "slider", min: 4, max: 96, step: 1, default: 30,  category: "Item Name", categoryKey: "fabmod.cfg.cat.itemName" },
    { key: "itemName_los",      labelKey: "fabmod.cfg.lbl.itemName_los",      tooltipKey: "fabmod.cfg.tip.itemName_los",      type: "toggle", default: false,                          category: "Item Name", categoryKey: "fabmod.cfg.cat.itemName" },
]);


// ── Item name helpers ─────────────────────────────────────────────────────

export function translatedItemName(itemStack) {
    const parts = [{ translate: itemStack.localizationKey }];
    if (itemStack.amount > 1) parts.push({ text: ` §e${itemStack.amount}x` });
    return { rawtext: parts };
}

export function translatedBlockName(block) {
    return { rawtext: [{ text: "§b" }, { translate: block.localizationKey }] };
}

export function translatedEntityName(typeId, healthText) {
    const id = typeId.split(":")[1];
    const parts = [{ text: "§e" }, { translate: `entity.${id}.name` }];
    if (healthText) parts.push({ text: healthText });
    return { rawtext: parts };
}

// ── Crop helpers ─────────────────────────────────────────────────────────────

// Max growth values for known vanilla crops
const CROP_KNOWN = {
    "minecraft:wheat":            { state: "growth", max: 7 },
    "minecraft:carrots":          { state: "growth", max: 7 },
    "minecraft:potatoes":         { state: "growth", max: 7 },
    "minecraft:pumpkin_stem":     { state: "growth", max: 7 },
    "minecraft:melon_stem":       { state: "growth", max: 7 },
    "minecraft:torchflower_crop": { state: "growth", max: 7 },
    "minecraft:pitcher_crop":     { state: "growth", max: 4 },
    "minecraft:beetroot":         { state: "growth", max: 3 },
    "minecraft:nether_wart":      { state: "growth", max: 3 },
    "minecraft:sweet_berry_bush": { state: "growth", max: 3 },
    "minecraft:cocoa":            { state: "age",    max: 2 },
};

// Returns { current, max } if block is a crop, null otherwise.
// max is null for unknown modded crops (growth/age state detected but no known max).
function getCropInfo(block) {
    const known = CROP_KNOWN[block.typeId];
    if (known) {
        let val;
        try { val = block.permutation.getState(known.state); } catch {}
        if (typeof val === "number") return { current: val, max: known.max };
    }
    // Generic fallback for modded crops using standard state names
    for (const stateName of ["growth", "age"]) {
        let val;
        try { val = block.permutation.getState(stateName); } catch {}
        if (typeof val === "number") return { current: val, max: null };
    }
    return null;
}

function makeCropBar(current, max) {
    if (max === null) {
        return `§e${current}`;
    }
    const mature = current >= max;
    const filled = Math.round((current / max) * 8);
    const bar = "█".repeat(filled) + "░".repeat(8 - filled);
    const color = mature ? "§a" : current / max >= 0.5 ? "§e" : "§6";
    return `${color}${bar}  ${Math.round((current / max) * 100)}%${mature ? " §a✔" : ""}`;
}

// ── Container helpers ────────────────────────────────────────────────────────

const FURNACE_IDS = new Set(["minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker"])

// ── WAILA tick ───────────────────────────────────────────────────────────────

const prevWailaPos = new Map()

function showWaila(player, pos, content) {
    if (pos === "bc") {
        player.onScreenDisplay.setActionBar(content);
    } else {
        const prefixed = (content?.rawtext)
            ? { rawtext: [{ text: "§r§r§0§l" }, ...content.rawtext] }
            : "§r§r§0§l" + (content ?? "");
        player.onScreenDisplay.setTitle(`_tw:${pos}`, {
            subtitle: prefixed,
            fadeInDuration: 0, stayDuration: 4, fadeOutDuration: 0
        });
    }
}

eventBus.playerInterval((players) => {
    const serverEntityDist = getSetting("waila_entityDist");
    const serverBlockDist = getSetting("waila_blockDist");

    for (const player of players) {
        if (player.nameTag !== player.name) player.nameTag = player.name;

        const pos = gdp("p_waila_pos", player) ?? "bc";
        const prevPos = prevWailaPos.get(player.id) ?? pos;
        prevWailaPos.set(player.id, pos);

        // Passage d'un panel titre vers actionBar : efface le panel résiduel
        // _tw:cl est caché par hud_screen.json mais ne correspond à aucun panel → force la mise à jour de #hud_title_text_string
        if (prevPos !== "bc" && pos === "bc") {
            try { player.onScreenDisplay.setTitle("_tw:cl", { fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 }) } catch {}
        }

        if (!isUnlocked("waila", player) || !(gdp("waila", player) ?? false)) continue;

        const entityDist = Math.min(gdp("p_waila_entityDist", player) ?? serverEntityDist, serverEntityDist);
        const blockDist = Math.min(gdp("p_waila_blockDist", player) ?? serverBlockDist, serverBlockDist);

        try {
            // Un seul raycast d'entités couvrant la plus grande des deux portées,
            // puis tri mob/item dans le résultat (déjà ordonné par distance) — évite
            // un second raycast par joueur et par cycle.
            const hits = player.getEntitiesFromViewDirection({ maxDistance: Math.max(entityDist, blockDist) });

            // Priorité au mob (jusqu'à entityDist), même si un item est plus proche
            const mobHit = hits.find(h =>
                h.distance <= entityDist &&
                h.entity.typeId !== "minecraft:player" &&
                h.entity.typeId !== "minecraft:item" &&
                h.entity.typeId !== "fabmod:player_corpse" &&
                !backpackIDs.includes(h.entity.typeId)
            );
            if (mobHit) {
                const entity = mobHit.entity;
                const health = entity.getComponent("minecraft:health");
                const content = health
                    ? translatedEntityName(entity.typeId, `  §c${Math.floor(health.currentValue)} §7/ §c${Math.floor(health.effectiveMax)} §c❤`)
                    : translatedEntityName(entity.typeId);
                showWaila(player, pos, content);
                continue;
            }

            const itemHit = hits.find(h => h.distance <= blockDist && h.entity.typeId === "minecraft:item");
            if (itemHit) {
                const itemStack = itemHit.entity.getComponent("minecraft:item")?.itemStack;
                if (itemStack) {
                    showWaila(player, pos, translatedItemName(itemStack));
                    continue;
                }
            }
        } catch (e) { console.warn("[WAILA] entity error:", e); }

        try {
            const blockHit = player.getBlockFromViewDirection({ maxDistance: blockDist });
            if (blockHit) {
                const block = blockHit.block;
                const invComp = block.hasComponent("minecraft:inventory") ? block.getComponent("minecraft:inventory") : null;

                if (invComp && FURNACE_IDS.has(block.typeId)) {
                    // ── Four (furnace, blast furnace, smoker) ──────────────────
                    const furnaceMode = gdp("p_waila_furnacePreview", player) ?? "always";
                    if (furnaceMode === "always" || player.isSneaking) {
                        const container = invComp.container;
                        const input  = container.getItem(0);
                        const output = container.getItem(2);
                        let lit = false;
                        try { lit = block.permutation.getState("lit") === true; } catch {}
                        const parts = [{ text: "§b" }, { translate: block.localizationKey }, { text: "  §7" }];
                        if (!input && !output) {
                            parts.push({ text: "§8Empty" });
                        } else {
                            if (input) {
                                parts.push({ translate: input.localizationKey });
                                if (input.amount > 1) parts.push({ text: ` §e×${input.amount}` });
                            } else {
                                parts.push({ text: "§8—" });
                            }
                            parts.push({ text: "  §8→  §7" });
                            if (output) {
                                parts.push({ translate: output.localizationKey });
                                if (output.amount > 1) parts.push({ text: ` §e×${output.amount}` });
                            } else {
                                parts.push({ text: "§8—" });
                            }
                            if (lit) parts.push({ text: "  §c🔥" });
                        }
                        showWaila(player, pos, { rawtext: parts });
                    } else {
                        showWaila(player, pos, translatedBlockName(block));
                    }

                } else if (invComp) {
                    // ── Conteneur générique (coffre, barrel, hopper...) ────────
                    const chestMode = gdp("p_waila_chestPreview", player) ?? "always";
                    if (chestMode === "always" || player.isSneaking) {
                        const groups = new Map();
                        const container = invComp.container;
                        for (let i = 0; i < container.size; i++) {
                            const item = container.getItem(i);
                            if (!item) continue;
                            const g = groups.get(item.typeId);
                            if (g) g.amount += item.amount;
                            else groups.set(item.typeId, { amount: item.amount, key: item.localizationKey });
                        }
                        const sorted = [...groups.values()].sort((a, b) => b.amount - a.amount);
                        const shown = sorted.slice(0, 4);
                        const more = sorted.length - shown.length;
                        const parts = [{ text: "§b" }, { translate: block.localizationKey }, { text: "  §7" }];
                        if (sorted.length === 0) {
                            parts.push({ text: "§8Empty" });
                        } else {
                            for (let i = 0; i < shown.length; i++) {
                                if (i > 0) parts.push({ text: "§7, " });
                                parts.push({ translate: shown[i].key });
                                parts.push({ text: ` §e×${shown[i].amount}` });
                            }
                            if (more > 0) parts.push({ text: `  §8+${more}` });
                        }
                        showWaila(player, pos, { rawtext: parts });
                    } else {
                        showWaila(player, pos, translatedBlockName(block));
                    }

                } else {
                    const cropInfo = getCropInfo(block);
                    if (cropInfo !== null) {
                        showWaila(player, pos, { rawtext: [
                            { text: "§b" }, { translate: block.localizationKey },
                            { text: "  " + makeCropBar(cropInfo.current, cropInfo.max) }
                        ]});
                    } else {
                        showWaila(player, pos, translatedBlockName(block));
                    }
                }
            } else {
                // Rien à afficher : efface l'actionBar si bc, sinon laisse le titre expirer
                if (pos === "bc") player.onScreenDisplay.setActionBar("");
            }
        } catch (e) { console.warn("[WAILA] block error:", e); }
    }
}, 3);

// ── Item Name floating nameTag ───────────────────────────────────────────────

let itemNameWasActive = false;

eventBus.interval(() => {
    const dims = ["overworld", "nether", "the_end"];
    const enabledPlayers = world.getPlayers().filter(p =>
        isUnlocked("itemName", p) && (gdp("itemName", p) ?? false)
    );

    // Personne n'a l'affichage actif : on évite de balayer les items des 3 dimensions
    // chaque cycle. Un unique passage de nettoyage est fait quand l'affichage vient
    // d'être désactivé, puis plus aucun scan tant que ça reste off.
    if (enabledPlayers.length === 0) {
        if (!itemNameWasActive) return;
        itemNameWasActive = false;
        for (const dimName of dims) {
            try {
                const dimension = world.getDimension(dimName);
                for (const entity of dimension.getEntities({ type: "minecraft:item" })) {
                    if (entity.nameTag) entity.nameTag = "";
                }
            } catch {}
        }
        return;
    }
    itemNameWasActive = true;

    const serverDist = getSetting("itemName_distance");
    const serverLos  = getSetting("itemName_los");
    for (const dimName of dims) {
        const dimension = world.getDimension(dimName);
        for (const entity of dimension.getEntities({ type: "minecraft:item" })) {
            let visible = false;
            for (const player of enabledPlayers) {
                const maxDist = Math.min(gdp("p_itemName_dist", player) ?? serverDist, serverDist);
                const useLos  = gdp("p_itemName_los", player) ?? serverLos;
                const dx = entity.location.x - player.location.x;
                const dy = entity.location.y - player.location.y;
                const dz = entity.location.z - player.location.z;
                if (Math.sqrt(dx*dx + dy*dy + dz*dz) > maxDist) continue;
                if (useLos) {
                    const head = { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };
                    const dir  = { x: entity.location.x - head.x, y: entity.location.y - head.y, z: entity.location.z - head.z };
                    const realDist = Math.sqrt(dir.x*dir.x + dir.y*dir.y + dir.z*dir.z);
                    const hit  = dimension.getBlockFromRay(head, dir, { maxDistance: realDist, includePassableBlocks: false, includeLiquidBlocks: false });
                    if (hit) continue;
                }
                visible = true;
                break;
            }
            if (visible) {
                const itemStack = entity.getComponent("minecraft:item")?.itemStack;
                if (!itemStack) { if (entity.nameTag) entity.nameTag = ""; continue; }
                const name = prettyName(itemStack.typeId);
                const tag = itemStack.amount > 1 ? `§f${name} §e${itemStack.amount}x` : `§f${name}`;
                if (entity.nameTag !== tag) entity.nameTag = tag;
            } else {
                if (entity.nameTag) entity.nameTag = "";
            }
        }
    }
}, 20);
