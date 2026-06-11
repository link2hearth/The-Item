import { gdp, sdp, t } from "../core/utils.js"
import { isUnlocked } from "../core/data.js"
import { registerMenu } from "./router.js"
import { getSetting } from "../core/settings.js"
import { ModalFormData } from "@minecraft/server-ui"

function settingsMenu(player) {
    const toggleDefs = [
        { key: "nightVision",    labelKey: "fabmod.ui.toggle.nightVision",    unlock: "nightVision",    tooltipKey: "fabmod.ui.modal.nightVision_tooltip"    },
        { key: "dynLight",       labelKey: "fabmod.ui.toggle.dynLight",       unlock: "dynLight",       tooltipKey: "fabmod.ui.modal.dynLight_tooltip",       sideOff: () => player.runCommand("function dynlight_off") },
        { key: "glowing",        labelKey: "fabmod.ui.toggle.glowing",        unlock: "glowing",        tooltipKey: "fabmod.ui.modal.glowing_tooltip",        sideOff: () => player.runCommand("function dynlight_off") },
        { key: "noFall",         labelKey: "fabmod.ui.toggle.noFall",         unlock: "noFall",         tooltipKey: "fabmod.ui.modal.noFall_tooltip"         },
        { key: "agile",          labelKey: "fabmod.ui.toggle.agile",          unlock: "agile",          tooltipKey: "fabmod.ui.modal.agile_tooltip"          },
        { key: "corpse",         labelKey: "fabmod.ui.toggle.corpse",         unlock: "corpse",         tooltipKey: "fabmod.ui.modal.corpse_toggle_tooltip",  inline: "corpse"      },
        { key: "magnet",         labelKey: "fabmod.ui.toggle.magnet",         unlock: "magnet",         tooltipKey: "fabmod.ui.modal.magnet_toggle_tooltip",  inline: "magnet"      },
        { key: "backpackHover",  labelKey: "fabmod.ui.toggle.backpackHover",  unlock: "backpackHover",  tooltipKey: "fabmod.ui.modal.backpackHover_tooltip" },
        { key: "refill",         labelKey: "fabmod.ui.toggle.refill",         unlock: "refill",         tooltipKey: "fabmod.ui.modal.refill_tooltip"         },
        { key: "waila",          labelKey: "fabmod.ui.toggle.waila",          unlock: "waila",          tooltipKey: "fabmod.ui.modal.waila_toggle_tooltip",   inline: "waila"       },
        { key: "silkSpawner",    labelKey: "fabmod.ui.toggle.silkSpawner",    unlock: "silkSpawner",    tooltipKey: "fabmod.ui.modal.silkSpawner_tooltip"    },
        { key: "tc",             labelKey: "fabmod.ui.toggle.tc",             unlock: "tc",             tooltipKey: "fabmod.ui.modal.tc_tooltip"             },
        { key: "vm",             labelKey: "fabmod.ui.toggle.vm",             unlock: "vm",             tooltipKey: "fabmod.ui.modal.vm_tooltip"             },
        { key: "autoReplant",    labelKey: "fabmod.ui.toggle.autoReplant",    unlock: "autoReplant",    tooltipKey: "fabmod.ui.modal.autoReplant_tooltip"    },
        { key: "antiVoid",       labelKey: "fabmod.ui.toggle.antiVoid",       unlock: "antiVoid",       tooltipKey: "fabmod.ui.modal.antiVoid_tooltip"       },
        { key: "waterBreathing", labelKey: "fabmod.ui.toggle.waterBreathing", unlock: "waterBreathing", tooltipKey: "fabmod.ui.modal.waterBreathing_tooltip" },
        { key: "haste",          labelKey: "fabmod.ui.toggle.haste",          unlock: "haste",          tooltipKey: "fabmod.ui.modal.haste_tooltip"          },
        { key: "fireRes",        labelKey: "fabmod.ui.toggle.fireRes",        unlock: "fireRes",        tooltipKey: "fabmod.ui.modal.fireRes_tooltip"        },
        { key: "doubleXp",       labelKey: "fabmod.ui.toggle.doubleXp",       unlock: "doubleXp",       tooltipKey: "fabmod.ui.modal.doubleXp_tooltip"       },
        { key: "regen",          labelKey: "fabmod.ui.toggle.regen",          unlock: "regen",          tooltipKey: "fabmod.ui.modal.regen_tooltip"          },
        { key: "resistance",     labelKey: "fabmod.ui.toggle.resistance",     unlock: "resistance",     tooltipKey: "fabmod.ui.modal.resistance_tooltip"     },
        { key: "strength",       labelKey: "fabmod.ui.toggle.strength",       unlock: "strength",       tooltipKey: "fabmod.ui.modal.strength_tooltip"       },
        { key: "saturation",     labelKey: "fabmod.ui.toggle.saturation",     unlock: "saturation",     tooltipKey: "fabmod.ui.modal.saturation_tooltip"     },
        { key: "doubleJump",     labelKey: "fabmod.ui.toggle.doubleJump",     unlock: "doubleJump",     tooltipKey: "fabmod.ui.modal.doubleJump_tooltip"     },
        { key: "cb_sweeping",    labelKey: "fabmod.ui.toggle.cb_sweeping",    unlock: "cb_sweeping",    tooltipKey: "fabmod.ui.modal.cb_sweeping_tooltip"    },
        { key: "entityRadar",    labelKey: "fabmod.ui.toggle.entityRadar",    unlock: "entityRadar",    tooltipKey: "fabmod.ui.modal.entityRadar_toggle_tooltip", inline: "entityRadar" },
        { key: "itemName",       labelKey: "fabmod.ui.toggle.itemName",       unlock: "itemName",       tooltipKey: "fabmod.ui.modal.itemName_toggle_tooltip",    inline: "itemName"    },
    ];

    const form = new ModalFormData();
    form.title(t("fabmod.ui.title.settings"));

    // Tracks each field added to the form in order, for reading formValues on submit
    const fields = [];

    for (const d of toggleDefs) {
        if (!isUnlocked(d.unlock, player)) continue;

        form.toggle(t(d.labelKey), { defaultValue: gdp(d.key, player) ?? false, tooltip: t(d.tooltipKey) });
        fields.push({ key: d.key, type: "toggle", sideOff: d.sideOff });

        if (d.inline === "waila") {
            const maxE = getSetting("waila_entityDist");
            const maxB = getSetting("waila_blockDist");
            form.slider(t("fabmod.ui.modal.waila_entity_dist"), 1, maxE, { valueStep: 1, defaultValue: Math.min(gdp("p_waila_entityDist", player) ?? maxE, maxE), tooltip: t("fabmod.ui.modal.waila_entity_dist_tooltip") });
            fields.push({ key: "p_waila_entityDist", type: "value" });
            form.slider(t("fabmod.ui.modal.waila_block_dist"), 1, maxB, { valueStep: 1, defaultValue: Math.min(gdp("p_waila_blockDist", player) ?? maxB, maxB), tooltip: t("fabmod.ui.modal.waila_block_dist_tooltip") });
            fields.push({ key: "p_waila_blockDist", type: "value" });
            const wailaPositions = ["bc", "tc"];
            const curWailaPosIdx = Math.max(0, wailaPositions.indexOf(gdp("p_waila_pos", player) ?? "bc"));
            form.dropdown(t("fabmod.ui.modal.waila_pos"), ["↓ Bottom Center", "↑ Top Center"], { defaultValueIndex: curWailaPosIdx, tooltip: t("fabmod.ui.modal.waila_pos_tooltip") });
            fields.push({ key: "p_waila_pos", type: "dropdown", options: wailaPositions });
            const chestModes = ["always", "sneak"];
            const curChestIdx = Math.max(0, chestModes.indexOf(gdp("p_waila_chestPreview", player) ?? "always"));
            form.dropdown(t("fabmod.ui.modal.waila_chest_preview"), [t("fabmod.ui.modal.waila_chest_always"), t("fabmod.ui.modal.waila_chest_sneak")], { defaultValueIndex: curChestIdx, tooltip: t("fabmod.ui.modal.waila_chest_preview_tooltip") });
            fields.push({ key: "p_waila_chestPreview", type: "dropdown", options: chestModes });
            const furnaceModes = ["always", "sneak"];
            const curFurnaceIdx = Math.max(0, furnaceModes.indexOf(gdp("p_waila_furnacePreview", player) ?? "always"));
            form.dropdown(t("fabmod.ui.modal.waila_furnace_preview"), [t("fabmod.ui.modal.waila_chest_always"), t("fabmod.ui.modal.waila_chest_sneak")], { defaultValueIndex: curFurnaceIdx, tooltip: t("fabmod.ui.modal.waila_furnace_preview_tooltip") });
            fields.push({ key: "p_waila_furnacePreview", type: "dropdown", options: furnaceModes });
        }

        if (d.inline === "entityRadar") {
            const maxR = getSetting("entityRadar_radius");
            form.slider(t("fabmod.ui.modal.entity_radar_radius"), 8, maxR, { valueStep: 1, defaultValue: Math.min(gdp("p_entityRadar_radius", player) ?? maxR, maxR), tooltip: t("fabmod.ui.modal.radar_radius_tooltip") });
            fields.push({ key: "p_entityRadar_radius", type: "value" });
            form.toggle(t("fabmod.ui.modal.entity_radar_sneak"), { defaultValue: gdp("p_entityRadar_sneak", player) ?? false, tooltip: t("fabmod.ui.modal.radar_sneak_tooltip") });
            fields.push({ key: "p_entityRadar_sneak", type: "value" });
        }

        if (d.inline === "itemName") {
            const maxD = getSetting("itemName_distance");
            form.slider(t("fabmod.ui.modal.distance"), 1, maxD, { valueStep: 1, defaultValue: Math.min(gdp("p_itemName_dist", player) ?? maxD, maxD), tooltip: t("fabmod.ui.modal.itemname_dist_tooltip") });
            fields.push({ key: "p_itemName_dist", type: "value" });
            form.toggle(t("fabmod.ui.modal.los"), { defaultValue: gdp("p_itemName_los", player) ?? getSetting("itemName_los"), tooltip: t("fabmod.ui.modal.itemname_los_tooltip") });
            fields.push({ key: "p_itemName_los", type: "value" });
        }

        if (d.inline === "magnet") {
            const maxM = getSetting("magnet_radius");
            form.slider(t("fabmod.ui.modal.magnet_radius"), 1, maxM, { valueStep: 1, defaultValue: Math.min(gdp("p_magnet_radius", player) ?? maxM, maxM), tooltip: t("fabmod.ui.modal.magnet_radius_tooltip") });
            fields.push({ key: "p_magnet_radius", type: "value" });
        }


        if (d.inline === "corpse") {
            form.toggle(t("fabmod.ui.modal.corpse_indicator"), { defaultValue: gdp("p_corpse_indicator", player) ?? true, tooltip: t("fabmod.ui.modal.corpse_indicator_tooltip") });
            fields.push({ key: "p_corpse_indicator", type: "value" });
            const corpsePositions = ["bc", "tl", "tc", "tr"];
            const curCorpsePosIdx = Math.max(0, corpsePositions.indexOf(gdp("p_corpse_indicator_pos", player) ?? "bc"));
            form.dropdown(t("fabmod.ui.modal.corpse_pos"), ["↓ Bottom Center", "↖ Top Left", "↑ Top Center", "↗ Top Right"], { defaultValueIndex: curCorpsePosIdx, tooltip: t("fabmod.ui.modal.corpse_pos_tooltip") });
            fields.push({ key: "p_corpse_indicator_pos", type: "dropdown", options: corpsePositions });
        }
    }

    // TPA toggle
    form.toggle(t("fabmod.ui.toggle.tpaRequests"), { defaultValue: gdp("tpa", player) ?? true, tooltip: t("fabmod.ui.modal.tpa_tooltip") });
    fields.push({ key: "tpa", type: "toggle" });

    // Sort visibility toggle + mode dropdown
    form.toggle(t("fabmod.ui.toggle.sortVisible"), { defaultValue: gdp("p_sort_visible", player) ?? true, tooltip: t("fabmod.ui.modal.sortVisible_tooltip") });
    fields.push({ key: "p_sort_visible", type: "toggle" });
    const sortModes = ["family", "id"];
    const curSortIdx = Math.max(0, sortModes.indexOf(gdp("sortMode", player) ?? "family"));
    form.dropdown(t("fabmod.ui.btn.sort_settings_btn"), ["↳ Family", "# ID"], { defaultValueIndex: curSortIdx, tooltip: t("fabmod.ui.modal.sort_tooltip") });
    fields.push({ key: "sortMode", type: "dropdown", options: sortModes });

    form.submitButton(t("fabmod.ui.btn.save"));

    form.show(player).then(res => {
        if (res.canceled) return;
        const vals = res.formValues;
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            const val = vals[i];
            if (field.type === "dropdown") {
                sdp(field.key, player, field.options[val]);
            } else {
                if (field.sideOff && gdp(field.key, player) && !val) field.sideOff();
                sdp(field.key, player, val);
            }
        }
        player.sendMessage(t("fabmod.msg.customize_saved"));
    });
}

registerMenu("settings", settingsMenu);
