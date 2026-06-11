import { world, system, EquipmentSlot } from "@minecraft/server"
import { gdp } from "../core/utils.js"
import { isUnlocked, isTheItem, getDamageTier } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"

// ── Bullet Shot (hitscan) ─────────────────────────────────────────────────────
// Swing The Item in the air (no entity/block in melee range) → instant raycast.
// Hits entity → damage. Hits block → dynlight9 at impact for 3 seconds + sparks.

const BULLET_RANGE_DEFAULT = 30;   // default range when no pref saved
const BULLET_RANGE_MAX     = 128;  // hard cap
const IMPACT_LIGHT_TICKS   = 60;   // dynlight duration at impact (3 s)

// Cooldown per player: Map<playerId, lastFireTick>
const cooldowns = new Map();

const FACE_OFFSET = {
    up:    { x: 0, y: 1,  z: 0  },
    down:  { x: 0, y: -1, z: 0  },
    north: { x: 0, y: 0,  z: -1 },
    south: { x: 0, y: 0,  z: 1  },
    east:  { x: 1, y: 0,  z: 0  },
    west:  { x: -1, y: 0, z: 0  },
};

// ── Fire ──────────────────────────────────────────────────────────────────────

function fireBullet(player) {
    const range  = Math.min(gdp("p_bullet_range", player) ?? BULLET_RANGE_DEFAULT, BULLET_RANGE_MAX);
    const eyePos = {
        x: player.location.x,
        y: player.location.y + 1.62,
        z: player.location.z,
    };
    const dim    = player.dimension;
    const damage = 1 + getDamageTier(player);

    // ── Entity hit ────────────────────────────────────────────────────────────
    try {
        const hits = player.getEntitiesFromViewDirection({ maxDistance: range });
        const target = hits.find(h =>
            h.entity.typeId !== "minecraft:player" &&
            h.entity.typeId !== "minecraft:item"
        )?.entity;

        if (target?.isValid) {
            try { dim.spawnParticle("minecraft:basic_crit_particle", target.location); } catch {}
            try { target.applyDamage(damage, { cause: "entityAttack", damagingEntity: player }); } catch {}
            return;
        }
    } catch {}

    // ── Block hit ─────────────────────────────────────────────────────────────
    try {
        const blockHit = player.getBlockFromViewDirection({
            maxDistance: range,
            includePassableBlocks: false,
            includeLiquidBlocks: false,
        });

        if (blockHit) {
            const face   = (blockHit.face ?? "up").toLowerCase();
            const offset = FACE_OFFSET[face] ?? { x: 0, y: 1, z: 0 };
            const bloc   = blockHit.block;

            const impactPos = {
                x: bloc.location.x + offset.x + 0.5,
                y: bloc.location.y + offset.y + 0.5,
                z: bloc.location.z + offset.z + 0.5,
            };

            try { dim.spawnParticle("minecraft:lava_particle", impactPos); } catch {}

            // Dynlight at impact face, removed after IMPACT_LIGHT_TICKS
            const lx = Math.floor(bloc.location.x + offset.x);
            const ly = Math.floor(bloc.location.y + offset.y);
            const lz = Math.floor(bloc.location.z + offset.z);
            try { player.runCommand(`execute positioned ${lx} ${ly + 1} ${lz} run function dynlight9`); } catch {}
            system.runTimeout(() => {
                if (!player.isValid) return;
                try { player.runCommand(`execute positioned ${lx} ${ly + 1} ${lz} run function dynlight_off`); } catch {}
            }, IMPACT_LIGHT_TICKS);
            return;
        }
    } catch {}
}

// ── Swing → fire ──────────────────────────────────────────────────────────────

eventBus.after("playerSwingStart", (ev) => {
    const player = ev.player;
    if (!isUnlocked("fireballShot", player)) return;
    if (!(gdp("fireballShot", player) ?? false)) return;

    // 15-tick cooldown (~0.75 s)
    const lastFire = cooldowns.get(player.id) ?? 0;
    if (system.currentTick - lastFire < 15) return;

    const mainhand = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    if (!isTheItem(mainhand?.typeId)) return;

    // Abort if a hittable entity is in melee range (normal attack)
    try {
        const hits = player.getEntitiesFromViewDirection({ maxDistance: 6 });
        if (hits.some(h =>
            h.entity.typeId !== "minecraft:player" &&
            h.entity.typeId !== "minecraft:item"
        )) return;
    } catch { return; }

    // Abort if a block is in mining range
    try {
        if (player.getBlockFromViewDirection({ maxDistance: 4 })) return;
    } catch {}

    cooldowns.set(player.id, system.currentTick);
    fireBullet(player);
});
