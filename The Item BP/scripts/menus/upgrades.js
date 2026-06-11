import { gdp, sdp, t, isAdmin, prettyName } from "../core/utils.js"
import { UNLOCK_MAP, UPGRADE_LABELS, RECIPE_MAP, UPGRADE_DESCRIPTIONS, UPGRADE_PREREQ, isUnlocked, unlock, getBackpackTier, getDamageTier, swapItemTier } from "../core/data.js"
import { registerMenu, openMenu } from "./router.js"
import { ActionFormData, MessageFormData } from "@minecraft/server-ui"

// Upgrades auto-activated on unlock (all toggleable features)
const AUTO_ACTIVATE = new Set([
    "nightVision", "dynLight", "glowing", "noFall", "agile",
    "corpse", "magnet", "refill", "waila", "silkSpawner",
    "tc", "vm", "autoReplant", "antiVoid", "waterBreathing",
    "haste", "fireRes", "doubleXp", "regen", "resistance",
    "strength", "saturation", "doubleJump", "entityRadar", "itemName",
    "cb_sharpness", "cb_smite", "cb_knockback", "cb_fireAspect", "cb_lifeSteal", "cb_sweeping",
]);

// ── Recipe display helpers ───────────────────────────────────────────────────

// Clés Bedrock non-standard : blocs (tile.) et items avec format camelCase/spécial
const RECIPE_ITEM_KEYS = {
    // Blocs (tile.)
    "minecraft:glass":                          "tile.glass.name",
    "minecraft:torch":                          "tile.torch.name",
    "minecraft:dropper":                        "tile.dropper.name",
    "minecraft:hopper":                         "tile.hopper.name",
    "minecraft:sculk":                          "tile.sculk.name",
    "minecraft:slime":                          "tile.slime.name",
    "minecraft:redstone_block":                 "tile.redstone_block.name",
    "minecraft:emerald_block":                  "tile.emerald_block.name",
    "minecraft:cobblestone":                    "tile.cobblestone.name",
    "minecraft:chest":                          "tile.chest.name",
    "minecraft:netherrack":                     "tile.netherrack.name",
    "minecraft:end_stone":                      "tile.end_stone.name",
    "minecraft:undyed_shulker_box":             "tile.undyed_shulker_box.name",
    "minecraft:sponge":                         "tile.sponge.name",
    "minecraft:conduit":                        "tile.conduit.name",
    "minecraft:packed_ice":                     "tile.packed_ice.name",
    "minecraft:blue_ice":                       "tile.blue_ice.name",
    "minecraft:enchanting_table":               "tile.enchanting_table.name",
    "minecraft:lapis_block":                    "tile.lapis_block.name",
    "minecraft:piston":                         "tile.piston.name",
    "minecraft:netherite_block":                "tile.netherite_block.name",
    "minecraft:cake":                           "tile.cake.name",
    "minecraft:oak_log":                        "tile.log.oak.name",
    "minecraft:white_wool":                     "tile.wool.white.name",
    "minecraft:tnt":                             "tile.tnt.name",
    "minecraft:shulker_box":                     "tile.shulker_box.name",
    "minecraft:wither_skeleton_skull":          "tile.skull.wither.name",
    "minecraft:soul_sand":                      "tile.soul_sand.name",
    "minecraft:obsidian":                       "tile.obsidian.name",
    "minecraft:stone":                          "tile.stone.name",
    "minecraft:glowstone":                      "tile.glowstone.name",
    "minecraft:cobbled_deepslate":              "tile.cobbled_deepslate.name",
    "minecraft:bookshelf":                      "tile.bookshelf.name",
    "minecraft:diamond_block":                  "tile.diamond_block.name",
    "minecraft:ender_chest":                    "tile.ender_chest.name",
    "minecraft:beacon":                         "tile.beacon.name",
    "minecraft:comparator":                     "tile.comparator.name",
    // Items
    "minecraft:rotten_flesh":                   "item.rottenFlesh.name",
    "minecraft:heart_of_the_sea":               "item.heartOfTheSea.name",
    "minecraft:enchanted_golden_apple":         "item.appleEnchanted.name",
    "minecraft:golden_apple":                   "item.apple.golden.name",
    "minecraft:totem_of_undying":               "item.totem.name",
    "minecraft:milk_bucket":                    "item.bucket.milk.name",
    "minecraft:lava_bucket":                    "item.bucket.lava.name",
    "minecraft:wheat_seeds":                    "item.seeds.name",
    "minecraft:glistering_melon_slice":         "item.speckled_melon.name",
    // Potions (IDs fictifs pour affichage — data values gérés dans les JSON de recette)
    "minecraft:potion_swiftness":               "item.potion.swiftness.name",
    "minecraft:potion_leaping":                 "item.potion.jump.name",
    "minecraft:potion_slow_falling":            "item.potion.slow_falling.name",
    "minecraft:potion_fire_resistance":         "item.potion.fire_resistance.name",
    "minecraft:potion_water_breathing":         "item.potion.water_breathing.name",
    "minecraft:potion_strength":                "item.potion.strength.name",
};

function recipeItemLangKey(typeId) {
    if (typeId in RECIPE_ITEM_KEYS) return RECIPE_ITEM_KEYS[typeId];
    const [ns, id] = typeId.split(":");
    if (ns === "minecraft") return `item.${id}.name`;
    return `item.${typeId}.name`;
}

// Texte pour les boutons (ActionFormData ne supporte pas rawtext)
function recipeButtonText(items) {
    return (items ?? []).map(([typeId, count]) => {
        const name = prettyName(typeId);
        return count > 1 ? `${name} x${count}` : name;
    }).join(" + ");
}

// Rawtext pour le chat avec traduction native Bedrock
function recipeRawtextParts(items) {
    const parts = [{ text: "§f" }];
    for (let i = 0; i < (items ?? []).length; i++) {
        if (i > 0) parts.push({ text: " §7+ §f" });
        const [typeId, count] = items[i];
        parts.push({ translate: recipeItemLangKey(typeId) });
        if (count > 1) parts.push({ text: ` x${count}` });
    }
    return parts;
}

// ── Apply Upgrade Menu ──────────────────────────────────────────────────────

function applyUpgradeMenu(player) {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) { player.sendMessage(t("fabmod.msg.inv_error")); return; }
    const op = isAdmin(player);

    const found = [];
    const foundKeys = new Set();
    for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (!item) continue;
        for (const [featureKey, itemId] of Object.entries(UNLOCK_MAP)) {
            if (item.typeId === itemId) {
                found.push({ slot: i, featureKey, itemId, free: false });
                foundKeys.add(featureKey);
                break;
            }
        }
    }

    if (op) {
        for (const [featureKey, itemId] of Object.entries(UNLOCK_MAP)) {
            if (!foundKeys.has(featureKey)) {
                found.push({ slot: -1, featureKey, itemId, free: true });
            }
        }
    }

    if (found.length === 0) {
        recipesMenu(player, "command");
        return;
    }

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.apply_upgrade"));
    for (const entry of found) {
        const alreadyUnlocked = isUnlocked(entry.featureKey, player);
        const label = UPGRADE_LABELS[entry.featureKey] ?? entry.featureKey;
        const recipe = recipeButtonText(RECIPE_MAP[entry.featureKey]);
        if (alreadyUnlocked) {
            form.button(`§7§o${label} §a§o✓\n§o${recipe}`);
        } else if (entry.free) {
            form.button(`§d§o${label} §5§o[FREE]\n§7§o${recipe}`);
        } else {
            form.button(`§e§o${label}\n§7§o${recipe}`);
        }
    }
    form.button(t("fabmod.ui.btn.upgrade_recipes"));
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === found.length) { recipesMenu(player); return; }
        if (res.selection === found.length + 1) { openMenu("command", player); return; }

        const chosen = found[res.selection];
        if (isUnlocked(chosen.featureKey, player)) {
            player.sendMessage(t("fabmod.msg.already_unlocked_menu"));
            applyUpgradeMenu(player);
            return;
        }

        if (chosen.featureKey === "backpackT2" && getBackpackTier(player) < 1) { player.sendMessage(t("fabmod.msg.need_backpack_base")); return; }
        if (chosen.featureKey === "backpackT3" && getBackpackTier(player) < 2) { player.sendMessage(t("fabmod.msg.need_backpack_t2")); return; }
        if (chosen.featureKey === "backpackT4" && getBackpackTier(player) < 3) { player.sendMessage(t("fabmod.msg.need_backpack_t3")); return; }
        if (chosen.featureKey === "backpackT5" && getBackpackTier(player) < 4) { player.sendMessage(t("fabmod.msg.need_backpack_t4")); return; }

        if (chosen.free) {
            const label = UPGRADE_LABELS[chosen.featureKey] ?? chosen.featureKey;
            const confirm = new MessageFormData();
            confirm.title(t("fabmod.ui.title.free_unlock"));
            confirm.body(t("fabmod.ui.body.cheat_confirm"));
            confirm.button1(t("fabmod.ui.btn.yes"));
            confirm.button2(t("fabmod.ui.btn.no"));
            confirm.show(player).then(cRes => {
                if (cRes.canceled || cRes.selection === 1) { applyUpgradeMenu(player); return; }
                unlock(chosen.featureKey, player);
                if (AUTO_ACTIVATE.has(chosen.featureKey)) sdp(chosen.featureKey, player, true);
                if (chosen.featureKey === "backpackT2") sdp("backpackTier", player, Math.max(getBackpackTier(player), 2));
                if (chosen.featureKey === "backpackT3") sdp("backpackTier", player, Math.max(getBackpackTier(player), 3));
                if (chosen.featureKey === "backpackT4") sdp("backpackTier", player, Math.max(getBackpackTier(player), 4));
                if (chosen.featureKey === "backpackT5") sdp("backpackTier", player, Math.max(getBackpackTier(player), 5));
                if (chosen.featureKey === "damageT1") { sdp("damageTier", player, Math.max(getDamageTier(player), 1)); swapItemTier(player, Math.max(getDamageTier(player), 1)); }
                if (chosen.featureKey === "damageT2") { sdp("damageTier", player, Math.max(getDamageTier(player), 2)); swapItemTier(player, Math.max(getDamageTier(player), 2)); }
                if (chosen.featureKey === "damageT3") { sdp("damageTier", player, Math.max(getDamageTier(player), 3)); swapItemTier(player, Math.max(getDamageTier(player), 3)); }
                if (chosen.featureKey === "damageT4") { sdp("damageTier", player, Math.max(getDamageTier(player), 4)); swapItemTier(player, Math.max(getDamageTier(player), 4)); }
                if (chosen.featureKey === "damageT5") { sdp("damageTier", player, Math.max(getDamageTier(player), 5)); swapItemTier(player, Math.max(getDamageTier(player), 5)); }
                player.sendMessage(t("fabmod.msg.unlocked", label));
                player.playSound("random.levelup");
            });
            return;
        }

        const slotItem = inv.getItem(chosen.slot);
        if (!slotItem || slotItem.typeId !== chosen.itemId) {
            player.sendMessage(t("fabmod.msg.item_not_found"));
            return;
        }
        if (slotItem.amount > 1) {
            slotItem.amount -= 1;
            inv.setItem(chosen.slot, slotItem);
        } else {
            inv.setItem(chosen.slot, undefined);
        }

        unlock(chosen.featureKey, player);
        if (chosen.featureKey.startsWith("cb_")) sdp(chosen.featureKey, player, true);
        if (chosen.featureKey === "backpackT2") sdp("backpackTier", player, Math.max(getBackpackTier(player), 2));
        if (chosen.featureKey === "backpackT3") sdp("backpackTier", player, Math.max(getBackpackTier(player), 3));
        if (chosen.featureKey === "backpackT4") sdp("backpackTier", player, Math.max(getBackpackTier(player), 4));
        if (chosen.featureKey === "backpackT5") sdp("backpackTier", player, Math.max(getBackpackTier(player), 5));
        if (chosen.featureKey === "damageT1") { sdp("damageTier", player, Math.max(getDamageTier(player), 1)); swapItemTier(player, Math.max(getDamageTier(player), 1)); }
        if (chosen.featureKey === "damageT2") { sdp("damageTier", player, Math.max(getDamageTier(player), 2)); swapItemTier(player, Math.max(getDamageTier(player), 2)); }
        if (chosen.featureKey === "damageT3") { sdp("damageTier", player, Math.max(getDamageTier(player), 3)); swapItemTier(player, Math.max(getDamageTier(player), 3)); }
        if (chosen.featureKey === "damageT4") { sdp("damageTier", player, Math.max(getDamageTier(player), 4)); swapItemTier(player, Math.max(getDamageTier(player), 4)); }
        if (chosen.featureKey === "damageT5") { sdp("damageTier", player, Math.max(getDamageTier(player), 5)); swapItemTier(player, Math.max(getDamageTier(player), 5)); }
        const label = UPGRADE_LABELS[chosen.featureKey] ?? chosen.featureKey;
        player.sendMessage(t("fabmod.msg.unlocked", label));
        player.playSound("random.levelup");
    });
}

// ── Recipes Menu ────────────────────────────────────────────────────────────

function recipesMenu(player, backTo = "apply") {
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.upgrade_recipes"));
    const keys = Object.keys(UPGRADE_LABELS);
    for (const key of keys) {
        const label = UPGRADE_LABELS[key];
        const recipe = recipeButtonText(RECIPE_MAP[key]);
        const unlocked = isUnlocked(key, player);
        form.button(`${unlocked ? "§a§o" : "§e§o"}${label}${unlocked ? " §7§o✓" : ""}\n§7§o${recipe}`);
    }
    form.button(t("fabmod.ui.btn.back"));
    form.show(player).then(res => {
        if (res.canceled || res.selection === keys.length) {
            if (backTo === "command") openMenu("command", player);
            else applyUpgradeMenu(player);
            return;
        }
        if (res.selection < keys.length) {
            const key = keys[res.selection];
            const label = UPGRADE_LABELS[key];
            const unlocked = isUnlocked(key, player);
            const BR = "§8════════════════════";
            const rawMsg = { rawtext: [
                { text: "§6" },
                { translate: `item.${UNLOCK_MAP[key]}.name` },
                { text: `${unlocked ? " §a✓" : ""}\n${BR}\n§7📋 ` },
                { translate: "fabmod.upgrade.recipe" },
                { text: " " },
                ...recipeRawtextParts(RECIPE_MAP[key]),
                { text: `\n§7ℹ ` },
                { translate: UPGRADE_DESCRIPTIONS[key] ?? "" },
            ]};
            if (UPGRADE_PREREQ[key]) {
                const prereqLabel = UPGRADE_LABELS[UPGRADE_PREREQ[key]] ?? UPGRADE_PREREQ[key];
                rawMsg.rawtext.push({ text: "\n" });
                rawMsg.rawtext.push({ translate: "fabmod.upgrade.prereq", with: [prereqLabel] });
            }
            rawMsg.rawtext.push({ text: `\n${BR}` });
            player.sendMessage(rawMsg);
            recipesMenu(player, backTo);
        }
    });
}

registerMenu("upgrades", applyUpgradeMenu);
registerMenu("recipes", recipesMenu);
