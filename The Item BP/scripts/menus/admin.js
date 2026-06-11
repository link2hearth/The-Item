import { world, system } from "@minecraft/server"
import { gdp, sdp, t, isOp, isAdmin, loadBans, saveBans, loadKnownPlayers, saveKnownPlayers, saveBackLocation } from "../core/utils.js"
import { dimensionNames } from "../core/data.js"
import { registerMenu, openMenu } from "./router.js"
import { getAllDefinitions, getCategories, getDefinitionsByCategory, getSetting, setSetting } from "../core/settings.js"
import { loadClaims, saveClaims, getMaxChunks, getChunkCostCap } from "../modules/chunks.js"
import { Hub, warps } from "../modules/teleport.js"
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui"

// ── Admin Main ──────────────────────────────────────────────────────────────

function adminMenu(player) {
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.admin"));
    form.button(t("fabmod.ui.btn.regular_item"));
    form.button(t("fabmod.ui.btn.chunks_admin"));
    form.button(t("fabmod.ui.btn.player_mgmt"));
    form.button(t("fabmod.ui.btn.server_settings"));
    form.button(t("fabmod.ui.btn.ticking"));
    form.button(t("fabmod.ui.btn.world_control"));
    form.button(t("fabmod.ui.btn.set_hub"));
    form.button(t("fabmod.ui.btn.waypoints_mgmt"));
    form.button(t("fabmod.ui.btn.give_structure"));

    form.show(player).then(res => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0: openMenu("command", player); break;
            case 1: adminChunksMenu(player); break;
            case 2: adminPlayerMenu(player); break;
            case 3: adminSettingsMenu(player); break;
            case 4: adminTickingMenu(player); break;
            case 5: adminWorldMenu(player); break;
            case 6: Hub(true, player); break;
            case 7: adminWaypointsMenu(player); break;
            case 8:
                try {
                    player.runCommand("give @s structure_block 1");
                    player.sendMessage(t("fabmod.msg.structure_given"));
                } catch (e) { player.sendMessage("§cError: " + e); }
                adminMenu(player);
                break;
        }
    });
}

// ── Server Config (auto-generated from settings definitions) ────────────────

function serverConfigCategory(player, category) {
    const defs = getDefinitionsByCategory(category);
    const form = new ModalFormData();
    const catKey = defs[0]?.categoryKey;
    form.title(catKey ? { rawtext: [{ text: "§5" }, { translate: catKey }] } : `§5${category}`);

    for (const def of defs) {
        const current = getSetting(def.key);
        const label = def.labelKey ? t(def.labelKey) : def.label;
        const tooltipOpt = def.tooltipKey ? { tooltip: t(def.tooltipKey) } : {};
        if (def.type === "slider") {
            form.slider(label, def.min, def.max, { valueStep: def.step ?? 1, defaultValue: current ?? def.default, ...tooltipOpt });
        } else if (def.type === "toggle") {
            form.toggle(label, { defaultValue: current ?? def.default, ...tooltipOpt });
        } else if (def.type === "dropdown") {
            const idx = (def.options ?? []).indexOf(current ?? def.default);
            form.dropdown(label, def.options ?? [], { defaultValueIndex: Math.max(0, idx), ...tooltipOpt });
        } else if (def.type === "text") {
            form.textField(label, def.placeholder ?? "", { defaultValue: String(current ?? def.default ?? ""), ...tooltipOpt });
        }
    }

    form.show(player).then(res => {
        if (res.canceled) { adminSettingsMenu(player); return; }
        for (let i = 0; i < defs.length; i++) {
            const def = defs[i];
            let value = res.formValues[i];
            if (def.type === "dropdown") value = (def.options ?? [])[value];
            setSetting(def.key, value);
        }
        const msgCatKey = defs[0]?.categoryKey;
        player.sendMessage({ rawtext: [{ translate: "fabmod.msg.settings_saved", with: { rawtext: [{ translate: msgCatKey ?? "fabmod.cfg.cat.mining" }] } }] });
        adminSettingsMenu(player);
    });
}

// ── OP Manage Admins ────────────────────────────────────────────────────────

function opManageAdmins(player) {
    const players = world.getPlayers();
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.admin_manage"));

    for (const p of players) {
        const hasTag = p.hasTag("is_admin");
        const isOpStatus = isOp(p);
        let status = hasTag ? "§a§o[ADMIN]" : "§7§o[normal]";
        if (isOpStatus) status += " §5§o[OP]";
        form.button(`§o${p.name}\n${status}`);
    }
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === players.length) { openMenu("command", player); return; }
        const target = players[res.selection];
        opToggleAdmin(player, target);
    });
}

function opToggleAdmin(player, target) {
    const hasTag = target.hasTag("is_admin");
    const form = new MessageFormData();
    form.title("§5" + target.name);

    if (hasTag) {
        form.body(t("fabmod.ui.body.remove_admin", target.name));
        form.button1(t("fabmod.ui.btn.remove_admin"));
        form.button2(t("fabmod.ui.btn.cancel"));
    } else {
        form.body(t("fabmod.ui.body.give_admin", target.name));
        form.button1(t("fabmod.ui.btn.give_admin"));
        form.button2(t("fabmod.ui.btn.cancel"));
    }

    form.show(player).then(res => {
        if (res.canceled || res.selection === 1) { opManageAdmins(player); return; }
        if (hasTag) {
            target.removeTag("is_admin");
            player.sendMessage(t("fabmod.msg.admin_tag_removed", target.name));
            target.sendMessage(t("fabmod.msg.admin_status_removed"));
        } else {
            target.addTag("is_admin");
            player.sendMessage(t("fabmod.msg.admin_tag_given", target.name));
            target.sendMessage(t("fabmod.msg.admin_tag_given", target.name));
        }
        opManageAdmins(player);
    });
}

// ── Admin Chunks ────────────────────────────────────────────────────────────

function adminChunksMenu(player) {
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.chunks_admin"));
    form.button(t("fabmod.ui.btn.view_claims"));
    form.button(t("fabmod.ui.btn.claim_server"));
    form.button(t("fabmod.ui.btn.unclaim_any"));
    form.button(t("fabmod.ui.btn.transfer_chunk"));
    form.button(t("fabmod.ui.btn.set_max_chunks", String(getMaxChunks())));
    form.button(t("fabmod.ui.btn.set_chunk_cost_cap", String(getChunkCostCap())));
    form.button(t(player.hasTag("chunk_viz") ? "fabmod.ui.btn.chunk_viz_on" : "fabmod.ui.btn.chunk_viz_off"));
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0: adminViewAllClaims(player); break;
            case 1: adminClaimServer(player); break;
            case 2: adminUnclaimAny(player); break;
            case 3: adminTransferChunk(player); break;
            case 4: adminSetMaxChunks(player); break;
            case 5: adminSetChunkCostCap(player); break;
            case 6:
                if (player.hasTag("chunk_viz")) {
                    player.removeTag("chunk_viz");
                    player.sendMessage(t("fabmod.msg.chunk_viz_off"));
                } else {
                    player.addTag("chunk_viz");
                    player.sendMessage(t("fabmod.msg.chunk_viz_on"));
                }
                adminChunksMenu(player);
                break;
            case 7: adminMenu(player); break;
        }
    });
}

function adminViewAllClaims(player) {
    const claims = loadClaims();
    const keys = Object.keys(claims);
    if (keys.length === 0) { player.sendMessage(t("fabmod.msg.admin_no_chunks")); adminChunksMenu(player); return; }

    const byOwner = {};
    for (const key of keys) {
        const owner = claims[key].owner;
        if (!byOwner[owner]) byOwner[owner] = [];
        byOwner[owner].push(key);
    }

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.all_claims"));
    const entries = [];
    for (const owner of Object.keys(byOwner)) {
        const count = byOwner[owner].length;
        const label = owner === "[SERVER]" ? "§4§o[SERVER]" : `§e§o${owner}`;
        entries.push({ owner, keys: byOwner[owner] });
        form.button(`${label}\n§7§o${count} chunk${count > 1 ? "s" : ""}`);
    }
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === entries.length) { adminChunksMenu(player); return; }
        adminViewOwnerClaims(player, entries[res.selection].owner);
    });
}

function adminViewOwnerClaims(player, ownerName) {
    const claims = loadClaims();
    const ownerClaims = [];
    for (const key in claims) {
        if (claims[key].owner !== ownerName) continue;
        const parts = key.split(",");
        const dimName = dimensionNames[parts[2]] ?? parts[2];
        const trusted = claims[key].trusted ?? [];
        ownerClaims.push({ key, cx: parts[0], cz: parts[1], dim: dimName, dimId: parts[2], trusted });
    }

    if (ownerClaims.length === 0) { adminViewAllClaims(player); return; }

    const form = new ActionFormData();
    const ownerLabel = ownerName === "[SERVER]" ? "§4[SERVER]" : ownerName;
    form.title({ rawtext: [{ translate: "fabmod.ui.title.owner_claims" }, { text: `: ${ownerLabel}` }] });
    for (const c of ownerClaims) {
        const trustedStr = c.trusted.length > 0 ? `\n§7§oTrusted: ${c.trusted.join(", ")}` : "";
        form.button(`§b§o[${c.cx}, ${c.cz}] §7§o${c.dim}${trustedStr}`);
    }
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === ownerClaims.length) { adminViewAllClaims(player); return; }
        const selected = ownerClaims[res.selection];
        const tpX = parseInt(selected.cx) * 16 + 8;
        const tpZ = parseInt(selected.cz) * 16 + 8;
        saveBackLocation(player);
        player.teleport({ x: tpX, y: 100, z: tpZ }, { dimension: world.getDimension(selected.dimId) });
        player.addEffect("slow_falling", 120, { amplifier: 0, showParticles: false });
        player.sendMessage(t("fabmod.msg.chunk_tp", selected.cx, selected.cz));
    });
}

function getChunkKey(pos, dimId) { return `${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)},${dimId}`; }
function getChunkCoords(pos) { return { cx: Math.floor(pos.x / 16), cz: Math.floor(pos.z / 16) }; }

function adminClaimServer(player) {
    const claims = loadClaims();
    const key = getChunkKey(player.location, player.dimension.id);
    const { cx, cz } = getChunkCoords(player.location);

    if (claims[key]) {
        new MessageFormData()
            .title(t("fabmod.ui.title.server_claim"))
            .body(t("fabmod.ui.body.server_claim_overwrite", String(cx), String(cz), claims[key].owner))
            .button1(t("fabmod.ui.btn.override"))
            .button2(t("fabmod.ui.btn.cancel"))
            .show(player).then(res => {
                if (res.canceled || res.selection === 1) return;
                const fresh = loadClaims();
                fresh[key] = { owner: "[SERVER]", trusted: [] };
                saveClaims(fresh);
                player.sendMessage(t("fabmod.msg.admin_server_chunk_claimed", String(cx), String(cz)));
                player.playSound("random.anvil_use");
            });
        return;
    }

    new MessageFormData()
        .title(t("fabmod.ui.title.server_claim"))
        .body(t("fabmod.ui.body.server_claim", String(cx), String(cz)))
        .button1(t("fabmod.ui.btn.claim"))
        .button2(t("fabmod.ui.btn.cancel"))
        .show(player).then(res => {
            if (res.canceled || res.selection === 1) return;
            const fresh = loadClaims();
            fresh[key] = { owner: "[SERVER]", trusted: [] };
            saveClaims(fresh);
            player.sendMessage(t("fabmod.msg.admin_server_chunk_claimed", String(cx), String(cz)));
            player.playSound("random.anvil_use");
        });
}

function adminUnclaimAny(player) {
    const claims = loadClaims();
    const keys = Object.keys(claims);
    if (keys.length === 0) { player.sendMessage(t("fabmod.msg.admin_no_chunks")); adminChunksMenu(player); return; }

    const list = [];
    for (const key of keys) {
        const parts = key.split(",");
        const dimName = dimensionNames[parts[2]] ?? parts[2];
        list.push({ key, cx: parts[0], cz: parts[1], dim: dimName, owner: claims[key].owner });
    }

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.unclaim_any"));
    for (const c of list) {
        const ownerLabel = c.owner === "[SERVER]" ? "§4§o[SERVER]" : `§e§o${c.owner}`;
        form.button(`§c§o[${c.cx}, ${c.cz}] §7§o${c.dim}\n${ownerLabel}`);
    }
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === list.length) { adminChunksMenu(player); return; }
        const selected = list[res.selection];
        new MessageFormData()
            .title(t("fabmod.ui.title.unclaim"))
            .body(t("fabmod.ui.body.unclaim_confirm", selected.cx, selected.cz, selected.owner))
            .button1(t("fabmod.ui.btn.unclaim_btn"))
            .button2(t("fabmod.ui.btn.cancel"))
            .show(player).then(r => {
                if (r.canceled || r.selection === 1) return;
                const fresh = loadClaims();
                delete fresh[selected.key];
                saveClaims(fresh);
                player.sendMessage(t("fabmod.msg.admin_chunk_unclaimed", selected.cx, selected.cz, selected.owner));
            });
    });
}

function adminTransferChunk(player) {
    const claims = loadClaims();
    const key = getChunkKey(player.location, player.dimension.id);
    const claim = claims[key];
    const { cx, cz } = getChunkCoords(player.location);

    if (!claim) { player.sendMessage(t("fabmod.msg.admin_chunk_not_claimed")); return; }

    const players = world.getPlayers();
    const names = players.map(p => p.name);
    names.unshift("[SERVER]");

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.transfer_chunk_pos", String(cx), String(cz)));
    form.body(t("fabmod.ui.body.transfer_chunk", claim.owner));
    for (const name of names) {
        const label = name === "[SERVER]" ? "§4§o[SERVER]" : `§e§o${name}`;
        form.button(label);
    }
    form.button(t("fabmod.ui.btn.cancel"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === names.length) return;
        const newOwner = names[res.selection];
        const fresh = loadClaims();
        if (!fresh[key]) return;
        fresh[key].owner = newOwner;
        saveClaims(fresh);
        player.sendMessage(t("fabmod.msg.admin_chunk_transferred", String(cx), String(cz), newOwner));
    });
}


function adminSetMaxChunks(player) {
    new ModalFormData()
        .title(t("fabmod.ui.title.max_chunks"))
        .slider(t("fabmod.ui.modal.max_chunks_slider"), 1, 200, { valueStep: 1, defaultValue: getMaxChunks(), tooltip: t("fabmod.ui.modal.max_chunks_tooltip") })
        .show(player).then(res => {
            if (res.canceled) return;
            world.setDynamicProperty("maxChunksPerPlayer", res.formValues[0]);
            player.sendMessage(t("fabmod.msg.admin_max_chunks_set", String(res.formValues[0])));
            adminChunksMenu(player);
        });
}

function adminSetChunkCostCap(player) {
    new ModalFormData()
        .title(t("fabmod.ui.title.chunk_cost_cap"))
        .slider(t("fabmod.ui.modal.chunk_cost_cap_slider"), 1, 50, { valueStep: 1, defaultValue: getChunkCostCap(), tooltip: t("fabmod.ui.modal.chunk_cost_cap_tooltip") })
        .show(player).then(res => {
            if (res.canceled) return;
            world.setDynamicProperty("chunkCostCap", res.formValues[0]);
            player.sendMessage(t("fabmod.msg.admin_chunk_cost_cap_set", String(res.formValues[0])));
            adminChunksMenu(player);
        });
}

// ── Admin Player Management ─────────────────────────────────────────────────

function adminPlayerMenu(player) {
    let pvpOn = true;
    try { pvpOn = world.gameRules.pvp; } catch {}

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.player_mgmt"));
    form.button(t(pvpOn ? "fabmod.ui.btn.pvp_on" : "fabmod.ui.btn.pvp_off"));
    form.button(t("fabmod.ui.btn.players"));
    form.button(t("fabmod.ui.btn.ban_list"));
    form.button(t("fabmod.ui.btn.world_access"));
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0:
                try {
                    player.dimension.runCommand(`gamerule pvp ${!pvpOn}`);
                    player.sendMessage(!pvpOn ? t("fabmod.msg.pvp_enabled") : t("fabmod.msg.pvp_disabled"));
                } catch (e) { player.sendMessage("§cError: " + e); }
                adminPlayerMenu(player);
                break;
            case 1: adminPlayersMenu(player); break;
            case 2: adminBanList(player); break;
            case 3: adminWorldAccessForm(player); break;
            case 4: adminMenu(player); break;
        }
    });
}

function adminPlayersMenu(player) {
    const online = world.getPlayers();
    const bans = loadBans();
    const onlineNames = new Set(online.map(p => p.name));
    const offlineKnown = loadKnownPlayers().slice().reverse()
        .filter(n => !onlineNames.has(n) && !bans.includes(n) && n !== player.name);

    const entries = [];
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.players"));

    for (const p of online) {
        const isSelf = p.name === player.name;
        entries.push({ name: p.name, online: true, ref: p, isSelf });
        form.button({ rawtext: [{ text: `§a§o${p.name}${isSelf ? " §7§o(you)" : ""}\n§7§o` }, { translate: "fabmod.lbl.online" }] });
    }
    for (const name of offlineKnown) {
        entries.push({ name, online: false, ref: null, isSelf: false });
        form.button({ rawtext: [{ text: `§8§o${name}\n§8§o` }, { translate: "fabmod.lbl.offline" }] });
    }

    if (entries.length === 0) { player.sendMessage(t("fabmod.msg.chunk_no_players")); adminPlayerMenu(player); return; }

    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === entries.length) { adminPlayerMenu(player); return; }
        const entry = entries[res.selection];
        if (entry.online) adminPlayerActionsOnline(player, entry.ref, entry.isSelf);
        else adminPlayerActionsOffline(player, entry.name);
    });
}

// targetForTp : entité Player à espionner, ou null pour rester sur place (self-spectator)
function spyForm(player, targetForTp) {
    new ModalFormData()
        .title(t("fabmod.ui.title.go_spy"))
        .slider(t("fabmod.cfg.lbl.spy_duration"), 1, 11, { valueStep: 1, defaultValue: 5, tooltip: t("fabmod.cfg.tip.spy_duration") })
        .toggle(t("fabmod.cfg.lbl.spy_return_pos"), { defaultValue: true, tooltip: t("fabmod.cfg.tip.spy_return_pos") })
        .show(player).then(r => {
            if (r.canceled) return;
            const [minutes, returnPos] = r.formValues;
            const infinite = minutes > 10;

            let prevMode = "survival";
            try { prevMode = String(player.getGameMode()); } catch {}
            const returnLoc = { x: player.location.x, y: player.location.y, z: player.location.z };
            const returnDim = player.dimension;

            try {
                saveBackLocation(player);
                player.runCommand("gamemode spectator @s");
                sdp("wasSpectator", player, true);
                if (targetForTp) {
                    player.teleport(targetForTp.location, { dimension: targetForTp.dimension });
                    player.addEffect("invisibility", 999999, { amplifier: 0, showParticles: false });
                }

                if (infinite) {
                    player.sendMessage(t("fabmod.msg.spy_started_inf"));
                    return;
                }

                player.sendMessage(t("fabmod.msg.spy_started", String(minutes)));

                const totalTicks     = minutes * 60 * 20;
                const countdownSteps = Math.min(5, Math.floor(totalTicks / 20));
                const waitTicks      = totalTicks - countdownSteps * 20;

                function doReturn() {
                    if (!player.isValid) return;
                    try {
                        player.runCommand(`gamemode ${prevMode} @s`);
                        if (prevMode !== "spectator") sdp("wasSpectator", player, undefined);
                        if (returnPos) player.teleport(returnLoc, { dimension: returnDim });
                        player.sendMessage(t("fabmod.msg.spy_ended"));
                    } catch {}
                }

                function countdown(n) {
                    if (!player.isValid) return;
                    if (n <= 0) { doReturn(); return; }
                    player.sendMessage(`§e[Spy] ${n}...`);
                    system.runTimeout(() => countdown(n - 1), 20);
                }

                system.runTimeout(() => {
                    if (!player.isValid) return;
                    countdown(countdownSteps);
                }, waitTicks);

            } catch (e) { player.sendMessage(t("fabmod.msg.ticking_error", e)); }
        });
}

function adminPlayerActionsOnline(player, target, isSelf = false) {
    const form    = new ActionFormData();
    const actions = [];
    form.title(`§o${target.name}`);

    if (!isSelf) {
        form.button(t("fabmod.ui.btn.kick_player_btn"));
        actions.push(() => {
            new MessageFormData()
                .title(t("fabmod.ui.title.kick"))
                .body(t("fabmod.ui.body.kick_confirm", target.name))
                .button1(t("fabmod.ui.btn.kick_confirm"))
                .button2(t("fabmod.ui.btn.cancel"))
                .show(player).then(r => {
                    if (r.canceled || r.selection === 1) { adminPlayerActionsOnline(player, target, isSelf); return; }
                    try { player.runCommand("kick " + JSON.stringify(target.name) + " Kicked by admin"); } catch {}
                    player.sendMessage(t("fabmod.msg.admin_kicked", target.name));
                });
        });

        form.button(t("fabmod.ui.btn.ban_player_btn"));
        actions.push(() => {
            new MessageFormData()
                .title(t("fabmod.ui.title.ban"))
                .body(t("fabmod.ui.body.ban_confirm", target.name))
                .button1(t("fabmod.ui.btn.ban_confirm"))
                .button2(t("fabmod.ui.btn.cancel"))
                .show(player).then(r => {
                    if (r.canceled || r.selection === 1) { adminPlayerActionsOnline(player, target, isSelf); return; }
                    const bans = loadBans();
                    if (!bans.includes(target.name)) { bans.push(target.name); saveBans(bans); }
                    try { player.runCommand("kick " + JSON.stringify(target.name) + " Banned from this server"); } catch {}
                    player.sendMessage(t("fabmod.msg.admin_banned", target.name));
                });
        });

        form.button(t("fabmod.ui.btn.go_spy"));
        actions.push(() => spyForm(player, target));

        form.button(t("fabmod.ui.btn.tp_to"));
        actions.push(() => {
            try {
                saveBackLocation(player);
                player.teleport(target.location, { dimension: target.dimension });
            } catch (e) { player.sendMessage(t("fabmod.msg.ticking_error", e)); }
        });
    }

    const modes  = ["survival", "creative", "adventure", "spectator"];
    const labels = ["Survival", "Creative", "Adventure", "Spectator"];
    for (let i = 0; i < modes.length; i++) {
        form.button(t(`fabmod.ui.btn.${modes[i]}`));
        const mode = modes[i], label = labels[i];

        if (isSelf && mode === "spectator") {
            actions.push(() => spyForm(player, null));
        } else {
            actions.push(() => {
                try {
                    player.dimension.runCommand(`gamemode ${mode} "${target.name}"`);
                    sdp("wasSpectator", target, mode === "spectator" ? true : undefined);
                    player.sendMessage(t("fabmod.msg.gamemode_changed", label));
                    if (!isSelf) target.sendMessage(t("fabmod.msg.gamemode_changed", label));
                } catch (e) { player.sendMessage(t("fabmod.msg.ticking_error", e)); }
            });
        }
    }

    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === actions.length) { adminPlayersMenu(player); return; }
        actions[res.selection]?.();
    });
}

function adminPlayerActionsOffline(player, name) {
    new MessageFormData()
        .title(t("fabmod.ui.title.ban"))
        .body(t("fabmod.ui.body.ban_confirm", name))
        .button1(t("fabmod.ui.btn.ban_confirm"))
        .button2(t("fabmod.ui.btn.cancel"))
        .show(player).then(r => {
            if (r.canceled || r.selection === 1) { adminPlayersMenu(player); return; }
            const bans = loadBans();
            if (!bans.includes(name)) { bans.push(name); saveBans(bans); }
            player.sendMessage(t("fabmod.msg.admin_banned", name));
        });
}

function adminBanList(player) {
    const reversed = loadBans().slice().reverse();
    if (reversed.length === 0) { player.sendMessage(t("fabmod.msg.admin_no_bans")); return; }

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.banned_players"));
    for (const name of reversed) form.button(`§c§o${name}`);
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === reversed.length) { adminPlayerMenu(player); return; }
        const name = reversed[res.selection];
        new MessageFormData()
            .title(t("fabmod.ui.title.unban"))
            .body(t("fabmod.ui.body.unban_confirm", name))
            .button1(t("fabmod.ui.btn.unban_confirm"))
            .button2(t("fabmod.ui.btn.cancel"))
            .show(player).then(r => {
                if (r.canceled || r.selection === 1) { adminBanList(player); return; }
                const freshBans = loadBans();
                const idx = freshBans.indexOf(name);
                if (idx !== -1) { freshBans.splice(idx, 1); saveBans(freshBans); player.sendMessage(t("fabmod.msg.admin_unbanned", name)); }
            });
    });
}

// ── World Access (ModalFormData) ─────────────────────────────────────────────

function adminWorldAccessForm(player) {
    const noNew    = world.getDynamicProperty("noNewPlayers")    ?? false;
    const maxEn    = world.getDynamicProperty("maxPlayersEnabled") ?? false;
    const maxVal   = Math.min(Math.max(world.getDynamicProperty("maxPlayers") ?? 20, 2), 100);

    new ModalFormData()
        .title(t("fabmod.ui.title.world_access"))
        .toggle(t("fabmod.cfg.lbl.no_new_players"),     { defaultValue: noNew,  tooltip: t("fabmod.cfg.tip.no_new_players")     })
        .toggle(t("fabmod.cfg.lbl.max_players_enabled"), { defaultValue: maxEn,   tooltip: t("fabmod.cfg.tip.max_players_enabled") })
        .slider(t("fabmod.cfg.lbl.max_players"), 2, 100, { valueStep: 1, defaultValue: maxVal, tooltip: t("fabmod.cfg.tip.max_players") })
        .show(player).then(res => {
            if (res.canceled) { adminPlayerMenu(player); return; }
            const [newNoNew, newMaxEn, newMax] = res.formValues;
            world.setDynamicProperty("noNewPlayers",      newNoNew);
            world.setDynamicProperty("maxPlayersEnabled", newMaxEn);
            world.setDynamicProperty("maxPlayers",        newMax);
            player.sendMessage(t("fabmod.msg.world_access_saved"));
            adminPlayerMenu(player);
        });
}

// ── Admin Waypoints Management ───────────────────────────────────────────────

function adminWaypointsMenu(player) {
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.waypoints_mgmt"));
    form.button(t("fabmod.ui.btn.set_waypoint"));
    form.button(t("fabmod.ui.btn.delete_waypoint"));
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === 2) { adminMenu(player); return; }
        if (res.selection === 0) { warps(true, player, false); return; }
        if (res.selection === 1) { warps(false, player, true); return; }
    });
}

// ── Admin Server Settings ───────────────────────────────────────────────────

function adminSettingsMenu(player) {
    const categories = getCategories();

    const form = new ModalFormData();
    form.title(t("fabmod.ui.title.server_settings"));
    form.label(t("fabmod.ui.modal.settings_save_reminder"));

    const fields = [];

    // Waypoints toggle
    form.toggle(t("fabmod.ui.toggle.waypoints_enabled"), { defaultValue: !!world.getDynamicProperty("warpsEnabled"), tooltip: t("fabmod.ui.modal.waypoints_enabled_tooltip") });
    fields.push({ type: "world_dp", key: "warpsEnabled" });

    // Max chunks slider
    form.slider(t("fabmod.ui.modal.max_chunks_slider"), 1, 200, { valueStep: 1, defaultValue: getMaxChunks(), tooltip: t("fabmod.ui.modal.max_chunks_tooltip") });
    fields.push({ type: "world_dp", key: "maxChunksPerPlayer" });

    // Config categories inline with section labels
    for (const cat of categories) {
        const defs = getDefinitionsByCategory(cat);
        const catKey = defs[0]?.categoryKey;
        form.label({ rawtext: [{ text: "\n§5§l" }, { translate: catKey ?? cat }] });
        for (const def of defs) {
            const current = getSetting(def.key);
            const label = def.labelKey ? t(def.labelKey) : def.label;
            const tooltipOpt = def.tooltipKey ? { tooltip: t(def.tooltipKey) } : {};
            if (def.type === "slider") {
                form.slider(label, def.min, def.max, { valueStep: def.step ?? 1, defaultValue: current ?? def.default, ...tooltipOpt });
                fields.push({ type: "setting", key: def.key });
            } else if (def.type === "toggle") {
                form.toggle(label, { defaultValue: current ?? def.default, ...tooltipOpt });
                fields.push({ type: "setting", key: def.key });
            } else if (def.type === "dropdown") {
                const idx = Math.max(0, (def.options ?? []).indexOf(current ?? def.default));
                form.dropdown(label, def.options ?? [], { defaultValueIndex: idx, ...tooltipOpt });
                fields.push({ type: "setting_dropdown", key: def.key, options: def.options ?? [] });
            } else if (def.type === "text") {
                form.textField(label, def.placeholder ?? "", { defaultValue: String(current ?? def.default ?? ""), ...tooltipOpt });
                fields.push({ type: "setting", key: def.key });
            }
        }
    }

    form.submitButton(t("fabmod.ui.btn.save"));

    form.show(player).then(res => {
        if (res.canceled) return;
        const vals = res.formValues;
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            const val = vals[i];
            if (field.type === "world_dp") {
                world.setDynamicProperty(field.key, val);
            } else if (field.type === "setting_dropdown") {
                setSetting(field.key, field.options[val]);
            } else {
                setSetting(field.key, val);
            }
        }
        player.sendMessage(t("fabmod.msg.customize_saved"));
    });
}

// ── Admin Ticking Areas ─────────────────────────────────────────────────────

function loadTickingAreas() {
    const raw = world.getDynamicProperty("tickingAreas");
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

function saveTickingAreas(areas) {
    world.setDynamicProperty("tickingAreas", JSON.stringify(areas));
}

function clearTickingPreview(player) {
    player.removeTag("ticking_preview");
    sdp("tickPreviewCx", player, undefined);
    sdp("tickPreviewCz", player, undefined);
    sdp("tickPreviewSize", player, undefined);
    sdp("tickPreviewDim", player, undefined);
}

function adminTickingMenu(player) {
    const hasPreview = player.hasTag("ticking_preview");
    const areas = loadTickingAreas();
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.ticking"));

    if (hasPreview) {
        const size = gdp("tickPreviewSize", player) ?? 1;
        form.button(t("fabmod.ui.btn.ticking_confirm_zone", String(size), String(size)));
        form.button(t("fabmod.ui.btn.remove_preview"));
        form.button(t("fabmod.ui.btn.back"));
    } else {
        form.button(t("fabmod.ui.btn.preview_new"));
        if (areas.length > 0) form.button(t("fabmod.ui.btn.remove_area"));
        form.button(t("fabmod.ui.btn.back"));
    }

    form.show(player).then(res => {
        if (res.canceled) return;
        if (hasPreview) {
            if (res.selection === 0) adminTickingConfirm(player);
            else if (res.selection === 1) { clearTickingPreview(player); player.sendMessage(t("fabmod.msg.preview_removed")); adminTickingMenu(player); }
            else adminMenu(player);
        } else {
            if (res.selection === 0) { adminTickingSizeSelect(player); return; }
            if (areas.length > 0 && res.selection === 1) { adminTickingRemove(player); return; }
            adminMenu(player);
        }
    });
}

function adminTickingSizeSelect(player) {
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.ticking_size"));
    form.button(t("fabmod.ui.btn.ticking_size_1"));
    form.button(t("fabmod.ui.btn.ticking_size_3"));
    form.button(t("fabmod.ui.btn.ticking_size_5"));
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === 3) { adminTickingMenu(player); return; }
        const sizes = [1, 3, 5];
        const size = sizes[res.selection];
        const cx = Math.floor(player.location.x / 16);
        const cz = Math.floor(player.location.z / 16);

        sdp("tickPreviewCx", player, cx);
        sdp("tickPreviewCz", player, cz);
        sdp("tickPreviewSize", player, size);
        sdp("tickPreviewDim", player, player.dimension.id);
        player.addTag("ticking_preview");

        player.sendMessage(t("fabmod.msg.ticking_preview", `${size}×${size}`));
    });
}

function adminTickingConfirm(player) {
    const form = new ModalFormData();
    form.title(t("fabmod.ui.title.ticking_confirm"));
    form.textField(t("fabmod.ui.modal.area_name"), "e.g. my_farm");

    form.show(player).then(res => {
        if (res.canceled) { adminTickingMenu(player); return; }
        const name = String(res.formValues[0]).trim().replace(/\s+/g, "_");
        if (!name) { player.sendMessage(t("fabmod.msg.ticking_invalid_name")); adminTickingConfirm(player); return; }

        const areas = loadTickingAreas();
        if (areas.find(a => a.name === name)) { player.sendMessage(t("fabmod.msg.ticking_exists", name)); adminTickingMenu(player); return; }

        const cx = gdp("tickPreviewCx", player);
        const cz = gdp("tickPreviewCz", player);
        const size = gdp("tickPreviewSize", player) ?? 1;
        const dimId = gdp("tickPreviewDim", player);
        const half = Math.floor(size / 2);
        const minX = (cx - half) * 16;
        const minZ = (cz - half) * 16;
        const maxX = (cx + half) * 16 + 15;
        const maxZ = (cz + half) * 16 + 15;

        const dim = world.getDimension(dimId ?? "minecraft:overworld");
        try {
            dim.runCommand(`tickingarea add ${minX} 0 ${minZ} ${maxX} 0 ${maxZ} ${name}`);
        } catch (e) {
            player.sendMessage(t("fabmod.msg.ticking_error", e));
            clearTickingPreview(player);
            adminTickingMenu(player);
            return;
        }
        areas.push({ name, cx, cz, size, dimId });
        saveTickingAreas(areas);
        player.sendMessage(t("fabmod.msg.ticking_added", name, `${size}×${size}`, minX, minZ));
        clearTickingPreview(player);
        adminTickingMenu(player);
    });
}

function adminTickingRemove(player) {
    const areas = loadTickingAreas();
    if (areas.length === 0) { player.sendMessage(t("fabmod.msg.ticking_none")); adminTickingMenu(player); return; }

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.remove_ticking"));
    for (const area of areas) {
        const s = area.size ?? 1;
        form.button(`§c§o${area.name}\n§7§o${s}×${s} at chunk (${area.cx}, ${area.cz})`);
    }
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === areas.length) { adminTickingMenu(player); return; }
        const area = areas[res.selection];
        const dim = world.getDimension(area.dimId ?? "minecraft:overworld");
        try { dim.runCommand(`tickingarea remove ${area.name}`); } catch {}
        const fresh = loadTickingAreas().filter(a => a.name !== area.name);
        saveTickingAreas(fresh);
        player.sendMessage(t("fabmod.msg.ticking_deleted", area.name));
        adminTickingMenu(player);
    });
}

// ── Admin World Control ─────────────────────────────────────────────────────

function adminWorldMenu(player) {
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.world_control"));
    form.button(t("fabmod.ui.btn.weather_btn"));
    form.button(t("fabmod.ui.btn.time_btn"));
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === 2) { adminMenu(player); return; }
        switch (res.selection) {
            case 0: adminWeatherMenu(player); break;
            case 1: adminTimeMenu(player); break;
        }
    });
}

function adminWeatherMenu(player) {
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.weather"));
    form.button("§e§o☀ Clear");
    form.button("§b§oRain");
    form.button("§8§o⚡ Thunder");
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === 3) { adminWorldMenu(player); return; }
        const cmds = ["weather clear", "weather rain", "weather thunder"];
        const labels = ["Clear", "Rain", "Thunder"];
        try { player.dimension.runCommand(cmds[res.selection]); player.sendMessage(t("fabmod.msg.weather_set", labels[res.selection])); }
        catch (e) { player.sendMessage(t("fabmod.msg.ticking_error", e)); }
        adminWorldMenu(player);
    });
}

function adminTimeMenu(player) {
    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.time"));
    form.button(t("fabmod.ui.btn.day"));
    form.button(t("fabmod.ui.btn.noon"));
    form.button(t("fabmod.ui.btn.night"));
    form.button(t("fabmod.ui.btn.midnight"));
    form.button(t("fabmod.ui.btn.back"));

    form.show(player).then(res => {
        if (res.canceled || res.selection === 4) { adminWorldMenu(player); return; }
        const cmds = ["time set day", "time set noon", "time set night", "time set midnight"];
        const labels = ["Day", "Noon", "Night", "Midnight"];
        try { player.dimension.runCommand(cmds[res.selection]); player.sendMessage(t("fabmod.msg.weather_set", labels[res.selection])); }
        catch (e) { player.sendMessage(t("fabmod.msg.ticking_error", e)); }
        adminWorldMenu(player);
    });
}


// ── Register all menus ──────────────────────────────────────────────────────

registerMenu("admin", adminMenu);
registerMenu("opManageAdmins", opManageAdmins);
