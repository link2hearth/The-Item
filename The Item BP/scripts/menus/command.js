import { gdp, t, isOp } from "../core/utils.js"
import { registerMenu, openMenu } from "./router.js"
import { inventorySort } from "../modules/player.js"
import { getTPS } from "../core/tps.js"
import { ActionFormData } from "@minecraft/server-ui"

function commandMenu(player) {
    const sortMode    = gdp("sortMode", player) ?? "family";
    const showSort    = gdp("p_sort_visible", player) ?? true;

    const { x, y, z } = player.location;
    const tps = getTPS();
    const tpsColor = tps === null ? "§7" : tps >= 18 ? "§a" : tps >= 12 ? "§e" : "§c";
    const tpsText  = tps === null ? "§7TPS: §o--" : `§7TPS: ${tpsColor}${tps.toFixed(1)}`;

    const form    = new ActionFormData();
    const actions = [];

    form.title("The Item").body(`§9${Math.floor(x)} §c${Math.floor(y)} §a${Math.floor(z)}  §8|  ${tpsText}`);

    if (showSort) {
        form.button({ rawtext: [{ translate: "fabmod.ui.btn.sort_inventory" }, { text: "\n§7§oMode: " }, { translate: `fabmod.ui.sort.${sortMode}` }] });
        actions.push(() => { const n = inventorySort(player); player.sendMessage(t("fabmod.msg.sort_done", n)); });
    }

    form.button(t("fabmod.ui.btn.teleportations")); actions.push(() => openMenu("teleport", player));
    form.button(t("fabmod.ui.btn.chunks"));         actions.push(() => openMenu("chunks",    player));
    form.button(t("fabmod.ui.btn.settings_btn"));   actions.push(() => openMenu("settings",  player));
    form.button(t("fabmod.ui.btn.upgrades"));       actions.push(() => openMenu("upgrades",  player));
    form.button(t("fabmod.ui.btn.combat"));         actions.push(() => openMenu("combat",    player));
    if (isOp(player)) {
        form.button(t("fabmod.ui.btn.manage_admins")); actions.push(() => openMenu("opManageAdmins", player));
    }
    form.button(t("fabmod.ui.btn.my_stats")); actions.push(() => openMenu("stats", player));

    form.show(player).then(res => {
        if (res.canceled) return;
        actions[res.selection]?.();
    });
}

registerMenu("command", commandMenu);
