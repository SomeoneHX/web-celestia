// GLSL ES 3.0 shader sources.
//
// The star and selection pointer stages are ports of Celestia's
// shaders/star_vert.glsl, star_frag.glsl, selpointer_vert.glsl and
// selpointer_frag.glsl. The `set_vp(vec4)` macro those files use is expanded
// into an explicit projection of the view and projection matrices. The
// remaining stages cover geometry that Celestia renders with a fixed pipeline.
//
// All position attributes arrive already relative to the camera, in kilometres,
// which keeps float32 precision usable across the full scale of the scene.
// Depth is written logarithmically because a single frame can span from a few
// hundred kilometres to several light years.

/** Common vertex prelude: matrices, viewport size and the depth term. */
export const VERTEX_COMMON = /* glsl */ `
precision highp float;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uViewport;
uniform float uFarDistance;

out float vFragDepth;

vec4 celestiaProject(vec4 position)
{
    vec4 clip = uProj * uView * position;
    vFragDepth = 1.0 + clip.w;
    return clip;
}
`;

/** Common fragment prelude, including the logarithmic depth write. */
export const FRAGMENT_COMMON = /* glsl */ `
precision highp float;

in float vFragDepth;
uniform float uLogDepthFactor;

out vec4 fragColor;

#define CELESTIA_WRITE_DEPTH() gl_FragDepth = log2(max(vFragDepth, 1.0)) * uLogDepthFactor
`;

// ---------------------------------------------------------------- stars
//
// From shaders/star_vert.glsl: the vertex stage sets gl_PointSize from a
// per-vertex size attribute and forwards a colour; the fragment stage multiplies
// the star sprite texture by that colour.

export const STAR_VERTEX = /* glsl */ `${VERTEX_COMMON}
layout(location = 0) in vec3 aPosition;
layout(location = 7) in float aPointSize;
layout(location = 8) in vec4 aColor;

out vec4 vColor;

void main(void)
{
    gl_PointSize = aPointSize;
    vColor = aColor;
    gl_Position = celestiaProject(vec4(aPosition, 1.0));
}
`;

export const STAR_FRAGMENT = /* glsl */ `${FRAGMENT_COMMON}
uniform sampler2D uStarTexture;
uniform float uWriteDepth;

in vec4 vColor;

void main(void)
{
    fragColor = texture(uStarTexture, gl_PointCoord) * vColor;
    if (uWriteDepth > 0.5)
    {
        CELESTIA_WRITE_DEPTH();
    }
}
`;

// ------------------------------------------------------------ celestial points
//
// Deep sky objects, markers and reference marks: a camera facing quad whose size
// is given in pixels and whose texture rectangle is supplied per instance.

export const SPRITE_VERTEX = /* glsl */ `${VERTEX_COMMON}
layout(location = 0) in vec3 aPosition;
layout(location = 3) in vec2 aCorner;
layout(location = 7) in vec2 aSize;
layout(location = 8) in vec4 aColor;
layout(location = 9) in vec4 aUvRect;
layout(location = 10) in float aRotation;

out vec2 vUv;
out vec4 vColor;

void main(void)
{
    float c = cos(aRotation);
    float s = sin(aRotation);
    vec2 corner = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);

    vec4 clip = uProj * uView * vec4(aPosition, 1.0);
    vec2 pixelsToClip = vec2(2.0 / uViewport.x, 2.0 / uViewport.y);
    clip.xy += corner * aSize * pixelsToClip * clip.w * 0.5;

    vUv = mix(aUvRect.xy, aUvRect.zw, aCorner + 0.5);
    vColor = aColor;
    vFragDepth = 1.0 + clip.w;
    gl_Position = clip;
}
`;

export const SPRITE_FRAGMENT = /* glsl */ `${FRAGMENT_COMMON}
uniform sampler2D uSprite;
uniform float uWriteDepth;

in vec2 vUv;
in vec4 vColor;

void main(void)
{
    vec4 texel = texture(uSprite, vUv);
    fragColor = texel * vColor;
    if (fragColor.a < 0.004) discard;
    if (uWriteDepth > 0.5)
    {
        CELESTIA_WRITE_DEPTH();
    }
}
`;

// ------------------------------------------------------------------- bodies
//
// One unit sphere mesh is shared by every body. The vertex stage scales it by
// the body's radii in the body frame, rotates it into the scene frame and
// offsets it to the camera relative centre, so ellipsoids come out correctly
// flattened without a mesh per body.

export const BODY_VERTEX = /* glsl */ `${VERTEX_COMMON}
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

uniform mat3 uBodyToScene;
uniform vec3 uCenter;
uniform vec3 uRadii;

out vec2 vTexCoord;
out vec3 vNormal;
out vec3 vScenePosition;

void main(void)
{
    vec3 local = aPosition * uRadii;
    vTexCoord = aTexCoord;
    vNormal = uBodyToScene * (aNormal / uRadii);
    vScenePosition = uCenter + uBodyToScene * local;
    gl_Position = celestiaProject(vec4(vScenePosition, 1.0));
}
`;

export const BODY_FRAGMENT = /* glsl */ `${FRAGMENT_COMMON}
uniform sampler2D uSurface;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform sampler2D uBump;

uniform vec3 uSunDirection;
uniform float uSunIrradiance;
uniform float uAmbient;
uniform vec3 uLightColor;
uniform float uHasNight;
uniform float uHasClouds;
uniform float uHasBump;
uniform float uCloudShadow;
uniform float uEclipseShadow;
uniform float uCloudTexOffset;

in vec2 vTexCoord;
in vec3 vNormal;
in vec3 vScenePosition;

void main(void)
{
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(-vScenePosition);

    // Lambert term with a softened terminator so the night side falls off
    // gradually rather than ending on a hard edge.
    float cosSun = dot(normal, uSunDirection);
    float terminator = smoothstep(-0.12, 0.12, cosSun) * max(cosSun, 0.0);

    vec3 albedo = texture(uSurface, vTexCoord).rgb;

    // Cloud layer, composited before lighting so the terminator applies to it.
    if (uHasClouds > 0.5)
    {
        vec4 cloud = texture(uClouds, vec2(vTexCoord.x + uCloudTexOffset, vTexCoord.y));
        float shade = mix(1.0, 1.0 - uCloudShadow, clamp(1.0 - max(cosSun, 0.0) * 2.0, 0.0, 1.0));
        albedo = mix(albedo, cloud.rgb * shade, cloud.a);
    }

    vec3 lit = albedo * (terminator * uSunIrradiance * uLightColor + uAmbient);

    // Night side emissive map, which only Earth provides.
    if (uHasNight > 0.5)
    {
        float nightFactor = 1.0 - smoothstep(-0.05, 0.25, cosSun);
        lit += texture(uNight, vTexCoord).rgb * nightFactor * uEclipseShadow * uSunIrradiance;
    }

    // Blinn-Phong highlight, masked by the bump map so it only appears on water.
    if (uHasBump > 0.5)
    {
        float mask = texture(uBump, vTexCoord).r;
        vec3 halfVector = normalize(uSunDirection + viewDir);
        float highlight = pow(max(dot(normal, halfVector), 0.0), 48.0) * mask * 0.55;
        lit += vec3(highlight) * uSunIrradiance * uLightColor;
    }

    fragColor = vec4(lit, 1.0);
    CELESTIA_WRITE_DEPTH();
}
`;

// -------------------------------------------------------------- atmosphere
//
// A single shell drawn with additive blending. Opacity rises towards the limb,
// which reproduces the limb brightening of a real atmosphere at planetary
// distances.

export const ATMOSPHERE_VERTEX = /* glsl */ `${VERTEX_COMMON}
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat3 uBodyToScene;
uniform vec3 uCenter;
uniform vec3 uRadii;

out vec3 vNormal;
out vec3 vScenePosition;

void main(void)
{
    vec3 local = aPosition * uRadii;
    vNormal = uBodyToScene * aNormal;
    vScenePosition = uCenter + uBodyToScene * local;
    gl_Position = celestiaProject(vec4(vScenePosition, 1.0));
}
`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `${FRAGMENT_COMMON}
uniform vec3 uSunDirection;
uniform vec3 uRayleigh;
uniform float uMie;
uniform float uSunIrradiance;

in vec3 vNormal;
in vec3 vScenePosition;

void main(void)
{
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(-vScenePosition);

    float rim = 1.0 - max(dot(normal, viewDir), 0.0);
    rim = pow(clamp(rim, 0.0, 1.0), 2.2);

    float cosSun = dot(normal, uSunDirection);
    float day = smoothstep(-0.45, 0.10, cosSun);

    vec3 color = uRayleigh * rim * day * uSunIrradiance + vec3(uMie) * rim * day;
    float alpha = clamp(rim * day * 0.9, 0.0, 1.0);

    fragColor = vec4(color, alpha);
}
`;

// -------------------------------------------------------------------- rings

export const RING_VERTEX = /* glsl */ `${VERTEX_COMMON}
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

uniform mat3 uBodyToScene;
uniform vec3 uCenter;
uniform vec3 uRadii;

out vec2 vTexCoord;
out vec3 vNormal;
out vec3 vScenePosition;

void main(void)
{
    vec3 local = aPosition * uRadii;
    vTexCoord = aTexCoord;
    vNormal = uBodyToScene * aNormal;
    vScenePosition = uCenter + uBodyToScene * local;
    gl_Position = celestiaProject(vec4(vScenePosition, 1.0));
}
`;

export const RING_FRAGMENT = /* glsl */ `${FRAGMENT_COMMON}
uniform sampler2D uRingTexture;
uniform vec3 uSunDirection;
uniform vec3 uRingColor;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
uniform float uSunIrradiance;

in vec2 vTexCoord;
in vec3 vNormal;
in vec3 vScenePosition;

void main(void)
{
    vec4 texel = texture(uRingTexture, vTexCoord);
    if (texel.a < 0.01) discard;

    vec3 normal = normalize(vNormal);
    float cosSun = abs(dot(normal, uSunDirection));
    float lit = mix(0.12, 1.0, smoothstep(0.0, 0.35, cosSun));

    // Shadow cast by the planet across the ring plane.
    vec3 toPlanet = uPlanetCenter - vScenePosition;
    float alongSun = dot(toPlanet, uSunDirection);
    float shadow = 1.0;
    if (alongSun > 0.0)
    {
        float lateral = length(toPlanet - uSunDirection * alongSun);
        shadow = smoothstep(uPlanetRadius * 0.92, uPlanetRadius * 1.10, lateral);
    }

    vec3 color = uRingColor * texel.rgb * lit * shadow * uSunIrradiance;
    fragColor = vec4(color, texel.a);
    CELESTIA_WRITE_DEPTH();
}
`;

// -------------------------------------------------------------------- lines

export const LINE_VERTEX = /* glsl */ `${VERTEX_COMMON}
layout(location = 0) in vec3 aPosition;
layout(location = 3) in float aFade;

out float vFade;

void main(void)
{
    vFade = aFade;
    gl_Position = celestiaProject(vec4(aPosition, 1.0));
}
`;

export const LINE_FRAGMENT = /* glsl */ `${FRAGMENT_COMMON}
uniform vec4 uColor;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uCameraDistance;
uniform float uWriteDepth;

in float vFade;

void main(void)
{
    vec4 color = uColor;
    color.a *= vFade;

    if (uFadeFar > 0.0)
    {
        // Orbits fade out with distance so a distant system does not turn into a
        // solid blob of lines.
        color.a *= 1.0 - smoothstep(uFadeNear, uFadeFar, uCameraDistance);
    }

    if (color.a < 0.004) discard;
    fragColor = color;
    if (uWriteDepth > 0.5)
    {
        CELESTIA_WRITE_DEPTH();
    }
}
`;

// ----------------------------------------------------------- selection pointer
//
// Ported from shaders/selpointer_vert.glsl: a unit square is scaled to
// uPixelSize, rotated by uCos and uSin and placed on the screen aligned axes
// uRight and uUp around uCenter, then projected with the scene matrices.

export const SELECTION_VERTEX = /* glsl */ `${VERTEX_COMMON}
layout(location = 0) in vec2 aCorner;

uniform float uPixelSize;
uniform float uCos;
uniform float uSin;
uniform vec3 uCenter;
uniform vec3 uRight;
uniform vec3 uUp;

out vec2 vCorner;

void main(void)
{
    float x = aCorner.x * uPixelSize;
    float y = aCorner.y * uPixelSize;
    vec3 pos = (x * uCos - y * uSin) * uRight + (x * uSin + y * uCos) * uUp + uCenter;
    vCorner = aCorner;
    gl_Position = celestiaProject(vec4(pos, 1.0));
}
`;

export const SELECTION_FRAGMENT = /* glsl */ `${FRAGMENT_COMMON}
uniform vec4 uColor;
in vec2 vCorner;

void main(void)
{
    // The frame is drawn as four bars with a gap in the middle.
    float ax = abs(vCorner.x);
    float ay = abs(vCorner.y);
    if (ax > 0.55 && ay > 0.55)
    {
        discard;
    }
    fragColor = uColor;
}
`;

// --------------------------------------------------------------------- text
//
// Labels and HUD text come from a glyph atlas generated on the CPU. Each quad
// carries a screen space origin in pixels so text keeps a constant size.

export const TEXT_VERTEX = /* glsl */ `
precision highp float;

uniform vec2 uViewport;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aOrigin;
layout(location = 2) in vec4 aUvRect;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec2 aSize;
layout(location = 5) in float aDepth;

out vec2 vUv;
out vec4 vColor;

void main(void)
{
    vec2 pixel = aOrigin + aCorner * aSize;
    vec2 ndc = vec2(pixel.x / uViewport.x * 2.0 - 1.0, 1.0 - pixel.y / uViewport.y * 2.0);
    vUv = mix(aUvRect.xy, aUvRect.zw, aCorner);
    vColor = aColor;
    gl_Position = vec4(ndc, aDepth, 1.0);
}
`;

export const TEXT_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uAtlas;

in vec2 vUv;
in vec4 vColor;

out vec4 fragColor;

void main(void)
{
    vec4 texel = texture(uAtlas, vUv);
    fragColor = vec4(vColor.rgb, vColor.a * texel.a);
    if (fragColor.a < 0.01) discard;
}
`;

// ------------------------------------------------------------------ backdrop
//
// A full screen quad drawing the sky background, including a band along the
// galactic plane.

export const BACKDROP_VERTEX = /* glsl */ `
precision highp float;
layout(location = 0) in vec2 aCorner;
uniform vec2 uViewport;
out vec2 vUv;
void main(void)
{
    vUv = vec2(aCorner.x / uViewport.x * 2.0 - 1.0, aCorner.y / uViewport.y * 2.0 - 1.0);
    gl_Position = vec4(aCorner.x / uViewport.x * 2.0 - 1.0, 1.0 - aCorner.y / uViewport.y * 2.0, 0.0, 1.0);
}
`;

export const BACKDROP_FRAGMENT = /* glsl */ `
precision highp float;

in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uGalacticNormal;
uniform vec3 uGalacticCenter;

out vec4 fragColor;

void main(void)
{
    vec4 far = uInvViewProj * vec4(vUv, 1.0, 1.0);
    vec3 dir = normalize(far.xyz / far.w);

    float band = 1.0 - abs(dot(dir, uGalacticNormal));
    float glow = pow(clamp(band, 0.0, 1.0), 24.0);
    float centre = pow(max(dot(dir, uGalacticCenter), 0.0), 3.0);
    vec3 color = vec3(0.026, 0.029, 0.047) + vec3(0.085, 0.088, 0.125) * glow * (0.4 + centre);
    fragColor = vec4(color, 1.0);
}
`;
