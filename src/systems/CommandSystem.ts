import Dog from '../entities/Dog/Dog';
import { DogCommand } from '../entities/Dog/types';

export const COMMANDS: { label: string; hint: string; command: DogCommand }[] = [
    { label: 'Mur',    hint: 'Free',   command: 'MUR'   },
    { label: 'Ejja',   hint: 'Follow', command: 'EJJA'  },
    { label: 'Ieqaf',  hint: 'Stop',   command: 'IEQAF' },
    { label: 'Bravu!', hint: 'Praise', command: 'BRAVU' },
];

export default class CommandSystem {
    private dog: Dog;
    private getShepherdPos: () => { x: number; y: number };

    constructor(dog: Dog, getShepherdPos: () => { x: number; y: number }) {
        this.dog = dog;
        this.getShepherdPos = getShepherdPos;
    }

    dispatch(command: DogCommand): void {
        const pos = this.getShepherdPos();
        this.dog.receiveCommand(command, pos.x, pos.y);
    }

    tryMatchVoice(transcript: string): boolean {
        const t = transcript.toLowerCase();
        const map: Record<string, DogCommand> = {
            'mur':    'MUR',
            'ejja':   'EJJA',
            'ieqaf':  'IEQAF',
            'waqqaf': 'IEQAF',
            'bravu':  'BRAVU',
        };

        for (const [keyword, cmd] of Object.entries(map)) {
            if (t.includes(keyword)) {
                this.dispatch(cmd);
                return true;
            }
        }
        return false;
    }
}
