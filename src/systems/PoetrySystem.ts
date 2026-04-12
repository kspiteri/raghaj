import poemsData from '../../data/poems.json';
import SaveSystem from './SaveSystem';

export interface Poem {
    id: string;
    title: string;
    author: string;
    narrator: string;
    text_mt: string;
    text_en: string;
    audio: string | null;
}

const poems: Poem[] = poemsData as Poem[];

export default class PoetrySystem {
    private onShow: (poem: Poem) => void;
    private save: SaveSystem;

    constructor(onShow: (poem: Poem) => void, save: SaveSystem) {
        this.onShow = onShow;
        this.save = save;
    }

    // Trigger disabled — re-enable when poem audio is ready
    update(_isMoving: boolean, _delta: number): void {}

    // Manual trigger for testing
    triggerPoem(): void {
        const unlocked = this.save.getUnlockedPoems();
        const available = poems.filter(p => !unlocked.includes(p.id));
        const pool = available.length > 0 ? available : poems;
        const poem = pool[Math.floor(Math.random() * pool.length)];
        this.save.unlockPoem(poem.id);
        this.onShow(poem);
    }

    getAll(): Poem[] {
        return poems;
    }
}
