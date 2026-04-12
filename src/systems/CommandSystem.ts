import Dog from '../entities/Dog/Dog';
import { DogCommand } from '../entities/Dog/types';

export const COMMANDS: { label: string; command: DogCommand; description: string }[] = [
    { label: 'Mur',    command: 'MUR',   description: 'Roam freely, nudge strays back'         },
    { label: 'Ejja',   command: 'EJJA',  description: 'Follow & herd — duration\nscales with trust' },
    { label: 'Ieqaf',  command: 'IEQAF', description: 'Hold position — duration\nscales with trust' },
    { label: 'Bravu!', command: 'BRAVU', description: 'Praise — builds the dog\'s trust'        },
    { label: 'Agħti',  command: 'AGHTI', description: 'Give the dog a treat'                    },
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
