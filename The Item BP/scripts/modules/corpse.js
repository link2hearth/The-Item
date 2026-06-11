import { world, Player, system, EquipmentSlot } from "@minecraft/server"
import { gdp, t } from "../core/utils.js"
import { isUnlocked, dimensionNames } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { ActionFormData } from "@minecraft/server-ui"

// ── Inventory snapshot system ────────────────────────────────────────────────

/** @type {Map<string, { items: any[], armor: Record<string, any> }>} */
const snapshots = new Map()

/** @type {Map<string, { intervalId: number, timeoutId: number|null, hpRef: number }>} */
const scanners = new Map()

/** @type {Map<string, Array<{ location: Object, dimensionId: string, entity: Object }>>} */
const corpseMap = new Map()

function snapInventory(player) {
    try {
        const invComp = player.getComponent("minecraft:inventory")
        if (!invComp) return
        const container = invComp.container
        const items = []
        for (let i = 0; i < container.size; i++) {
            items.push(container.getItem(i) ?? null)
        }
        const eq = player.getComponent("minecraft:equippable")
        const armor = eq ? {
            head:    eq.getEquipment(EquipmentSlot.Head)    ?? null,
            chest:   eq.getEquipment(EquipmentSlot.Chest)   ?? null,
            legs:    eq.getEquipment(EquipmentSlot.Legs)    ?? null,
            feet:    eq.getEquipment(EquipmentSlot.Feet)    ?? null,
            offhand: eq.getEquipment(EquipmentSlot.Offhand) ?? null,
        } : {}
        snapshots.set(player.id, { items, armor })
    } catch (e) { console.warn("[Corpse] snapInventory error:", e) }
}

function stopScanner(playerId) {
    const s = scanners.get(playerId)
    if (!s) return
    system.clearRun(s.intervalId)
    if (s.timeoutId !== null) system.clearRun(s.timeoutId)
    scanners.delete(playerId)
}

function scheduleStopCheck(player) {
    const s = scanners.get(player.id)
    if (!s) return
    if (s.timeoutId !== null) system.clearRun(s.timeoutId)

    s.timeoutId = system.runTimeout(() => {
        const entry = scanners.get(player.id)
        if (!entry) return
        if (!player.isValid) { stopScanner(player.id); return }
        const currentHp = player.getComponent("minecraft:health")?.currentValue ?? 0
        if (currentHp > entry.hpRef) {
            stopScanner(player.id)
        }
        // Si HP pas récupérés : scan continue indéfiniment
    }, 200) // 10 secondes = 200 ticks
}

eventBus.after("entityHurt", (ev) => {
    if (!(ev.hurtEntity instanceof Player)) return
    const player = ev.hurtEntity
    if (!player.isValid) return

    const hpRef = player.getComponent("minecraft:health")?.currentValue ?? 0

    // Ne pas snapper si hp=0 : Bedrock a déjà vidé l'inventaire avant de fire cet event
    if (hpRef > 0) snapInventory(player)

    if (scanners.has(player.id)) {
        // Scanner déjà actif : reset hpRef et relance le timer 10s
        scanners.get(player.id).hpRef = hpRef
        scheduleStopCheck(player)
        return
    }

    // Démarre le scan toutes les 4 ticks
    const intervalId = system.runInterval(() => {
        if (!player.isValid) { stopScanner(player.id); return }
        const hp = player.getComponent("minecraft:health")?.currentValue ?? 0
        if (hp > 0) snapInventory(player)
    }, 4)

    scanners.set(player.id, { intervalId, timeoutId: null, hpRef })
    scheduleStopCheck(player)
})

// ── Corpse spawn on death ───────────────────────────────────────────────────

eventBus.after("entityDie", (ev) => {
    if (!(ev.deadEntity instanceof Player)) return
    try { if (world.gameRules.keepInventory) return } catch {}

    const player = ev.deadEntity
    const dim = dimensionNames[player.dimension.id] ?? "???"
    const loc = player.location

    player.sendMessage(t("fabmod.msg.death_location", dim, Math.round(loc.x), Math.round(loc.y), Math.round(loc.z)))

    if (!isUnlocked("corpse", player)) return
    if (!(gdp("corpse", player) ?? false)) return

    stopScanner(player.id)
    const snapshot = snapshots.get(player.id)
    snapshots.delete(player.id)

    try {
        const corpse = player.dimension.spawnEntity("fabmod:player_corpse", loc)
        corpse.nameTag = `${player.name}'s Corpse`
        corpse.addTag(`owner:${player.name}`)

        if (snapshot) {
            // Injection après 1 tick pour laisser l'entité s'initialiser
            system.runTimeout(() => {
                if (!corpse.isValid) return
                const container = corpse.getComponent("minecraft:inventory")?.container
                if (!container) return

                for (const item of snapshot.items) {
                    if (item) try { container.addItem(item) } catch {}
                }
                for (const item of Object.values(snapshot.armor)) {
                    if (item) try { container.addItem(item) } catch {}
                }

                // Supprime les items droppés au sol qui sont maintenant dans le corpse
                cleanGroundItems(player.dimension, loc, snapshot)
            }, 1)
        } else {
            // Fallback mort subite : collecte les items au sol et les injecte dans le corpse
            system.runTimeout(() => {
                if (!corpse.isValid) return
                const container = corpse.getComponent("minecraft:inventory")?.container
                if (!container) return
                const groundItems = player.dimension.getEntities({
                    type: "minecraft:item",
                    location: loc,
                    maxDistance: 12
                })
                for (const itemEntity of groundItems) {
                    if (!itemEntity.isValid) continue
                    const itemStack = itemEntity.getComponent("minecraft:item")?.itemStack
                    if (!itemStack) continue
                    try { container.addItem(itemStack); itemEntity.kill() } catch {}
                }
            }, 5)
        }

        const stack = corpseMap.get(player.id) ?? []
        stack.push({
            location: { x: loc.x, y: loc.y, z: loc.z },
            dimensionId: player.dimension.id,
            entity: corpse
        })
        corpseMap.set(player.id, stack)
    } catch (e) { console.warn("[Corpse] spawn error:", e) }
}, 5)

function cleanGroundItems(dimension, loc, snapshot) {
    // Compteur par typeId : combien d'unités de ce type étaient dans l'inventaire
    const typeCount = new Map()
    const allItems = [
        ...snapshot.items,
        ...Object.values(snapshot.armor)
    ].filter(Boolean)

    for (const item of allItems) {
        typeCount.set(item.typeId, (typeCount.get(item.typeId) ?? 0) + item.amount)
    }

    try {
        const groundItems = dimension.getEntities({
            type: "minecraft:item",
            location: loc,
            maxDistance: 12
        })
        for (const itemEntity of groundItems) {
            if (!itemEntity.isValid) continue
            const itemStack = itemEntity.getComponent("minecraft:item")?.itemStack
            if (!itemStack) continue
            const remaining = typeCount.get(itemStack.typeId) ?? 0
            if (remaining > 0) {
                // Ne supprime que ce qui appartient au snapshot, sans dépasser la quantité connue
                typeCount.set(itemStack.typeId, remaining - itemStack.amount)
                itemEntity.kill()
            }
        }
    } catch (e) { console.warn("[Corpse] cleanGroundItems error:", e) }
}

// ── Indicateur de cadavre (HUD custom) ──────────────────────────────────────

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

system.runInterval(() => {
    if (corpseMap.size === 0) return
    for (const player of world.getAllPlayers()) {
        const stack = corpseMap.get(player.id)
        if (!stack) continue

        // Nettoie toutes les entrées invalides ou dusted (quel que soit leur position dans le stack)
        // try/catch par entité : un proxy en cours de transformation peut lever une exception
        for (let i = stack.length - 1; i >= 0; i--) {
            try {
                const e = stack[i]
                if (!e.entity.isValid || e.entity.typeId !== "fabmod:player_corpse" || e.entity.hasTag("dusted")) stack.splice(i, 1)
            } catch { stack.splice(i, 1) }
        }

        // Plus aucun corpse : efface l'indicateur
        if (stack.length === 0) {
            corpseMap.delete(player.id)
            try {
                player.onScreenDisplay.setTitle("", {
                    fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 0
                })
            } catch {}
            continue
        }

        // Indicateur désactivé par le joueur
        if (!(gdp("p_corpse_indicator", player) ?? true)) continue

        const pos = gdp("p_corpse_indicator_pos", player) ?? "bc"
        const data = stack[stack.length - 1] // corpse le plus récent encore présent

        // Joueur dans une autre dimension
        if (player.dimension.id !== data.dimensionId) {
            const dimName = dimensionNames[data.dimensionId] ?? data.dimensionId
            try {
                player.onScreenDisplay.setTitle(`_ti:${pos}`, {
                    subtitle: `§r§r§r§c§l☠\n§7§l${dimName}`,
                    fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 0
                })
            } catch {}
            continue
        }

        try {
            const pLoc = player.location
            const cLoc = data.location
            const dx = cLoc.x - pLoc.x
            const dz = cLoc.z - pLoc.z
            const distance = Math.round(Math.sqrt(dx * dx + dz * dz))

            // Bearing Minecraft (0=Sud, 90=Ouest, 180=Nord, 270=Est)
            const mcBearing = Math.atan2(-dx, dz) * (180 / Math.PI)
            const relAngle = ((mcBearing - player.getRotation().y) % 360 + 360) % 360
            const arrow = ARROWS[Math.round(relAngle / 45) % 8]

            player.onScreenDisplay.setTitle(`_ti:${pos}`, {
                subtitle: `§r§r§r§c§l☠ §r§l${arrow}\n§e§l${distance < 1 ? "<1" : distance}m`,
                fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 0
            })
        } catch {}
    }
}, 10)

// ── Nettoyage déconnexion joueur ─────────────────────────────────────────────

world.afterEvents.playerLeave.subscribe((ev) => {
    stopScanner(ev.playerId)
    snapshots.delete(ev.playerId)
    // corpseMap gardé : le corpse reste dans le monde
})

// ── Interaction corpse (lock propriétaire) ───────────────────────────────────

eventBus.after("entityHitEntity", (ev) => {
    if (!(ev.damagingEntity instanceof Player)) return
    if (ev.hitEntity.typeId !== "fabmod:player_corpse") return
    if (ev.hitEntity.hasTag("dusted")) return

    const player = ev.damagingEntity
    const corpse = ev.hitEntity

    const isAdmin = player.hasTag("is_admin")
    const isOwner = corpse.hasTag(`owner:${player.name}`)

    if (!isAdmin && !isOwner) {
        player.sendMessage(t("fabmod.msg.corpse_not_yours"))
        return
    }

    new ActionFormData()
        .title(t("fabmod.ui.title.corpse"))
        .body(t("fabmod.ui.body.corpse_open"))
        .button(t("fabmod.ui.btn.destroy_corpse"))
        .button(t("fabmod.ui.btn.leave"))
        .show(player).then((res) => {
            if (res.canceled || res.selection === 1) return
            corpse.addTag("dusted")
            corpse.triggerEvent("entity_transform")
            try { corpse.playAnimation("animation.player_corpse.despawn") } catch {}

            // Retire immédiatement le corpse de la map sans attendre l'intervalle
            // Comparaison par entity.id (les proxies Bedrock ne sont pas === entre événements)
            const corpseId = corpse.id
            for (const [pid, stack] of corpseMap) {
                const idx = stack.findIndex(e => { try { return e.entity.id === corpseId } catch { return false } })
                if (idx === -1) continue
                stack.splice(idx, 1)
                if (stack.length === 0) {
                    corpseMap.delete(pid)
                    try {
                        const owner = world.getAllPlayers().find(p => p.id === pid)
                        if (owner) owner.onScreenDisplay.setTitle("", {
                            fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 0
                        })
                    } catch {}
                }
                break
            }
        })
})
