// Flock
export const FLOCK_SIZE_INITIAL = 200;
export const FLOCK_SIZE_MAX = 1000; // scale up after Phase 1 performance validated

// Boids weights
export const BOID_COHESION = 0.06;       // gentle — keeps groups loose
export const BOID_SEPARATION = 1.5;
export const BOID_ALIGNMENT = 0.4;
export const BOID_DOG_REPULSION = 2.0;
export const BOID_NEIGHBOR_RADIUS = 80;  // px — how far a sheep looks for neighbours
export const DOG_REPULSION_RADIUS = 150; // px

// Sheep speeds (px/s)
export const SHEEP_GRAZE_SPEED = 22;     // calm wandering
export const SHEEP_FLEE_SPEED = 120;     // when dog is pushing

// Grazing wander
export const BOID_WANDER_STRENGTH = 12;  // force applied along wander direction
export const WANDER_TURN_RATE = 0.8;     // radians/s max turn per sheep

// Shepherd / dog speeds (px/s)
export const SHEPHERD_WALK_SPEED = 90;
export const SHEPHERD_RUN_SPEED  = 300;
export const DOG_SPEED = 300;

// Autonomous dog
export const DOG_AUTONOMOUS_INTERVAL = 3500; // ms between autonomous decisions
export const DOG_STRAY_THRESHOLD = 160;      // px — sheep further than this from shepherd is "stray"
export const DOG_GATHER_RADIUS = 130;         // px — dog rests when all sheep are within this of shepherd

// Sheep ↔ shepherd
export const SHEEP_SHEPHERD_AVOID_RADIUS = 38;  // px — sheep gently step aside for shepherd
export const SHEEP_SHEPHERD_AVOID_STRENGTH = 1.8;

// Wall avoidance
export const WALL_AVOIDANCE_RADIUS = 45; // px — sheep steer away when within this distance

// Joystick
export const JOYSTICK_RADIUS = 30;
export const JOYSTICK_DEAD_ZONE = 10;

// Poetry
export const POETRY_STILL_TRIGGER_MS = 10_000;
export const POETRY_FADE_DURATION = 800;

// Camera / world
export const WORLD_WIDTH = 36000;
export const WORLD_HEIGHT = 36000;
export const TARGET_FPS = 60;

// Terrain
export const TILE_SIZE = 64;
export const TILE_ELEV_STEP = 10;  // screen-space pixels per elevation level
export const TILE_ELEV_MAX  = 8;   // discrete elevation levels (0 = coast, 7 = summit)

// Grass
export const GRASS_INITIAL_LEVEL       = 3;
export const GRASS_REGROW_RATE_PER_SEC = 0.05;   // levels/sec — 0→3 in ~60s
export const GRASS_EAT_AMOUNT          = 0.08;   // deducted per nearly-still sheep per second
export const SHEEP_BARE_SPEED_FACTOR   = 0.6;
export const BOID_BARE_REPULSION       = 0.4;
export const GRAZE_ZONE_SIZE           = 20;     // tiles/side for poem unlock zones

// Stray risk
export const STRAY_TIME_THRESHOLD   = 20;        // seconds on bare ground → stray
export const STRAY_WANDER_MULTIPLIER = 2.5;

// Guide ability
export const GUIDE_DURATION_MS    = 8_000;
export const GUIDE_COOLDOWN_MS    = 30_000;
export const GUIDE_RADIUS         = 300;           // px — sheep within this follow shepherd
export const GUIDE_SPREAD_RADIUS  = 180;           // px — guided sheep orbit shepherd at this distance

// Dog trust
export const DOG_TRUST_INITIAL         = 30;
export const PRAISE_BASE_COOLDOWN_MS   = 4_000;  // cooldown × combo count (1 press=4s, 5=20s)
export const PRAISE_WINDOW_MS          = 3_000;  // window to land extra presses
export const PRAISE_MAX_COMBO          = 5;
export const DOG_STOP_DECAY_START_MS   = 20_000; // STOP for this long before trust decays
export const DOG_STOP_DECAY_RATE       = 2;      // trust/sec lost while stopped too long
export const DOG_IDLE_DECAY_INTERVAL_MS = 15_000; // every 15s ignored → −1 trust
export const TRUST_HIGH_THRESHOLD      = 70;
export const TRUST_LOW_THRESHOLD       = 40;
export const TRUST_LOW_IGNORE_CHANCE   = 0.20;   // 20% chance to ignore command when trust < 40
export const TRUST_HIGH_SPEED_FACTOR   = 0.6;   // multiplier on DOG_AUTONOMOUS_INTERVAL at high trust

// Dog commands
export const DOG_STOP_MAX_MS        = 60_000;     // IEQAF max duration (high trust)
export const MUR_SHEPHERD_RADIUS    = 400;         // px — MUR mode acts within this of shepherd
export const EJJA_DURATION_MIN_MS   = 8_000;       // at trust=0
export const EJJA_DURATION_MAX_MS   = 45_000;      // at trust=100
export const IEQAF_DURATION_MIN_MS  = 10_000;      // at trust=0 (max = DOG_STOP_MAX_MS)

// Treats
export const TREAT_SPAWN_COUNT    = 5;
export const TREAT_COLLECT_RADIUS = 20;          // px — shepherd picks up
export const TREAT_GIVE_RADIUS    = 100;         // px — shepherd gives to dog
export const TREAT_MAX_CARRY      = 5;
export const TREAT_RESPAWN_MS     = 300_000;     // 5 min
export const TREAT_TRUST_BONUS    = 15;

// Flock mood
export const MOOD_HIGH_THRESHOLD       = 0.7;
export const MOOD_LOW_THRESHOLD        = 0.3;
export const MOOD_HIGH_COHESION_BONUS  = 1.4;
export const MOOD_LOW_SEP_BONUS        = 1.6;
export const MOOD_UPDATE_INTERVAL_MS   = 500;

// Zoom
export const ZOOM_MIN  = 0.18;
export const ZOOM_MAX  = 1.0;
export const ZOOM_STEP = 0.08;  // fractional multiplier per wheel tick
