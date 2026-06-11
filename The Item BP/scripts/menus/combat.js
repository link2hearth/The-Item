import { gdp, sdp, t } from "../core/utils.js"
import { isUnlocked, getDamageTier, DAMAGE_TIERS } from "../core/data.js"
import { registerMenu, openMenu } from "./router.js"
import { ModalFormData } from "@minecraft/server-ui"

const COMBAT_EFFECTS = [
    { key: "cb_sharpness",  labelKey: "fabmod.ui.combat.sharpness",  tooltipKey: "fabmod.ui.combat.sharpness_desc"  },
    { key: "cb_knockback",  labelKey: "fabmod.ui.combat.knockback",   tooltipKey: "fabmod.ui.combat.knockback_desc"  },
    { key: "cb_fireAspect", labelKey: "fabmod.ui.combat.fireAspect",  tooltipKey: "fabmod.ui.combat.fireAspect_desc" },
    { key: "cb_lifeSteal",  labelKey: "fabmod.ui.combat.lifeSteal",   tooltipKey: "fabmod.ui.combat.lifeSteal_desc"  },
    { key: "cb_smite",      labelKey: "fabmod.ui.combat.smite",       tooltipKey: "fabmod.ui.combat.smite_desc"      },
    { key: "cb_sweeping",   labelKey: "fabmod.ui.combat.sweeping",    tooltipKey: "fabmod.ui.combat.sweeping_desc"   },
];

function combatMenu(player) {
    const tier = getDamageTier(player);
    const tierInfo = DAMAGE_TIERS[tier];

    const form = new ModalFormData();
    form.title(t("fabmod.ui.title.combat") + " — " + tierInfo.name + " (+" + tierInfo.damage + ")");

    const fields = [];

    // ── Combat effects (requires upgrade unlock) ─────────────────────────────
    for (const eff of COMBAT_EFFECTS) {
        if (!isUnlocked(eff.key, player)) continue;
        form.toggle(t(eff.labelKey), { defaultValue: gdp(eff.key, player) ?? false, tooltip: t(eff.tooltipKey) });
        fields.push({ key: eff.key });
    }

    // ── Fireball Shot (requires upgrade unlock) ───────────────────────────────
    if (isUnlocked("fireballShot", player)) {
        form.toggle(t("fabmod.ui.toggle.fireballShot"), { defaultValue: gdp("fireballShot", player) ?? false, tooltip: t("fabmod.ui.modal.fireballShot_tooltip") });
        fields.push({ key: "fireballShot" });
        form.slider(t("fabmod.ui.modal.bullet_range"), 6, 128, { valueStep: 1, defaultValue: gdp("p_bullet_range", player) ?? 64, tooltip: t("fabmod.ui.modal.bullet_range_tooltip") });
        fields.push({ key: "p_bullet_range" });
    }

    // ── Focus Mobs (always available) ─────────────────────────────────────────
    form.toggle(t("fabmod.ui.modal.focus_mobs"), { defaultValue: gdp("focusMobs", player) ?? false, tooltip: t("fabmod.ui.modal.focus_mobs_tooltip") });
    fields.push({ key: "focusMobs" });
    form.slider(t("fabmod.ui.modal.focus_mobs_radius"), 1, 10, { valueStep: 1, defaultValue: gdp("p_focusMobs_radius", player) ?? 4, tooltip: t("fabmod.ui.modal.focus_mobs_radius_tooltip") });
    fields.push({ key: "p_focusMobs_radius" });

    form.submitButton(t("fabmod.ui.btn.save"));

    form.show(player).then(res => {
        if (res.canceled) return;
        const vals = res.formValues;
        for (let i = 0; i < fields.length; i++) {
            sdp(fields[i].key, player, vals[i]);
        }
        player.sendMessage(t("fabmod.msg.customize_saved"));
    });
}

registerMenu("combat", combatMenu);
