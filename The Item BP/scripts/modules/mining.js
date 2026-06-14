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
    "minecraft:overworld": { x: 100000, y: -58, z: 0 },
    "minecraft:nether":    { x: 100000, y:  20, z: 0 },
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

// Noms de zones temporaires uniques par opération. Le chunk de stockage n'est
// chargé QUE le temps d'un clone, jamais en permanence → 0 slot de ticking area
// consommé au repos. Plusieurs opérations simultanées posent chacune leur zone
// et retirent la leur : le chunk reste chargé tant qu'au moins une est en cours.
let storageAreaSeq = 0;
function nextStorageArea() { return `sks${(storageAreaSeq++) % 100000}`; }

// Pose une zone de tick temporaire sur le chunk de stockage puis RETENTE
// `attempt(dim)` toutes les 5 ticks jusqu'à ce qu'il renvoie true. Le clone
// lui-même sert de test de disponibilité : un chunk « lisible » via getBlock
// n'est pas toujours prêt à recevoir un clone (chargement asynchrone). La zone
// est retirée dès que l'opération réussit. Garde-fou : abandon après ~60 s →
// onFail(). Même logique que cleanupWhenLoaded dans workstation.js.
function withStorageLoaded(dimId, pos, attempt, onFail) {
    const dim  = world.getDimension(dimId);
    const area = nextStorageArea();
    // « true » = preload : force le chargement immédiat. Indispensable ici car le
    // chunk de stockage (X=100000) est très loin du joueur et jamais généré — sans
    // ce flag la zone est enregistrée mais le chunk reste déchargé (getBlock échoue).
    try { dim.runCommand(`tickingarea add ${pos.x} ${pos.y} ${pos.z} ${pos.x} ${pos.y} ${pos.z} ${area} true`); } catch {}

    let attempts = 0;
    const MAX = 240; // 240 × 5 ticks = 1200 ticks ≈ 60 s

    const finish = () => { try { dim.runCommand(`tickingarea remove ${area}`); } catch {} };

    const step = () => {
        attempts++;
        // Le chunk doit d'abord être lisible, puis l'opération doit réussir.
        let ready = false;
        try { ready = !!dim.getBlock(pos); } catch { ready = false; }
        if (ready) {
            let ok = false;
            try { ok = attempt(dim) === true; } catch {}
            if (ok) { finish(); return; }
        }

        if (attempts >= MAX) { finish(); try { onFail?.(); } catch {} return; }
        system.runTimeout(step, 5);
    };

    system.runTimeout(step, 5);
}

// ── Récupération : beforeEvents.playerBreakBlock ──────────────────────────────

// Récupérations en cours (par joueur) : tant qu'une l'est, les re-cassages du même
// spawner (le break se redéclenche en boucle car on annule) sont ignorés — sinon on
// empilerait plusieurs menus/clones en parallèle.
const pickupInProgress = new Set();

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.block.typeId !== spawnerID) return;
    const player = ev.player;
    const mainhand = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    if (!mainhand?.getComponent("enchantable")?.getEnchantment("silk_touch")) return;
    if (!isUnlocked("silkSpawner", player)) return;
    if (!(gdp("silkSpawner", player) ?? false)) return;
    if (!STORAGE_CONF[player.dimension.id]) return; // The End ou autre → ignoré

    ev.cancel = true;
    if (pickupInProgress.has(player.id)) return; // déjà une récupération en cours
    pickupInProgress.add(player.id);

    const loc = { ...ev.block.location };
    const dim = player.dimension;
    const dimId = dim.id;
    // Sécurité : libère le verrou même si rien n'aboutit (joueur qui abandonne).
    system.runTimeout(() => pickupInProgress.delete(player.id), 1200);
    system.run(() => processPickup(player, loc, dim, dimId));
});

function processPickup(player, loc, dim, dimId) {
    const finish = () => pickupInProgress.delete(player.id);

    // Détection automatique → pas de menu
    if (dimId === "minecraft:nether") {
        doPickup(player, loc, dimId, SPAWNER_MOBS.find(m => m.egg === "minecraft:blaze_spawn_egg"), finish);
        return;
    }
    if (hasBlockNearby(dim, loc, 12, ["minecraft:end_portal_frame"])) {
        doPickup(player, loc, dimId, SPAWNER_MOBS.find(m => m.egg === "minecraft:silverfish_spawn_egg"), finish);
        return;
    }
    if (hasBlockNearby(dim, loc, 5, ["minecraft:web", "minecraft:cobweb"])) {
        doPickup(player, loc, dimId, SPAWNER_MOBS.find(m => m.egg === "minecraft:cave_spider_spawn_egg"), finish);
        return;
    }

    // Menu réduit pour les donjons / contexte inconnu
    const recentEgg = getMostLikelyEgg(player.id);
    const isDungeon = hasBlockNearby(dim, loc, 5, ["minecraft:mossy_cobblestone"]);
    const mobList = isDungeon ? SPAWNER_MOBS_DUNGEON : SPAWNER_MOBS_OVERWORLD;
    const defaultIdx = recentEgg ? Math.max(0, mobList.findIndex(m => m.egg === recentEgg)) : 0;

    showSpawnerForm(player, mobList, defaultIdx, loc, dimId, finish, 0);
}

// En Survie, le joueur maintient le clic de minage → il est « occupé » et
// ModalFormData.show() reste EN ATTENTE indéfiniment (la promesse ne résout pas).
// On ne peut donc pas se fier au résultat du show précédent : on relance un NOUVEAU
// show toutes les 20 ticks tant que le joueur n'a pas répondu. Dès qu'il relâche,
// l'un des show s'affiche, il répond → state.done coupe les relances suivantes.
function showSpawnerForm(player, mobList, defaultIdx, loc, dimId, finish, tries, state) {
    state = state ?? { done: false };
    if (state.done) return;
    if (tries > 60) { state.done = true; finish(); player.sendMessage("§7Relâche le minage puis recommence pour choisir le mob."); return; }

    // Relance armée AVANT le show : si show() lève une exception synchrone, la
    // boucle continue quand même (sinon tout s'arrête silencieusement).
    system.runTimeout(() => { if (!state.done) showSpawnerForm(player, mobList, defaultIdx, loc, dimId, finish, tries + 1, state); }, 20);

    try {
        const form = new ModalFormData()
            .title("Spawner — Type de mob")
            .dropdown("Quel mob était dans ce spawner ?", mobList.map(m => m.name), { defaultValueIndex: defaultIdx });

        form.show(player).then(res => {
            if (state.done) return;
            if (res.canceled && res.cancelationReason === "UserBusy") return; // occupé → la relance réessaiera
            state.done = true;
            if (res.canceled) { finish(); player.sendMessage("§7Annulé — le spawner reste en place."); return; }
            doPickup(player, loc, dimId, mobList[res.formValues[0]], finish);
        }).catch(() => {});
    } catch {}
}

function doPickup(player, loc, dimId, mobEntry, finish) {
    const slot = allocateSlot();
    const sPos = storagePos(dimId, slot);

    withStorageLoaded(dimId, sPos, (dim) => {
        // clone … move : déplace le spawner (avec son mob) du monde vers le stockage.
        // Tant que le chunk de stockage n'est pas prêt, successCount = 0 → on retente
        // (rien n'est déplacé, le spawner d'origine reste intact).
        let r;
        try { r = dim.runCommand(`clone ${loc.x} ${loc.y} ${loc.z} ${loc.x} ${loc.y} ${loc.z} ${sPos.x} ${sPos.y} ${sPos.z} replace move`); } catch { return false; }
        if (!(r?.successCount > 0)) return false;

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
        finish();
        return true;
    }, () => {
        // Le clone n'a jamais abouti (chunk jamais prêt) : le spawner d'origine est
        // INTACT (break annulé), on n'y touche pas — on libère juste le slot réservé.
        freeSlot(slot);
        finish();
        player.sendMessage("§cZone de stockage indisponible — spawner laissé en place, réessaie.");
    });
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
        const sPos = storagePos(storedDimId, slot);
        withStorageLoaded(storedDimId, sPos, (dim) => {
            // clone … move : déplace le spawner du stockage vers le monde. Tant que
            // le chunk de stockage n'est pas prêt, successCount = 0 → on retente
            // (le spawner stocké reste en place, l'item du joueur n'est pas consommé).
            let r;
            try { r = dim.runCommand(`clone ${sPos.x} ${sPos.y} ${sPos.z} ${sPos.x} ${sPos.y} ${sPos.z} ${targetLoc.x} ${targetLoc.y} ${targetLoc.z} replace move`); } catch { return false; }
            if (!(r?.successCount > 0)) return false;

            // Libérer le slot
            freeSlot(slot);

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
            return true;
        }, () => {
            player.sendMessage("§cZone de stockage indisponible — réessaie dans quelques secondes.");
        });
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
