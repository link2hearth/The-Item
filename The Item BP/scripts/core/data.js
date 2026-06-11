import { ItemStack } from "@minecraft/server"
import { gdp, sdp } from "./utils.js"

// ── Upgrade System ──────────────────────────────────────────────────────────

export const UNLOCK_MAP = {
    waila:             "fabmod:upgrade_waila",
    dynLight:          "fabmod:upgrade_dynamic_lights",
    refill:            "fabmod:upgrade_auto_refill",
    nightVision:       "fabmod:upgrade_night_vision",
    noFall:            "fabmod:upgrade_no_fall_damage",
    agile:             "fabmod:upgrade_agile",
    magnet:            "fabmod:upgrade_magnet",
    corpse:            "fabmod:upgrade_corpse",
    tc:                "fabmod:upgrade_tree_capitator",
    vm:                "fabmod:upgrade_vein_miner",
    silkSpawner:       "fabmod:upgrade_spawner_silk",
    tp_player_spawn:   "fabmod:upgrade_tp_player_spawn",
    tp_home:           "fabmod:upgrade_tp_home",
    tp_death:          "fabmod:upgrade_tp_death",
    backpackEnabled:   "fabmod:upgrade_cheat_backpack",
    backpackT2:        "fabmod:upgrade_backpack_t2",
    backpackT3:        "fabmod:upgrade_backpack_t3",
    backpackT4:        "fabmod:upgrade_backpack_t4",
    backpackT5:        "fabmod:upgrade_backpack_t5",
    backpackHover:     "fabmod:upgrade_backpack_hover",
    autoReplant:       "fabmod:upgrade_auto_replant",
    keepMenu:          "fabmod:upgrade_keep_item",
    glowing:           "fabmod:upgrade_glowing",
    antiVoid:          "fabmod:upgrade_anti_void",
    waterBreathing:    "fabmod:upgrade_water_breathing",
    haste:             "fabmod:upgrade_haste",
    fireRes:           "fabmod:upgrade_fire_resistance",
    doubleXp:          "fabmod:upgrade_double_xp",
    regen:             "fabmod:upgrade_regeneration",
    resistance:        "fabmod:upgrade_resistance",
    strength:          "fabmod:upgrade_strength",
    saturation:        "fabmod:upgrade_saturation",
    doubleJump:        "fabmod:upgrade_double_jump",
    damageT1:          "fabmod:upgrade_damage_t1",
    damageT2:          "fabmod:upgrade_damage_t2",
    damageT3:          "fabmod:upgrade_damage_t3",
    damageT4:          "fabmod:upgrade_damage_t4",
    damageT5:          "fabmod:upgrade_damage_t5",
    itemName:          "fabmod:upgrade_item_name",
    cb_sharpness:      "fabmod:upgrade_sharpness",
    cb_knockback:      "fabmod:upgrade_knockback",
    cb_fireAspect:     "fabmod:upgrade_fire_aspect",
    cb_lifeSteal:      "fabmod:upgrade_lifesteal",
    cb_smite:          "fabmod:upgrade_smite",
    cb_sweeping:       "fabmod:upgrade_sweeping",
    entityRadar:       "fabmod:upgrade_entity_radar",
    fireballShot:      "fabmod:upgrade_fireball_shot",
};

export const UPGRADE_LABELS = {
    waila:           "WAILA",
    dynLight:        "Dynamic Lights",
    refill:          "Auto Refill",
    nightVision:     "Night Vision",
    noFall:          "No Fall Damage",
    agile:           "Agile",
    magnet:          "Item Magnet",
    corpse:          "Corpse on Death",
    tc:              "Tree Capitator",
    vm:              "Vein Miner",
    silkSpawner:     "Spawner Silk Touch",
    tp_player_spawn: "TP Player Spawn",
    tp_home:         "TP Home",
    tp_death:        "TP Last Death",
    backpackEnabled: "Backpack",
    backpackT2:      "Backpack Tier 2",
    backpackT3:      "Backpack Tier 3",
    backpackT4:      "Backpack Tier 4",
    backpackT5:      "Backpack Tier 5",
    backpackHover:   "Backpack Hover",
    autoReplant:     "Auto Replant",
    keepMenu:        "Keep Item on Death",
    glowing:         "Glowing",
    antiVoid:        "Anti Void",
    waterBreathing:  "Water Breathing",
    haste:           "Haste",
    fireRes:         "Fire Resistance",
    doubleXp:        "Double XP",
    regen:           "Regeneration",
    resistance:      "Resistance",
    strength:        "Strength",
    saturation:      "Saturation",
    doubleJump:      "Double Jump",
    damageT1:        "Damage Tier 1",
    damageT2:        "Damage Tier 2",
    damageT3:        "Damage Tier 3",
    damageT4:        "Damage Tier 4",
    damageT5:        "Damage Tier 5",
    itemName:        "Item Name Display",
    cb_sharpness:    "Sharpness",
    cb_knockback:    "Knockback",
    cb_fireAspect:   "Fire Aspect",
    cb_lifeSteal:    "Life Steal",
    cb_smite:        "Smite",
    cb_sweeping:     "Sweeping Edge",
    entityRadar:     "Entity Radar",
    fireballShot:    "Fireball Shot",
};

// Format : [[typeId, count], ...]  — typeId = identifiant Bedrock de l'item
// Pour les tags (logs, wool) : item représentatif utilisé pour l'affichage
// Pour les potions : IDs fictifs (potion_xxx) mappés dans RECIPE_ITEM_KEYS (upgrades.js)
export const RECIPE_MAP = {
    waila:           [["minecraft:glass", 8]],
    dynLight:        [["minecraft:torch", 4], ["minecraft:copper_ingot", 4]],
    refill:          [["minecraft:hopper", 2], ["minecraft:dropper", 2], ["minecraft:comparator", 3], ["minecraft:redstone", 1]],
    nightVision:     [["minecraft:glass", 4], ["minecraft:sculk", 2], ["minecraft:amethyst_shard", 2]],
    noFall:          [["minecraft:feather", 4], ["minecraft:potion_slow_falling", 4]],
    agile:           [["minecraft:rabbit_foot", 2], ["minecraft:sugar", 2], ["minecraft:potion_swiftness", 2], ["minecraft:potion_leaping", 2]],
    magnet:          [["minecraft:hopper", 8]],
    corpse:          [["minecraft:bone", 2], ["minecraft:soul_sand", 3], ["minecraft:stone", 3]],
    tc:              [["minecraft:stone_axe", 2], ["minecraft:copper_axe", 2], ["minecraft:oak_log", 2], ["minecraft:iron_axe", 2]],
    vm:              [["minecraft:stone", 2], ["minecraft:diamond_block", 1], ["minecraft:iron_pickaxe", 1], ["minecraft:diamond_pickaxe", 1], ["minecraft:emerald_block", 1], ["minecraft:redstone_block", 1], ["minecraft:lapis_block", 1]],
    silkSpawner:     [["minecraft:experience_bottle", 4], ["minecraft:nether_star", 1], ["minecraft:ender_chest", 2], ["minecraft:end_crystal", 1]],
    tp_player_spawn: [["minecraft:white_wool", 3], ["minecraft:oak_log", 3], ["minecraft:ender_pearl", 2]],
    tp_home:         [["minecraft:gold_ingot", 1], ["minecraft:ender_pearl", 2], ["minecraft:iron_ingot", 1], ["minecraft:redstone", 2], ["minecraft:compass", 2]],
    tp_death:        [["minecraft:totem_of_undying", 2], ["minecraft:nether_star", 1], ["minecraft:ender_pearl", 2], ["minecraft:blaze_rod", 2], ["minecraft:ghast_tear", 1]],
    backpackEnabled: [["minecraft:chest", 2], ["minecraft:leather", 2], ["minecraft:string", 4]],
    backpackHover:   [["fabmod:upgrade_cheat_backpack", 1], ["minecraft:hopper", 8]],
    backpackT2:      [["minecraft:diamond", 2], ["minecraft:chest", 2], ["minecraft:milk_bucket", 2], ["minecraft:redstone", 2]],
    backpackT3:      [["minecraft:netherrack", 2], ["minecraft:quartz", 2], ["minecraft:lava_bucket", 2], ["minecraft:chest", 2]],
    backpackT4:      [["minecraft:netherite_ingot", 4], ["minecraft:chest", 2], ["minecraft:wither_skeleton_skull", 2]],
    backpackT5:      [["minecraft:end_stone", 4], ["minecraft:shulker_box", 2], ["minecraft:ender_pearl", 2]],
    autoReplant:     [["minecraft:wheat_seeds", 1], ["minecraft:carrot", 1], ["minecraft:pumpkin_seeds", 1], ["minecraft:wheat", 1], ["minecraft:potato", 1], ["minecraft:melon_seeds", 1], ["minecraft:beetroot_seeds", 1], ["minecraft:beetroot", 1]],
    keepMenu:        [["minecraft:copper_ingot", 4], ["minecraft:iron_ingot", 4]],
    glowing:         [["minecraft:torch", 4], ["minecraft:glowstone", 4]],
    antiVoid:        [["minecraft:elytra", 2], ["minecraft:chorus_fruit", 2], ["minecraft:feather", 2], ["minecraft:phantom_membrane", 2]],
    waterBreathing:  [["minecraft:sponge", 2], ["minecraft:conduit", 1], ["minecraft:heart_of_the_sea", 1], ["minecraft:potion_water_breathing", 2], ["minecraft:prismarine_crystals", 2]],
    haste:           [["minecraft:stone_pickaxe", 1], ["minecraft:iron_pickaxe", 1], ["minecraft:diamond_pickaxe", 1], ["minecraft:netherite_pickaxe", 1], ["minecraft:emerald", 1], ["minecraft:diamond", 1], ["minecraft:beacon", 1]],
    fireRes:         [["minecraft:packed_ice", 2], ["minecraft:powder_snow_bucket", 4], ["minecraft:potion_fire_resistance", 2]],
    doubleXp:        [["minecraft:bookshelf", 2], ["minecraft:experience_bottle", 3], ["minecraft:lapis_block", 2], ["minecraft:enchanting_table", 1]],
    regen:           [["minecraft:enchanted_golden_apple", 4], ["minecraft:nether_star", 4]],
    resistance:      [["minecraft:obsidian", 4], ["minecraft:totem_of_undying", 2], ["minecraft:netherite_ingot", 2]],
    strength:        [["minecraft:netherite_sword", 1], ["minecraft:blaze_rod", 2], ["minecraft:dragon_breath", 3], ["minecraft:potion_strength", 2]],
    saturation:      [["minecraft:golden_apple", 1], ["minecraft:cooked_beef", 2], ["minecraft:golden_carrot", 1], ["minecraft:enchanted_golden_apple", 1], ["minecraft:bread", 1], ["minecraft:honey_bottle", 1], ["minecraft:cake", 1]],
    doubleJump:      [["minecraft:rabbit_foot", 2], ["minecraft:slime", 2], ["minecraft:feather", 2], ["minecraft:potion_leaping", 2]],
    damageT1:        [["minecraft:wooden_sword", 1], ["minecraft:stone_sword", 1], ["minecraft:wooden_axe", 1], ["minecraft:stone_axe", 1], ["minecraft:wooden_pickaxe", 1], ["minecraft:stone_pickaxe", 1], ["minecraft:oak_log", 2]],
    damageT2:        [["minecraft:stone_sword", 1], ["minecraft:iron_sword", 1], ["minecraft:stone_axe", 1], ["minecraft:iron_axe", 1], ["minecraft:stone_pickaxe", 1], ["minecraft:iron_pickaxe", 1], ["minecraft:flint", 2]],
    damageT3:        [["minecraft:iron_sword", 1], ["minecraft:golden_sword", 1], ["minecraft:iron_axe", 1], ["minecraft:golden_axe", 1], ["minecraft:iron_pickaxe", 1], ["minecraft:golden_pickaxe", 1], ["minecraft:obsidian", 2]],
    damageT4:        [["minecraft:golden_sword", 1], ["minecraft:diamond_sword", 1], ["minecraft:golden_axe", 1], ["minecraft:diamond_axe", 1], ["minecraft:golden_pickaxe", 1], ["minecraft:diamond_pickaxe", 1], ["minecraft:blaze_rod", 1], ["minecraft:ghast_tear", 1]],
    damageT5:        [["minecraft:diamond_sword", 1], ["minecraft:netherite_sword", 1], ["minecraft:diamond_axe", 1], ["minecraft:netherite_axe", 1], ["minecraft:diamond_pickaxe", 1], ["minecraft:netherite_pickaxe", 1], ["minecraft:shulker_shell", 2]],
    cb_sharpness:    [["minecraft:obsidian", 2], ["minecraft:quartz", 2], ["minecraft:flint", 2], ["minecraft:potion_strength", 2]],
    cb_knockback:    [["minecraft:slime_ball", 4], ["minecraft:piston", 2], ["minecraft:potion_strength", 2]],
    cb_fireAspect:   [["minecraft:fire_charge", 2], ["minecraft:blaze_rod", 4], ["minecraft:magma_cream", 2]],
    cb_lifeSteal:    [["minecraft:golden_carrot", 2], ["minecraft:ghast_tear", 2], ["minecraft:fermented_spider_eye", 2], ["minecraft:golden_apple", 2]],
    cb_smite:        [["minecraft:rotten_flesh", 2], ["minecraft:wither_skeleton_skull", 1], ["minecraft:bone", 2], ["minecraft:soul_sand", 2], ["minecraft:potion_strength", 1]],
    cb_sweeping:     [["minecraft:iron_sword", 2], ["minecraft:tnt", 4], ["minecraft:diamond_sword", 2]],
    itemName:        [["minecraft:book", 4], ["minecraft:paper", 1], ["minecraft:spyglass", 2], ["minecraft:name_tag", 1]],
    entityRadar:     [["minecraft:ender_eye", 1], ["minecraft:spyglass", 1], ["minecraft:glowstone", 2]],
    fireballShot:    [["minecraft:fire_charge", 3], ["minecraft:bow", 3], ["minecraft:arrow", 3]],
};

export const UPGRADE_DESCRIPTIONS = {
    waila:           "fabmod.upgrade.desc.waila",
    dynLight:        "fabmod.upgrade.desc.dynLight",
    refill:          "fabmod.upgrade.desc.refill",
    nightVision:     "fabmod.upgrade.desc.nightVision",
    noFall:          "fabmod.upgrade.desc.noFall",
    agile:           "fabmod.upgrade.desc.agile",
    magnet:          "fabmod.upgrade.desc.magnet",
    corpse:          "fabmod.upgrade.desc.corpse",
    tc:              "fabmod.upgrade.desc.tc",
    vm:              "fabmod.upgrade.desc.vm",
    silkSpawner:     "fabmod.upgrade.desc.silkSpawner",
    tp_player_spawn: "fabmod.upgrade.desc.tp_player_spawn",
    tp_home:         "fabmod.upgrade.desc.tp_home",
    tp_death:        "fabmod.upgrade.desc.tp_death",
    backpackEnabled: "fabmod.upgrade.desc.backpackEnabled",
    backpackT2:      "fabmod.upgrade.desc.backpackT2",
    backpackT3:      "fabmod.upgrade.desc.backpackT3",
    backpackT4:      "fabmod.upgrade.desc.backpackT4",
    backpackT5:      "fabmod.upgrade.desc.backpackT5",
    backpackHover:   "fabmod.upgrade.desc.backpackHover",
    autoReplant:     "fabmod.upgrade.desc.autoReplant",
    keepMenu:        "fabmod.upgrade.desc.keepMenu",
    glowing:         "fabmod.upgrade.desc.glowing",
    antiVoid:        "fabmod.upgrade.desc.antiVoid",
    waterBreathing:  "fabmod.upgrade.desc.waterBreathing",
    haste:           "fabmod.upgrade.desc.haste",
    fireRes:         "fabmod.upgrade.desc.fireRes",
    doubleXp:        "fabmod.upgrade.desc.doubleXp",
    regen:           "fabmod.upgrade.desc.regen",
    resistance:      "fabmod.upgrade.desc.resistance",
    strength:        "fabmod.upgrade.desc.strength",
    saturation:      "fabmod.upgrade.desc.saturation",
    doubleJump:      "fabmod.upgrade.desc.doubleJump",
    damageT1:        "fabmod.upgrade.desc.damageT1",
    damageT2:        "fabmod.upgrade.desc.damageT2",
    damageT3:        "fabmod.upgrade.desc.damageT3",
    damageT4:        "fabmod.upgrade.desc.damageT4",
    damageT5:        "fabmod.upgrade.desc.damageT5",
    itemName:        "fabmod.upgrade.desc.itemName",
    cb_sharpness:    "fabmod.upgrade.desc.cb_sharpness",
    cb_knockback:    "fabmod.upgrade.desc.cb_knockback",
    cb_fireAspect:   "fabmod.upgrade.desc.cb_fireAspect",
    cb_lifeSteal:    "fabmod.upgrade.desc.cb_lifeSteal",
    cb_smite:        "fabmod.upgrade.desc.cb_smite",
    cb_sweeping:     "fabmod.upgrade.desc.cb_sweeping",
    entityRadar:     "fabmod.upgrade.desc.entityRadar",
    fireballShot:    "fabmod.upgrade.desc.fireballShot",
};

export const UPGRADE_PREREQ = {
    backpackT2:    "backpackEnabled",
    backpackT3:    "backpackT2",
    backpackT4:    "backpackT3",
    backpackT5:    "backpackT4",
    backpackHover: "backpackEnabled",
    damageT2:   "damageT1",
    damageT3:   "damageT2",
    damageT4:   "damageT3",
    damageT5:   "damageT4",
};

export const AUTO_ENABLE_ON_UNLOCK = ["backpackEnabled", "corpse", "dynLight", "waila", "tc", "vm", "entityRadar", "fireballShot"];

// ── Upgrade helpers ─────────────────────────────────────────────────────────

export function isUnlocked(featureKey, player) {
    return gdp("unlocked_" + featureKey, player) === true;
}

export function unlock(featureKey, player) {
    sdp("unlocked_" + featureKey, player, true);
    if (AUTO_ENABLE_ON_UNLOCK.includes(featureKey)) {
        sdp(featureKey, player, true);
    }
    if (featureKey === "fireballShot" && gdp("p_bullet_range", player) === undefined) {
        sdp("p_bullet_range", player, 64);
    }
}

// ── Item tier IDs ────────────────────────────────────────────────────────────

const ITEM_TIER_IDS = [
    "fabmod:item",      // tier 0
    "fabmod:item_t1",   // tier 1
    "fabmod:item_t2",   // tier 2
    "fabmod:item_t3",   // tier 3
    "fabmod:item_t4",   // tier 4
    "fabmod:item_t5",   // tier 5
];

export function isTheItem(typeId) {
    return ITEM_TIER_IDS.includes(typeId);
}

export function getItemIdForTier(tier) {
    return ITEM_TIER_IDS[tier] ?? ITEM_TIER_IDS[0];
}

export function swapItemTier(player, newTier) {
    const targetId = getItemIdForTier(newTier);
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    for (let i = 0; i < inv.size; i++) {
        const stack = inv.getItem(i);
        if (stack && isTheItem(stack.typeId) && stack.typeId !== targetId) {
            const newItem = new ItemStack(targetId, 1);
            try { newItem.lockMode = stack.lockMode; } catch {}
            inv.setItem(i, newItem);
            return;
        }
    }
}

// ── Menu item ───────────────────────────────────────────────────────────────

export function createOwnedMenu(playerName) {
    const item = new ItemStack("fabmod:item", 1);
    try { item.lockMode = "inventory"; } catch {}
    return item;
}

export function isMenuOwnedBy(player) {
    return gdp("menuOwner", player) !== undefined;
}

// ── Spawner data ────────────────────────────────────────────────────────────

export const spawnerID = "minecraft:mob_spawner";

export const SPAWNER_MOBS = [
    { name: "Blaze",              egg: "minecraft:blaze_spawn_egg" },
    { name: "Cave Spider",        egg: "minecraft:cave_spider_spawn_egg" },
    { name: "Creeper",            egg: "minecraft:creeper_spawn_egg" },
    { name: "Drowned",            egg: "minecraft:drowned_spawn_egg" },
    { name: "Elder Guardian",     egg: "minecraft:elder_guardian_spawn_egg" },
    { name: "Enderman",           egg: "minecraft:enderman_spawn_egg" },
    { name: "Guardian",           egg: "minecraft:guardian_spawn_egg" },
    { name: "Hoglin",             egg: "minecraft:hoglin_spawn_egg" },
    { name: "Husk",               egg: "minecraft:husk_spawn_egg" },
    { name: "Magma Cube",         egg: "minecraft:magma_cube_spawn_egg" },
    { name: "Phantom",            egg: "minecraft:phantom_spawn_egg" },
    { name: "Piglin",             egg: "minecraft:piglin_spawn_egg" },
    { name: "Piglin Brute",       egg: "minecraft:piglin_brute_spawn_egg" },
    { name: "Pillager",           egg: "minecraft:pillager_spawn_egg" },
    { name: "Ravager",            egg: "minecraft:ravager_spawn_egg" },
    { name: "Silverfish",         egg: "minecraft:silverfish_spawn_egg" },
    { name: "Skeleton",           egg: "minecraft:skeleton_spawn_egg" },
    { name: "Slime",              egg: "minecraft:slime_spawn_egg" },
    { name: "Spider",             egg: "minecraft:spider_spawn_egg" },
    { name: "Stray",              egg: "minecraft:stray_spawn_egg" },
    { name: "Vex",                egg: "minecraft:vex_spawn_egg" },
    { name: "Witch",              egg: "minecraft:witch_spawn_egg" },
    { name: "Wither Skeleton",    egg: "minecraft:wither_skeleton_spawn_egg" },
    { name: "Zombie",             egg: "minecraft:zombie_spawn_egg" },
    { name: "Zombie Villager",    egg: "minecraft:zombie_villager_spawn_egg" },
    { name: "Zombified Piglin",   egg: "minecraft:zombified_piglin_spawn_egg" },
];

// ── Backpack data ───────────────────────────────────────────────────────────

export const backpackIDs = [
    "fabmod:backpack_large",
    "fabmod:backpack_t1", "fabmod:backpack_t2", "fabmod:backpack_t3",
    "fabmod:backpack_t4", "fabmod:backpack_t5"
];

export const unallowedItems = backpackIDs.concat([
    "minecraft:barrier",
    "minecraft:undyed_shulker_box",
    "minecraft:white_shulker_box", "minecraft:orange_shulker_box",
    "minecraft:magenta_shulker_box", "minecraft:light_blue_shulker_box",
    "minecraft:yellow_shulker_box", "minecraft:lime_shulker_box",
    "minecraft:pink_shulker_box", "minecraft:gray_shulker_box",
    "minecraft:silver_shulker_box", "minecraft:cyan_shulker_box",
    "minecraft:purple_shulker_box", "minecraft:blue_shulker_box",
    "minecraft:brown_shulker_box", "minecraft:green_shulker_box",
    "minecraft:red_shulker_box", "minecraft:black_shulker_box"
]);

export const backpackData = {
    "fabmod:backpack_large": { count: 4 },
    "fabmod:backpack_hover": { count: 4 },
    "fabmod:backpack_t1": { count: 4 },
    "fabmod:backpack_t2": { count: 4 },
    "fabmod:backpack_t3": { count: 4 },
    "fabmod:backpack_t4": { count: 4 },
    "fabmod:backpack_t5": { count: 4 }
};

export const BACKPACK_TIERS = {
    1: { slots: 27, name: "Leather Bag", entityId: "fabmod:backpack_t1" },
    2: { slots: 40, name: "Reinforced Bag", entityId: "fabmod:backpack_t2" },
    3: { slots: 60, name: "Nether Bag", entityId: "fabmod:backpack_t3" },
    4: { slots: 80, name: "Netherite Bag", entityId: "fabmod:backpack_t4" },
    5: { slots: 96, name: "End Bag", entityId: "fabmod:backpack_t5" }
};

export const BACKPACK_PLACEHOLDER_ID = "minecraft:barrier";

export function getBackpackTier(player) {
    return gdp("backpackTier", player) ?? 1;
}

// ── Combat data ─────────────────────────────────────────────────────────────

export const DAMAGE_TIERS = {
    0: { damage: 1, name: "Base" },
    1: { damage: 4, name: "Wood/Stone" },
    2: { damage: 5, name: "Stone/Iron" },
    3: { damage: 6, name: "Iron/Gold" },
    4: { damage: 7, name: "Gold/Diamond" },
    5: { damage: 8, name: "Diamond/Netherite" },
};

export function getDamageTier(player) {
    return gdp("damageTier", player) ?? 0;
}

export const UNDEAD_MOBS = [
    "zombie", "husk", "drowned", "zombie_villager", "zombified_piglin",
    "skeleton", "stray", "wither_skeleton", "bogged",
    "phantom", "wither", "zoglin", "skeleton_horse",
];

// ── Dimension names ─────────────────────────────────────────────────────────

export const dimensionNames = {
    "minecraft:overworld": "Overworld",
    "minecraft:nether": "Nether",
    "minecraft:the_end": "The End"
};
