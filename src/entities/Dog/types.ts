export enum DogState {
    IDLE    = 'IDLE',
    MOVING  = 'MOVING',
    HERDING = 'HERDING',
    STOPPED = 'STOPPED',  // holds position, auto-reverts to IDLE after DOG_STOP_MAX_MS
}

export type DogCommand =
    | 'MUR'    // Mur    — free roam, nudge strays within shepherd radius
    | 'EJJA'   // Ejja   — follow shepherd, actively herd
    | 'IEQAF'  // Ieqaf  — hold position up to 60s then revert
    | 'BRAVU'; // Bravu! — praise, no movement change
