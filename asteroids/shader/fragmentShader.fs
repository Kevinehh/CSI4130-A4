// ./shader/fragmentShader.fs

varying vec3 vWorldPosition;
varying vec3 vViewDirection;

uniform vec3 uCameraPos;       // Camera position in world space
uniform vec3 uFogColor;        // Base color of the fog
uniform float uBeltRadius;     // Center radius of the torus
uniform float uTorusRadius;    // Thickness radius of the torus cross-section
uniform float uNoiseScale;     // How large the noise patterns are
uniform float uNoiseStrength;  // How much the noise affects density
uniform float uDensityScale;   // Overall density multiplier
uniform int uSteps;            // Number of raymarching steps
uniform float uMaxDist;        // Max distance to march

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);

    // Smoothstep interpolation
    vec3 u = f * f * (3.0 - 2.0 * f);

    return mix(mix(mix( hash(i + vec3(0.0,0.0,0.0)),
                         hash(i + vec3(1.0,0.0,0.0)), u.x),
                   mix( hash(i + vec3(0.0,1.0,0.0)),
                         hash(i + vec3(1.0,1.0,0.0)), u.x), u.y),
               mix(mix( hash(i + vec3(0.0,0.0,1.0)),
                         hash(i + vec3(1.0,0.0,1.0)), u.x),
                   mix( hash(i + vec3(0.0,1.0,1.0)),
                         hash(i + vec3(1.0,1.0,1.0)), u.x), u.y), u.z);
}



float sdfTorus(vec3 p, float r1, float r2) {
  vec2 q = vec2(length(p.xy) - r1, p.z);
  return length(q) - r2;
}


vec4 raymarch(vec3 rayOrigin, vec3 rayDir) {
    float totalDensity = 0.0;
    float dist = 0.0;
    float stepSize = uMaxDist / float(uSteps);

    for (int i = 0; i < uSteps; i++) {
        vec3 p = rayOrigin + rayDir * dist;

        // Calculate distance to the torus surface
        float torusDist = sdfTorus(p, uBeltRadius, uTorusRadius);

        // Calculate density based on distance *inside* the torus
        // Use smoothstep for a softer falloff near the edge
        float density = 0.0;
        if (torusDist < 0.0) { // If inside the torus volume
             // Calculate falloff: closer to 0 distance = higher density
             // Make it denser in the middle of the torus tube
             density = smoothstep(0.0, -uTorusRadius, torusDist); // 1 deep inside, 0 at surface

             // Add noise - sample noise based on world position
             float noiseVal = noise(p * uNoiseScale) * 2.0 - 1.0; // Range -1 to 1
             density *= (1.0 + noiseVal * uNoiseStrength);
             density = max(0.0, density); // Ensure density isn't negative

             // Accumulate density scaled by overall scale and step size
             totalDensity += density * uDensityScale * stepSize;
        }


        dist += stepSize;
        if (dist > uMaxDist || totalDensity > 1.5) break; // Stop if too far or too dense
    }

    // Apply Beer's Law for transparency: T = exp(-density)
    float transmittance = exp(-totalDensity);

    // Final color: fog color blended based on transparency
    return vec4(uFogColor, 1.0 - transmittance); // Alpha = 1 - transmittance
}


void main() {
  // Normalize the direction from the fragment position towards the camera
  vec3 rayDir = normalize(-vViewDirection); // Ray direction from camera to fragment

  // The ray origin is the camera position
  vec3 rayOrigin = uCameraPos;

  // Perform raymarching
  vec4 result = raymarch(rayOrigin, rayDir);

  // Discard fragments that are fully transparent and outside the torus visually
   if (result.a < 0.01) {
     discard;
   }

  gl_FragColor = result;
}