import { world, system, EquipmentSlot, ItemStack, Player, PlayerPermissionLevel } from "@minecraft/server"
import { ActionFormData } from "@minecraft/server-ui"

// ── Dynamic Properties helpers ──────────────────────────────────────────────

export function gdp(string, who) {
    return who.getDynamicProperty(string);
}

export function sdp(string, who, data) {
    who.setDynamicProperty(string, data);
}

// ── Translation helper ──────────────────────────────────────────────────────

export function t(key, ...args) {
    if (args.length === 0) return { rawtext: [{ translate: key }] }
    return { rawtext: [{ translate: key, with: args.map(String) }] }
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function prettyName(typeId) {
    return typeId.split(":")[1].split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Math ────────────────────────────────────────────────────────────────────

export function rng(num) {
    return Math.floor(Math.random() * num);
}

// ── Player checks ───────────────────────────────────────────────────────────

export function isAdmin(player) {
    return player.hasTag("is_admin");
}

export function isOp(player) {
    return player.playerPermissionLevel === PlayerPermissionLevel.Operator;
}

// ── Effects ─────────────────────────────────────────────────────────────────

export function safeAddEffect(player, effectId, duration, amplifier) {
    try {
        const existing = player.getEffect(effectId);
        if (existing && existing.amplifier > amplifier) return;
        player.addEffect(effectId, duration, { amplifier, showParticles: false });
    } catch {}
}

// ── Spawn helpers ───────────────────────────────────────────────────────────

export function spawnEntityAnywhere(entityID, location, dimension) {
    const entity = dimension.spawnEntity(entityID, { x: location.x, y: 100, z: location.z })
    entity.teleport(location)
    return entity
}

export function spawnItemAnywhere(item, location, dimension) {
    const itemEntity = dimension.spawnItem(item, { x: location.x, y: 100, z: location.z })
    itemEntity.teleport(location)
    return itemEntity
}

// ── Ban system ──────────────────────────────────────────────────────────────

export function loadBans() {
    const raw = world.getDynamicProperty("bannedPlayers");
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

export function saveBans(bans) {
    world.setDynamicProperty("bannedPlayers", JSON.stringify(bans));
}

// ── Known players (whitelist) ────────────────────────────────────────────────

export function loadKnownPlayers() {
    const raw = world.getDynamicProperty("knownPlayers");
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

export function saveKnownPlayers(names) {
    world.setDynamicProperty("knownPlayers", JSON.stringify(names));
}

// ── Menu helper ─────────────────────────────────────────────────────────────

export function setMenu(player, stringArr, func) {
    const form = new ActionFormData();
    for (let i = 0; i < stringArr.length; ++i) {
        form.button(stringArr[i])
    }
    form.show(player).then(res => {
        if (res.canceled) return;
        func[res.selection]();
    });
}

// ── Portal detection ────────────────────────────────────────────────────────

export function portalNearby(player) {
    const { x, y, z } = player.location
    for (let cx = x + 1; cx >= x - 1; cx--) {
        for (let cy = y + 1; cy >= y; cy--) {
            for (let cz = z + 1; cz >= z - 1; cz--) {
                const block = player.dimension.getBlock({ x: cx, y: cy, z: cz })
                if (block?.typeId === "minecraft:portal" || block?.typeId === "minecraft:end_portal") return true
            }
        }
    }
    return false
}

// ── Random ID ───────────────────────────────────────────────────────────────

export function generateRandomID(length) {
    const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
    let id = ""
    for (let i = 0; i < length; i++) try { id += characters[Math.floor(Math.random() * characters.length)] } catch {}
    return id
}

// ── Teleport back location ──────────────────────────────────────────────────

export function saveBackLocation(player) {
    const loc = player.location;
    sdp("spawnBackLoc", player, JSON.stringify({ x: loc.x, y: loc.y, z: loc.z }));
    sdp("spawnBackDim", player, player.dimension.id);
}
