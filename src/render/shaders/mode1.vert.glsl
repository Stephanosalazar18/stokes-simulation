attribute float aMagnitude;
varying vec3 vColor;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = 2.0 + aMagnitude * 4.0;
  vColor = color;
}
