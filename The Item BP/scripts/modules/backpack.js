import { world, system, EquipmentSlot, ItemStack, BlockPermutation } from "@minecraft/server"
import { gdp, sdp, spawnEntityAnywhere, spawnItemAnywhere, portalNearby, generateRandomID } from "../core/utils.js"
import { isUnlocked, backpackIDs, backpackData, unallowedItems, BACKPACK_TIERS, BACKPACK_PLACEHOLDER_ID, getBackpackTier, isTheItem } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { getSetting } from "../core/settings.js"

// Retourne l'entité backpack d'un joueur avec le tag donné, dans sa dimension actuelle
function findBpForPlayer(player, tag) {
    const entities = player.dimension.getEntities({ tags: [tag] })
    return entities.find(e => e.getDynamicProperty("playerID") === player.id) ?? null
}

// Ajoute un item dans les slots usables du backpack (0 à tierSlots-1), retourne true si ajouté
function addItemToBpSlots(container, itemStack, tierSlots) {
    // Stack sur items existants
    for (let i = 0; i < tierSlots; i++) {
        const slot = container.getItem(i)
        if (!slot || slot.typeId !== itemStack.typeId) continue
        if (slot.amount >= slot.maxAmount) continue
        const space = slot.maxAmount - slot.amount
        if (space >= itemStack.amount) {
            slot.amount += itemStack.amount
            container.setItem(i, slot)
            return true
        }
    }
    // Slot vide
    for (let i = 0; i < tierSlots; i++) {
        if (!container.getItem(i)) {
            container.setItem(i, itemStack)
            return true
        }
    }
    return false
}

// ── Inventory helpers ───────────────────────────────────────────────────────

function transferInventory(container1, container2, dimension, fromInvLocation, FromInvStartingSlot, ToInvStartingSlot, maxSlot) {
    let itemSlotNum = FromInvStartingSlot
    for (let i = 0; i < container1.size; i++) {
        if (itemSlotNum < maxSlot) {
            const item = container1.getItem(itemSlotNum)
            if (item != undefined) {
                if (!unallowedItems.includes(item.typeId)) {
                    container2.setItem(i + ToInvStartingSlot, item)
                } else {
                    spawnItemAnywhere(item, fromInvLocation, dimension)
                    container1.setItem(i + FromInvStartingSlot, undefined)
                }
            }
            itemSlotNum++
        }
    }
}

function emptyInventory(container) {
    for (let i = 0; i < container.size; i++) container.setItem(i, undefined)
}

function fillBackpackPlaceholders(entity, maxSlot, player) {
    const inv = entity.getComponent("minecraft:inventory").container
    // maxSlot est le slot corbeille — on laisse vide, on remplit à partir de maxSlot+1
    for (let i = maxSlot + 1; i < 99; i++) {
        const existing = inv.getItem(i)
        if (existing && existing.typeId !== BACKPACK_PLACEHOLDER_ID) {
            try { spawnItemAnywhere(existing, player.location, player.dimension) } catch {}
        }
        inv.setItem(i, new ItemStack(BACKPACK_PLACEHOLDER_ID, 1))
    }
}

function clearBackpackPlaceholders(entity) {
    const inv = entity.getComponent("minecraft:inventory").container
    for (let i = 0; i < 99; i++) {
        const item = inv.getItem(i)
        if (item && item.typeId === BACKPACK_PLACEHOLDER_ID) {
            inv.setItem(i, undefined)
        }
    }
}

// ── Save / Load ─────────────────────────────────────────────────────────────

// Y de travail par dimension — on utilise le bedrock sol/plafond
const BARREL_Y_OW     = -64   // Sol bedrock Overworld
const BARREL_Y_NETHER = 127   // Plafond bedrock Nether
const BARREL_Y_OTHER  = 250   // End / autres : ciel (colonne verticale)

// Décalages du carré 2×2 pour Overworld & Nether
const SQUARE_OFFSETS = [
    { dx: 0, dz: 0 },
    { dx: 1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 1, dz: 1 },
]

// Config de la dimension : Y de travail, mode carré, si on doit restaurer le bedrock
function dimCfg(dim) {
    switch (dim.id) {
        case "minecraft:overworld": return { y: BARREL_Y_OW,     square: true,  bedrock: true  }
        case "minecraft:nether":    return { y: BARREL_Y_NETHER, square: true,  bedrock: true  }
        default:                    return { y: BARREL_Y_OTHER,  square: false, bedrock: false }
    }
}

// Retourne {bx, by, bz} pour le barrel b selon la config et le X de workspace
function barrelPos(cfg, wx, baseZ, b) {
    if (cfg.square) {
        const { dx, dz } = SQUARE_OFFSETS[b]
        return { bx: wx + dx, by: cfg.y, bz: baseZ + dz }
    }
    return { bx: wx, by: cfg.y + b, bz: baseZ }
}

// Cherche un X libre (pas de barrel aux positions cibles), décale de 5 si occupé
function findFreeWorkspace(dim, baseX, baseZ, cfg, count) {
    for (let shift = 0; shift < 20; shift++) {
        const wx = baseX + shift * 5
        const free = Array.from({ length: count }, (_, b) => b).every(b => {
            try {
                const { bx, by, bz } = barrelPos(cfg, wx, baseZ, b)
                return dim.getBlock({ x: bx, y: by, z: bz })?.typeId !== "minecraft:barrel"
            } catch { return true }
        })
        if (free) return wx
    }
    return baseX
}

export function saveBackpack(entity) {
    try {
        clearBackpackPlaceholders(entity)
        // Vider le slot corbeille avant la sauvegarde
        const _te = Object.entries(BACKPACK_TIERS).find(([, v]) => v.entityId === entity.typeId)
        if (_te) try { entity.getComponent("minecraft:inventory").container.setItem(BACKPACK_TIERS[_te[0]].slots, undefined) } catch {}
        const dim = entity.dimension
        const entityLoc = entity.location
        const id = entity.getDynamicProperty("backpack_id")
        const maxCount = backpackData[entity.typeId].count
        const entityInv = entity.getComponent("minecraft:inventory").container
        const cfg = dimCfg(dim)
        const baseX = Math.floor(entityLoc.x)
        const baseZ = Math.floor(entityLoc.z)
        const wx = cfg.square ? findFreeWorkspace(dim, baseX, baseZ, cfg, maxCount) : baseX

        for (let b = 0; b < maxCount; b++) {
            const { bx, by, bz } = barrelPos(cfg, wx, baseZ, b)
            const block = dim.getBlock({ x: bx, y: by, z: bz })
            const savedPerm = cfg.bedrock ? block?.permutation : null
            try {
                if (cfg.bedrock) dim.runCommand(`setblock ${bx} ${by} ${bz} air`)
                block.setPermutation(BlockPermutation.resolve("barrel"))
                const blockInv = block.getComponent("minecraft:inventory").container
                const srcStart = b * 27
                transferInventory(entityInv, blockInv, dim, entityLoc, srcStart, 0, srcStart + 27)
                const suffix = b === 0 ? "" : `_${b + 1}`
                dim.runCommand(`structure save backpack${id}${suffix} ${bx} ${by} ${bz} ${bx} ${by} ${bz} false disk true`)
                try { emptyInventory(blockInv) } catch {}
            } catch {} finally {
                try {
                    if (cfg.bedrock && savedPerm) block.setPermutation(savedPerm)
                    else dim.runCommand(`setblock ${bx} ${by} ${bz} air`)
                } catch {}
            }
        }
    } catch {}
    try { entity.remove() } catch {}
}

function loadBackpack(entityTypeID, player, backpackId, tierSlots) {
    const dim = player.dimension
    const id = backpackId
    const maxCount = backpackData[entityTypeID].count
    const cfg = dimCfg(dim)
    const baseX = Math.floor(player.location.x)
    const baseZ = Math.floor(player.location.z)
    const wx = cfg.square ? findFreeWorkspace(dim, baseX, baseZ, cfg, maxCount) : baseX
    let backPack = undefined
    try {
        const blocks = []
        const lastPerms = []

        for (let b = maxCount - 1; b >= 0; b--) {
            const { bx, by, bz } = barrelPos(cfg, wx, baseZ, b)
            const block = dim.getBlock({ x: bx, y: by, z: bz })
            const lastBlock = block.permutation
            if (cfg.bedrock) dim.runCommand(`setblock ${bx} ${by} ${bz} air`)
            const suffix = b === 0 ? "" : `_${b + 1}`
            if (dim.runCommand(`structure load backpack${id}${suffix} ${bx} ${by} ${bz}`).successCount < 1) {
                block.setPermutation(BlockPermutation.resolve("barrel"))
                dim.runCommand(`structure save backpack${id}${suffix} ${bx} ${by} ${bz} ${bx} ${by} ${bz} false disk true`)
            }
            dim.runCommand(`structure load backpack${id}${suffix} ${bx} ${by} ${bz}`)
            blocks[b] = block
            lastPerms[b] = lastBlock
        }

        const viewDir = player.getViewDirection()
        const headLoc = player.getHeadLocation()
        backPack = spawnEntityAnywhere(entityTypeID, { x: headLoc.x + viewDir.x, y: headLoc.y + viewDir.y, z: headLoc.z + viewDir.z }, dim)
        const entityInv = backPack.getComponent("minecraft:inventory").container

        for (let b = maxCount - 1; b >= 0; b--) {
            const block = blocks[b]
            const blockInv = block.getComponent("minecraft:inventory").container
            const destStart = b * 27
            transferInventory(blockInv, entityInv, dim, block.location, 0, destStart, 27)
            emptyInventory(blockInv)
            dim.runCommand(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air`)
            block.setPermutation(lastPerms[b])
        }

        backPack.setDynamicProperty("backpack_id", id)
        backPack.setDynamicProperty("playerID", player.id)
        fillBackpackPlaceholders(backPack, tierSlots, player)
        return backPack
    } catch {
        for (let b = 0; b < maxCount; b++) {
            try {
                const { bx, by, bz } = barrelPos(cfg, wx, baseZ, b)
                const block = dim.getBlock({ x: bx, y: by, z: bz })
                if (block?.typeId === "minecraft:barrel") {
                    try { emptyInventory(block.getComponent("minecraft:inventory").container) } catch {}
                    dim.runCommand(`setblock ${bx} ${by} ${bz} air`)
                    if (cfg.bedrock) try { block.setPermutation(BlockPermutation.resolve("bedrock")) } catch {}
                }
            } catch {}
        }
        if (backPack) try { backPack.remove() } catch {}
        return undefined
    }
}

// ── Backpack spawn (every 5 ticks) ──────────────────────────────────────────

eventBus.interval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const equip = player.getComponent("equippable")
            const mainhand = equip?.getEquipment(EquipmentSlot.Mainhand)
            const holdingMenu = isTheItem(mainhand?.typeId)
            const unlocked = isUnlocked("backpackEnabled", player)

            if (holdingMenu && unlocked && player.isSneaking && !player.hasTag("backpack_active")) {
                if (!portalNearby(player)) {
                    let id = player.getDynamicProperty("cheatBackpackId")
                    if (id == undefined) {
                        id = "cheat_" + generateRandomID(20)
                        player.setDynamicProperty("cheatBackpackId", id)
                    }
                    const tier = getBackpackTier(player)
                    const tierInfo = BACKPACK_TIERS[tier]
                    // Sauvegarder tout backpack existant (hover ou autre) avant d'ouvrir le cheat
                    const existing = player.dimension.getEntities({ families: ["backpack"] })
                    for (const bp of existing) {
                        if (bp.getDynamicProperty("playerID") === player.id) saveBackpack(bp)
                    }
                    const backpack = loadBackpack(tierInfo.entityId, player, id, tierInfo.slots)
                    if (backpack) {
                        backpack.nameTag = "\u00A7" + tier
                        backpack.addTag("cheat_backpack")
                        player.addTag("backpack_active")
                        player.playSound("open.chest")
                    }
                }
            }

        } catch {}
    }
}, 5);

// ── Backpack follow + close detection (every tick) ──────────────────────────

eventBus.interval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const headLoc = player.getHeadLocation()
            const viewDir = player.getViewDirection()
            const target = { x: headLoc.x + viewDir.x * 0.1, y: headLoc.y + viewDir.y * 0.1, z: headLoc.z + viewDir.z * 0.1 }

            if (player.hasTag("backpack_active")) {
                const entity = findBpForPlayer(player, "cheat_backpack")
                if (entity) {
                    entity.teleport(target)
                    // Vider le slot corbeille si un item y a été déposé
                    const trashSlot = BACKPACK_TIERS[getBackpackTier(player)]?.slots
                    const bpInv = entity.getComponent("minecraft:inventory")?.container
                    if (trashSlot !== undefined && bpInv?.getItem(trashSlot)) bpInv.setItem(trashSlot, undefined)
                    const equip = player.getComponent("equippable")
                    const mainhand = equip?.getEquipment(EquipmentSlot.Mainhand)
                    if (!player.isSneaking || !isTheItem(mainhand?.typeId)) {
                        saveBackpack(entity)
                        player.removeTag("backpack_active")
                        player.playSound("close.chest")
                    }
                } else {
                    player.removeTag("backpack_active")
                }
                continue
            }

            // Hover backpack : sous les pieds, inaccessible quelle que soit la direction
            const hoverBp = findBpForPlayer(player, "hover_backpack")
            if (!hoverBp) continue
            const vd = player.getViewDirection()
            let dodgeX = 0, dodgeZ = 0
            if (vd.y < -0.3) {
                const hLen = Math.sqrt(vd.x * vd.x + vd.z * vd.z)
                dodgeX = hLen > 0.1 ? -(vd.x / hLen) * 0.2 : 0.2
                dodgeZ = hLen > 0.1 ? -(vd.z / hLen) * 0.2 : 0
            }
            hoverBp.teleport({ x: player.location.x + dodgeX, y: player.location.y - 1, z: player.location.z + dodgeZ })
            if (!isUnlocked("backpackHover", player) || !gdp("backpackHover", player)) {
                saveBackpack(hoverBp)
            }
        } catch {}
    }
}, 1);

// ── Orphan cleanup (every 60 ticks) ─────────────────────────────────────────

const bpDims = ["overworld", "nether", "the_end"].map(id => { try { return world.getDimension(id) } catch { return null } }).filter(d => d != null);

eventBus.interval(() => {
    for (const dim of bpDims) {
        try {
            // Backpacks interactifs orphelins
            for (const backpack of dim.getEntities({ tags: ["cheat_backpack"] })) {
                const playerId = backpack.getDynamicProperty("playerID")
                if (playerId == undefined) { try { backpack.remove() } catch {}; continue }
                const owner = world.getEntity(playerId)
                if (owner == undefined || !owner.hasTag("backpack_active")) saveBackpack(backpack)
            }
            // Backpacks hover orphelins
            for (const backpack of dim.getEntities({ tags: ["hover_backpack"] })) {
                const playerId = backpack.getDynamicProperty("playerID")
                if (playerId == undefined) { try { backpack.remove() } catch {}; continue }
                const owner = world.getEntity(playerId)
                if (owner == undefined) { saveBackpack(backpack); continue }
                if (!isUnlocked("backpackHover", owner) || !gdp("backpackHover", owner)) saveBackpack(backpack)
            }
        } catch {}
    }
}, 60);

// ── Barrel cleanup (every 100 ticks) ─────────────────────────────────────────
// Nettoie les barrels orphelins dans la zone de travail du joueur

eventBus.interval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const dim = player.dimension
            const cfg = dimCfg(dim)
            const bx = Math.floor(player.location.x)
            const bz = Math.floor(player.location.z)

            if (cfg.square) {
                // Scan le carré 2×2 et les 4 décalages de collision possibles (shift 0-3 × 5)
                for (let shift = 0; shift < 4; shift++) {
                    const wx = bx + shift * 5
                    for (const { dx, dz } of SQUARE_OFFSETS) {
                        try {
                            const block = dim.getBlock({ x: wx + dx, y: cfg.y, z: bz + dz })
                            if (block?.typeId === "minecraft:barrel") {
                                try { emptyInventory(block.getComponent("minecraft:inventory").container) } catch {}
                                dim.runCommand(`setblock ${wx + dx} ${cfg.y} ${bz + dz} air`)
                                if (cfg.bedrock) try { block.setPermutation(BlockPermutation.resolve("bedrock")) } catch {}
                            }
                        } catch {}
                    }
                }
            } else {
                for (let b = 0; b < 4; b++) {
                    try {
                        const by = cfg.y + b
                        const block = dim.getBlock({ x: bx, y: by, z: bz })
                        if (block?.typeId === "minecraft:barrel") {
                            try { emptyInventory(block.getComponent("minecraft:inventory").container) } catch {}
                            dim.runCommand(`setblock ${bx} ${by} ${bz} air`)
                        }
                    } catch {}
                }
            }
        } catch {}
    }
}, 100);

// ── Backpack Hover — spawn/vacuum/despawn (every 10 ticks) ───────────────────
// Spawn quand l'inventaire est plein, despawn quand il y a de la place.

eventBus.interval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            if (!isUnlocked("backpackHover", player) || !gdp("backpackHover", player)) continue
            if (player.hasTag("backpack_active")) continue

            const playerInv = player.getComponent("minecraft:inventory")?.container
            if (!playerInv) continue

            let full = true
            for (let i = 0; i < playerInv.size; i++) {
                if (!playerInv.getItem(i)) { full = false; break }
            }

            const hoverBp = findBpForPlayer(player, "hover_backpack")

            // Inventaire pas plein → despawn si l'entité existe
            if (!full) {
                if (hoverBp) saveBackpack(hoverBp)
                continue
            }

            // Inventaire plein → spawn si l'entité n'existe pas encore
            if (!hoverBp) {
                let id = player.getDynamicProperty("cheatBackpackId")
                if (id == undefined) {
                    id = "cheat_" + generateRandomID(20)
                    player.setDynamicProperty("cheatBackpackId", id)
                }
                const tier = getBackpackTier(player)
                const tierInfo = BACKPACK_TIERS[tier]
                const bp = loadBackpack("fabmod:backpack_hover", player, id, tierInfo.slots)
                if (bp) {
                    bp.nameTag = "\u00A7" + tier
                    bp.addTag("hover_backpack")
                }
                continue
            }

            // Vacuum : aspirer les items au sol proches
            const bpInv = hoverBp.getComponent("minecraft:inventory")?.container
            if (!bpInv) continue

            const tier = getBackpackTier(player)
            const tierSlots = BACKPACK_TIERS[tier].slots
            const radius = (isUnlocked("magnet", player) && gdp("magnet", player))
                ? Math.min(gdp("p_magnet_radius", player) ?? getSetting("magnet_radius"), getSetting("magnet_radius"))
                : 2

            const items = player.dimension.getEntities({ type: "minecraft:item", location: player.location, maxDistance: radius })
            for (const itemEntity of items) {
                try {
                    const comp = itemEntity.getComponent("minecraft:item")
                    if (!comp) continue
                    const stack = comp.itemStack
                    if (unallowedItems.includes(stack.typeId)) continue
                    if (addItemToBpSlots(bpInv, stack, tierSlots)) itemEntity.remove()
                } catch {}
            }
        } catch {}
    }
}, 10);

// ── Backpack — accès restreint au propriétaire ───────────────────────────────

eventBus.before("playerInteractWithEntity", (ev) => {
    const entity = ev.target;
    if (!entity.hasTag("cheat_backpack") && !entity.hasTag("hover_backpack")) return;
    if (entity.hasTag("hover_backpack")) { ev.cancel = true; return; }
    if (entity.getDynamicProperty("playerID") !== ev.player.id) ev.cancel = true;
});

// ── Backpack Hover — sauvegarde à la mort du joueur ──────────────────────────

eventBus.after("entityDie", (ev) => {
    if (ev.deadEntity.typeId !== "minecraft:player") return;
    const hoverBp = findBpForPlayer(ev.deadEntity, "hover_backpack");
    if (hoverBp) saveBackpack(hoverBp);
});

// ── Backpack Hover — sauvegarde périodique (every 200 ticks) ─────────────────

eventBus.interval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            if (!isUnlocked("backpackHover", player) || !gdp("backpackHover", player)) continue
            if (player.hasTag("backpack_active")) continue

            const hoverBp = findBpForPlayer(player, "hover_backpack")
            if (!hoverBp) continue

            const id = player.getDynamicProperty("cheatBackpackId")
            if (!id) continue

            saveBackpack(hoverBp)
            const tier = getBackpackTier(player)
            const tierInfo = BACKPACK_TIERS[tier]
            const bp = loadBackpack("fabmod:backpack_hover", player, id, tierInfo.slots)
            if (bp) {
                bp.nameTag = "\u00A7" + tier
                bp.addTag("hover_backpack")
            }
        } catch {}
    }
}, 200);
