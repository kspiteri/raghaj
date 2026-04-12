export enum DogState {
    IDLE    = 'IDLE',
    MOVING  = 'MOVING',
    HERDING = 'HERDING',
    STOPPED = 'STOPPED',  // holds position, auto-reverts to IDLE after DOG_STOP_MAX_MS
}

export type DogCommand =
    | 'MUR'    // Mur    — free roam, nudge strays within shepherd radius
    | 'EJJA'   // Ejja   — follow shepherd, actively herd (trust-timed)
    | 'IEQAF'  // Ieqaf  — hold position (trust-timed, then revert)
    | 'BRAVU'  // Bravu! — praise, no movement change
    | 'AGHTI'; // Agħti  — give treat (handled externally, no-op in dog state)
