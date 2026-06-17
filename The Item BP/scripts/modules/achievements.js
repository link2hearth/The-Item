import { world, EquipmentSlot, Player } from "@minecraft/server";
import { MessageFormData, ActionFormData } from "@minecraft/server-ui"
import { gdp, sdp } from "../core/utils.js"
import { isUnlocked, UNLOCK_MAP } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { openMenu } from "../menus/router.js"

// ── Achievement definitions ──────────────────────────────────────────────────

const ACHIEVEMENTS = [
    // xp = XP levels rewarded on unlock
    { id: "first_step",       nameKey: "fabmod.ach.first_step.name",       descKey: "fabmod.ach.first_step.desc",       xp: 1  },
    { id: "getting_wood",     nameKey: "fabmod.ach.getting_wood.name",     descKey: "fabmod.ach.getting_wood.desc",     xp: 1  },
    { id: "stone_age",        nameKey: "fabmod.ach.stone_age.name",        descKey: "fabmod.ach.stone_age.desc",        xp: 2  },
    { id: "iron_man",         nameKey: "fabmod.ach.iron_man.name",         descKey: "fabmod.ach.iron_man.desc",         xp: 2  },
    { id: "diamonds",         nameKey: "fabmod.ach.diamonds.name",         descKey: "fabmod.ach.diamonds.desc",         xp: 3  },
    { id: "diamond_hoarder",  nameKey: "fabmod.ach.diamond_hoarder.name",  descKey: "fabmod.ach.diamond_hoarder.desc",  xp: 5  },
    { id: "ancient_treasure", nameKey: "fabmod.ach.ancient_treasure.name", descKey: "fabmod.ach.ancient_treasure.desc", xp: 6  },
    { id: "first_coal",       nameKey: "fabmod.ach.first_coal.name",       descKey: "fabmod.ach.first_coal.desc",       xp: 1  },
    { id: "first_gold",       nameKey: "fabmod.ach.first_gold.name",       descKey: "fabmod.ach.first_gold.desc",       xp: 2  },
    { id: "first_emerald",    nameKey: "fabmod.ach.first_emerald.name",    descKey: "fabmod.ach.first_emerald.desc",    xp: 3  },
    { id: "first_redstone",   nameKey: "fabmod.ach.first_redstone.name",   descKey: "fabmod.ach.first_redstone.desc",   xp: 2  },
    { id: "first_lapis",      nameKey: "fabmod.ach.first_lapis.name",      descKey: "fabmod.ach.first_lapis.desc",      xp: 2  },
    { id: "miner_1k",         nameKey: "fabmod.ach.miner_1k.name",         descKey: "fabmod.ach.miner_1k.desc",         xp: 4  },
    { id: "miner_10k",        nameKey: "fabmod.ach.miner_10k.name",        descKey: "fabmod.ach.miner_10k.desc",        xp: 7  },
    { id: "all_ores",         nameKey: "fabmod.ach.all_ores.name",         descKey: "fabmod.ach.all_ores.desc",         xp: 8  },
    { id: "suit_up",          nameKey: "fabmod.ach.suit_up.name",          descKey: "fabmod.ach.suit_up.desc",          xp: 3  },
    { id: "use_crafting",     nameKey: "fabmod.ach.use_crafting.name",     descKey: "fabmod.ach.use_crafting.desc",     xp: 1  },
    { id: "use_furnace",      nameKey: "fabmod.ach.use_furnace.name",      descKey: "fabmod.ach.use_furnace.desc",      xp: 1  },
    { id: "use_blast_furnace",nameKey: "fabmod.ach.use_blast_furnace.name",descKey: "fabmod.ach.use_blast_furnace.desc",xp: 2  },
    { id: "use_smoker",       nameKey: "fabmod.ach.use_smoker.name",       descKey: "fabmod.ach.use_smoker.desc",       xp: 1  },
    { id: "use_enchanting",   nameKey: "fabmod.ach.use_enchanting.name",   descKey: "fabmod.ach.use_enchanting.desc",   xp: 3  },
    { id: "use_anvil",        nameKey: "fabmod.ach.use_anvil.name",        descKey: "fabmod.ach.use_anvil.desc",        xp: 2  },
    { id: "use_brewing",      nameKey: "fabmod.ach.use_brewing.name",      descKey: "fabmod.ach.use_brewing.desc",      xp: 3  },
    { id: "use_grindstone",   nameKey: "fabmod.ach.use_grindstone.name",   descKey: "fabmod.ach.use_grindstone.desc",   xp: 2  },
    { id: "use_stonecutter",  nameKey: "fabmod.ach.use_stonecutter.name",  descKey: "fabmod.ach.use_stonecutter.desc",  xp: 1  },
    { id: "use_loom",         nameKey: "fabmod.ach.use_loom.name",         descKey: "fabmod.ach.use_loom.desc",         xp: 1  },
    { id: "use_smithing",     nameKey: "fabmod.ach.use_smithing.name",     descKey: "fabmod.ach.use_smithing.desc",     xp: 2  },
    { id: "use_cartography",  nameKey: "fabmod.ach.use_cartography.name",  descKey: "fabmod.ach.use_cartography.desc",  xp: 1  },
    { id: "use_fletching",    nameKey: "fabmod.ach.use_fletching.name",    descKey: "fabmod.ach.use_fletching.desc",    xp: 1  },
    { id: "use_lectern",      nameKey: "fabmod.ach.use_lectern.name",      descKey: "fabmod.ach.use_lectern.desc",      xp: 1  },
    { id: "use_composter",    nameKey: "fabmod.ach.use_composter.name",    descKey: "fabmod.ach.use_composter.desc",    xp: 1  },
    { id: "use_barrel",       nameKey: "fabmod.ach.use_barrel.name",       descKey: "fabmod.ach.use_barrel.desc",       xp: 1  },
    { id: "use_cauldron",     nameKey: "fabmod.ach.use_cauldron.name",     descKey: "fabmod.ach.use_cauldron.desc",     xp: 1  },
    { id: "all_workstations", nameKey: "fabmod.ach.all_workstations.name", descKey: "fabmod.ach.all_workstations.desc", xp: 8  },
    { id: "nether",           nameKey: "fabmod.ach.nether.name",           descKey: "fabmod.ach.nether.desc",           xp: 4  },
    { id: "the_end",          nameKey: "fabmod.ach.the_end.name",          descKey: "fabmod.ach.the_end.desc",          xp: 6  },
    { id: "monster_hunter",   nameKey: "fabmod.ach.monster_hunter.name",   descKey: "fabmod.ach.monster_hunter.desc",   xp: 1  },
    { id: "overkill",         nameKey: "fabmod.ach.overkill.name",         descKey: "fabmod.ach.overkill.desc",         xp: 3  },
    { id: "kills_500",        nameKey: "fabmod.ach.kills_500.name",        descKey: "fabmod.ach.kills_500.desc",        xp: 5  },
    { id: "exterminator",     nameKey: "fabmod.ach.exterminator.name",     descKey: "fabmod.ach.exterminator.desc",     xp: 6  },
    { id: "kill_creeper",     nameKey: "fabmod.ach.kill_creeper.name",     descKey: "fabmod.ach.kill_creeper.desc",     xp: 3  },
    { id: "kill_skeleton",    nameKey: "fabmod.ach.kill_skeleton.name",    descKey: "fabmod.ach.kill_skeleton.desc",    xp: 2  },
    { id: "kill_spider",      nameKey: "fabmod.ach.kill_spider.name",      descKey: "fabmod.ach.kill_spider.desc",      xp: 2  },
    { id: "kill_ghast",       nameKey: "fabmod.ach.kill_ghast.name",       descKey: "fabmod.ach.kill_ghast.desc",       xp: 6  },
    { id: "kill_blaze",       nameKey: "fabmod.ach.kill_blaze.name",       descKey: "fabmod.ach.kill_blaze.desc",       xp: 5  },
    { id: "kill_enderman",    nameKey: "fabmod.ach.kill_enderman.name",    descKey: "fabmod.ach.kill_enderman.desc",    xp: 5  },
    { id: "kill_guardian",    nameKey: "fabmod.ach.kill_guardian.name",    descKey: "fabmod.ach.kill_guardian.desc",    xp: 5  },
    { id: "kill_wither_skel", nameKey: "fabmod.ach.kill_wither_skel.name", descKey: "fabmod.ach.kill_wither_skel.desc", xp: 6  },
    { id: "kill_wither",      nameKey: "fabmod.ach.kill_wither.name",      descKey: "fabmod.ach.kill_wither.desc",      xp: 10 },
    { id: "kill_ender_dragon",nameKey: "fabmod.ach.kill_ender_dragon.name",descKey: "fabmod.ach.kill_ender_dragon.desc",xp: 10 },
    { id: "you_died",         nameKey: "fabmod.ach.you_died.name",         descKey: "fabmod.ach.you_died.desc",         xp: 1  },
    { id: "frequent_dier",    nameKey: "fabmod.ach.frequent_dier.name",    descKey: "fabmod.ach.frequent_dier.desc",    xp: 2  },
    { id: "playtime_1h",      nameKey: "fabmod.ach.playtime_1h.name",      descKey: "fabmod.ach.playtime_1h.desc",      xp: 2  },
    { id: "playtime_10h",     nameKey: "fabmod.ach.playtime_10h.name",     descKey: "fabmod.ach.playtime_10h.desc",     xp: 5  },
    { id: "first_upgrade",    nameKey: "fabmod.ach.first_upgrade.name",    descKey: "fabmod.ach.first_upgrade.desc",    xp: 2  },
    { id: "damage_t1",        nameKey: "fabmod.ach.damage_t1.name",        descKey: "fabmod.ach.damage_t1.desc",        xp: 2  },
    { id: "damage_t5",        nameKey: "fabmod.ach.damage_t5.name",        descKey: "fabmod.ach.damage_t5.desc",        xp: 8  },
    { id: "backpack_t1",      nameKey: "fabmod.ach.backpack_t1.name",      descKey: "fabmod.ach.backpack_t1.desc",      xp: 2  },
    { id: "backpack_t5",      nameKey: "fabmod.ach.backpack_t5.name",      descKey: "fabmod.ach.backpack_t5.desc",      xp: 8  },
    { id: "keep_menu",              nameKey: "fabmod.ach.keep_menu.name",              descKey: "fabmod.ach.keep_menu.desc",              xp: 3  },
    // -- Batch 5 : upgrades individuels --
    // Vision / Info
    { id: "unlock_waila",          nameKey: "fabmod.ach.unlock_waila.name",          descKey: "fabmod.ach.unlock_waila.desc",          xp: 2  },
    { id: "unlock_dyn_light",      nameKey: "fabmod.ach.unlock_dyn_light.name",      descKey: "fabmod.ach.unlock_dyn_light.desc",      xp: 2  },
    { id: "unlock_glowing",        nameKey: "fabmod.ach.unlock_glowing.name",        descKey: "fabmod.ach.unlock_glowing.desc",        xp: 2  },
    { id: "unlock_entity_radar",   nameKey: "fabmod.ach.unlock_entity_radar.name",   descKey: "fabmod.ach.unlock_entity_radar.desc",   xp: 3  },
    // Utilitaires
    { id: "unlock_refill",         nameKey: "fabmod.ach.unlock_refill.name",         descKey: "fabmod.ach.unlock_refill.desc",         xp: 2  },
    { id: "unlock_auto_replant",   nameKey: "fabmod.ach.unlock_auto_replant.name",   descKey: "fabmod.ach.unlock_auto_replant.desc",   xp: 2  },
    { id: "unlock_magnet",         nameKey: "fabmod.ach.unlock_magnet.name",         descKey: "fabmod.ach.unlock_magnet.desc",         xp: 3  },
    { id: "unlock_item_name",      nameKey: "fabmod.ach.unlock_item_name.name",      descKey: "fabmod.ach.unlock_item_name.desc",      xp: 2  },
    // Mobilité
    { id: "unlock_no_fall",        nameKey: "fabmod.ach.unlock_no_fall.name",        descKey: "fabmod.ach.unlock_no_fall.desc",        xp: 3  },
    { id: "unlock_agile",          nameKey: "fabmod.ach.unlock_agile.name",          descKey: "fabmod.ach.unlock_agile.desc",          xp: 3  },
    { id: "unlock_double_jump",    nameKey: "fabmod.ach.unlock_double_jump.name",    descKey: "fabmod.ach.unlock_double_jump.desc",    xp: 4  },
    { id: "unlock_anti_void",      nameKey: "fabmod.ach.unlock_anti_void.name",      descKey: "fabmod.ach.unlock_anti_void.desc",      xp: 4  },
    // Téléportation
    { id: "unlock_tp_spawn",       nameKey: "fabmod.ach.unlock_tp_spawn.name",       descKey: "fabmod.ach.unlock_tp_spawn.desc",       xp: 2  },
    { id: "unlock_tp_home",        nameKey: "fabmod.ach.unlock_tp_home.name",        descKey: "fabmod.ach.unlock_tp_home.desc",        xp: 3  },
    { id: "unlock_tp_death",       nameKey: "fabmod.ach.unlock_tp_death.name",       descKey: "fabmod.ach.unlock_tp_death.desc",       xp: 6  },
    // Minage
    { id: "unlock_vm",             nameKey: "fabmod.ach.unlock_vm.name",             descKey: "fabmod.ach.unlock_vm.desc",             xp: 3  },
    { id: "unlock_tc",             nameKey: "fabmod.ach.unlock_tc.name",             descKey: "fabmod.ach.unlock_tc.desc",             xp: 3  },
    { id: "unlock_silk_spawner",   nameKey: "fabmod.ach.unlock_silk_spawner.name",   descKey: "fabmod.ach.unlock_silk_spawner.desc",   xp: 6  },
    { id: "unlock_corpse",         nameKey: "fabmod.ach.unlock_corpse.name",         descKey: "fabmod.ach.unlock_corpse.desc",         xp: 3  },
    // Sac à dos (tiers intermédiaires)
    { id: "backpack_t2",           nameKey: "fabmod.ach.backpack_t2.name",           descKey: "fabmod.ach.backpack_t2.desc",           xp: 3  },
    { id: "backpack_t3",           nameKey: "fabmod.ach.backpack_t3.name",           descKey: "fabmod.ach.backpack_t3.desc",           xp: 4  },
    { id: "backpack_t4",           nameKey: "fabmod.ach.backpack_t4.name",           descKey: "fabmod.ach.backpack_t4.desc",           xp: 6  },
    { id: "unlock_backpack_hover", nameKey: "fabmod.ach.unlock_backpack_hover.name", descKey: "fabmod.ach.unlock_backpack_hover.desc", xp: 3  },
    // Buffs passifs
    { id: "unlock_night_vision",   nameKey: "fabmod.ach.unlock_night_vision.name",   descKey: "fabmod.ach.unlock_night_vision.desc",   xp: 2  },
    { id: "unlock_water_breathing",nameKey: "fabmod.ach.unlock_water_breathing.name",descKey: "fabmod.ach.unlock_water_breathing.desc",xp: 3  },
    { id: "unlock_haste",          nameKey: "fabmod.ach.unlock_haste.name",          descKey: "fabmod.ach.unlock_haste.desc",          xp: 3  },
    { id: "unlock_fire_res",       nameKey: "fabmod.ach.unlock_fire_res.name",       descKey: "fabmod.ach.unlock_fire_res.desc",       xp: 4  },
    { id: "unlock_regen",          nameKey: "fabmod.ach.unlock_regen.name",          descKey: "fabmod.ach.unlock_regen.desc",          xp: 4  },
    { id: "unlock_resistance",     nameKey: "fabmod.ach.unlock_resistance.name",     descKey: "fabmod.ach.unlock_resistance.desc",     xp: 4  },
    { id: "unlock_strength",       nameKey: "fabmod.ach.unlock_strength.name",       descKey: "fabmod.ach.unlock_strength.desc",       xp: 4  },
    { id: "unlock_saturation",     nameKey: "fabmod.ach.unlock_saturation.name",     descKey: "fabmod.ach.unlock_saturation.desc",     xp: 3  },
    { id: "unlock_double_xp",      nameKey: "fabmod.ach.unlock_double_xp.name",      descKey: "fabmod.ach.unlock_double_xp.desc",      xp: 4  },
    // Dégâts (tiers intermédiaires)
    { id: "damage_t2",             nameKey: "fabmod.ach.damage_t2.name",             descKey: "fabmod.ach.damage_t2.desc",             xp: 3  },
    { id: "damage_t3",             nameKey: "fabmod.ach.damage_t3.name",             descKey: "fabmod.ach.damage_t3.desc",             xp: 4  },
    { id: "damage_t4",             nameKey: "fabmod.ach.damage_t4.name",             descKey: "fabmod.ach.damage_t4.desc",             xp: 6  },
    // Combat actif
    { id: "unlock_sharpness",      nameKey: "fabmod.ach.unlock_sharpness.name",      descKey: "fabmod.ach.unlock_sharpness.desc",      xp: 3  },
    { id: "unlock_knockback",      nameKey: "fabmod.ach.unlock_knockback.name",      descKey: "fabmod.ach.unlock_knockback.desc",      xp: 3  },
    { id: "unlock_fire_aspect",    nameKey: "fabmod.ach.unlock_fire_aspect.name",    descKey: "fabmod.ach.unlock_fire_aspect.desc",    xp: 4  },
    { id: "unlock_lifesteal",      nameKey: "fabmod.ach.unlock_lifesteal.name",      descKey: "fabmod.ach.unlock_lifesteal.desc",      xp: 5  },
    { id: "unlock_smite",          nameKey: "fabmod.ach.unlock_smite.name",          descKey: "fabmod.ach.unlock_smite.desc",          xp: 3  },
    { id: "unlock_sweeping",       nameKey: "fabmod.ach.unlock_sweeping.name",       descKey: "fabmod.ach.unlock_sweeping.desc",       xp: 3  },
    { id: "unlock_fireball",       nameKey: "fabmod.ach.unlock_fireball.name",       descKey: "fabmod.ach.unlock_fireball.desc",       xp: 4  },
    { id: "all_upgrades",          nameKey: "fabmod.ach.all_upgrades.name",          descKey: "fabmod.ach.all_upgrades.desc",          xp: 10 },
    // -- Gameplay commun --
    { id: "first_blood",    nameKey: "fabmod.ach.first_blood.name",    descKey: "fabmod.ach.first_blood.desc",    xp: 5 },
    { id: "lava_death",     nameKey: "fabmod.ach.lava_death.name",     descKey: "fabmod.ach.lava_death.desc",     xp: 2 },
    { id: "bedrock_reach",  nameKey: "fabmod.ach.bedrock_reach.name",  descKey: "fabmod.ach.bedrock_reach.desc",  xp: 3 },
    { id: "sky_limit",      nameKey: "fabmod.ach.sky_limit.name",      descKey: "fabmod.ach.sky_limit.desc",      xp: 3 },
    { id: "insomniac",      nameKey: "fabmod.ach.insomniac.name",      descKey: "fabmod.ach.insomniac.desc",      xp: 6 },
    // -- Progression monde --
    { id: "elytra_found",   nameKey: "fabmod.ach.elytra_found.name",   descKey: "fabmod.ach.elytra_found.desc",   xp: 6 },
    { id: "beacon_active",  nameKey: "fabmod.ach.beacon_active.name",  descKey: "fabmod.ach.beacon_active.desc",  xp: 5 },
    // -- Effets & survie --
    { id: "hero_of_village", nameKey: "fabmod.ach.hero_of_village.name", descKey: "fabmod.ach.hero_of_village.desc", xp: 5 },
    { id: "bad_omen",        nameKey: "fabmod.ach.bad_omen.name",        descKey: "fabmod.ach.bad_omen.desc",        xp: 2 },
    { id: "conduit_power",   nameKey: "fabmod.ach.conduit_power.name",   descKey: "fabmod.ach.conduit_power.desc",   xp: 4 },
    { id: "dolphins_grace",  nameKey: "fabmod.ach.dolphins_grace.name",  descKey: "fabmod.ach.dolphins_grace.desc",  xp: 2 },
    { id: "milk_cure",       nameKey: "fabmod.ach.milk_cure.name",       descKey: "fabmod.ach.milk_cure.desc",       xp: 3 },
    { id: "wither_survive",  nameKey: "fabmod.ach.wither_survive.name",  descKey: "fabmod.ach.wither_survive.desc",  xp: 5 },
    { id: "totem_use",       nameKey: "fabmod.ach.totem_use.name",       descKey: "fabmod.ach.totem_use.desc",       xp: 5 },
    // -- Craft & obtention --
    { id: "craft_table",    nameKey: "fabmod.ach.craft_table.name",    descKey: "fabmod.ach.craft_table.desc",    xp: 1 },
    { id: "wood_pick",      nameKey: "fabmod.ach.wood_pick.name",      descKey: "fabmod.ach.wood_pick.desc",      xp: 1 },
    { id: "stone_pick",     nameKey: "fabmod.ach.stone_pick.name",     descKey: "fabmod.ach.stone_pick.desc",     xp: 1 },
    { id: "iron_pick",      nameKey: "fabmod.ach.iron_pick.name",      descKey: "fabmod.ach.iron_pick.desc",      xp: 2 },
    { id: "diamond_pick",   nameKey: "fabmod.ach.diamond_pick.name",   descKey: "fabmod.ach.diamond_pick.desc",   xp: 4 },
    { id: "furnace_craft",  nameKey: "fabmod.ach.furnace_craft.name",  descKey: "fabmod.ach.furnace_craft.desc",  xp: 1 },
    { id: "first_sword",    nameKey: "fabmod.ach.first_sword.name",    descKey: "fabmod.ach.first_sword.desc",    xp: 1 },
    { id: "first_hoe",      nameKey: "fabmod.ach.first_hoe.name",      descKey: "fabmod.ach.first_hoe.desc",      xp: 1 },
    { id: "bread_craft",    nameKey: "fabmod.ach.bread_craft.name",    descKey: "fabmod.ach.bread_craft.desc",    xp: 2 },
    { id: "cake_craft",     nameKey: "fabmod.ach.cake_craft.name",     descKey: "fabmod.ach.cake_craft.desc",     xp: 3 },
    { id: "minecart_craft", nameKey: "fabmod.ach.minecart_craft.name", descKey: "fabmod.ach.minecart_craft.desc", xp: 2 },
    { id: "shield_craft",   nameKey: "fabmod.ach.shield_craft.name",   descKey: "fabmod.ach.shield_craft.desc",   xp: 2 },
    { id: "bow_craft",      nameKey: "fabmod.ach.bow_craft.name",      descKey: "fabmod.ach.bow_craft.desc",      xp: 2 },
    { id: "tnt_craft",      nameKey: "fabmod.ach.tnt_craft.name",      descKey: "fabmod.ach.tnt_craft.desc",      xp: 2 },
    { id: "piston_craft",   nameKey: "fabmod.ach.piston_craft.name",   descKey: "fabmod.ach.piston_craft.desc",   xp: 2 },
    { id: "bed_craft",      nameKey: "fabmod.ach.bed_craft.name",      descKey: "fabmod.ach.bed_craft.desc",      xp: 1 },
    { id: "diamond_armor",  nameKey: "fabmod.ach.diamond_armor.name",  descKey: "fabmod.ach.diamond_armor.desc",  xp: 4 },
    { id: "netherite_item", nameKey: "fabmod.ach.netherite_item.name", descKey: "fabmod.ach.netherite_item.desc", xp: 6 },
    { id: "trident_obtain", nameKey: "fabmod.ach.trident_obtain.name", descKey: "fabmod.ach.trident_obtain.desc", xp: 5 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasAchievement(player, id) {
    return gdp("achievement_" + id, player) === true;
}

function grant(player, id) {
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (!ach || hasAchievement(player, id)) return;
    sdp("achievement_" + id, player, true);
    try { player.addLevels(ach.xp); } catch {}
    world.sendMessage({ rawtext: [
        { text: `§7[§6${player.name}§7] ` },
        { translate: "fabmod.ach.toast_prefix" },
        { text: " §f" },
        { translate: ach.nameKey },
        { text: " §7— " },
        { translate: ach.descKey },
        { text: ` §e(+${ach.xp} lvl)` }
    ]});
    player.playSound("random.levelup");
}

// ── Event hooks ──────────────────────────────────────────────────────────────

// First login
eventBus.after("playerSpawn", (ev) => {
    if (ev.initialSpawn) grant(ev.player, "first_step");
}, 10);

// Block mining
eventBus.after("playerBreakBlock", (ev) => {
    const player = ev.player;
    const blockId = ev.brokenBlockPermutation.type.id;

    if (blockId.includes("_log"))
        grant(player, "getting_wood");

    const mined = gdp("stat_blocksMined", player) ?? 0;
    if (mined >= 100)   grant(player, "stone_age");
    if (mined >= 1000)  grant(player, "miner_1k");
    if (mined >= 10000) grant(player, "miner_10k");

    if (blockId === "minecraft:iron_ore" || blockId === "minecraft:deepslate_iron_ore")
        grant(player, "iron_man");

    if (blockId === "minecraft:coal_ore" || blockId === "minecraft:deepslate_coal_ore")
        grant(player, "first_coal");

    if (blockId === "minecraft:gold_ore" || blockId === "minecraft:deepslate_gold_ore" || blockId === "minecraft:nether_gold_ore")
        grant(player, "first_gold");

    if (blockId === "minecraft:emerald_ore" || blockId === "minecraft:deepslate_emerald_ore")
        grant(player, "first_emerald");

    if (blockId === "minecraft:redstone_ore" || blockId === "minecraft:deepslate_redstone_ore" || blockId === "minecraft:lit_redstone_ore" || blockId === "minecraft:lit_deepslate_redstone_ore")
        grant(player, "first_redstone");

    if (blockId === "minecraft:lapis_ore" || blockId === "minecraft:deepslate_lapis_ore")
        grant(player, "first_lapis");

    if (blockId === "minecraft:diamond_ore" || blockId === "minecraft:deepslate_diamond_ore") {
        grant(player, "diamonds");
        if ((gdp("stat_diamond_approx", player) ?? 0) >= 100)
            grant(player, "diamond_hoarder");
    }

    if (blockId === "minecraft:ancient_debris")
        grant(player, "ancient_treasure");

    // all_ores : tous les 10 minerais minés au moins une fois (stat mis à jour au tick précédent)
    if (blockId.includes("_ore") || blockId === "minecraft:ancient_debris") {
        const oreKeys = ["coal", "copper", "iron", "gold", "lapis", "redstone", "emerald", "diamond", "quartz", "debris"];
        if (oreKeys.every(k => (gdp("stat_ore_" + k, player) ?? 0) >= 1))
            grant(player, "all_ores");
    }
}, 10);

// Workstations & crafting blocks
const WORKSTATION_MAP = {
    use_crafting:      ["minecraft:crafting_table", "fabmod:crafting_table_perso"],
    use_furnace:       ["minecraft:furnace", "minecraft:lit_furnace", "fabmod:furnace_perso"],
    use_blast_furnace: ["minecraft:blast_furnace", "minecraft:lit_blast_furnace"],
    use_smoker:        ["minecraft:smoker", "minecraft:lit_smoker"],
    use_enchanting:    ["minecraft:enchanting_table"],
    use_anvil:         ["minecraft:anvil", "minecraft:chipped_anvil", "minecraft:damaged_anvil"],
    use_brewing:       ["minecraft:brewing_stand"],
    use_grindstone:    ["minecraft:grindstone"],
    use_stonecutter:   ["minecraft:stonecutter"],
    use_loom:          ["minecraft:loom"],
    use_smithing:      ["minecraft:smithing_table"],
    use_cartography:   ["minecraft:cartography_table"],
    use_fletching:     ["minecraft:fletching_table"],
    use_lectern:       ["minecraft:lectern"],
    use_composter:     ["minecraft:composter"],
    use_barrel:        ["minecraft:barrel"],
    use_cauldron:      ["minecraft:cauldron", "minecraft:water_cauldron", "minecraft:lava_cauldron", "minecraft:powder_snow_cauldron"],
};
const WORKSTATION_IDS = Object.keys(WORKSTATION_MAP);

world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    const player = ev.player;
    const blockId = ev.block.typeId;

    if (blockId === "minecraft:beacon") grant(player, "beacon_active");

    for (const [achId, blockIds] of Object.entries(WORKSTATION_MAP)) {
        if (blockIds.includes(blockId)) {
            if (!hasAchievement(player, achId)) {
                grant(player, achId);
                if (WORKSTATION_IDS.every(id => hasAchievement(player, id)))
                    grant(player, "all_workstations");
            }
            break;
        }
    }
});

// Dimension change (Nether / End)
world.afterEvents.playerDimensionChange.subscribe((ev) => {
    const dim = ev.toDimension.id;
    if (dim === "minecraft:nether")  grant(ev.player, "nether");
    if (dim === "minecraft:the_end") grant(ev.player, "the_end");
});

// Armor equip

const lastArmor = new Map();

eventBus.playerInterval((players) => {
    for (const player of players) {

        const equip = player.getComponent("minecraft:equippable");
        if (!equip) continue;

        const boots  = equip.getEquipment(EquipmentSlot.Feet)?.typeId;
        const legs   = equip.getEquipment(EquipmentSlot.Legs)?.typeId;
        const chest  = equip.getEquipment(EquipmentSlot.Chest)?.typeId;
        const helmet = equip.getEquipment(EquipmentSlot.Head)?.typeId;

        const armorState = `${boots}|${legs}|${chest}|${helmet}`;

        if (lastArmor.get(player.id) !== armorState) {
            lastArmor.set(player.id, armorState);

            if (
                boots === "minecraft:iron_boots" &&
                legs === "minecraft:iron_leggings" &&
                chest === "minecraft:iron_chestplate" &&
                helmet === "minecraft:iron_helmet"
            ) {
                grant(player, "suit_up");
            }
        }
    }
}, 10);
// Playtime (checked every 100 ticks alongside the stat update)
eventBus.playerInterval((players) => {
    for (const player of players) {
        const ticks = gdp("playTimeTicks", player) ?? 0;
        if (ticks >= 72000)  grant(player, "playtime_1h");
        if (ticks >= 720000) grant(player, "playtime_10h");
    }
}, 100);

// ── Kill / death achievements (called from player.js after stat update) ──────

export function onMobKilledByPlayer(player, monsterKills, entityTypeId) {
    if (monsterKills >= 1)    grant(player, "monster_hunter");
    if (monsterKills >= 100)  grant(player, "overkill");
    if (monsterKills >= 500)  grant(player, "kills_500");
    if (monsterKills >= 1000) grant(player, "exterminator");

    switch (entityTypeId) {
        case "minecraft:creeper":          grant(player, "kill_creeper");     break;
        case "minecraft:skeleton":         grant(player, "kill_skeleton");    break;
        case "minecraft:spider":
        case "minecraft:cave_spider":      grant(player, "kill_spider");      break;
        case "minecraft:ghast":            grant(player, "kill_ghast");       break;
        case "minecraft:blaze":            grant(player, "kill_blaze");       break;
        case "minecraft:enderman":         grant(player, "kill_enderman");    break;
        case "minecraft:guardian":
        case "minecraft:elder_guardian":   grant(player, "kill_guardian");    break;
        case "minecraft:wither_skeleton":  grant(player, "kill_wither_skel"); break;
        case "minecraft:wither":           grant(player, "kill_wither");      break;
        case "minecraft:ender_dragon":     grant(player, "kill_ender_dragon");break;
    }
}

export function onPlayerDied(player, totalDeaths) {
    if (totalDeaths >= 1)  grant(player, "you_died");
    if (totalDeaths >= 10) grant(player, "frequent_dier");
}

// ── Upgrade achievements (called from player.js after unlock) ─────────────────

const UPGRADE_ACH_MAP = {
    waila:           "unlock_waila",
    dynLight:        "unlock_dyn_light",
    refill:          "unlock_refill",
    nightVision:     "unlock_night_vision",
    noFall:          "unlock_no_fall",
    agile:           "unlock_agile",
    magnet:          "unlock_magnet",
    corpse:          "unlock_corpse",
    tc:              "unlock_tc",
    vm:              "unlock_vm",
    silkSpawner:     "unlock_silk_spawner",
    tp_player_spawn: "unlock_tp_spawn",
    tp_home:         "unlock_tp_home",
    tp_death:        "unlock_tp_death",
    backpackEnabled: "backpack_t1",
    backpackT2:      "backpack_t2",
    backpackT3:      "backpack_t3",
    backpackT4:      "backpack_t4",
    backpackT5:      "backpack_t5",
    backpackHover:   "unlock_backpack_hover",
    autoReplant:     "unlock_auto_replant",
    keepMenu:        "keep_menu",
    glowing:         "unlock_glowing",
    antiVoid:        "unlock_anti_void",
    waterBreathing:  "unlock_water_breathing",
    haste:           "unlock_haste",
    fireRes:         "unlock_fire_res",
    doubleXp:        "unlock_double_xp",
    regen:           "unlock_regen",
    resistance:      "unlock_resistance",
    strength:        "unlock_strength",
    saturation:      "unlock_saturation",
    doubleJump:      "unlock_double_jump",
    damageT1:        "damage_t1",
    damageT2:        "damage_t2",
    damageT3:        "damage_t3",
    damageT4:        "damage_t4",
    damageT5:        "damage_t5",
    itemName:        "unlock_item_name",
    cb_sharpness:    "unlock_sharpness",
    cb_knockback:    "unlock_knockback",
    cb_fireAspect:   "unlock_fire_aspect",
    cb_lifeSteal:    "unlock_lifesteal",
    cb_smite:        "unlock_smite",
    cb_sweeping:     "unlock_sweeping",
    entityRadar:     "unlock_entity_radar",
    fireballShot:    "unlock_fireball",
};

export function onUpgradeUnlocked(player, featureKey) {
    grant(player, "first_upgrade");
    const achId = UPGRADE_ACH_MAP[featureKey];
    if (achId) grant(player, achId);
    if (Object.keys(UNLOCK_MAP).every(k => isUnlocked(k, player)))
        grant(player, "all_upgrades");
}

// ── Gameplay common achievements ─────────────────────────────────────────────

// Premier kill PvP
eventBus.after("entityDie", (ev) => {
    if (ev.deadEntity instanceof Player && ev.damageSource?.damagingEntity instanceof Player) {
        const killer = ev.damageSource.damagingEntity;
        if (killer.id !== ev.deadEntity.id)
            grant(killer, "first_blood");
    }
}, 10);

// Mort par lave
eventBus.after("entityDie", (ev) => {
    if (ev.deadEntity instanceof Player && ev.damageSource?.cause === "lava")
        grant(ev.deadEntity, "lava_death");
}, 10);

// Y-position : bedrock et limite du ciel (toutes les 20 ticks)
eventBus.playerInterval((players) => {
    for (const player of players) {
        const y = player.location.y;
        if (y <= -63) grant(player, "bedrock_reach");
        if (y >= 320)  grant(player, "sky_limit");
    }
}, 20);

// Élytre dans l'inventaire ou slot poitrine (toutes les 100 ticks)
eventBus.playerInterval((players) => {
    for (const player of players) {
        if (hasAchievement(player, "elytra_found")) continue;
        const equip = player.getComponent("minecraft:equippable");
        if (!equip) continue;
        if (equip.getEquipment(EquipmentSlot.Chest)?.typeId === "minecraft:elytra") {
            grant(player, "elytra_found");
            continue;
        }
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (!inv) continue;
        for (let i = 0; i < inv.size; i++) {
            if (inv.getItem(i)?.typeId === "minecraft:elytra") {
                grant(player, "elytra_found");
                break;
            }
        }
    }
}, 100);

// Insomniaque : 10h de jeu sans dormir (toutes les 100 ticks)
eventBus.playerInterval((players) => {
    for (const player of players) {
        if (player.isSleeping) {
            sdp("stat_ticksWithoutSleep", player, 0);
            continue;
        }
        const ticks = (gdp("stat_ticksWithoutSleep", player) ?? 0) + 100;
        sdp("stat_ticksWithoutSleep", player, ticks);
        if (ticks >= 720000) grant(player, "insomniac");
    }
}, 100);

// ── Craft & obtention ────────────────────────────────────────────────────────

const CRAFT_CHECKS = [
    { id: "craft_table",    match: id => id === "minecraft:crafting_table" },
    { id: "wood_pick",      match: id => id === "minecraft:wooden_pickaxe" },
    { id: "stone_pick",     match: id => id === "minecraft:stone_pickaxe" },
    { id: "iron_pick",      match: id => id === "minecraft:iron_pickaxe" },
    { id: "diamond_pick",   match: id => id === "minecraft:diamond_pickaxe" },
    { id: "furnace_craft",  match: id => id === "minecraft:furnace" },
    { id: "first_sword",    match: id => id.endsWith("_sword") },
    { id: "first_hoe",      match: id => id.endsWith("_hoe") },
    { id: "bread_craft",    match: id => id === "minecraft:bread" },
    { id: "cake_craft",     match: id => id === "minecraft:cake" },
    { id: "minecart_craft", match: id => id === "minecraft:minecart" || id.endsWith("_minecart") },
    { id: "shield_craft",   match: id => id === "minecraft:shield" },
    { id: "bow_craft",      match: id => id === "minecraft:bow" },
    { id: "tnt_craft",      match: id => id === "minecraft:tnt" },
    { id: "piston_craft",   match: id => id === "minecraft:piston" || id === "minecraft:sticky_piston" },
    { id: "bed_craft",      match: id => id.endsWith("_bed") },
    { id: "diamond_armor",  match: id => id === "minecraft:diamond_helmet" || id === "minecraft:diamond_chestplate" || id === "minecraft:diamond_leggings" || id === "minecraft:diamond_boots" },
    { id: "netherite_item", match: id => id.startsWith("minecraft:netherite_") && !id.includes("ingot") && !id.includes("scrap") },
    { id: "trident_obtain", match: id => id === "minecraft:trident" },
];

const CRAFT_EQUIP_SLOTS = [
    EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs,
    EquipmentSlot.Feet, EquipmentSlot.Mainhand, EquipmentSlot.Offhand
];

eventBus.playerInterval((players) => {
    for (const player of players) {
        const pending = CRAFT_CHECKS.filter(c => !hasAchievement(player, c.id));
        if (pending.length === 0) continue;

        const itemIds = [];
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (inv) {
            for (let i = 0; i < inv.size; i++) {
                const item = inv.getItem(i);
                if (item) itemIds.push(item.typeId);
            }
        }
        const equip = player.getComponent("minecraft:equippable");
        if (equip) {
            for (const slot of CRAFT_EQUIP_SLOTS) {
                const item = equip.getEquipment(slot);
                if (item) itemIds.push(item.typeId);
            }
        }
        if (itemIds.length === 0) continue;

        for (const { id, match } of pending) {
            if (itemIds.some(match)) grant(player, id);
        }
    }
}, 100);

// ── Effets de statut & survie ────────────────────────────────────────────────

// Héros du village, Bad Omen, Conduit, Dauphins (toutes les 100 ticks)
eventBus.playerInterval((players) => {
    for (const player of players) {
        const effectIds = player.getEffects().map(e => e.typeId);
        if (effectIds.includes("minecraft:hero_of_the_village")) grant(player, "hero_of_village");
        if (effectIds.includes("minecraft:bad_omen"))             grant(player, "bad_omen");
        if (effectIds.includes("minecraft:conduit_power"))        grant(player, "conduit_power");
        if (effectIds.includes("minecraft:dolphins_grace"))       grant(player, "dolphins_grace");
    }
}, 100);

// Lait pendant empoisonnement
world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack?.typeId !== "minecraft:milk_bucket") return;
    if (ev.source.getEffects().some(e => e.typeId === "minecraft:poison"))
        grant(ev.source, "milk_cure");
});

// Survivre à l'effet Wither (toutes les 20 ticks)
const hadWitherMap = new Map();

eventBus.playerInterval((players) => {
    for (const player of players) {
        const hasWither = player.getEffects().some(e => e.typeId === "minecraft:wither");
        if (hasWither) {
            hadWitherMap.set(player.id, true);
        } else if (hadWitherMap.get(player.id)) {
            hadWitherMap.delete(player.id);
            grant(player, "wither_survive");
        }
    }
}, 20);

// Totem de l'immortalité : HP <= 1 puis récupération avec Regen II + Absorption (toutes les 5 ticks)
const nearDeathMap = new Map();

eventBus.playerInterval((players) => {
    for (const player of players) {
        const hp = player.getComponent("minecraft:health")?.currentValue ?? 20;
        if (hp <= 1) {
            nearDeathMap.set(player.id, true);
        } else if (nearDeathMap.get(player.id)) {
            nearDeathMap.delete(player.id);
            const effects = player.getEffects();
            const hasRegenII    = effects.some(e => e.typeId === "minecraft:regeneration" && e.amplifier >= 1);
            const hasAbsorption = effects.some(e => e.typeId === "minecraft:absorption");
            if (hasRegenII && hasAbsorption) grant(player, "totem_use");
        }
    }
}, 5);

// Nettoyage des maps d'état sur mort
eventBus.after("entityDie", (ev) => {
    if (!(ev.deadEntity instanceof Player)) return;
    hadWitherMap.delete(ev.deadEntity.id);
    nearDeathMap.delete(ev.deadEntity.id);
}, 10);

// ── Achievements Menu ─────────────────────────────────────────────────────────

const ACH_CATEGORIES = [
    {
        key: "mining",
        ids: ["getting_wood","stone_age","iron_man","diamonds","diamond_hoarder","ancient_treasure",
              "first_coal","first_gold","first_emerald","first_redstone","first_lapis",
              "miner_1k","miner_10k","all_ores","bedrock_reach","sky_limit"]
    },
    {
        key: "exploration",
        ids: ["first_step","nether","the_end","elytra_found","beacon_active",
              "insomniac","playtime_1h","playtime_10h","unlock_tp_death"]
    },
    {
        key: "combat",
        ids: ["monster_hunter","overkill","kills_500","exterminator",
              "kill_creeper","kill_skeleton","kill_spider","kill_ghast","kill_blaze",
              "kill_enderman","kill_guardian","kill_wither_skel","kill_wither",
              "kill_ender_dragon","first_blood"]
    },
    {
        key: "survival",
        ids: ["you_died","frequent_dier","lava_death","suit_up",
              "hero_of_village","bad_omen","conduit_power","dolphins_grace",
              "milk_cure","wither_survive","totem_use"]
    },
    {
        key: "craft",
        ids: ["use_crafting","use_furnace","use_blast_furnace","use_smoker","use_enchanting",
              "use_anvil","use_brewing","use_grindstone","use_stonecutter","use_loom",
              "use_smithing","use_cartography","use_fletching","use_lectern","use_composter",
              "use_barrel","use_cauldron","all_workstations",
              "craft_table","wood_pick","stone_pick","iron_pick","diamond_pick","furnace_craft",
              "first_sword","first_hoe","bread_craft","cake_craft","minecart_craft",
              "shield_craft","bow_craft","tnt_craft","piston_craft","bed_craft",
              "diamond_armor","netherite_item","trident_obtain"]
    },
    {
        key: "upgrades",
        ids: ["first_upgrade","keep_menu",
              "unlock_waila","unlock_dyn_light","unlock_glowing","unlock_entity_radar",
              "unlock_refill","unlock_auto_replant","unlock_magnet","unlock_item_name",
              "unlock_no_fall","unlock_agile","unlock_double_jump","unlock_anti_void",
              "unlock_tp_spawn","unlock_tp_home",
              "unlock_vm","unlock_tc","unlock_silk_spawner","unlock_corpse",
              "backpack_t1","backpack_t2","backpack_t3","backpack_t4","backpack_t5","unlock_backpack_hover",
              "unlock_night_vision","unlock_water_breathing","unlock_haste","unlock_fire_res",
              "unlock_regen","unlock_resistance","unlock_strength","unlock_saturation","unlock_double_xp",
              "damage_t1","damage_t2","damage_t3","damage_t4","damage_t5",
              "unlock_sharpness","unlock_knockback","unlock_fire_aspect","unlock_lifesteal",
              "unlock_smite","unlock_sweeping","unlock_fireball","all_upgrades"]
    },
];

function showCategoryAchievements(player, categoryKey) {
    const cat = ACH_CATEGORIES.find(c => c.key === categoryKey);
    const achs = cat.ids.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean);
    const obtained = achs.filter(a => hasAchievement(player, a.id)).length;

    const bodyRaw = [];
    for (const ach of achs) {
        const done = hasAchievement(player, ach.id);
        bodyRaw.push({ text: done ? "§a✔ §f" : "§7✗ §8" });
        bodyRaw.push({ translate: ach.nameKey });
        if (!done) {
            bodyRaw.push({ text: "\n   §8" });
            bodyRaw.push({ translate: ach.descKey });
        }
        bodyRaw.push({ text: "§r\n\n" });
    }

    new MessageFormData()
        .title({ rawtext: [{ translate: `fabmod.ach.cat.${categoryKey}` }, { text: ` (${obtained}/${achs.length})` }] })
        .body({ rawtext: bodyRaw })
        .button1({ rawtext: [{ translate: "fabmod.ach.btn_close" }] })
        .button2({ rawtext: [{ translate: "fabmod.ach.btn_categories" }] })
        .show(player).then(res => {
            if (res?.selection === 1) achievementsMenu(player);
        });
}

export function achievementsMenu(player) {
    const totalObtained = ACHIEVEMENTS.filter(a => hasAchievement(player, a.id)).length;
    const total = ACHIEVEMENTS.length;

    const form = new ActionFormData()
        .title({ rawtext: [{ translate: "fabmod.ach.menu_title" }, { text: ` (${totalObtained}/${total})` }] });

    for (const cat of ACH_CATEGORIES) {
        const achs = cat.ids.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean);
        const obtained = achs.filter(a => hasAchievement(player, a.id)).length;
        form.button({ rawtext: [
            { translate: `fabmod.ach.cat.${cat.key}` },
            { text: `  §7(${obtained}/${achs.length})` }
        ]});
    }

    form.button({ rawtext: [{ translate: "fabmod.ach.btn_back" }] });

    form.show(player).then(res => {
        if (res.canceled || res.selection === undefined) return;
        if (res.selection < ACH_CATEGORIES.length) {
            showCategoryAchievements(player, ACH_CATEGORIES[res.selection].key);
        } else {
            openMenu("stats", player);
        }
    });
}
