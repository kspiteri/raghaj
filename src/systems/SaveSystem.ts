const KEY_FLOCK = 'raghaj_flock_count';
const KEY_POEMS = 'raghaj_poems_unlocked';

export default class SaveSystem {
    getFlockCount(): number {
        return parseInt(localStorage.getItem(KEY_FLOCK) ?? '0', 10);
    }

    saveFlockCount(count: number): void {
        localStorage.setItem(KEY_FLOCK, String(count));
    }

    getUnlockedPoems(): string[] {
        try {
            return JSON.parse(localStorage.getItem(KEY_POEMS) ?? '[]') as string[];
        } catch {
            return [];
        }
    }

    unlockPoem(id: string): void {
        const list = this.getUnlockedPoems();
        if (!list.includes(id)) {
            list.push(id);
            localStorage.setItem(KEY_POEMS, JSON.stringify(list));
        }
    }
}
