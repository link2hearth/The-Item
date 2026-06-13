import { world, system } from "@minecraft/server"
import { eventBus } from "../core/eventBus.js"

// ── Craft & Cook ──────────────────────────────────────────────────────────────
// Debout  → pose une table de craft personnelle
// Sneak   → pose un four personnel (contenu transféré via structure save/load)
// Un seul four ET une seule table par joueur : reposer l'item supprime l'ancien.
//
// Gestion des ticking areas (plafond Bedrock = 10 par monde, donc on économise) :
//   • Table : AUCUNE zone permanente. Une zone temporaire est posée sur l'ancienne
//     table le temps de la supprimer, puis retirée. (Une table ne tick pas.)
//   • Four  : une zone 9×9 chunks (81, sous le plafond 100/zone) active UNIQUEMENT
//     pendant qu'il cuit (bloc lit_furnace). Un four alimenté en continu par hoppers
//     reste allumé → garde toute l'usine tickée = chunk loader volontaire.
//     Dès qu'il s'éteint (bloc furnace), la zone est retirée → slot libéré.
//     Une zone temporaire (1 chunk) sert à supprimer l'ancien four au re-placement.
//   • Cleanup : la zone temporaire dure TANT QUE le chunk n'est pas chargé et
//     l'ancien bloc pas retiré (chunks lourds = chargement long), avec un
//     garde-fou de sécurité. Si l'emplacement n'est plus un four/table (déjà
//     cassé par un joueur) → on zappe.

const ITEM_ID = "fabmod:craft_and_cook"

// ── Propriétés dynamiques (blocs actuellement posés) ──────────────────────────
const FP_PROP_POS = "wk_furnace_pos"
const FP_PROP_DIM = "wk_furnace_dim"
const CT_PROP_POS = "wk_ct_pos"
const CT_PROP_DIM = "wk_ct_dim"

const ALL_DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]

// ── Noms de ticking areas ─────────────────────────────────────────────────────
// Four actif (cuisson) : `wkf` + id  — stable, géré par l'interval et le break.
// Cleanup / hold       : transitoires, uniques par opération (auto-retirées).
function id8FromString(id) { return (id ?? "").replace(/[^0-9]/g, "").slice(-8) }
function furnaceArea(player) { return `wkf${id8FromString(player.id)}` }

let cleanupSeq = 0
function nextCleanupArea() { return `wko${(cleanupSeq++) % 100000}` }

function structName(player) {
    return `wkf_${player.id.replace(/[^a-zA-Z0-9]/g, "")}`
}

// ── Helpers données ───────────────────────────────────────────────────────────
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

// Zone de cuisson du four : carré centré sur le chunk du four.
// Rayon 4 chunks = 9×9 = 81 chunks (plafond Bedrock = 100/zone). Un four alimenté
// en continu (hoppers) reste allumé → garde toute l'usine tickée = chunk loader.
const FURNACE_RADIUS_CHUNKS = 4

function tryTaAddArea(dim, pos, name, label, radiusChunks) {
    const cx = Math.floor(pos.x / 16)
    const cz = Math.floor(pos.z / 16)
    const minX = (cx - radiusChunks) * 16
    const minZ = (cz - radiusChunks) * 16
    const maxX = (cx + radiusChunks) * 16 + 15
    const maxZ = (cz + radiusChunks) * 16 + 15
    try {
        const res = dim.runCommand(`tickingarea add ${minX} ${pos.y} ${minZ} ${maxX} ${pos.y} ${maxZ} ${name}`)
        if (!res || res.successCount === 0) {
            console.warn(`[workstation] tickingarea add failed (${label}) name=${name} — likely at the 10-area limit`)
        }
        return res
    } catch (e) {
        console.warn(`[workstation] tickingarea add threw (${label}) name=${name}: ${e}`)
        return null
    }
}

function removeAreaAllDims(name) {
    for (const d of ALL_DIMS) {
        try { world.getDimension(d).runCommand(`tickingarea remove ${name}`) } catch {}
    }
}

// Pose une zone de tick sur `pos` et attend que le chunk soit RÉELLEMENT chargé
// (le chargement est asynchrone et peut être long sur un chunk lourd). Une fois
// le bloc lisible, exécute onLoaded(block, dim) puis retire la/les zone(s).
// Garde-fou : abandon après ~60 s si le chunk ne charge jamais (évite de fuiter
// une zone et de bloquer un slot).
function cleanupWhenLoaded(dimId, pos, onLoaded, holdAreas = []) {
    const dim  = world.getDimension(dimId)
    const area = nextCleanupArea()
    tryTaAdd(dim, pos, area, "cleanup")

    let attempts = 0
    const MAX = 240 // 240 × 5 ticks = 1200 ticks ≈ 60 s

    const finish = () => {
        cmd(dim, `tickingarea remove ${area}`)
        for (const h of holdAreas) cmd(h.dim, `tickingarea remove ${h.name}`)
    }

    const step = () => {
        attempts++
        let block
        try { block = dim.getBlock(pos) } catch { block = undefined }

        if (!block) {
            // Chunk pas encore chargé → on patiente (zone maintenue active).
            if (attempts >= MAX) {
                console.warn(`[workstation] cleanup abandonné : chunk jamais chargé à ${pos.x},${pos.y},${pos.z}`)
                finish()
                return
            }
            system.runTimeout(step, 5)
            return
        }

        try { onLoaded(block, dim) } catch (e) { console.warn(`[workstation] cleanup onLoaded: ${e}`) }
        finish()
    }

    system.runTimeout(step, 5)
}

// ── Placement ─────────────────────────────────────────────────────────────────

const cooldownFurnace = new Map()
const cooldownTable   = new Map()
const pendingItem     = new Map()
const furnaceArmed    = new Set() // ids des joueurs dont la zone four (cuisson) est active

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

            if (isSneaking) placeFurnace(player, currentDim, placedPos)
            else            placeTable(player, currentDim, placedPos)
        } catch {}
    })
})

function placeFurnace(player, currentDim, placedPos) {
    if (!isFurnace(currentDim.getBlock(placedPos))) return
    const newPos = placedPos
    const facing = getPlayerFacing(player)

    const oldData = getFpData(player)
    if (oldData && oldData.dimId === currentDim.id &&
        oldData.pos.x === newPos.x && oldData.pos.y === newPos.y && oldData.pos.z === newPos.z) return

    // Orienter tout de suite le nouveau four (vide pour l'instant)
    const nb = currentDim.getBlock(newPos)
    if (nb) nb.setPermutation(nb.permutation.withState("minecraft:cardinal_direction", facing))

    // Sauver la nouvelle position AVANT le nettoyage async
    saveFpData(player, newPos, currentDim.id)
    player.playSound("use.stone")

    // Premier four : rien à transférer. L'interval armera la zone s'il chauffe.
    if (!oldData) return

    // Transférer le contenu de l'ancien four → nouveau, puis supprimer l'ancien.
    // On garde le NOUVEAU chunk chargé (hold area) le temps du transfert, car le
    // chunk de l'ancien peut être long à charger.
    const sName    = structName(player)
    const holdArea = nextCleanupArea()
    tryTaAdd(currentDim, newPos, holdArea, "hold-new")

    cleanupWhenLoaded(oldData.dimId, oldData.pos, (oldBlock, oldDim) => {
        if (!isFurnace(oldBlock)) return // ancien four déjà retiré → rien à faire
        const { pos } = oldData
        cmd(oldDim, `structure save ${sName} ${pos.x} ${pos.y} ${pos.z} ${pos.x} ${pos.y} ${pos.z} false disk true`)
        cmd(oldDim, `setblock ${pos.x} ${pos.y} ${pos.z} air`)

        // Restaurer le contenu sur le nouveau four (chunk maintenu par holdArea)
        cmd(currentDim, `structure load ${sName} ${newPos.x} ${newPos.y} ${newPos.z}`)
        const b = currentDim.getBlock(newPos)
        if (b) {
            b.setPermutation(b.permutation.withState("minecraft:cardinal_direction", facing))
            // Si le four restauré est déjà allumé, armer sa zone tout de suite
            // (sinon il figerait hors de portée avant le prochain check d'interval).
            if (b.typeId === "minecraft:lit_furnace") {
                tryTaAddArea(currentDim, newPos, furnaceArea(player), "furnace-lit", FURNACE_RADIUS_CHUNKS)
                furnaceArmed.add(player.id)
            }
        }
    }, [{ dim: currentDim, name: holdArea }])
}

function placeTable(player, currentDim, placedPos) {
    // block_placer a posé un four → on le remplace par une table de craft
    if (!isFurnace(currentDim.getBlock(placedPos))) return
    cmd(currentDim, `setblock ${placedPos.x} ${placedPos.y} ${placedPos.z} minecraft:crafting_table`)
    if (currentDim.getBlock(placedPos)?.typeId !== "minecraft:crafting_table") return
    const newPos = placedPos

    const oldData = getCtData(player)
    if (oldData && oldData.dimId === currentDim.id &&
        oldData.pos.x === newPos.x && oldData.pos.y === newPos.y && oldData.pos.z === newPos.z) return

    saveCtData(player, newPos, currentDim.id)
    player.playSound("use.wood")

    if (!oldData) return

    // Supprimer l'ancienne table (zone temporaire jusqu'à chargement du chunk)
    cleanupWhenLoaded(oldData.dimId, oldData.pos, (oldBlock, oldDim) => {
        if (oldBlock.typeId !== "minecraft:crafting_table") return // déjà retirée
        const { pos } = oldData
        cmd(oldDim, `setblock ${pos.x} ${pos.y} ${pos.z} air`)
    })
}

// ── Gestion de la cuisson à distance (arme/désarme la zone selon l'état) ───────
// Toutes les ~20 ticks (1 s) : si le four d'un joueur est allumé (lit_furnace),
// on garde sa zone active pour qu'il continue à cuire hors de portée ; dès qu'il
// est éteint (furnace), on retire la zone → le slot est libéré.
eventBus.interval(() => {
    for (const player of world.getAllPlayers()) {
        const data = getFpData(player)
        if (!data) { furnaceArmed.delete(player.id); continue }

        let block
        try { block = world.getDimension(data.dimId).getBlock(data.pos) } catch { block = undefined }
        if (!block) continue // chunk non chargé → four inerte, rien à faire

        const dim  = world.getDimension(data.dimId)
        const area = furnaceArea(player)

        if (block.typeId === "minecraft:lit_furnace") {
            if (!furnaceArmed.has(player.id)) {
                tryTaAddArea(dim, data.pos, area, "furnace-lit", FURNACE_RADIUS_CHUNKS)
                furnaceArmed.add(player.id)
            }
        } else if (block.typeId === "minecraft:furnace") {
            // Éteint = a fini de cuire → libérer la zone
            if (furnaceArmed.has(player.id)) {
                cmd(dim, `tickingarea remove ${area}`)
                furnaceArmed.delete(player.id)
            }
        } else {
            // Plus un four (cassé/remplacé hors break-event) → nettoyer la référence
            cmd(dim, `tickingarea remove ${area}`)
            furnaceArmed.delete(player.id)
            saveFpData(player, null, null)
        }
    }
}, 20)

// ── Destruction manuelle ──────────────────────────────────────────────────────

function removeDrop(dim, pos, typeId) {
    system.run(() => {
        try {
            for (const item of dim.getEntities({ type: "minecraft:item", location: pos, maxDistance: 2 })) {
                if (item.getComponent("minecraft:item")?.itemStack?.typeId === typeId) {
                    item.remove()
                }
            }
        } catch {}
    })
}

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
            cmd(dim, `tickingarea remove ${furnaceArea(player)}`)
            furnaceArmed.delete(player.id)
            saveFpData(player, null, null)
            removeDrop(dim, pos, "minecraft:furnace")
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
            saveCtData(player, null, null)
            removeDrop(dim, pos, "minecraft:crafting_table")
        }
    } catch {}
})

// Joueur déconnecté : libérer son slot de cuisson (inutile de cuire pour un
// propriétaire absent). On garde la position sauvegardée pour son retour.
eventBus.after("playerLeave", (ev) => {
    const digits = id8FromString(ev.playerId)
    if (digits) removeAreaAllDims(`wkf${digits}`)
    furnaceArmed.delete(ev.playerId)
})
