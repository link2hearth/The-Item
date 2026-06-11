import { system, EquipmentSlot } from "@minecraft/server"
import { gdp, sdp } from "../core/utils.js"
import { isUnlocked, getDamageTier, UNDEAD_MOBS, isTheItem } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { defineSettings, getSetting } from "../core/settings.js"

// ── Settings definitions ────────────────────────────────────────────────────

defineSettings([
    { key: "cb_sweepGlobal",   labelKey: "fabmod.cfg.lbl.cb_sweepGlobal",   tooltipKey: "fabmod.cfg.tip.cb_sweepGlobal",   type: "toggle", default: true,                              category: "Combat", categoryKey: "fabmod.cfg.cat.combat" },
    { key: "cb_sweepCooldown", labelKey: "fabmod.cfg.lbl.cb_sweepCooldown", tooltipKey: "fabmod.cfg.tip.cb_sweepCooldown", type: "slider", min: 4,  max: 20,  step: 1,  default: 12,  category: "Combat", categoryKey: "fabmod.cfg.cat.combat" },
    { key: "cb_sweepRadius",   labelKey: "fabmod.cfg.lbl.cb_sweepRadius",   tooltipKey: "fabmod.cfg.tip.cb_sweepRadius",   type: "slider", min: 1,  max: 5,   step: 1,  default: 2,   category: "Combat", categoryKey: "fabmod.cfg.cat.combat" },
    { key: "cb_sweepDmgPct",   labelKey: "fabmod.cfg.lbl.cb_sweepDmgPct",   tooltipKey: "fabmod.cfg.tip.cb_sweepDmgPct",   type: "slider", min: 10, max: 100, step: 10, default: 50,  category: "Combat", categoryKey: "fabmod.cfg.cat.combat" },
    { key: "cb_lifeStealPct",  labelKey: "fabmod.cfg.lbl.cb_lifeStealPct",  tooltipKey: "fabmod.cfg.tip.cb_lifeStealPct",  type: "slider", min: 5,  max: 50,  step: 5,  default: 20,  category: "Combat", categoryKey: "fabmod.cfg.cat.combat" },
    { key: "cb_fireDuration",  labelKey: "fabmod.cfg.lbl.cb_fireDuration",  tooltipKey: "fabmod.cfg.tip.cb_fireDuration",  type: "slider", min: 1,  max: 10,  step: 1,  default: 4,   category: "Combat", categoryKey: "fabmod.cfg.cat.combat" },
]);

// ── Damage per tier (bonus on top of base 1 dmg) ────────────────────────────

const TIER_BONUS = [0, 3, 4, 5, 6, 7]; // tier 0-5, total = 1 + bonus

// ── Sweep helper ────────────────────────────────────────────────────────────

function canSweep(player) {
    const now = system.currentTick;
    const last = gdp("lastSweepTick", player) ?? 0;
    const cooldown = getSetting("cb_sweepCooldown");
    if (now - last < cooldown) return false;
    sdp("lastSweepTick", player, now);
    return true;
}

function doSweep(player, target, totalDmg) {
    const sweepRadius = getSetting("cb_sweepRadius");
    const sweepPct = getSetting("cb_sweepDmgPct") / 100;
    const sweepDmg = Math.max(1, Math.floor(totalDmg * sweepPct));

    try {
        const nearby = player.dimension.getEntities({
            location: target.location,
            maxDistance: sweepRadius,
            excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb"],
        });

        for (const mob of nearby) {
            if (mob.id === target.id) continue;
            try { mob.applyDamage(sweepDmg, { cause: "entityAttack", damagingEntity: player }); } catch {}
        }
    } catch {}

    // Sweep particles
    try {
        const loc = target.location;
        player.dimension.runCommand(`particle minecraft:critical_hit_emitter ${loc.x} ${loc.y + 0.5} ${loc.z}`);
    } catch {}
}

// ── The Item combat handler ─────────────────────────────────────────────────

eventBus.after("entityHitEntity", (ev) => {
    if (ev.damagingEntity?.typeId !== "minecraft:player") return;

    const player = ev.damagingEntity;
    const target = ev.hitEntity;
    if (!target || target.typeId === "minecraft:player") return;

    const equip = player.getComponent("minecraft:equippable");
    const mainhand = equip?.getEquipment(EquipmentSlot.Mainhand);
    if (!mainhand) return;

    // ── Global sword sweep (requires unlock + toggle + admin setting) ──
    if (mainhand.typeId.endsWith("_sword") && !isTheItem(mainhand.typeId)) {
        if (getSetting("cb_sweepGlobal") && isUnlocked("cb_sweeping", player) && gdp("cb_sweeping", player) && canSweep(player)) {
            const swordDmg = { wooden_sword: 4, stone_sword: 5, iron_sword: 6, golden_sword: 4, diamond_sword: 7, netherite_sword: 8 };
            const id = mainhand.typeId.replace("minecraft:", "");
            const dmg = swordDmg[id] ?? 5;
            doSweep(player, target, dmg);
        }
        return;
    }

    // ── The Item combat ─────────────────────────────────────────────────
    if (!isTheItem(mainhand.typeId)) return;

    const tier = getDamageTier(player);
    if (tier < 1) return;

    let bonusDmg = TIER_BONUS[tier] ?? 0;

    // Sharpness: +1-3 random bonus
    if (isUnlocked("cb_sharpness", player) && gdp("cb_sharpness", player)) {
        bonusDmg += 1 + Math.floor(Math.random() * 3);
    }

    // Smite: +4 vs undead
    if (isUnlocked("cb_smite", player) && gdp("cb_smite", player)) {
        const entityId = target.typeId.replace("minecraft:", "");
        if (UNDEAD_MOBS.includes(entityId)) bonusDmg += 4;
    }

    // Apply bonus damage
    if (bonusDmg > 0) {
        try { target.applyDamage(bonusDmg, { cause: "entityAttack", damagingEntity: player }); } catch {}
    }

    // Knockback: extra impulse
    if (isUnlocked("cb_knockback", player) && gdp("cb_knockback", player)) {
        try {
            const dx = target.location.x - player.location.x;
            const dz = target.location.z - player.location.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            target.applyImpulse({ x: dx / len * 0.8, y: 0.3, z: dz / len * 0.8 });
        } catch {}
    }

    // Fire Aspect: set target on fire
    if (isUnlocked("cb_fireAspect", player) && gdp("cb_fireAspect", player)) {
        try { target.setOnFire(getSetting("cb_fireDuration"), true); } catch {}
    }

    // Life Steal: heal % of total damage
    if (isUnlocked("cb_lifeSteal", player) && gdp("cb_lifeSteal", player)) {
        try {
            const totalDmg = 1 + bonusDmg;
            const pct = getSetting("cb_lifeStealPct") / 100;
            const heal = Math.ceil(totalDmg * pct);
            const health = player.getComponent("minecraft:health");
            if (health) health.setCurrentValue(Math.min(health.currentValue + heal, health.effectiveMax));
        } catch {}
    }

    // Sweeping Edge: AoE with cooldown
    if (isUnlocked("cb_sweeping", player) && gdp("cb_sweeping", player)) {
        if (canSweep(player)) {
            doSweep(player, target, 1 + bonusDmg);
        }
    }
}, 15);
