import { world, system } from "@minecraft/server"

// ── Priority-based Event Bus ────────────────────────────────────────────────
// Handlers are sorted by priority (higher = runs first).
// A handler returning `true` claims the event and stops propagation.

class EventBus {
    constructor() {
        this._before = new Map();
        this._after = new Map();
        this._intervals = [];
        this._playerIntervals = [];
        this._initialized = false;
    }

    // Register a beforeEvent handler (can cancel events)
    before(eventName, handler, priority = 0) {
        if (!this._before.has(eventName)) this._before.set(eventName, []);
        this._before.get(eventName).push({ handler, priority });
        this._before.get(eventName).sort((a, b) => b.priority - a.priority);
    }

    // Register an afterEvent handler
    after(eventName, handler, priority = 0) {
        if (!this._after.has(eventName)) this._after.set(eventName, []);
        this._after.get(eventName).push({ handler, priority });
        this._after.get(eventName).sort((a, b) => b.priority - a.priority);
    }

    // Register a tick interval
    interval(callback, ticks) {
        this._intervals.push({ callback, ticks });
    }

    // Register a per-player tick interval. The callback receives the shared players
    // array — all handlers of the same frequency reuse a single getAllPlayers() call.
    playerInterval(callback, ticks) {
        this._playerIntervals.push({ callback, ticks });
    }

    // Subscribe to all Minecraft events — call once after all modules are loaded
    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Before events
        for (const [eventName, handlers] of this._before) {
            try {
                world.beforeEvents[eventName].subscribe((ev) => {
                    for (const { handler } of handlers) {
                        try {
                            if (handler(ev) === true) break;
                        } catch (e) { console.warn(`[EventBus] before.${eventName}:`, e); }
                    }
                });
            } catch (e) { console.warn(`[EventBus] subscribe before.${eventName} failed:`, e); }
        }

        // After events
        for (const [eventName, handlers] of this._after) {
            try {
                world.afterEvents[eventName].subscribe((ev) => {
                    for (const { handler } of handlers) {
                        try {
                            if (handler(ev) === true) break;
                        } catch (e) { console.warn(`[EventBus] after.${eventName}:`, e); }
                    }
                });
            } catch (e) { console.warn(`[EventBus] subscribe after.${eventName} failed:`, e); }
        }

        // Intervals
        for (const { callback, ticks } of this._intervals) {
            system.runInterval(callback, ticks);
        }

        // Player intervals : regroupés par fréquence → un seul world.getAllPlayers()
        // par fréquence et par tick, partagé entre tous les handlers de cette fréquence.
        // Le try/catch par handler préserve l'isolation : un handler qui throw
        // n'interrompt pas les autres du même groupe.
        const byTicks = new Map();
        for (const { callback, ticks } of this._playerIntervals) {
            if (!byTicks.has(ticks)) byTicks.set(ticks, []);
            byTicks.get(ticks).push(callback);
        }
        for (const [ticks, callbacks] of byTicks) {
            system.runInterval(() => {
                const players = world.getAllPlayers();
                for (const cb of callbacks) {
                    try { cb(players); } catch (e) { console.warn("[EventBus] playerInterval:", e); }
                }
            }, ticks);
        }
    }
}

export const eventBus = new EventBus();
