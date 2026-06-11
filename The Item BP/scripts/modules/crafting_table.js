import { world, system } from "@minecraft/server"
import { eventBus } from "../core/eventBus.js"

// ── Crafting Table Personnelle ────────────────────────────────────────────────
// Le placement est géré nativement par minecraft:block_placer dans l'item JSON.
// Ce script gère uniquement : rappel de l'ancienne table, ticking area, position sauvegardée.

const ITEM_ID  = "fabmod:crafting_table_perso"
const PROP_POS = "ct_perso_pos"
const PROP_DIM = "ct_perso_dim"

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

function taName(player) {
    const id = player.id.replace(/[^0-9]/g, "")
    return `ct${id.slice(-8)}`
}

function cmd(dim, command) {
    try { return dim.runCommand(command) } catch { return null }
}

// ── Événements ───────────────────────────────────────────────────────────────

const ctCooldown    = new Map()
const ctPendingItem = new Map()

// Capturer l'item et la position exacte AVANT que block_placer les traite
eventBus.before("playerInteractWithBlock", (ev) => {
    if (ev.itemStack?.typeId !== ITEM_ID) return
    const off = FACE_OFFSET[ev.blockFace] ?? { x: 0, y: 0, z: 0 }
    const loc = ev.block.location
    ctPendingItem.set(ev.player.id, {
        itemStack: ev.itemStack,
        placedPos: { x: loc.x + off.x, y: loc.y + off.y, z: loc.z + off.z }
    })
})

// Après que Minecraft a posé le bloc via block_placer
eventBus.after("playerInteractWithBlock", (ev) => {
    const pending = ctPendingItem.get(ev.player.id)
    if (!pending) return
    ctPendingItem.delete(ev.player.id)
    const { itemStack, placedPos } = pending

    const now  = system.currentTick
    const last = ctCooldown.get(ev.player.id) ?? -20
    if (now - last < 10) return
    ctCooldown.set(ev.player.id, now)

    const player     = ev.player
    const currentDim = player.dimension

    system.run(() => {
        try {
            // Remettre l'item si consommé (mode survie) — toujours, avant tout return
            const inv = player.getComponent("minecraft:inventory")?.container
            if (inv) {
                const slot = player.selectedSlotIndex
                const current = inv.getItem(slot)
                if (!current || current.typeId !== ITEM_ID) {
                    inv.setItem(slot, itemStack)
                }
            }

            // Vérifier que le bloc posé est bien une crafting table à la position exacte
            if (currentDim.getBlock(placedPos)?.typeId !== "minecraft:crafting_table") return
            const newPos = placedPos

            const oldData = getSavedData(player)
            if (oldData && oldData.dimId === currentDim.id &&
                oldData.pos.x === newPos.x && oldData.pos.y === newPos.y && oldData.pos.z === newPos.z) return

            const ta = taName(player)

            // Supprimer l'ancienne table
            if (oldData) {
                try {
                    const oldDim = world.getDimension(oldData.dimId)
                    const { pos } = oldData
                    if (oldDim.getBlock(pos)?.typeId === "minecraft:crafting_table") {
                        cmd(oldDim, `setblock ${pos.x} ${pos.y} ${pos.z} air`)
                    }
                    cmd(oldDim, `tickingarea remove ${ta}`)
                } catch {}
            }

            cmd(currentDim, `tickingarea remove ${ta}`)
            cmd(currentDim, `tickingarea add ${newPos.x} ${newPos.y} ${newPos.z} ${newPos.x} ${newPos.y} ${newPos.z} ${ta}`)
            saveData(player, newPos, currentDim.id)
            player.playSound("use.wood")
        } catch {}
    })
})

// Si le joueur brise sa table manuellement → nettoyer la référence
eventBus.after("playerBreakBlock", (ev) => {
    try {
        if (!ev.brokenBlockPermutation.matches("minecraft:crafting_table")) return

        const player  = ev.player
        const oldData = getSavedData(player)
        if (!oldData) return

        const loc = ev.block.location
        const { pos } = oldData
        if (pos.x === Math.floor(loc.x) && pos.y === Math.floor(loc.y) && pos.z === Math.floor(loc.z)) {
            const dim = player.dimension
            cmd(dim, `tickingarea remove ${taName(player)}`)
            saveData(player, null, null)
            // Supprimer le drop "crafting table" pour éviter la duplication
            system.run(() => {
                try {
                    for (const item of dim.getEntities({ type: "minecraft:item", location: pos, maxDistance: 2 })) {
                        if (item.getComponent("minecraft:item")?.itemStack?.typeId === "minecraft:crafting_table") {
                            item.remove()
                        }
                    }
                } catch {}
            })
        }
    } catch {}
})
