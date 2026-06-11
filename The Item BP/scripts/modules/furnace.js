import { world, system } from "@minecraft/server"
import { eventBus } from "../core/eventBus.js"

// ── Four Personnel (Ender Furnace) ───────────────────────────────────────────
// Le placement est géré nativement par minecraft:block_placer dans l'item JSON.
// Ce script gère : save/load de l'état du four, ticking area, position sauvegardée.

const FURNACE_ITEM_ID = "fabmod:furnace_perso"
const PROP_POS        = "furnace_perso_pos"
const PROP_DIM        = "furnace_perso_dim"

function structName(player) {
    return `fp_${player.id.replace(/[^a-zA-Z0-9]/g, "")}`
}

function taName(player) {
    const id = player.id.replace(/[^0-9]/g, "")
    return `fp${id.slice(-8)}`
}

function getSavedData(player) {
    const rawPos = player.getDynamicProperty(PROP_POS)
    const dimId  = player.getDynamicProperty(PROP_DIM)
    if (!rawPos || !dimId) return null
    try { return { pos: JSON.parse(rawPos), dimId } } catch { return null }
}

function saveData(player, pos, dimId) {
    player.setDynamicProperty(PROP_POS, pos ? JSON.stringify(pos) : undefined)
    player.setDynamicProperty(PROP_DIM, dimId ?? undefined)
}

const FACE_OFFSET = {
    Up:    { x:  0, y:  1, z:  0 },
    Down:  { x:  0, y: -1, z:  0 },
    North: { x:  0, y:  0, z: -1 },
    South: { x:  0, y:  0, z:  1 },
    East:  { x:  1, y:  0, z:  0 },
    West:  { x: -1, y:  0, z:  0 },
}

// Retourne la direction vers laquelle le four doit faire face (opposé du regard du joueur)
function getPlayerFacing(player) {
    const yaw = ((player.getRotation().y % 360) + 360) % 360
    if (yaw >= 315 || yaw < 45)  return "north"
    if (yaw >= 45  && yaw < 135) return "east"
    if (yaw >= 135 && yaw < 225) return "south"
    return "west"
}

function isFurnace(block) {
    return block?.typeId === "minecraft:furnace" || block?.typeId === "minecraft:lit_furnace"
}

function cmd(dim, command) {
    try { return dim.runCommand(command) } catch { return null }
}

// ── Événements ───────────────────────────────────────────────────────────────

const fpCooldown    = new Map()
const fpPendingItem = new Map()

// Capturer l'item et la position exacte AVANT que block_placer les traite
eventBus.before("playerInteractWithBlock", (ev) => {
    if (ev.itemStack?.typeId !== FURNACE_ITEM_ID) return
    const off = FACE_OFFSET[ev.blockFace] ?? { x: 0, y: 0, z: 0 }
    const loc = ev.block.location
    fpPendingItem.set(ev.player.id, {
        itemStack: ev.itemStack,
        placedPos: { x: loc.x + off.x, y: loc.y + off.y, z: loc.z + off.z }
    })
})

// Après que Minecraft a posé le bloc via block_placer
eventBus.after("playerInteractWithBlock", (ev) => {
    const pending = fpPendingItem.get(ev.player.id)
    if (!pending) return
    fpPendingItem.delete(ev.player.id)
    const { itemStack, placedPos } = pending

    const now  = system.currentTick
    const last = fpCooldown.get(ev.player.id) ?? -20
    if (now - last < 10) return
    fpCooldown.set(ev.player.id, now)

    const player     = ev.player
    const currentDim = player.dimension

    system.run(() => {
        try {
            // Remettre l'item si consommé (mode survie) — toujours, avant tout return
            const inv = player.getComponent("minecraft:inventory")?.container
            if (inv) {
                const slot = player.selectedSlotIndex
                const current = inv.getItem(slot)
                if (!current || current.typeId !== FURNACE_ITEM_ID) {
                    inv.setItem(slot, itemStack)
                }
            }

            // Vérifier que le bloc posé est bien un four à la position exacte
            if (!isFurnace(currentDim.getBlock(placedPos))) return
            const newPos = placedPos

            const oldData = getSavedData(player)
            if (oldData && oldData.dimId === currentDim.id &&
                oldData.pos.x === newPos.x && oldData.pos.y === newPos.y && oldData.pos.z === newPos.z) return

            const sName = structName(player)
            const ta    = taName(player)

            // Sauvegarder et supprimer l'ancien four
            if (oldData) {
                try {
                    const oldDim = world.getDimension(oldData.dimId)
                    const { pos } = oldData
                    if (isFurnace(oldDim.getBlock(pos))) {
                        cmd(oldDim, `structure save ${sName} ${pos.x} ${pos.y} ${pos.z} ${pos.x} ${pos.y} ${pos.z} false disk true`)
                        cmd(oldDim, `setblock ${pos.x} ${pos.y} ${pos.z} air`)
                    }
                    cmd(oldDim, `tickingarea remove ${ta}`)
                } catch {}
            }

            // Restaurer l'état sur le nouveau four
            if (oldData) {
                cmd(currentDim, `structure load ${sName} ${newPos.x} ${newPos.y} ${newPos.z}`)
            }

            // Orienter le four vers le joueur — APRÈS structure load pour ne pas être écrasé
            const furnaceBlock = currentDim.getBlock(newPos)
            if (furnaceBlock) {
                furnaceBlock.setPermutation(furnaceBlock.permutation.withState("minecraft:cardinal_direction", getPlayerFacing(player)))
            }

            system.runTimeout(() => {
                cmd(currentDim, `tickingarea remove ${ta}`)
                cmd(currentDim, `tickingarea add ${newPos.x} ${newPos.y} ${newPos.z} ${newPos.x} ${newPos.y} ${newPos.z} ${ta}`)
                saveData(player, newPos, currentDim.id)
                player.playSound("use.stone")
            }, 2)
        } catch {}
    })
})

// Si le joueur brise son four manuellement → nettoyer
eventBus.after("playerBreakBlock", (ev) => {
    try {
        const perm = ev.brokenBlockPermutation
        if (!perm.matches("minecraft:furnace") && !perm.matches("minecraft:lit_furnace")) return

        const player  = ev.player
        const oldData = getSavedData(player)
        if (!oldData) return

        const loc = ev.block.location
        const { pos } = oldData
        if (pos.x === Math.floor(loc.x) && pos.y === Math.floor(loc.y) && pos.z === Math.floor(loc.z)) {
            const dim = player.dimension
            cmd(dim, `tickingarea remove ${taName(player)}`)
            saveData(player, null, null)
            // Supprimer le drop "four" pour éviter la duplication
            system.run(() => {
                try {
                    for (const item of dim.getEntities({ type: "minecraft:item", location: pos, maxDistance: 2 })) {
                        if (item.getComponent("minecraft:item")?.itemStack?.typeId === "minecraft:furnace") {
                            item.remove()
                        }
                    }
                } catch {}
            })
        }
    } catch {}
})
