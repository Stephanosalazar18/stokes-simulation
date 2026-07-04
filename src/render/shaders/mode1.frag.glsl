varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float alpha = 1.0 - d * 2.0;
  gl_FragColor = vec4(vColor, alpha);
}
