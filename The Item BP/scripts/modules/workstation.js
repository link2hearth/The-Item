import { world, system } from "@minecraft/server"
import { eventBus } from "../core/eventBus.js"

// ── Craft & Cook ──────────────────────────────────────────────────────────────
// Debout  → pose une table de craft personnelle
// Sneak   → pose un four personnel (sauvegarde état via structure)
// Les deux états sont indépendants (propriétés dynamiques séparées).
// block_placer pose toujours un four ; en debout on le remplace par setblock crafting_table.

const ITEM_ID = "fabmod:craft_and_cook"

// ── Propriétés dynamiques ─────────────────────────────────────────────────────
const FP_PROP_POS = "wk_furnace_pos"
const FP_PROP_DIM = "wk_furnace_dim"
const CT_PROP_POS = "wk_ct_pos"
const CT_PROP_DIM = "wk_ct_dim"

// ── Helpers ───────────────────────────────────────────────────────────────────

function structName(player) {
    return `wkf_${player.id.replace(/[^a-zA-Z0-9]/g, "")}`
}

function fpTaName(player) {
    const id = player.id.replace(/[^0-9]/g, "")
    return `wkf${id.slice(-8)}`
}

function ctTaName(player) {
    const id = player.id.replace(/[^0-9]/g, "")
    return `wkc${id.slice(-8)}`
}

function getFpData(player) {
    const rawPos = player.getDynamicProperty(FP_PROP_POS)
    const dimId  = player.getDynamicProperty(FP_PROP_DIM)
    if (!rawPos || !dimId) return null
    try { return { pos: JSON.parse(rawPos), dimId } } catch { return null }
}

function saveFpData(player, pos, dimId) {
    player.setDynamicProperty(FP_PROP_POS, pos ? JSON.stringify(pos) : undefined)
    player.setDynamicProperty(FP_PROP_DIM, dimId ?? undefined)
}

function getCtData(player) {
    const rawPos = player.getDynamicProperty(CT_PROP_POS)
    const dimId  = player.getDynamicProperty(CT_PROP_DIM)
    if (!rawPos || !dimId) return null
    try { return { pos: JSON.parse(rawPos), dimId } } catch { return null }
}

function saveCtData(player, pos, dimId) {
    player.setDynamicProperty(CT_PROP_POS, pos ? JSON.stringify(pos) : undefined)
    player.setDynamicProperty(CT_PROP_DIM, dimId ?? undefined)
}

const FACE_OFFSET = {
    Up:    { x:  0, y:  1, z:  0 },
    Down:  { x:  0, y: -1, z:  0 },
    North: { x:  0, y:  0, z: -1 },
    South: { x:  0, y:  0, z:  1 },
    East:  { x:  1, y:  0, z:  0 },
    West:  { x: -1, y:  0, z:  0 },
}

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

function tryTaAdd(dim, pos, name, label) {
    try {
        const res = dim.runCommand(`tickingarea add ${pos.x} ${pos.y} ${pos.z} ${pos.x} ${pos.y} ${pos.z} ${name}`)
        if (!res || res.successCount === 0) {
            console.warn(`[workstation] tickingarea add failed (${label}) name=${name} at ${pos.x},${pos.y},${pos.z} — likely at the 10-area limit`)
        }
        return res
    } catch (e) {
        console.warn(`[workstation] tickingarea add threw (${label}) name=${name}: ${e}`)
        return null
    }
}

// ── Placement ─────────────────────────────────────────────────────────────────

const cooldownFurnace = new Map()
const cooldownTable   = new Map()
const pendingItem     = new Map()

// Capturer position, sneak et itemStack AVANT que block_placer agisse
eventBus.before("playerInteractWithBlock", (ev) => {
    if (ev.itemStack?.typeId !== ITEM_ID) return
    const off = FACE_OFFSET[ev.blockFace] ?? { x: 0, y: 0, z: 0 }
    const loc = ev.block.location
    pendingItem.set(ev.player.id, {
        itemStack:  ev.itemStack,
        placedPos:  { x: loc.x + off.x, y: loc.y + off.y, z: loc.z + off.z },
        isSneaking: ev.player.isSneaking,
    })
})

eventBus.after("playerInteractWithBlock", (ev) => {
    const pending = pendingItem.get(ev.player.id)
    if (!pending) return
    pendingItem.delete(ev.player.id)
    const { itemStack, placedPos, isSneaking } = pending

    const now  = system.currentTick
    const cd   = isSneaking ? cooldownFurnace : cooldownTable
    const last = cd.get(ev.player.id) ?? -20
    if (now - last < 10) return
    cd.set(ev.player.id, now)

    const player     = ev.player
    const currentDim = player.dimension

    system.run(() => {
        try {
            // Remettre l'item si consommé (mode survie) — toujours, avant tout return
            const inv = player.getComponent("minecraft:inventory")?.container
            if (inv) {
                const slot    = player.selectedSlotIndex
                const current = inv.getItem(slot)
                if (!current || current.typeId !== ITEM_ID) {
                    inv.setItem(slot, itemStack)
                }
            }

            if (isSneaking) {
                // ── Sneak → Four ──────────────────────────────────────────────
                if (!isFurnace(currentDim.getBlock(placedPos))) return
                const newPos = placedPos

                const oldData = getFpData(player)
                if (oldData && oldData.dimId === currentDim.id &&
                    oldData.pos.x === newPos.x && oldData.pos.y === newPos.y && oldData.pos.z === newPos.z) return

                const sName = structName(player)
                const ta    = fpTaName(player)

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

                if (oldData) {
                    cmd(currentDim, `structure load ${sName} ${newPos.x} ${newPos.y} ${newPos.z}`)
                }

                const furnaceBlock = currentDim.getBlock(newPos)
                if (furnaceBlock) {
                    furnaceBlock.setPermutation(furnaceBlock.permutation.withState("minecraft:cardinal_direction", getPlayerFacing(player)))
                }

                cmd(currentDim, `tickingarea remove ${ta}`)
                tryTaAdd(currentDim, newPos, ta, "furnace")
                saveFpData(player, newPos, currentDim.id)
                player.playSound("use.stone")

            } else {
                // ── Debout → Table de craft ───────────────────────────────────
                // Vérifier que block_placer a bien posé un four avant de le remplacer
                if (!isFurnace(currentDim.getBlock(placedPos))) return
                cmd(currentDim, `setblock ${placedPos.x} ${placedPos.y} ${placedPos.z} minecraft:crafting_table`)

                if (currentDim.getBlock(placedPos)?.typeId !== "minecraft:crafting_table") return
                const newPos = placedPos

                const oldData = getCtData(player)
                if (oldData && oldData.dimId === currentDim.id &&
                    oldData.pos.x === newPos.x && oldData.pos.y === newPos.y && oldData.pos.z === newPos.z) return

                const ta = ctTaName(player)

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
                tryTaAdd(currentDim, newPos, ta, "table")
                saveCtData(player, newPos, currentDim.id)
                player.playSound("use.wood")
            }
        } catch {}
    })
})

// ── Destruction ───────────────────────────────────────────────────────────────

eventBus.after("playerBreakBlock", (ev) => {
    try {
        const perm = ev.brokenBlockPermutation

        if (perm.matches("minecraft:furnace") || perm.matches("minecraft:lit_furnace")) {
            const player  = ev.player
            const oldData = getFpData(player)
            if (!oldData) return

            const loc = ev.block.location
            const { pos } = oldData
            if (pos.x !== Math.floor(loc.x) || pos.y !== Math.floor(loc.y) || pos.z !== Math.floor(loc.z)) return

            const dim = player.dimension
            cmd(dim, `tickingarea remove ${fpTaName(player)}`)
            saveFpData(player, null, null)
            system.run(() => {
                try {
                    for (const item of dim.getEntities({ type: "minecraft:item", location: pos, maxDistance: 2 })) {
                        if (item.getComponent("minecraft:item")?.itemStack?.typeId === "minecraft:furnace") {
                            item.remove()
                        }
                    }
                } catch {}
            })
            return
        }

        if (perm.matches("minecraft:crafting_table")) {
            const player  = ev.player
            const oldData = getCtData(player)
            if (!oldData) return

            const loc = ev.block.location
            const { pos } = oldData
            if (pos.x !== Math.floor(loc.x) || pos.y !== Math.floor(loc.y) || pos.z !== Math.floor(loc.z)) return

            const dim = player.dimension
            cmd(dim, `tickingarea remove ${ctTaName(player)}`)
            saveCtData(player, null, null)
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
