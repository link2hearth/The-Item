import { system } from "@minecraft/server"

// ── TPS Tracker ──────────────────────────────────────────────────────────────
// Stores one sample (tick + real time) per second.
// Keeps a rolling 20-second window to calculate TPS on demand.

const samples = []; // { tick: number, time: number }

system.runInterval(() => {
    samples.push({ tick: system.currentTick, time: Date.now() });
    // Drop samples older than 20 seconds
    const cutoff = Date.now() - 20000;
    while (samples.length > 1 && samples[0].time < cutoff) samples.shift();
}, 20);

export function getTPS() {
    if (samples.length < 2) return null;
    const oldest = samples[0];
    const newest = samples[samples.length - 1];
    const tickDelta = newest.tick - oldest.tick;
    const timeDelta = newest.time - oldest.time;
    if (timeDelta <= 0) return null;
    return Math.min(20, (tickDelta / timeDelta) * 1000);
}
