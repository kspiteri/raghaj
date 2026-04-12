import Phaser from 'phaser';

// Screen-space post-process applied to the GameScene camera.
// Warm colour grade + radial edge blur (no heavy darkening).
const FRAG = `
#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

void main () {
    vec2 uv = outTexCoord;
    vec2 d  = uv - 0.5;
    float dist = dot(d, d);  // 0 at centre, ~0.5 at corners

    // Radial blur — amount grows from 0 at centre to ~0.014 at corners
    float blur = smoothstep(0.08, 0.50, dist) * 0.014;

    // 9-tap box sample spread around current UV
    vec4 col = vec4(0.0);
    float d1 = blur;
    float d2 = blur * 0.7;
    col += texture2D(uMainSampler, uv);
    col += texture2D(uMainSampler, uv + vec2( d1,  0.0));
    col += texture2D(uMainSampler, uv + vec2(-d1,  0.0));
    col += texture2D(uMainSampler, uv + vec2( 0.0,  d1));
    col += texture2D(uMainSampler, uv + vec2( 0.0, -d1));
    col += texture2D(uMainSampler, uv + vec2( d2,  d2));
    col += texture2D(uMainSampler, uv + vec2(-d2,  d2));
    col += texture2D(uMainSampler, uv + vec2( d2, -d2));
    col += texture2D(uMainSampler, uv + vec2(-d2, -d2));
    col /= 9.0;

    // Warm colour grade: sun-bleached limestone feel
    col.r = clamp(col.r * 1.07, 0.0, 1.0);
    col.g = clamp(col.g * 1.02, 0.0, 1.0);
    col.b = clamp(col.b * 0.90, 0.0, 1.0);

    // Mild contrast lift
    col.rgb = clamp((col.rgb - 0.5) * 1.08 + 0.5, 0.0, 1.0);

    // Very gentle edge fade (10% max) just to soften the frame — no heavy darkening
    float fade = 1.0 - smoothstep(0.35, 0.50, dist) * 0.10;
    col.rgb *= fade;

    gl_FragColor = vec4(col.rgb, col.a);
}
`;

export default class VignettePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    constructor(game: Phaser.Game) {
        super({ game, name: 'VignettePipeline', fragShader: FRAG });
    }
}
