import { world, system } from "@minecraft/server"
import { gdp, sdp, t, setMenu, saveBackLocation } from "../core/utils.js"
import { isUnlocked } from "../core/data.js"
import { openMenu } from "../menus/router.js"
import { ActionFormData, ModalFormData } from "@minecraft/server-ui"

// ── Helpers ──────────────────────────────────────────────────────────────────

// Retourne le Y juste au-dessus de la surface via getTopmostBlock (Y=320 → bas).
// Fallback : fallbackY si le chunk n'est pas chargé ou en cas d'erreur.
function findSurface(dimension, x, z, fallbackY = 64) {
    try {
        const top = dimension.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
        if (top) return top.y + 1;
    } catch {}
    return fallbackY;
}

// Scan ascendant depuis startY : cherche 2 blocs air avec sol solide.
// Utilisé pour le Nether (pas de getTopmostBlock fiable à cause du plafond).
function findSafeY(dimension, x, startY, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    for (let i = 0; i < 30; i++) {
        try {
            const y = startY + i;
            const feet  = dimension.getBlock({ x: fx, y,     z: fz });
            const head  = dimension.getBlock({ x: fx, y: y+1, z: fz });
            const floor = dimension.getBlock({ x: fx, y: y-1, z: fz });
            if (feet && head && floor && !feet.isSolid && !head.isSolid && floor.isSolid)
                return y;
        } catch { continue; }
    }
    return startY + 1;
}

// ── Teleport ─────────────────────────────────────────────────────────────────

// Même principe que l'addon Waypoints : player.teleport() gère nativement les
// chunks non chargés — Bedrock charge le chunk et place le joueur.
//
// exactY fourni  → téléport direct aux coordonnées sauvegardées (home/hub/warp/back)
// exactY null    → getTopmostBlock pour trouver la surface (world spawn / player spawn)
function smartTeleport(player, x, z, dimension, onDone, exactY = null) {
    const fx = Math.floor(x) + 0.5;
    const fz = Math.floor(z) + 0.5;
    const isNether = dimension.id === "minecraft:nether";

    let safeY;
    if (exactY !== null) {
        safeY = exactY;
    } else if (isNether) {
        safeY = findSafeY(dimension, x, 10, z);
    } else {
        safeY = findSurface(dimension, x, z);
    }

    player.teleport({ x: fx, y: safeY, z: fz }, { dimension });
    if (onDone) onDone();
}

// ── Hub ─────────────────────────────────────────────────────────────────────

export function Hub(boolSet, player) {
    if (boolSet) {
        world.setDynamicProperty("hub", player.location);
        world.setDynamicProperty("hubDim", player.dimension.id);
        world.sendMessage(t("fabmod.msg.hub_set"));
        return;
    }

    const hubLoc = world.getDynamicProperty("hub");
    const hubDim = world.getDynamicProperty("hubDim");
    if (!hubLoc) {
        player.sendMessage(t("fabmod.msg.hub_not_set"));
        return;
    }
    smartTeleport(player, hubLoc.x, hubLoc.z, world.getDimension(hubDim),
        () => player.sendMessage(t("fabmod.msg.hub_tp")), hubLoc.y);
}

// ── Home ────────────────────────────────────────────────────────────────────

export function Home(boolSet, player) {
    if (boolSet) {
        player.setDynamicProperty("home", player.location);
        player.setDynamicProperty("homeDim", player.dimension.id);
        player.sendMessage(t("fabmod.msg.home_set"));
        return;
    }

    const getHome = player.getDynamicProperty("home");
    const getDim = player.getDynamicProperty("homeDim");
    if (!getHome) {
        player.sendMessage(t("fabmod.msg.home_not_set"));
        return;
    }
    smartTeleport(player, getHome.x, getHome.z, world.getDimension(getDim),
        null, getHome.y);
}

// ── Warps ───────────────────────────────────────────────────────────────────

export function warps(boolSet, player, boolDelete) {
    const loc = player.location;
    const dim = player.dimension;

    if (boolSet) {
        const form = new ModalFormData();
        form.title(t("fabmod.ui.title.create_waypoint"));
        form.textField(t("fabmod.ui.modal.waypoint_name"), "");

        form.show(player).then(res => {
            if (res.canceled) return;
            const name = res.formValues[0]?.trim();
            if (!name || name.length === 0) {
                player.sendMessage(t("fabmod.msg.warp_empty"));
                return;
            }

            const existing = gdp("warps", world);
            if (existing !== undefined) {
                const parsed = JSON.parse(existing);
                const duplicate = parsed.some(w => Object.keys(w)[0].toLowerCase() === name.toLowerCase());
                if (duplicate) {
                    player.sendMessage(t("fabmod.msg.warp_exists", name));
                    return;
                }
            }

            const newWarp = { [name]: [{ x: loc.x, y: loc.y, z: loc.z }, dim.id] };

            if (existing === undefined) {
                sdp("warps", world, JSON.stringify([newWarp]));
                world.sendMessage(t("fabmod.msg.warp_set", name));
                return;
            }

            const w_list = JSON.parse(existing);
            w_list.push(newWarp);
            sdp("warps", world, JSON.stringify(w_list));
            world.sendMessage(t("fabmod.msg.warp_set", name));
        });
        return;
    }

    if (gdp("warps", world) === undefined) {
        player.sendMessage(t("fabmod.msg.warp_none"));
        return;
    }

    const wParsed = JSON.parse(gdp("warps", world));
    const aForm = new ActionFormData();
    aForm.title(t(boolDelete ? "fabmod.ui.title.delete_waypoint" : "fabmod.ui.title.waypoints"));

    for (let i = 0; i < wParsed.length; ++i) {
        aForm.button(`${boolDelete ? "§c§o" : "§e§o"}${Object.keys(wParsed[i])[0]}`);
    }

    aForm.show(player).then(res => {
        if (res.canceled) return;
        const selectedWarp = wParsed[res.selection];
        const warpName = Object.keys(selectedWarp)[0];
        const data = selectedWarp[warpName];
        if (boolDelete) {
            wParsed.splice(res.selection, 1);
            sdp("warps", world, JSON.stringify(wParsed));
            world.sendMessage(t("fabmod.msg.warp_deleted", warpName));
            return;
        }
        smartTeleport(player, data[0].x, data[0].z, world.getDimension(data[1]),
            () => player.sendMessage(t("fabmod.msg.warp_tp", warpName)), data[0].y);
    });
}

// ── TP to Player ────────────────────────────────────────────────────────────

export function tp(player) {
    const form = new ActionFormData().title(t("fabmod.ui.title.tp_to_player"));
    const players = world.getPlayers();
    for (let i = 0; i < players.length; ++i) {
        form.button(`§o${players[i].name}`);
    }
    form.show(player).then(res => {
        if (res.canceled) return;
        const toPlayer = world.getPlayers()[res.selection];
        if (!toPlayer) {
            player.sendMessage(t("fabmod.msg.player_not_found"));
            return;
        }
        if (gdp("tpa", toPlayer)) {
            // Target player is online → chunk is loaded, direct teleport
            player.teleport(toPlayer.location, { dimension: toPlayer.dimension });
            player.sendMessage(t("fabmod.msg.tp_to_player", toPlayer.name));
        } else {
            player.sendMessage(t("fabmod.msg.tp_denied", toPlayer.name));
        }
    });
}

// ── Teleport Menu ───────────────────────────────────────────────────────────

export function teleportMenu(player) {
    const backLoc = gdp("spawnBackLoc", player);
    const backDim = gdp("spawnBackDim", player);
    const hasBack = backLoc && backDim;
    const deathLoc = gdp("lastDeathLoc", player);
    const deathDim = gdp("lastDeathDim", player);
    const playerSpawn = player.getSpawnPoint();
    const hubExists = !!world.getDynamicProperty("hub");

    const uPlayerSpawn = isUnlocked("tp_player_spawn", player);
    const uHome        = isUnlocked("tp_home",         player);
    const uDeath       = isUnlocked("tp_death",        player);
    const buttons = [];

    buttons.push({ label: t("fabmod.ui.btn.world_spawn"), id: "world" });
    if (playerSpawn) buttons.push({ label: uPlayerSpawn ? t("fabmod.ui.btn.player_spawn") : t("fabmod.ui.btn.player_spawn_locked"), id: "player" });
    buttons.push({ label: uHome ? t("fabmod.ui.btn.home_set") : t("fabmod.ui.btn.home_locked"), id: "home" });
    if (hubExists) buttons.push({ label: t("fabmod.ui.btn.hub"), id: "hub" });

    const warpsEnabled = !!world.getDynamicProperty("warpsEnabled");
    if (warpsEnabled) buttons.push({ label: t("fabmod.ui.btn.waypoints_btn"), id: "warps" });

    buttons.push({ label: t("fabmod.ui.btn.tp_to_player"), id: "tp_player" });
    if (hasBack) buttons.push({ label: t("fabmod.ui.btn.tp_back"), id: "back" });
    if (uDeath && deathLoc) buttons.push({ label: t("fabmod.ui.btn.tp_death"), id: "death" });
    buttons.push({ label: t("fabmod.ui.btn.back"), id: "menu" });

    const form = new ActionFormData();
    form.title(t("fabmod.ui.title.teleportations"));
    for (const b of buttons) form.button(b.label);
    form.show(player).then(res => {
        if (res.canceled) return;
        const action = buttons[res.selection].id;

        switch (action) {
            case "world": {
                saveBackLocation(player);
                const sLoc = world.getDefaultSpawnLocation();
                // Toujours utiliser getTopmostBlock pour atterrir sur la surface,
                // car sLoc.y peut être en plein air (spawn sur montagne, valeur stale, etc.)
                smartTeleport(player, sLoc.x, sLoc.z, world.getDimension("overworld"),
                    () => player.sendMessage(t("fabmod.msg.tp_world_spawn")));
                break;
            }
            case "player": {
                if (!uPlayerSpawn) { player.sendMessage(t("fabmod.msg.locked_player_spawn")); return; }
                saveBackLocation(player);
                smartTeleport(player, playerSpawn.x, playerSpawn.z, playerSpawn.dimension,
                    () => player.sendMessage(t("fabmod.msg.tp_bed")));
                break;
            }
            case "home":
                if (!uHome) { player.sendMessage(t("fabmod.msg.locked_home")); return; }
                setMenu(player, [t("fabmod.ui.btn.tp_home"), t("fabmod.ui.btn.set_home"), t("fabmod.ui.btn.back")], [
                    () => Home(false, player),
                    () => Home(true, player),
                    () => teleportMenu(player)
                ]);
                break;
            case "hub":
                saveBackLocation(player);
                Hub(false, player);
                break;
            case "warps":
                saveBackLocation(player);
                warps(false, player, false);
                break;
            case "tp_player":
                tp(player);
                break;
            case "back":
                try {
                    const back = JSON.parse(backLoc);
                    sdp("spawnBackLoc", player, undefined);
                    sdp("spawnBackDim", player, undefined);
                    smartTeleport(player, back.x, back.z, world.getDimension(backDim),
                        () => player.sendMessage(t("fabmod.msg.tp_back")), back.y);
                } catch (e) { player.sendMessage(t("fabmod.msg.tp_back_fail")); }
                break;
            case "death": {
                try {
                    const loc = JSON.parse(deathLoc);
                    saveBackLocation(player);
                    smartTeleport(player, loc.x, loc.z, world.getDimension(deathDim),
                        () => player.sendMessage(t("fabmod.msg.tp_death")), loc.y);
                } catch (e) { player.sendMessage(t("fabmod.msg.tp_death_fail")); }
                break;
            }
            case "menu":
                openMenu("command", player);
                break;
        }
    });
}
