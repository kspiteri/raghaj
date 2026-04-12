import CommandSystem from './CommandSystem';

// SpeechRecognition is not yet in all TS DOM lib versions — declare minimally here
interface ISpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: ISpeechRecognitionEvent) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
}
interface ISpeechRecognitionEvent {
    results: { length: number; [i: number]: { [j: number]: { transcript: string } } };
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

export default class VoiceSystem {
    private recognition: ISpeechRecognition | null = null;
    private active = false;

    constructor(private commands: CommandSystem) {}

    isSupported(): boolean {
        return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    }

    start(): void {
        if (!this.isSupported() || this.active) return;

        const w = window as unknown as Record<string, SpeechRecognitionCtor>;
        const Ctor: SpeechRecognitionCtor = w['SpeechRecognition'] ?? w['webkitSpeechRecognition'];

        this.recognition = new Ctor();
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        // No locale lock — let the device use its default; we match Maltese keywords ourselves

        this.recognition.onresult = (event: ISpeechRecognitionEvent) => {
            const transcript = event.results[event.results.length - 1][0].transcript;
            this.commands.tryMatchVoice(transcript);
        };

        this.recognition.onerror = () => {
            this.active = false;
        };

        this.recognition.onend = () => {
            // Auto-restart if still supposed to be active
            if (this.active) this.recognition?.start();
        };

        this.recognition.start();
        this.active = true;
    }

    stop(): void {
        this.active = false;
        this.recognition?.stop();
    }
}
