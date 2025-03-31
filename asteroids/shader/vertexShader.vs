// /shader/vertexShader.vs

varying vec3 vWorldPosition;
varying vec3 vViewDirection; // Direction from vertex to camera

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vViewDirection = cameraPosition - worldPosition.xyz; // Vector from vertex position to camera
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}