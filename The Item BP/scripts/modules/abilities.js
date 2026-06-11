import { world, EquipmentSlot } from "@minecraft/server"
import { gdp, sdp, t, safeAddEffect } from "../core/utils.js"
import { isUnlocked, backpackIDs } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { defineSettings, getSetting } from "../core/settings.js"

// ── Settings definitions ────────────────────────────────────────────────────

defineSettings([
    { key: "magnet_radius",         labelKey: "fabmod.cfg.lbl.magnet_radius",         tooltipKey: "fabmod.cfg.tip.magnet_radius",         type: "slider", min: 4,    max: 24,   step: 1,   default: 8,    category: "Abilities", categoryKey: "fabmod.cfg.cat.abilities" },
    { key: "entityRadar_radius",    labelKey: "fabmod.cfg.lbl.entityRadar_radius",    tooltipKey: "fabmod.cfg.tip.entityRadar_radius",    type: "slider", min: 8,    max: 64,   step: 1,   default: 32,   category: "Abilities", categoryKey: "fabmod.cfg.cat.abilities" },
]);

// ── Dynamic Lights ──────────────────────────────────────────────────────────

const DYNLIGHT_ITEMS = {
    15: ["lit_pumpkin","lava_bucket","glowstone","shroomlight","beacon","lantern","sea_lantern","campfire","froglight","end_rod"],
    13: ["torch","soul_lantern","soul_campfire","candle"],
    11: ["crying_obsidian","soul_torch"],
    9:  ["fire_charge","redstone_torch","ender_chest","enchanting_table","totem_of_undying","nether_star"],
    6:  ["dragon_breath","ender_eye","magma","blaze_rod","blaze_powder","glow_ink_sac","glow_berries","glowstone_dust","experience_bottle"]
};

function getDynLightLevel(itemId) {
    if (!itemId) return 0;
    for (const [lvl, arr] of Object.entries(DYNLIGHT_ITEMS)) {
        for (const key of arr) { if (itemId.includes(key)) return Number(lvl); }
    }
    return 0;
}

const DYNLIGHT_FN = { 15: "dynlight15", 13: "dynlight13", 11: "dynlight11", 9: "dynlight9", 6: "dynlight6" };

function dynlightCleanPrev(player) {
    const px = gdp("dynlight_lastX", player);
    const py = gdp("dynlight_lastY", player);
    const pz = gdp("dynlight_lastZ", player);
    if (px === undefined) return;

    const loc = player.location;
    const dx = Math.abs(Math.floor(loc.x) - px);
    const dy = Math.abs(Math.floor(loc.y) - py);
    const dz = Math.abs(Math.floor(loc.z) - pz);

    if (dx > 2 || dy > 2 || dz > 2) {
        try { player.runCommand(`execute positioned ${px} ${py + 1} ${pz} run function dynlight_off`); } catch {}
    }
}

function dynlightSavePos(player) {
    const loc = player.location;
    sdp("dynlight_lastX", player, Math.floor(loc.x));
    sdp("dynlight_lastY", player, Math.floor(loc.y));
    sdp("dynlight_lastZ", player, Math.floor(loc.z));
}

eventBus.interval(() => {
    for (const player of world.getPlayers()) {
        const glowingOn = isUnlocked("glowing", player) && (gdp("glowing", player) ?? false);
        const dynLightOn = isUnlocked("dynLight", player) && (gdp("dynLight", player) ?? false);

        if (!dynLightOn && !glowingOn) {
            if (player.hasTag("dynlight_on")) {
                dynlightCleanPrev(player);
                player.runCommand("execute positioned ~~1~ run function dynlight_off");
                player.removeTag("dynlight_on");
                sdp("dynlight_lastX", player, undefined);
            }
            continue;
        }

        try {
            dynlightCleanPrev(player);

            if (glowingOn) {
                player.runCommand("execute positioned ~~1~ run function dynlight15");
                player.addTag("dynlight_on");
                dynlightSavePos(player);
                continue;
            }

            const equip = player.getComponent("minecraft:equippable");
            const mainhand = equip?.getEquipment(EquipmentSlot.Mainhand);
            const offhand  = equip?.getEquipment(EquipmentSlot.Offhand);
            const level = getDynLightLevel(offhand?.typeId) || getDynLightLevel(mainhand?.typeId);

            if (level > 0) {
                player.runCommand(`execute positioned ~~1~ run function ${DYNLIGHT_FN[level]}`);
                player.addTag("dynlight_on");
                dynlightSavePos(player);
            } else if (player.hasTag("dynlight_on")) {
                player.runCommand("execute positioned ~~1~ run function dynlight_off");
                player.removeTag("dynlight_on");
                sdp("dynlight_lastX", player, undefined);
            }
        } catch (e) {}
    }
}, 2);

// ── Passive Effects (Night Vision, Agile, Water Breathing, etc.) ────────────

eventBus.interval(() => {
    for (const player of world.getPlayers()) {
        try {
            if (isUnlocked("nightVision", player) && (gdp("nightVision", player) ?? false))
                safeAddEffect(player, "night_vision", 400, 0);
            if (isUnlocked("agile", player) && (gdp("agile", player) ?? false)) {
                safeAddEffect(player, "speed", 400, 0);
                safeAddEffect(player, "jump_boost", 400, 1);
            }
            if (isUnlocked("waterBreathing", player) && (gdp("waterBreathing", player) ?? false))
                safeAddEffect(player, "water_breathing", 400, 0);
            if (isUnlocked("haste", player) && (gdp("haste", player) ?? false))
                safeAddEffect(player, "haste", 400, 0);
            if (isUnlocked("fireRes", player) && (gdp("fireRes", player) ?? false))
                safeAddEffect(player, "fire_resistance", 400, 0);
            if (isUnlocked("regen", player) && (gdp("regen", player) ?? false))
                safeAddEffect(player, "regeneration", 400, 0);
            if (isUnlocked("resistance", player) && (gdp("resistance", player) ?? false))
                safeAddEffect(player, "resistance", 400, 0);
            if (isUnlocked("strength", player) && (gdp("strength", player) ?? false))
                safeAddEffect(player, "strength", 400, 0);
        } catch (e) {}
    }
}, 100);

// ── Saturation (partial hunger refill) ──────────────────────────────────────

eventBus.interval(() => {
    for (const player of world.getPlayers()) {
        if (!isUnlocked("saturation", player) || !(gdp("saturation", player) ?? false)) continue;
        try {
            const hungerComp = player.getComponent("minecraft:player.hunger");
            if (!hungerComp || hungerComp.currentValue > 15) continue;
            hungerComp.setCurrentValue(19);
        } catch (e) {}
    }
}, 20);

// ── No Fall Damage ──────────────────────────────────────────────────────────

eventBus.before("entityHurt", (ev) => {
    if (ev.damageSource.cause !== "fall") return;
    if (ev.hurtEntity?.typeId !== "minecraft:player") return;
    const player = ev.hurtEntity;
    if (!isUnlocked("noFall", player) || !(gdp("noFall", player) ?? false)) return;
    ev.cancel = true;
});

// ── Double Jump ─────────────────────────────────────────────────────────────

// Feather Falling: reduce fall damage by 50% after double jump
eventBus.after("entityHurt", (ev) => {
    if (ev.damageSource.cause !== "fall") return;
    if (ev.hurtEntity?.typeId !== "minecraft:player") return;
    if (!ev.hurtEntity.hasTag("djump_feather")) return;
    try {
        const health = ev.hurtEntity.getComponent("minecraft:health");
        if (health) health.setCurrentValue(Math.min(health.currentValue + ev.damage * 0.5, health.effectiveMax));
    } catch (e) {}
}, 5);

// Double Jump impulse
eventBus.after("playerButtonInput", (ev) => {
    if (ev.button !== "Jump" || ev.newButtonState !== "Pressed") return;
    const player = ev.player;
    if (!isUnlocked("doubleJump", player)) return;
    if (!(gdp("doubleJump", player) ?? false)) return;

    if (player.hasTag("djump_grounded")) {
        player.removeTag("djump_grounded");
        return;
    }
    if (player.hasTag("djump_used")) return;

    player.addTag("djump_used");
    player.applyImpulse({ x: 0, y: 0.75, z: 0 });
    player.addTag("djump_feather");
    player.playSound("mob.phantom.flap");
});

// Ground detection for double jump
eventBus.interval(() => {
    for (const player of world.getPlayers()) {
        if (player.isOnGround) {
            player.addTag("djump_grounded");
            player.removeTag("djump_used");
            player.removeTag("djump_feather");
        }
    }
}, 5);

// ── Anti Void ───────────────────────────────────────────────────────────────

eventBus.after("entityHurt", (ev) => {
    if (ev.damageSource.cause !== "void") return;
    if (ev.hurtEntity?.typeId !== "minecraft:player") return;
    if (!isUnlocked("antiVoid", ev.hurtEntity)) return;
    if (!(gdp("antiVoid", ev.hurtEntity) ?? false)) return;
    try {
        const player = ev.hurtEntity;
        const health = player.getComponent("minecraft:health");
        if (health) health.setCurrentValue(Math.min(health.currentValue + ev.damage, health.effectiveMax));
        player.teleport({ x: player.location.x, y: 255, z: player.location.z });
        player.addEffect("slow_falling", 600, { amplifier: 0, showParticles: true });
        player.sendMessage(t("fabmod.msg.anti_void_saved"));
    } catch (e) {}
}, 15);

// ── Entity Radar ─────────────────────────────────────────────────────────────

const RADAR_EXCLUDE = new Set(["minecraft:item", "minecraft:player", "fabmod:player_corpse", ...backpackIDs]);

function applyRadarGlow(player, serverRadius) {
    const radius = Math.min(gdp("p_entityRadar_radius", player) ?? serverRadius, serverRadius);
    const entities = player.dimension.getEntities({ location: player.location, maxDistance: radius });
    for (const entity of entities) {
        if (RADAR_EXCLUDE.has(entity.typeId)) continue;
        entity.addEffect("glowing", 60, { amplifier: 0, showParticles: false });
    }
}

// Maintien du glow (mode normal) + keepalive pendant le sneak
eventBus.interval(() => {
    const serverRadius = getSetting("entityRadar_radius");
    for (const player of world.getPlayers()) {
        if (!isUnlocked("entityRadar", player) || !(gdp("entityRadar", player) ?? false)) continue;
        try {
            const sneakOnly = gdp("p_entityRadar_sneak", player) ?? false;
            if (sneakOnly && !player.isSneaking) continue;
            applyRadarGlow(player, serverRadius);
        } catch (e) {}
    }
}, 40);

// Déclenchement instantané au début du sneak
eventBus.after("playerButtonInput", (ev) => {
    if (ev.button !== "Sneak" || ev.newButtonState !== "Pressed") return;
    const player = ev.player;
    if (!isUnlocked("entityRadar", player) || !(gdp("entityRadar", player) ?? false)) return;
    if (!(gdp("p_entityRadar_sneak", player) ?? false)) return;
    try { applyRadarGlow(player, getSetting("entityRadar_radius")); } catch (e) {}
});

// ── Magnet ──────────────────────────────────────────────────────────────────

eventBus.interval(() => {
    const serverRadius = getSetting("magnet_radius");
    for (const player of world.getPlayers()) {
        if (!isUnlocked("magnet", player) || !gdp("magnet", player)) continue;

        const radius = Math.min(gdp("p_magnet_radius", player) ?? serverRadius, serverRadius);
        const items = player.dimension.getEntities({
            type: "minecraft:item",
            location: player.location,
            maxDistance: radius
        });

        for (const item of items) {
            item.teleport(player.location);
        }
    }
}, 10);
