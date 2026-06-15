import { world, system, ItemStack } from "@minecraft/server"
import { gdp, sdp, t, saveBackLocation } from "../core/utils.js"
import { dimensionNames } from "../core/data.js"
import { eventBus } from "../core/eventBus.js"
import { openMenu } from "../menus/router.js"
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui"

// ── Chunk helpers ───────────────────────────────────────────────────────────

function getChunkKey(pos, dimId) {
    return `${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)},${dimId}`;
}

function getChunkCoords(pos) {
    return { cx: Math.floor(pos.x / 16), cz: Math.floor(pos.z / 16) };
}

export function loadClaims() {
    const raw = world.getDynamicProperty("chunkClaims");
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

export function saveClaims(claims) {
    world.setDynamicProperty("chunkClaims", JSON.stringify(claims));
}

// True si le bloc (x,z) de la dimension dimId est dans un chunk revendiqué.
// `claims` peut être passé pour éviter de re-parser le JSON à chaque appel.
export function isChunkClaimed(x, z, dimId, claims = loadClaims()) {
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)},${dimId}`;
    return claims[key] !== undefined;
}

export function getMaxChunks() {
    return world.getDynamicProperty("maxChunksPerPlayer") ?? 50;
}

export function getChunkCostCap() {
    return world.getDynamicProperty("chunkCostCap") ?? 30;
}

function countPlayerClaims(claims, playerName) {
    let count = 0;
    for (const key in claims) { if (claims[key].owner === playerName) count++; }
    return count;
}

function getChunkCost(claimedCount) {
    return Math.min(claimedCount + 1, getChunkCostCap());
}

function getPlayTimeTicks(player) {
    return gdp("playTimeTicks", player) ?? 0;
}

function getTimeSlots(player) {
    const ticks = getPlayTimeTicks(player);
    if (ticks < 12000) return 0;
    return Math.floor(ticks / 24000);
}

// ── Chunk protection ────────────────────────────────────────────────────────

eventBus.before("playerBreakBlock", (ev) => {
    const claims = loadClaims();
    const key = getChunkKey(ev.block.location, ev.player.dimension.id);
    const claim = claims[key];
    if (!claim) return;
    if (claim.owner === ev.player.name) return;
    if (claim.trusted && claim.trusted.includes(ev.player.name)) return;
    if (ev.player.hasTag("is_admin")) return;
    ev.cancel = true;
    const playerRef = ev.player;
    system.run(() => playerRef.sendMessage(t("fabmod.msg.chunk_protected")));
}, 10);

eventBus.after("playerPlaceBlock", (ev) => {
    const claims = loadClaims();
    const key = getChunkKey(ev.block.location, ev.player.dimension.id);
    const claim = claims[key];
    if (!claim) return;
    if (claim.owner === ev.player.name) return;
    if (claim.trusted && claim.trusted.includes(ev.player.name)) return;
    if (ev.player.hasTag("is_admin")) return;

    const blockTypeId = ev.block.typeId;
    ev.block.setType("minecraft:air");
    try {
        const item = new ItemStack(blockTypeId, 1);
        ev.player.getComponent("minecraft:inventory")?.container?.addItem(item);
    } catch {}
    ev.player.sendMessage(t("fabmod.msg.chunk_protected"));
}, 10);

eventBus.before("playerInteractWithBlock", (ev) => {
    const interactable = ["chest", "barrel", "hopper", "dropper", "dispenser",
        "furnace", "blast_furnace", "smoker", "brewing_stand", "shulker_box",
        "trapped_chest", "lectern", "anvil", "grindstone", "cartography_table",
        "loom", "stonecutter", "smithing_table"];
    const blockId = ev.block.typeId.replace("minecraft:", "");
    if (!interactable.some(b => blockId.includes(b))) return;

    const claims = loadClaims();
    const key = getChunkKey(ev.block.location, ev.player.dimension.id);
    const claim = claims[key];
    if (!claim) return;
    if (claim.owner === ev.player.name) return;
    if (claim.trusted && claim.trusted.includes(ev.player.name)) return;
    if (ev.player.hasTag("is_admin")) return;
    ev.cancel = true;
    const playerRef = ev.player;
    system.run(() => playerRef.sendMessage(t("fabmod.msg.chunk_protected")));
}, 10);

// ── Chunk visualization ─────────────────────────────────────────────────────

const CHUNK_PARTICLE_PRIORITY = { "fabmod:chunk_wall_green": 3, "fabmod:chunk_wall_blue": 2, "fabmod:chunk_wall_red": 1, "fabmod:chunk_wall_white": 0 };

function getChunkParticle(claims, cx, cz, dimId, playerName) {
    const key = `${cx},${cz},${dimId}`;
    const claim = claims[key];
    if (!claim) return "fabmod:chunk_wall_white";
    if (claim.owner === playerName) return "fabmod:chunk_wall_green";
    if (claim.trusted && claim.trusted.includes(playerName)) return "fabmod:chunk_wall_blue";
    return "fabmod:chunk_wall_red";
}

eventBus.interval(() => {
    for (const player of world.getPlayers()) {
        if (!player.hasTag("chunk_viz")) continue;

        const claims = loadClaims();
        const { cx, cz } = getChunkCoords(player.location);
        const dimId = player.dimension.id;
        const playerY = Math.floor(player.location.y);
        const pName = player.name;

        for (let dx = -1; dx <= 2; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const leftP  = (dx > -1) ? getChunkParticle(claims, cx + dx - 1, cz + dz, dimId, pName) : "fabmod:chunk_wall_white";
                const rightP = (dx < 2)  ? getChunkParticle(claims, cx + dx, cz + dz, dimId, pName) : "fabmod:chunk_wall_white";
                const particle = CHUNK_PARTICLE_PRIORITY[leftP] >= CHUNK_PARTICLE_PRIORITY[rightP] ? leftP : rightP;

                const lineX = (cx + dx) * 16;
                const baseZ = (cz + dz) * 16;
                for (let i = 0; i <= 15; i += 2) {
                    for (let y = playerY - 9; y <= playerY + 18; y += 3) {
                        try { player.runCommand(`particle ${particle} ${lineX} ${y} ${baseZ + i}`); } catch {}
                    }
                }
            }
        }

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 2; dz++) {
                const topP    = (dz > -1) ? getChunkParticle(claims, cx + dx, cz + dz - 1, dimId, pName) : "fabmod:chunk_wall_white";
                const bottomP = (dz < 2)  ? getChunkParticle(claims, cx + dx, cz + dz, dimId, pName) : "fabmod:chunk_wall_white";
                const particle = CHUNK_PARTICLE_PRIORITY[topP] >= CHUNK_PARTICLE_PRIORITY[bottomP] ? topP : bottomP;

                const lineX = (cx + dx) * 16;
                const lineZ = (cz + dz) * 16;
                for (let i = 0; i <= 15; i += 2) {
                    for (let y = playerY - 9; y <= playerY + 18; y += 3) {
                        try { player.runCommand(`particle ${particle} ${lineX + i} ${y} ${lineZ}`); } catch {}
                    }
                }
            }
        }
    }
}, 30);

// ── Ticking area preview ────────────────────────────────────────────────────

eventBus.interval(() => {
    for (const player of world.getPlayers()) {
        if (!player.hasTag("ticking_preview")) continue;
        const cx = gdp("tickPreviewCx", player);
        const cz = gdp("tickPreviewCz", player);
        const size = gdp("tickPreviewSize", player) ?? 1;
        const dimId = gdp("tickPreviewDim", player);
        if (cx === undefined || cz === undefined) continue;
        if (player.dimension.id !== dimId) continue;

        const half = Math.floor(size / 2);
        const minX = (cx - half) * 16;
        const minZ = (cz - half) * 16;
        const maxX = (cx + half) * 16 + 16;
        const maxZ = (cz + half) * 16 + 16;
        const playerY = Math.floor(player.location.y);
        const particle = "fabmod:chunk_wall_white";

        for (let x = minX; x <= maxX; x += 2) {
            for (let y = playerY - 9; y <= playerY + 18; y += 3) {
                try { player.runCommand(`particle ${particle} ${x} ${y} ${minZ}`); } catch {}
                try { player.runCommand(`particle ${particle} ${x} ${y} ${maxZ}`); } catch {}
            }
        }
        for (let z = minZ; z <= maxZ; z += 2) {
            for (let y = playerY - 9; y <= playerY + 18; y += 3) {
                try { player.runCommand(`particle ${particle} ${minX} ${y} ${z}`); } catch {}
                try { player.runCommand(`particle ${particle} ${maxX} ${y} ${z}`); } catch {}
            }
        }
    }
}, 30);

// ── Chunks Menu ─────────────────────────────────────────────────────────────

export function chunksMenu(player) {
    const claims = loadClaims();
    const owned = countPlayerClaims(claims, player.name);
    const maxChunks = getMaxChunks();
    const timeSlots = getTimeSlots(player);
    const cost = getChunkCost(owned);

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.chunks"));
    form.button(t("fabmod.ui.btn.my_claims"));
    form.button({ rawtext: [{ text: "§a§o" }, { translate: "fabmod.ui.btn.claim_this_chunk" }, { text: "\n§e§o" }, { translate: "fabmod.ui.btn.chunk_cost", with: [String(cost)] }] });
    form.button(t("fabmod.ui.btn.unclaim_chunk"));
    form.button(t("fabmod.ui.btn.trust_player"));
    form.button({ rawtext: [{ text: "§6§o" }, { translate: "fabmod.ui.btn.chunk_credits", with: [String(owned), String(Math.min(timeSlots, maxChunks)), String(maxChunks)] }] });
    form.button(t(player.hasTag("chunk_viz") ? "fabmod.ui.btn.chunk_viz_on" : "fabmod.ui.btn.chunk_viz_off"));
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0: myClaimsMenu(player); break;
            case 1: claimChunk(player); break;
            case 2: unclaimMenu(player); break;
            case 3: trustMenu(player); break;
            case 4: break;
            case 5:
                if (player.hasTag("chunk_viz")) {
                    player.removeTag("chunk_viz");
                    player.sendMessage(t("fabmod.msg.chunk_viz_off"));
                } else {
                    player.addTag("chunk_viz");
                    player.sendMessage(t("fabmod.msg.chunk_viz_on"));
                }
                break;
            case 6: openMenu("command", player); break;
        }
    });
}

function claimChunk(player) {
    const claims = loadClaims();
    const key = getChunkKey(player.location, player.dimension.id);
    const owned = countPlayerClaims(claims, player.name);
    const maxChunks = getMaxChunks();
    const timeSlots = getTimeSlots(player);

    if (claims[key]) {
        if (claims[key].owner === player.name) player.sendMessage(t("fabmod.msg.chunk_already_yours"));
        else player.sendMessage(t("fabmod.msg.chunk_already_claimed", claims[key].owner));
        return;
    }
    if (owned >= maxChunks) { player.sendMessage(t("fabmod.msg.chunk_max_reached")); return; }
    if (owned >= timeSlots) {
        const playTicks = getPlayTimeTicks(player);
        if (playTicks < 12000) player.sendMessage(t("fabmod.msg.chunk_play_first_night"));
        else player.sendMessage(t("fabmod.msg.chunk_play_more"));
        return;
    }

    const cost = getChunkCost(owned);
    if (player.level < cost) { player.sendMessage(t("fabmod.msg.chunk_not_enough_xp", String(cost), String(player.level))); return; }

    const { cx, cz } = getChunkCoords(player.location);
    new MessageFormData()
        .title(t("fabmod.ui.title.claim_chunk"))
        .body({ rawtext: [{ translate: "fabmod.ui.body.claim_confirm", with: [String(cx), String(cz), String(cost), String(player.level), String(owned), String(Math.min(timeSlots, maxChunks))] }] })
        .button1(t("fabmod.ui.btn.claim"))
        .button2(t("fabmod.ui.btn.cancel"))
        .show(player).then(res => {
            if (res.canceled || res.selection === 1) return;
            player.addLevels(-cost);
            const freshClaims = loadClaims();
            freshClaims[key] = { owner: player.name, trusted: [] };
            saveClaims(freshClaims);
            player.sendMessage(t("fabmod.msg.chunk_claimed", String(cx), String(cz)));
            player.playSound("random.levelup");
        });
}

function myClaimsMenu(player) {
    const claims = loadClaims();
    const myClaims = [];
    for (const key in claims) {
        if (claims[key].owner !== player.name) continue;
        const parts = key.split(",");
        const dimName = dimensionNames[parts[2]] ?? parts[2];
        myClaims.push({ key, cx: parts[0], cz: parts[1], dim: dimName, dimId: parts[2] });
    }

    if (myClaims.length === 0) { player.sendMessage(t("fabmod.msg.chunk_no_claims")); chunksMenu(player); return; }

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.my_claims"));
    for (const c of myClaims) form.button(`§b§o[${c.cx}, ${c.cz}]\n§7§o${c.dim}`);
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === myClaims.length) { chunksMenu(player); return; }

        const selected = myClaims[res.selection];
        const tpX = parseInt(selected.cx) * 16 + 8;
        const tpZ = parseInt(selected.cz) * 16 + 8;

        saveBackLocation(player);
        player.teleport({ x: tpX, y: 100, z: tpZ }, { dimension: world.getDimension(selected.dimId) });
        player.addEffect("slow_falling", 120, { amplifier: 0, showParticles: false });
        player.sendMessage(t("fabmod.msg.chunk_tp", selected.cx, selected.cz));
    });
}

function unclaimMenu(player) {
    const claims = loadClaims();
    const myClaims = [];
    for (const key in claims) {
        if (claims[key].owner !== player.name) continue;
        const parts = key.split(",");
        const dimName = dimensionNames[parts[2]] ?? parts[2];
        myClaims.push({ key, cx: parts[0], cz: parts[1], dim: dimName });
    }

    if (myClaims.length === 0) { player.sendMessage(t("fabmod.msg.chunk_no_claims")); chunksMenu(player); return; }

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.unclaim_chunk"));
    for (const c of myClaims) form.button(`§c§o[${c.cx}, ${c.cz}]\n§7§o${c.dim}`);
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === myClaims.length) { chunksMenu(player); return; }

        const selected = myClaims[res.selection];
        new MessageFormData()
            .title(t("fabmod.ui.title.unclaim_confirm"))
            .body({ rawtext: [{ translate: "fabmod.ui.body.unclaim_confirm_player", with: [selected.cx, selected.cz] }] })
            .button1(t("fabmod.ui.btn.unclaim_btn"))
            .button2(t("fabmod.ui.btn.cancel"))
            .show(player).then(r => {
                if (r.canceled || r.selection === 1) return;
                const freshClaims = loadClaims();
                delete freshClaims[selected.key];
                saveClaims(freshClaims);
                player.sendMessage(t("fabmod.msg.chunk_unclaimed", selected.cx, selected.cz));
            });
    });
}

function trustMenu(player) {
    const claims = loadClaims();
    const key = getChunkKey(player.location, player.dimension.id);
    const claim = claims[key];

    if (!claim || claim.owner !== player.name) { player.sendMessage(t("fabmod.msg.chunk_not_yours")); return; }

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.trust_untrust"));

    const trusted = claim.trusted ?? [];
    const players = world.getPlayers().filter(p => p.name !== player.name);

    if (players.length === 0 && trusted.length === 0) { player.sendMessage(t("fabmod.msg.chunk_no_players")); return; }

    const buttons = [];
    for (const name of trusted) {
        buttons.push({ name, action: "untrust" });
        form.button({ rawtext: [{ text: `§a§o${name}` }, { text: "\n§7§o" }, { translate: "fabmod.ui.btn.trusted_click_remove" }] });
    }
    for (const p of players) {
        if (trusted.includes(p.name)) continue;
        buttons.push({ name: p.name, action: "trust" });
        form.button({ rawtext: [{ text: `§e§o${p.name}` }, { text: "\n§o" }, { translate: "fabmod.ui.btn.click_to_trust" }] });
    }
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === buttons.length) { chunksMenu(player); return; }

        const btn = buttons[res.selection];
        const freshClaims = loadClaims();
        const freshClaim = freshClaims[key];
        if (!freshClaim) return;

        if (btn.action === "trust") {
            if (!freshClaim.trusted) freshClaim.trusted = [];
            freshClaim.trusted.push(btn.name);
            saveClaims(freshClaims);
            player.sendMessage(t("fabmod.msg.chunk_trusted", btn.name));
        } else {
            freshClaim.trusted = (freshClaim.trusted ?? []).filter(n => n !== btn.name);
            saveClaims(freshClaims);
            player.sendMessage(t("fabmod.msg.chunk_untrusted", btn.name));
        }
    });
}
