import { world, system } from "@minecraft/server"

// ── Priority-based Event Bus ────────────────────────────────────────────────
// Handlers are sorted by priority (higher = runs first).
// A handler returning `true` claims the event and stops propagation.

class EventBus {
    constructor() {
        this._before = new Map();
        this._after = new Map();
        this._intervals = [];
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
    }
}

export const eventBus = new EventBus();
