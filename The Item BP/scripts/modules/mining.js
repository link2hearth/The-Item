import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server"
import { gdp, sdp, rng, t } from "../core/utils.js"
import { isUnlocked, isTheItem, spawnerID, SPAWNER_MOBS } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { defineSettings, getSetting } from "../core/settings.js"
import { ModalFormData } from "@minecraft/server-ui"

// ── Settings definitions ────────────────────────────────────────────────────

defineSettings([
    { key: "vm_radius",     labelKey: "fabmod.cfg.lbl.vm_radius",     tooltipKey: "fabmod.cfg.tip.vm_radius",     type: "slider", min: 1,  max: 15,  step: 1,  default: 5,   category: "Mining", categoryKey: "fabmod.cfg.cat.mining" },
    { key: "vm_delay",      labelKey: "fabmod.cfg.lbl.vm_delay",      tooltipKey: "fabmod.cfg.tip.vm_delay",      type: "slider", min: 0,  max: 4,   step: 1,  default: 1,   category: "Mining", categoryKey: "fabmod.cfg.cat.mining" },
    { key: "tc_maxH",       labelKey: "fabmod.cfg.lbl.tc_maxH",       tooltipKey: "fabmod.cfg.tip.tc_maxH",       type: "slider", min: 3,  max: 20,  step: 1,  default: 10,  category: "Mining", categoryKey: "fabmod.cfg.cat.mining" },
    { key: "tc_maxV",       labelKey: "fabmod.cfg.lbl.tc_maxV",       tooltipKey: "fabmod.cfg.tip.tc_maxV",       type: "slider", min: 32, max: 256, step: 16, default: 128, category: "Mining", categoryKey: "fabmod.cfg.cat.mining" },
    { key: "tc_leafBridge", labelKey: "fabmod.cfg.lbl.tc_leafBridge", tooltipKey: "fabmod.cfg.tip.tc_leafBridge", type: "slider", min: 0,  max: 5,   step: 1,  default: 2,   category: "Mining", categoryKey: "fabmod.cfg.cat.mining" },
    { key: "tc_leafDecay",  labelKey: "fabmod.cfg.lbl.tc_leafDecay",  tooltipKey: "fabmod.cfg.tip.tc_leafDecay",  type: "toggle", default: true,                              category: "Mining", categoryKey: "fabmod.cfg.cat.mining" },
]);

// ── Auto Replant — protège les cultures immatures ───────────────────────────

const CROP_MAX_GROWTH = {
    "minecraft:wheat":    7,
    "minecraft:carrots":  7,
    "minecraft:potatoes": 7,
    "minecraft:beetroot": 3,
};

const FARMING_HAND_ITEMS = new Set([
    "minecraft:wheat_seeds", "minecraft:carrot",
    "minecraft:potato",      "minecraft:beetroot_seeds",
]);

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    if (!isUnlocked("autoReplant", player)) return;
    const mainhand = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    const typeId = mainhand?.typeId ?? "";
    if (!typeId.endsWith("_hoe") && !FARMING_HAND_ITEMS.has(typeId)) return;
    const maxGrowth = CROP_MAX_GROWTH[ev.block.typeId];
    if (maxGrowth === undefined) return;
    const growth = ev.block.permutation.getState("growth") ?? 0;
    if (growth < maxGrowth) ev.cancel = true;
});

// ── Focus on Mobs — annule le minage de l'Item si mob hostile à portée ──────

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    if (!(gdp("focusMobs", player) ?? false)) return;
    const mainhand = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    if (!isTheItem(mainhand?.typeId)) return;
    const radius = gdp("p_focusMobs_radius", player) ?? 4;
    try {
        const hostiles = player.dimension.getEntities({
            location: player.location,
            maxDistance: radius,
            families: ["monster"],
        });
        if (hostiles.length > 0) ev.cancel = true;
    } catch {}
});

// ── Spawner Silk Touch ──────────────────────────────────────────────────────

// Sous-listes de mobs pour la détection contextuelle
const SPAWNER_MOBS_DUNGEON   = SPAWNER_MOBS.filter(m => ["minecraft:zombie_spawn_egg","minecraft:skeleton_spawn_egg","minecraft:spider_spawn_egg"].includes(m.egg));
const SPAWNER_MOBS_OVERWORLD = SPAWNER_MOBS.filter(m => ["minecraft:zombie_spawn_egg","minecraft:skeleton_spawn_egg","minecraft:spider_spawn_egg","minecraft:cave_spider_spawn_egg","minecraft:silverfish_spawn_egg"].includes(m.egg));

// Kills récents pour pré-sélection
const DUNGEON_MOB_EGGS = {
    "minecraft:zombie":   "minecraft:zombie_spawn_egg",
    "minecraft:skeleton": "minecraft:skeleton_spawn_egg",
    "minecraft:spider":   "minecraft:spider_spawn_egg",
};
const recentKills = new Map();

export function recordMobKill(player, entityTypeId) {
    const list = recentKills.get(player.id) ?? [];
    list.push(entityTypeId);
    if (list.length > 15) list.shift();
    recentKills.set(player.id, list);
}

function getMostLikelyEgg(playerId) {
    const list = recentKills.get(playerId) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
        const egg = DUNGEON_MOB_EGGS[list[i]];
        if (egg) return egg;
    }
    return null;
}

function hasBlockNearby(dimension, center, radius, typeIds) {
    for (let dx = -radius; dx <= radius; dx++)
    for (let dy = -radius; dy <= radius; dy++)
    for (let dz = -radius; dz <= radius; dz++) {
        try {
            const b = dimension.getBlock({ x: center.x + dx, y: center.y + dy, z: center.z + dz });
            if (b && typeIds.includes(b.typeId)) return true;
        } catch {}
    }
    return false;
}

// ── Zone de stockage distante ─────────────────────────────────────────────────

const STORAGE_CONF = {
    "minecraft:overworld": { x: 100000, y: -58, z: 0, tick: "spawner_store_ow" },
    "minecraft:nether":    { x: 100000, y:  20, z: 0, tick: "spawner_store_ne" },
};

// Offset par face pour calculer la position de pose
const FACE_OFFSET = {
    "Up":    [ 0,  1,  0], "Down":  [ 0, -1,  0],
    "North": [ 0,  0, -1], "South": [ 0,  0,  1],
    "East":  [ 1,  0,  0], "West":  [-1,  0,  0],
};

const STORAGE_COLS = 8; // 8×8 par couche = 64 slots, puis +2 en Y

function storagePos(dimId, slot) {
    const c = STORAGE_CONF[dimId];
    const layer = Math.floor(slot / (STORAGE_COLS * STORAGE_COLS));
    const local = slot % (STORAGE_COLS * STORAGE_COLS);
    return {
        x: c.x + (local % STORAGE_COLS) * 2,
        y: c.y + layer * 2,
        z: c.z + Math.floor(local / STORAGE_COLS) * 2,
    };
}

function allocateSlot() {
    const raw = world.getDynamicProperty("sk_free");
    const free = raw ? JSON.parse(raw) : [];
    if (free.length > 0) {
        const slot = free.shift();
        world.setDynamicProperty("sk_free", JSON.stringify(free));
        return slot;
    }
    const n = world.getDynamicProperty("sk_counter") ?? 0;
    world.setDynamicProperty("sk_counter", n + 1);
    return n;
}

function freeSlot(slot) {
    const raw = world.getDynamicProperty("sk_free");
    const free = raw ? JSON.parse(raw) : [];
    free.push(slot);
    world.setDynamicProperty("sk_free", JSON.stringify(free));
}

function getStorageCount(dimId) {
    return world.getDynamicProperty("sk_n_" + (dimId === "minecraft:nether" ? "ne" : "ow")) ?? 0;
}

function changeStorageCount(dimId, delta) {
    const key = "sk_n_" + (dimId === "minecraft:nether" ? "ne" : "ow");
    const n = Math.max(0, (world.getDynamicProperty(key) ?? 0) + delta);
    world.setDynamicProperty(key, n);
    return n;
}

function setupStorage(dimId) {
    const c = STORAGE_CONF[dimId];
    const dim = world.getDimension(dimId);
    // Ticking area : 1 seul chunk (X=100000 aligné chunk → chunk 6250,0)
    try { dim.runCommand(`tickingarea add ${c.x} ${c.y} ${c.z} ${c.x} ${c.y} ${c.z} ${c.tick} true`); } catch {}
}

function teardownStorage(dimId) {
    try { world.getDimension(dimId).runCommand(`tickingarea remove ${STORAGE_CONF[dimId].tick}`); } catch {}
}

// Restaurer les ticking areas au démarrage si des spawners sont en attente
system.run(() => {
    for (const dimId of Object.keys(STORAGE_CONF)) {
        if (getStorageCount(dimId) > 0) setupStorage(dimId);
    }
});

// ── Récupération : beforeEvents.playerBreakBlock ──────────────────────────────

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.block.typeId !== spawnerID) return;
    const player = ev.player;
    const mainhand = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    if (!mainhand?.getComponent("enchantable")?.getEnchantment("silk_touch")) return;
    if (!isUnlocked("silkSpawner", player)) return;
    if (!(gdp("silkSpawner", player) ?? false)) return;
    if (!STORAGE_CONF[player.dimension.id]) return; // The End ou autre → ignoré

    ev.cancel = true;
    const loc = { ...ev.block.location };
    const dim = player.dimension;
    const dimId = dim.id;
    system.run(() => processPickup(player, loc, dim, dimId));
});

function processPickup(player, loc, dim, dimId) {
    // Détection automatique
    if (dimId === "minecraft:nether") {
        doPickup(player, loc, dimId, SPAWNER_MOBS.find(m => m.egg === "minecraft:blaze_spawn_egg"));
        return;
    }
    if (hasBlockNearby(dim, loc, 12, ["minecraft:end_portal_frame"])) {
        doPickup(player, loc, dimId, SPAWNER_MOBS.find(m => m.egg === "minecraft:silverfish_spawn_egg"));
        return;
    }
    if (hasBlockNearby(dim, loc, 5, ["minecraft:web", "minecraft:cobweb"])) {
        doPickup(player, loc, dimId, SPAWNER_MOBS.find(m => m.egg === "minecraft:cave_spider_spawn_egg"));
        return;
    }

    // Menu réduit pour les donjons / contexte inconnu
    const recentEgg = getMostLikelyEgg(player.id);
    const isDungeon = hasBlockNearby(dim, loc, 5, ["minecraft:mossy_cobblestone"]);
    const mobList = isDungeon ? SPAWNER_MOBS_DUNGEON : SPAWNER_MOBS_OVERWORLD;
    const defaultIdx = recentEgg ? Math.max(0, mobList.findIndex(m => m.egg === recentEgg)) : 0;

    new ModalFormData()
        .title("Spawner — Type de mob")
        .dropdown("Quel mob était dans ce spawner ?", mobList.map(m => m.name), defaultIdx)
        .show(player).then(res => {
            if (res.canceled) {
                player.sendMessage("§7Annulé — le spawner reste en place.");
                return;
            }
            doPickup(player, loc, dimId, mobList[res.formValues[0]]);
        });
}

function doPickup(player, loc, dimId, mobEntry) {
    const slot = allocateSlot();
    const sPos = storagePos(dimId, slot);
    const dim = world.getDimension(dimId);
    const isFirst = getStorageCount(dimId) === 0;

    if (isFirst) setupStorage(dimId);

    const execute = () => {
        let ok = false;
        try {
            const r = dim.runCommand(`clone ${loc.x} ${loc.y} ${loc.z} ${loc.x} ${loc.y} ${loc.z} ${sPos.x} ${sPos.y} ${sPos.z} replace move`);
            ok = r?.successCount > 0;
        } catch {}

        if (!ok) {
            freeSlot(slot);
            player.sendMessage("§cZone de stockage non encore chargée — réessaie dans 2 secondes.");
            // Remettre le spawner à sa place
            try { dim.runCommand(`setblock ${loc.x} ${loc.y} ${loc.z} minecraft:mob_spawner`); } catch {}
            return;
        }

        changeStorageCount(dimId, 1);

        const dimLabel = dimId === "minecraft:nether" ? "Nether" : "Overworld";
        const fakeItem = new ItemStack(spawnerID, 1);
        fakeItem.nameTag = `§6${mobEntry?.name ?? "Spawner"}`;
        fakeItem.setLore([
            `§c⚠ À poser dans le ${dimLabel} uniquement`,
            `§8[silk:${slot}:${dimId === "minecraft:nether" ? "ne" : "ow"}]`,
        ]);

        const inv = player.getComponent("minecraft:inventory")?.container;
        if (inv) inv.addItem(fakeItem);
        else dim.spawnItem(fakeItem, player.location);

        player.sendMessage(`§aSpawner §6${mobEntry?.name ?? ""}§a récupéré — pose-le dans l'${dimLabel}.`);
    };

    // Premier usage : attendre 1 seconde que le chunk de stockage charge
    if (isFirst) system.runTimeout(execute, 20);
    else execute();
}

// ── Pose : beforeEvents.playerInteractWithBlock ───────────────────────────────

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const item = ev.itemStack;
    if (!item || item.typeId !== spawnerID) return;

    // Détecter le tag silk dans le lore
    const lore = item.getLore?.() ?? [];
    const tag = lore.find(l => l.startsWith("§8[silk:"));
    if (!tag) return;

    // Extraire slot et dimension : "§8[silk:3:ow]" → slot=3, dimKey="ow"
    const inner = tag.slice(8, -1); // supprime "§8[silk:" et "]"
    const parts = inner.split(":");
    const slot = parseInt(parts[0]);
    const storedDimId = parts[1] === "ne" ? "minecraft:nether" : "minecraft:overworld";
    const currentDimId = ev.player.dimension.id;

    // Mauvaise dimension
    if (currentDimId !== storedDimId) {
        ev.cancel = true;
        const label = storedDimId === "minecraft:nether" ? "Nether" : "Overworld";
        system.run(() => ev.player.sendMessage(`§cCe spawner ne peut être posé que dans le §e${label}§c !`));
        return;
    }

    // Calculer la position de pose à partir de la face cliquée
    const off = FACE_OFFSET[ev.blockFace] ?? [0, 1, 0];
    const cl = ev.block.location;
    const targetLoc = { x: cl.x + off[0], y: cl.y + off[1], z: cl.z + off[2] };

    // Vérifier que la cible est libre
    let targetBlock;
    try { targetBlock = ev.player.dimension.getBlock(targetLoc); } catch {}
    if (!targetBlock?.isAir) return;

    ev.cancel = true;
    const player = ev.player;

    system.run(() => {
        const dim = world.getDimension(storedDimId);
        const sPos = storagePos(storedDimId, slot);
        let ok = false;
        try {
            const r = dim.runCommand(`clone ${sPos.x} ${sPos.y} ${sPos.z} ${sPos.x} ${sPos.y} ${sPos.z} ${targetLoc.x} ${targetLoc.y} ${targetLoc.z} replace move`);
            ok = r?.successCount > 0;
        } catch {}

        if (!ok) {
            player.sendMessage("§cImpossible de placer le spawner ici.");
            return;
        }

        // Libérer le slot
        freeSlot(slot);
        const remaining = changeStorageCount(storedDimId, -1);
        if (remaining === 0) teardownStorage(storedDimId);

        // Supprimer l'item factice de l'inventaire
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (inv) {
            for (let i = 0; i < inv.size; i++) {
                const it = inv.getItem(i);
                if (!it || it.typeId !== spawnerID) continue;
                if ((it.getLore?.() ?? []).some(l => l === tag)) {
                    inv.setItem(i, undefined);
                    break;
                }
            }
        }

        player.sendMessage("§aSpawner posé !");
    });
});

// ── Vein Miner + Tree Capitator ─────────────────────────────────────────────

eventBus.after("playerBreakBlock", (ev) => {
    const block = ev.brokenBlockPermutation;
    const dim = ev.dimension;
    const start = ev.block.location;
    const player = ev.player;
    let count = 0;

    // Tree Capitator
    if (block?.type.id.endsWith("_log") && player.isSneaking && isUnlocked("tc", player) && gdp("tc", player)) {
        const logType = block.type.id;
        const leafType = logType.replace("_log", "_leaves");
        const MAX_H = getSetting("tc_maxH");
        const MAX_V = getSetting("tc_maxV");
        const MAX_LEAF_BRIDGE = getSetting("tc_leafBridge");

        const visited = new Set();
        const queue = [{ x: start.x, y: start.y, z: start.z, leafDist: 0 }];
        const key = (x, y, z) => `${x},${y},${z}`;
        visited.add(key(start.x, start.y, start.z));
        const leafPositions = [];
        const logPositions = [{ x: start.x, y: start.y, z: start.z }];

        while (queue.length > 0) {
            const cur = queue.shift();
            for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                const nx = cur.x + dx, ny = cur.y + dy, nz = cur.z + dz;
                if (Math.abs(nx - start.x) > MAX_H || Math.abs(nz - start.z) > MAX_H) continue;
                if (ny < start.y - 1 || ny > start.y + MAX_V) continue;
                const k = key(nx, ny, nz);
                if (visited.has(k)) continue;
                visited.add(k);

                const b = dim.getBlock({ x: nx, y: ny, z: nz });
                if (!b) continue;

                if (b.typeId === logType) {
                    dim.setBlockType({ x: nx, y: ny, z: nz }, "minecraft:air");
                    dim.spawnItem(block.getItemStack(), start);
                    count++;
                    logPositions.push({ x: nx, y: ny, z: nz });
                    queue.push({ x: nx, y: ny, z: nz, leafDist: 0 });
                } else if (b.typeId.startsWith(leafType.replace("_leaves", "")) && b.typeId.endsWith("_leaves") && cur.leafDist < MAX_LEAF_BRIDGE) {
                    queue.push({ x: nx, y: ny, z: nz, leafDist: cur.leafDist + 1 });
                }
            }
        }

        // Scan leaves around all broken logs (radius 2) to catch top layers
        const leafSet = new Set();
        for (const lp of logPositions) {
            for (let dx = -2; dx <= 2; dx++)
            for (let dy = -2; dy <= 2; dy++)
            for (let dz = -2; dz <= 2; dz++) {
                const nx = lp.x + dx, ny = lp.y + dy, nz = lp.z + dz;
                const k = key(nx, ny, nz);
                if (leafSet.has(k)) continue;
                try {
                    const b = dim.getBlock({ x: nx, y: ny, z: nz });
                    if (b && b.typeId.endsWith("_leaves")) {
                        leafSet.add(k);
                        leafPositions.push({ x: nx, y: ny, z: nz });
                    }
                } catch {}
            }
        }

        // Leaf decay: break nearby leaves with a cascade delay
        if (getSetting("tc_leafDecay") && leafPositions.length > 0) {
            let li = 0;
            function decayLeaf() {
                if (li >= leafPositions.length) return;
                const lp = leafPositions[li++];
                try {
                    const lb = dim.getBlock(lp);
                    if (lb && lb.typeId.endsWith("_leaves")) {
                        dim.runCommand(`setblock ${lp.x} ${lp.y} ${lp.z} air destroy`);
                    }
                } catch {}
                system.runTimeout(decayLeaf, 1);
            }
            system.runTimeout(decayLeaf, 5);
        }

        return true;
    }

    // Vein Miner
    if (block?.type?.id?.endsWith("_ore") && player.isSneaking && isUnlocked("vm", player) && gdp("vm", player)) {
        const mainhand = player?.getComponent("equippable")?.getEquipment(EquipmentSlot.Mainhand);
        const enchantable = mainhand?.getComponent("enchantable");
        const hasSilkTouch = !!enchantable?.getEnchantment("silk_touch");
        const fortune = enchantable?.getEnchantment("fortune");
        const fortuneLevel = fortune ? fortune.level : 0;

        const radius = getSetting("vm_radius");
        const delay = getSetting("vm_delay");

        // Collect all matching ores in a cube
        const ores = [];
        for (let dx = -radius; dx <= radius; dx++)
        for (let dy = -radius; dy <= radius; dy++)
        for (let dz = -radius; dz <= radius; dz++) {
            const pos = { x: start.x + dx, y: start.y + dy, z: start.z + dz };
            const b = dim.getBlock(pos);
            if (b && b.typeId.match(block.type.id)) ores.push(pos);
        }

        function breakOre(pos) {
            try { dim.setBlockType(pos, "minecraft:air"); } catch { return; }

            if (hasSilkTouch) {
                dim.spawnItem(new ItemStack(block.type.id, 1), start);
                return;
            }

            const oreId = block.type.id;
            const base = oreId.replace("minecraft:", "").replace("deepslate_", "").replace("_ore", "");
            let dropId;
            let d_count = 1;

            if (base === "iron" || base === "gold") {
                dropId = "minecraft:raw_" + base;
            } else if (base === "copper") {
                dropId = "minecraft:raw_copper";
                d_count = 2 + rng(4);
            } else if (base === "lapis") {
                dropId = "minecraft:lapis_lazuli";
                d_count = 4 + rng(6);
            } else if (base === "nether_gold") {
                dropId = "minecraft:gold_nugget";
                d_count = 2 + rng(5);
            } else if (base === "redstone" || base === "lit_redstone") {
                dropId = "minecraft:redstone";
                d_count = 4 + rng(2);
            } else if (base === "quartz") {
                dropId = "minecraft:quartz";
            } else {
                dropId = "minecraft:" + base;
            }

            if (fortuneLevel > 0 && dropId !== "minecraft:raw_iron" && dropId !== "minecraft:raw_gold" && dropId !== "minecraft:raw_copper") {
                d_count = d_count * (1 + rng(fortuneLevel + 1));
            }

            if (d_count > 250) d_count = 250;
            dim.spawnItem(new ItemStack(dropId, d_count), start);
        }

        if (delay <= 0) {
            for (const pos of ores) breakOre(pos);
        } else {
            let i = 0;
            function chain() {
                if (i >= ores.length) return;
                breakOre(ores[i++]);
                system.runTimeout(chain, delay);
            }
            chain();
        }
        return true;
    }
}, 10);

// ── Auto Replant ────────────────────────────────────────────────────────────

eventBus.after("playerBreakBlock", (ev) => {
    const player = ev.player;
    if (!isUnlocked("autoReplant", player) || !(gdp("autoReplant", player) ?? false)) return;

    const blockId = ev.brokenBlockPermutation.type.id;
    const states  = ev.brokenBlockPermutation.getAllStates();
    const loc     = ev.block.location;

    const CROPS = {
        "minecraft:wheat":     { maxGrowth: 7, seed: "minecraft:wheat_seeds",    place: "minecraft:wheat"    },
        "minecraft:carrots":   { maxGrowth: 7, seed: "minecraft:carrot",         place: "minecraft:carrots"  },
        "minecraft:potatoes":  { maxGrowth: 7, seed: "minecraft:potato",         place: "minecraft:potatoes" },
        "minecraft:beetroot":  { maxGrowth: 3, seed: "minecraft:beetroot_seeds", place: "minecraft:beetroot" },
    };

    const crop = CROPS[blockId];
    if (!crop) return;
    if ((states["growth"] ?? 0) < crop.maxGrowth) return;

    const below = ev.dimension.getBlock({ x: loc.x, y: loc.y - 1, z: loc.z });
    if (!below || below.typeId !== "minecraft:farmland") return;

    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (!item || item.typeId !== crop.seed) continue;
        if (item.amount > 1) { item.amount -= 1; inv.setItem(i, item); }
        else { inv.setItem(i, undefined); }
        ev.dimension.runCommand(`setblock ${loc.x} ${loc.y} ${loc.z} ${crop.place}`);
        break;
    }
}, 5);
