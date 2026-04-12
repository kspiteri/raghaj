import { DogState, DogCommand } from './types';

export function nextDogState(current: DogState, command: DogCommand): DogState {
    switch (command) {
        case 'MUR':   return DogState.IDLE;
        case 'EJJA':  return DogState.HERDING;
        case 'IEQAF': return DogState.STOPPED;
        case 'BRAVU': return current;
    }
}
