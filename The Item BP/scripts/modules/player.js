import { world, system, EquipmentSlot, ItemStack, Player } from "@minecraft/server"
import { gdp, sdp, t, rng, isAdmin, isOp, loadBans, loadKnownPlayers, saveKnownPlayers } from "../core/utils.js"
import { UNLOCK_MAP, UPGRADE_LABELS, isUnlocked, unlock, createOwnedMenu, isMenuOwnedBy, getBackpackTier, getDamageTier, isTheItem, swapItemTier } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { openMenu } from "../menus/router.js"
import { ActionFormData, MessageFormData } from "@minecraft/server-ui"
import { onUpgradeUnlocked, onMobKilledByPlayer, onPlayerDied, achievementsMenu } from "./achievements.js"
import { recordMobKill } from "./mining.js"

// ── Init new player ─────────────────────────────────────────────────────────

export function initNewPlayer(player) {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return false;
    inv.addItem(createOwnedMenu(player.name));
    sdp("playerJoined", player, true);
    sdp("menuOwner", player, player.name);
    sdp("tpa", player, true);
    sdp("vm", player, false);
    sdp("tc", player, false);
    sdp("magnet", player, false);
    sdp("silkSpawner", player, false);
    sdp("noFall", player, false);
    sdp("backpackEnabled", player, false);
    sdp("backpackHover", player, false);
    sdp("autoReplant", player, false);
    sdp("nightVision", player, false);
    sdp("dynLight", player, false);
    sdp("glowing", player, false);
    sdp("agile", player, false);
    sdp("corpse", player, false);
    sdp("refill", player, false);
    sdp("waila", player, false);
    sdp("entityRadar", player, false);
    sdp("antiVoid", player, false);
    sdp("waterBreathing", player, false);
    sdp("haste", player, false);
    sdp("fireRes", player, false);
    sdp("doubleXp", player, false);
    sdp("regen", player, false);
    sdp("resistance", player, false);
    sdp("strength", player, false);
    sdp("saturation", player, false);
    sdp("doubleJump", player, false);
    sdp("fireballShot", player, false);
    return true;
}

// ── Player Spawn ────────────────────────────────────────────────────────────

eventBus.after("playerSpawn", (ev) => {
    const p = ev.player;
    const initialSpawn = ev.initialSpawn;

    system.runTimeout(() => {
        // Ban check + no new players check
        if (initialSpawn) {
            const bans = loadBans();
            if (bans.includes(p.name)) {
                try { p.dimension.runCommand("kick " + JSON.stringify(p.name) + " Banned from this server"); } catch {}
                return;
            }

            const knownPlayers = loadKnownPlayers();
            const isKnown = knownPlayers.includes(p.name);
            const noNew = world.getDynamicProperty("noNewPlayers") ?? false;

            if (noNew && !isKnown && !p.hasTag("is_admin")) {
                try { p.dimension.runCommand("kick " + JSON.stringify(p.name) + " " + t("fabmod.msg.kicked_new_player")); } catch {}
                return;
            }

            if (!isKnown) {
                knownPlayers.push(p.name);
                saveKnownPlayers(knownPlayers);
            }

            // Max concurrent players check
            const maxEnabled = world.getDynamicProperty("maxPlayersEnabled") ?? false;
            if (maxEnabled && !p.hasTag("is_admin") && !isOp(p)) {
                const maxPlayers = world.getDynamicProperty("maxPlayers") ?? 20;
                if (world.getAllPlayers().length > maxPlayers) {
                    try { p.dimension.runCommand("kick " + JSON.stringify(p.name) + " " + t("fabmod.msg.kicked_server_full")); } catch {}
                    return;
                }
            }

            // Spectator safety net : retour automatique en survie à la connexion
            if (gdp("wasSpectator", p)) {
                sdp("wasSpectator", p, undefined);
                p.runCommand("gamemode survival @s");
                const spawn = world.getDefaultSpawnLocation();
                const spawnYValid = spawn.y >= -64 && spawn.y <= 320;
                let safeY = spawnYValid ? spawn.y : 64;
                if (!spawnYValid) {
                    try {
                        const top = p.dimension.getTopmostBlock({ x: Math.floor(spawn.x), z: Math.floor(spawn.z) });
                        if (top) safeY = top.y + 1;
                    } catch {}
                }
                p.teleport({ x: spawn.x + 0.5, y: safeY, z: spawn.z + 0.5 }, { dimension: world.getDimension("minecraft:overworld") });
                p.sendMessage(t("fabmod.msg.spectator_login_reset"));
            }
        }

        // Migration: old T4 → new T5
        if (getBackpackTier(p) === 4 && isUnlocked("backpackT4", p) && !isUnlocked("backpackT5", p)) {
            unlock("backpackT5", p);
            sdp("backpackTier", p, 5);
        }

        // Migration: swap item to match current damage tier
        const currentTier = getDamageTier(p);
        if (currentTier > 0) swapItemTier(p, currentTier);

        // First join init
        if (gdp("playerJoined", p) === undefined) {
            initNewPlayer(p);
            return;
        }

        // Respawn after death
        if (!initialSpawn) {
            if (!isUnlocked("keepMenu", p)) {
                for (const key of Object.keys(UNLOCK_MAP)) {
                    sdp("unlocked_" + key, p, undefined);
                }
                sdp("damageTier", p, 0);
                p.sendMessage(t("fabmod.msg.upgrades_lost"));
            }

            const inv = p.getComponent("minecraft:inventory")?.container;
            if (inv) {
                for (let i = 0; i < inv.size; i++) {
                    if (isTheItem(inv.getItem(i)?.typeId)) {
                        inv.setItem(i, undefined);
                    }
                }
                inv.addItem(createOwnedMenu(p.name));
                const tier = getDamageTier(p);
                if (tier > 0) swapItemTier(p, tier);
            }
        }
    }, 10);
});

// ── Playtime + Anti-dupe + XP Tracking (every 100 ticks) ────────────────────

eventBus.interval(() => {
    for (const player of world.getPlayers()) {
        // Safety net: init unregistered players
        if (gdp("playerJoined", player) === undefined) {
            initNewPlayer(player);
            continue;
        }

        // Playtime
        const current = gdp("playTimeTicks", player) ?? 0;
        sdp("playTimeTicks", player, current + 100);

        // Anti-dupe fabmod:item
        try {
            const inv = player.getComponent("minecraft:inventory")?.container;
            if (inv) {
                let foundFirst = false;
                for (let i = 0; i < inv.size; i++) {
                    if (isTheItem(inv.getItem(i)?.typeId)) {
                        if (foundFirst) { inv.setItem(i, undefined); }
                        else { foundFirst = true; }
                    }
                }
            }
        } catch {}

        // XP tracking + Double XP
        try {
            const currentXp = player.getTotalXp();
            const lastXp = gdp("stat_lastXp", player) ?? 0;
            if (currentXp > lastXp) {
                const gain = currentXp - lastXp;
                sdp("stat_totalXpGained", player, (gdp("stat_totalXpGained", player) ?? 0) + gain);
                if (isUnlocked("doubleXp", player) && (gdp("doubleXp", player) ?? false)) {
                    player.runCommand(`xp ${gain} @s`);
                    sdp("stat_lastXp", player, currentXp + gain);
                } else {
                    sdp("stat_lastXp", player, currentXp);
                }
            } else {
                sdp("stat_lastXp", player, currentXp);
            }
        } catch {}
    }
}, 100);

// ── Stats Tracking ──────────────────────────────────────────────────────────

// Mob kills + player deaths
eventBus.after("entityDie", (ev) => {
    const source = ev.damageSource;
    if (source?.damagingEntity instanceof Player) {
        const killer = source.damagingEntity;
        if (!(ev.deadEntity instanceof Player)) {
            const newKills = (gdp("stat_mobsKilled", killer) ?? 0) + 1;
            sdp("stat_mobsKilled", killer, newKills);
            onMobKilledByPlayer(killer, newKills, ev.deadEntity.typeId);
            recordMobKill(killer, ev.deadEntity.typeId);
        }
    }
    if (ev.deadEntity instanceof Player) {
        const dead = ev.deadEntity;
        sdp("lastDeathLoc", dead, JSON.stringify(dead.location));
        sdp("lastDeathDim", dead, dead.dimension.id);
        const newDeaths = (gdp("stat_deaths", dead) ?? 0) + 1;
        sdp("stat_deaths", dead, newDeaths);
        onPlayerDied(dead, newDeaths);
    }
}, 0);

// Blocks mined + ore tracking
eventBus.after("playerBreakBlock", (ev) => {
    const player = ev.player;
    sdp("stat_blocksMined", player, (gdp("stat_blocksMined", player) ?? 0) + 1);

    const blockId = ev.brokenBlockPermutation.type.id;
    if (!blockId.includes("_ore") && blockId !== "minecraft:ancient_debris") return;

    const mainhand = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    const enchantable = mainhand?.getComponent("enchantable");
    if (enchantable?.getEnchantment("silk_touch")) return;

    const oreMap = {
        coal: ["minecraft:coal_ore", "minecraft:deepslate_coal_ore"],
        copper: ["minecraft:copper_ore", "minecraft:deepslate_copper_ore"],
        iron: ["minecraft:iron_ore", "minecraft:deepslate_iron_ore"],
        gold: ["minecraft:gold_ore", "minecraft:deepslate_gold_ore", "minecraft:nether_gold_ore"],
        lapis: ["minecraft:lapis_ore", "minecraft:deepslate_lapis_ore"],
        redstone: ["minecraft:redstone_ore", "minecraft:deepslate_redstone_ore", "minecraft:lit_redstone_ore", "minecraft:lit_deepslate_redstone_ore"],
        emerald: ["minecraft:emerald_ore", "minecraft:deepslate_emerald_ore"],
        diamond: ["minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"],
        quartz: ["minecraft:nether_quartz_ore"],
        debris: ["minecraft:ancient_debris"]
    };

    for (const [ore, ids] of Object.entries(oreMap)) {
        if (!ids.includes(blockId)) continue;
        sdp("stat_ore_" + ore, player, (gdp("stat_ore_" + ore, player) ?? 0) + 1);
        if (ore === "diamond") {
            const fortune = enchantable?.getEnchantment("fortune");
            const fortuneLevel = fortune ? fortune.level : 0;
            const drops = 1 + rng(fortuneLevel + 1);
            sdp("stat_diamond_approx", player, (gdp("stat_diamond_approx", player) ?? 0) + drops);
        }
        break;
    }
}, 0);

// Blocks placed
eventBus.after("playerPlaceBlock", (ev) => {
    sdp("stat_blocksPlaced", ev.player, (gdp("stat_blocksPlaced", ev.player) ?? 0) + 1);
}, 0);

// ── Auto Refill ─────────────────────────────────────────────────────────────

eventBus.after("playerPlaceBlock", (ev) => {
    const player = ev.player;
    if (!isUnlocked("refill", player)) return;
    if (!(gdp("refill", player) ?? false)) return;

    try {
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (!inv) return;
        const slot = player.selectedSlotIndex;
        const current = inv.getItem(slot);
        if (current) return;

        const placedType = ev.block.typeId;

        for (let i = 9; i < inv.size; i++) {
            const item = inv.getItem(i);
            if (item && item.typeId === placedType) { inv.moveItem(i, slot, inv); return; }
        }
        for (let i = 0; i < 9; i++) {
            if (i === slot) continue;
            const item = inv.getItem(i);
            if (item && item.typeId === placedType) { inv.moveItem(i, slot, inv); return; }
        }
    } catch (e) {}
}, 5);

// ── Item Use (menu, upgrades) ───────────────────────────────────────────────

eventBus.after("itemUse", (ev) => {
    const player = ev.source;
    const usedItemId = ev.itemStack.typeId;

    // Direct upgrade application
    if (usedItemId.startsWith("fabmod:upgrade_")) {
        const featureKey = Object.keys(UNLOCK_MAP).find(k => UNLOCK_MAP[k] === usedItemId);
        if (!featureKey) return;

        if (isUnlocked(featureKey, player)) {
            const label = UPGRADE_LABELS[featureKey] ?? featureKey;
            player.sendMessage(t("fabmod.msg.already_unlocked", label));
            return;
        }

        if (featureKey === "backpackT2" && getBackpackTier(player) < 1) { player.sendMessage(t("fabmod.msg.need_backpack_base")); return; }
        if (featureKey === "backpackT3" && getBackpackTier(player) < 2) { player.sendMessage(t("fabmod.msg.need_backpack_t2")); return; }
        if (featureKey === "backpackT4" && getBackpackTier(player) < 3) { player.sendMessage(t("fabmod.msg.need_backpack_t3")); return; }
        if (featureKey === "backpackT5" && getBackpackTier(player) < 4) { player.sendMessage(t("fabmod.msg.need_backpack_t4")); return; }
        if (featureKey === "damageT2" && getDamageTier(player) < 1) { player.sendMessage(t("fabmod.msg.need_damage_prev")); return; }
        if (featureKey === "damageT3" && getDamageTier(player) < 2) { player.sendMessage(t("fabmod.msg.need_damage_prev")); return; }
        if (featureKey === "damageT4" && getDamageTier(player) < 3) { player.sendMessage(t("fabmod.msg.need_damage_prev")); return; }
        if (featureKey === "damageT5" && getDamageTier(player) < 4) { player.sendMessage(t("fabmod.msg.need_damage_prev")); return; }
        if (featureKey.startsWith("cb_") && getDamageTier(player) < 1) { player.sendMessage(t("fabmod.msg.need_damage_base")); return; }

        const eq = player.getComponent("minecraft:equippable");
        for (const slot of [EquipmentSlot.Mainhand, EquipmentSlot.Offhand]) {
            const handItem = eq?.getEquipment(slot);
            if (handItem && handItem.typeId === usedItemId) {
                if (handItem.amount > 1) { handItem.amount -= 1; eq.setEquipment(slot, handItem); }
                else { eq.setEquipment(slot, undefined); }
                break;
            }
        }

        unlock(featureKey, player);
        onUpgradeUnlocked(player, featureKey);
        if (featureKey === "backpackT2") sdp("backpackTier", player, Math.max(getBackpackTier(player), 2));
        if (featureKey === "backpackT3") sdp("backpackTier", player, Math.max(getBackpackTier(player), 3));
        if (featureKey === "backpackT4") sdp("backpackTier", player, Math.max(getBackpackTier(player), 4));
        if (featureKey === "backpackT5") sdp("backpackTier", player, Math.max(getBackpackTier(player), 5));
        if (featureKey === "damageT1") { sdp("damageTier", player, Math.max(getDamageTier(player), 1)); swapItemTier(player, Math.max(getDamageTier(player), 1)); }
        if (featureKey === "damageT2") { sdp("damageTier", player, Math.max(getDamageTier(player), 2)); swapItemTier(player, Math.max(getDamageTier(player), 2)); }
        if (featureKey === "damageT3") { sdp("damageTier", player, Math.max(getDamageTier(player), 3)); swapItemTier(player, Math.max(getDamageTier(player), 3)); }
        if (featureKey === "damageT4") { sdp("damageTier", player, Math.max(getDamageTier(player), 4)); swapItemTier(player, Math.max(getDamageTier(player), 4)); }
        if (featureKey === "damageT5") { sdp("damageTier", player, Math.max(getDamageTier(player), 5)); swapItemTier(player, Math.max(getDamageTier(player), 5)); }
        const label = UPGRADE_LABELS[featureKey] ?? featureKey;
        player.sendMessage(t("fabmod.msg.unlocked", label));
        player.playSound("random.levelup");
        return true;
    }

if (isTheItem(usedItemId)) {
        if (!isMenuOwnedBy(player)) {
            player.sendMessage(t("fabmod.msg.menu_not_yours"));
            return;
        }

        if (player.isSneaking) {
            if (!isUnlocked("backpackEnabled", player)) {
                player.sendMessage(t("fabmod.msg.locked_backpack"));
                return;
            }
        } else {
            if (isAdmin(player)) openMenu("admin", player);
            else openMenu("command", player);
        }
        return true;
    }
});

// ── Inventory Sort ──────────────────────────────────────────────────────────

function getItemCategory(typeId) {
    const id = typeId.split(":")[1] ?? typeId;
    if (/_helmet|_chestplate|_leggings|_boots/.test(id))                          return 0;
    if (/_sword|_axe|_pickaxe|_shovel|_hoe|bow$|crossbow|trident|shield/.test(id)) return 1;
    if (/apple|bread|carrot|potato|beef|pork|chicken|cod|salmon|cake|cookie|stew|soup|honey|melon_slice|pumpkin_pie|rabbit_stew|mushroom/.test(id)) return 2;
    if (/_log|_wood|_planks|_slab|_stairs|_fence|_door|_trapdoor|_button|_pressure_plate|_wall/.test(id)) return 3;
    if (/stone|cobble|brick|sand|gravel|dirt|grass|clay|concrete|terracotta|glass|wool|_leaves/.test(id)) return 4;
    if (/_ore|_block$|emerald_block|diamond_block|gold_block|iron_block|netherite_block/.test(id)) return 5;
    if (/ingot|nugget|diamond$|emerald$|quartz$|crystal|dust|shard|pearl|_rod|feather|string|leather$/.test(id)) return 6;
    return 7;
}

export function inventorySort(player) {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return 0;

    const mode = gdp("sortMode", player) ?? "family";
    const items = [];
    for (let i = 9; i < 36; i++) {
        const item = inv.getItem(i);
        if (item) items.push(item);
    }

    if (mode === "family") {
        items.sort((a, b) => {
            const ca = getItemCategory(a.typeId), cb = getItemCategory(b.typeId);
            if (ca !== cb) return ca - cb;
            return a.typeId.localeCompare(b.typeId);
        });
    } else {
        items.sort((a, b) => a.typeId.localeCompare(b.typeId));
    }

    for (let i = 9; i < 36; i++) inv.setItem(i, undefined);
    for (let i = 0; i < items.length; i++) inv.setItem(9 + i, items[i]);

    return items.length;
}

// ── Stats Menus ─────────────────────────────────────────────────────────────

export function statsMenu(player) {
    const form = new ActionFormData();
    form.title("§7My Stats");
    form.button("§e§oGeneral");
    form.button("§b§oOres Mined");
    form.button({ rawtext: [{ translate: "fabmod.stats.btn.achievements" }] });
    form.button("§7§o← Back");

    form.show(player).then(res => {
        if (res.canceled || res.selection === 3) { openMenu("command", player); return; }
        if (res.selection === 0) statsGeneral(player);
        if (res.selection === 1) statsOres(player);
        if (res.selection === 2) achievementsMenu(player);
    });
}

function statsGeneral(player) {
    const ticks = gdp("playTimeTicks", player) ?? 0;
    const totalSeconds = Math.floor(ticks / 20);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const body =
        `§ePlay Time §f: ${hours}h ${minutes}m ${seconds}s\n\n` +
        `§eMobs Killed §f: ${gdp("stat_mobsKilled", player) ?? 0}\n\n` +
        `§eDeaths §f: ${gdp("stat_deaths", player) ?? 0}\n\n` +
        `§eBlocks Mined §f: ${gdp("stat_blocksMined", player) ?? 0}\n\n` +
        `§eBlocks Placed §f: ${gdp("stat_blocksPlaced", player) ?? 0}\n\n` +
        `§eTotal XP Gained §f: ${gdp("stat_totalXpGained", player) ?? 0}`;

    new MessageFormData()
        .title("§eGeneral Stats")
        .body(body)
        .button1("§o Close")
        .button2("§o← Back")
        .show(player).then(res => {
            if (res.selection === 1) statsMenu(player);
        });
}

function statsOres(player) {
    const o = (key) => gdp("stat_ore_" + key, player) ?? 0;

    const body =
        `§7Silk Touch ores are not counted.\n\n` +
        `§6Coal §f: ${o("coal")}\n\n` +
        `§6Copper §f: ${o("copper")}\n\n` +
        `§fIron §f: ${o("iron")}\n\n` +
        `§eGold §f: ${o("gold")}\n\n` +
        `§9Lapis §f: ${o("lapis")}\n\n` +
        `§cRedstone §f: ${o("redstone")}\n\n` +
        `§aEmerald §f: ${o("emerald")}\n\n` +
        `§bDiamond Ore §f: ${o("diamond")}\n` +
        `§b  Diamonds §f: ≈ ${gdp("stat_diamond_approx", player) ?? 0} §7(approx.)\n\n` +
        `§dQuartz §f: ${o("quartz")}\n\n` +
        `§4Ancient Debris §f: ${o("debris")}`;

    new MessageFormData()
        .title("§bOres Mined")
        .body(body)
        .button1("§o Close")
        .button2("§o← Back")
        .show(player).then(res => {
            if (res.selection === 1) statsMenu(player);
        });
}
