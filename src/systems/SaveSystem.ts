const KEY_FLOCK           = 'raghaj_flock_count';
const KEY_POEMS           = 'raghaj_poems_unlocked';
const KEY_SETTLEMENT_POS  = 'raghaj_settlement_positions';
const KEY_DISCOVERIES     = 'raghaj_discoveries';
const KEY_QUESTS_DONE     = 'raghaj_quests_done';

export default class SaveSystem {
    getFlockCount(): number {
        return parseInt(localStorage.getItem(KEY_FLOCK) ?? '0', 10);
    }

    saveFlockCount(count: number): void {
        localStorage.setItem(KEY_FLOCK, String(count));
    }

    // ── String-list helpers ───────────────────────────────────────────────────

    private readStringList(key: string): string[] {
        try {
            return JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
        } catch {
            return [];
        }
    }

    private appendToList(key: string, id: string): void {
        const list = this.readStringList(key);
        if (!list.includes(id)) {
            list.push(id);
            localStorage.setItem(key, JSON.stringify(list));
        }
    }

    // ── Poems ─────────────────────────────────────────────────────────────────

    getUnlockedPoems(): string[] { return this.readStringList(KEY_POEMS); }
    unlockPoem(id: string): void { this.appendToList(KEY_POEMS, id); }

    // ── Settlements ───────────────────────────────────────────────────────────

    getSettlementPositions(): Array<{ id: string; wx: number; wy: number }> {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY_SETTLEMENT_POS) ?? '[]') as unknown[];
            return raw.filter((p): p is { id: string; wx: number; wy: number } => {
                if (typeof p !== 'object' || p === null) return false;
                const o = p as Record<string, unknown>;
                return typeof o.id === 'string' && typeof o.wx === 'number' && typeof o.wy === 'number';
            });
        } catch {
            return [];
        }
    }

    saveSettlementPositions(positions: Array<{ id: string; wx: number; wy: number }>): void {
        localStorage.setItem(KEY_SETTLEMENT_POS, JSON.stringify(positions));
    }

    getDiscoveries(): string[]          { return this.readStringList(KEY_DISCOVERIES); }
    addDiscovery(id: string): void      { this.appendToList(KEY_DISCOVERIES, id); }

    getQuestsDone(): string[]           { return this.readStringList(KEY_QUESTS_DONE); }
    completeQuest(id: string): void     { this.appendToList(KEY_QUESTS_DONE, id); }
}
