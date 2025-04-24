import * as THREE from "three";

let emitterGeometry: THREE.BufferGeometry;
let emitterPositions: Float32Array;
let emitterVelocities: Float32Array;
let emitterPoints: THREE.Points;
let scene: THREE.Scene;

export function setEmitterScene(s: THREE.Scene) {
  scene = s;
}

export function updateEmitters(smoothedLandmarks: any[]) {
  if (!emitterGeometry) {
    emitterGeometry = new THREE.BufferGeometry();
    emitterPositions = new Float32Array(smoothedLandmarks.length * 3);
    emitterVelocities = new Float32Array(smoothedLandmarks.length * 3);
    emitterGeometry.setAttribute("position", new THREE.BufferAttribute(emitterPositions, 3));
    const emitterMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        uniform float time;
        varying vec3 vColor;
        void main() {
          vColor = vec3(1.0, 0.5, 0.0); // Orange glow
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 10.0 * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          float glow = 1.0 - smoothstep(0.2, 0.5, dist);
          gl_FragColor = vec4(vColor, glow);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    emitterPoints = new THREE.Points(emitterGeometry, emitterMaterial);
    if (scene) scene.add(emitterPoints);
  }

  for (let i = 0; i < smoothedLandmarks.length; i++) {
    const point = smoothedLandmarks[i];
    const i3 = i * 3;
    // Invert X to match video direction
    emitterPositions[i3 + 0] = ((1 - point.x) - 0.5) * 2 * 100;
    emitterPositions[i3 + 1] = -(point.y - 0.5) * 2 * 100;
    emitterPositions[i3 + 2] = -point.z * 100;

    // Add velocity for dynamic dispersion
    emitterVelocities[i3 + 0] += (Math.random() - 0.5) * 0.1;
    emitterVelocities[i3 + 1] += (Math.random() - 0.5) * 0.1;
    emitterVelocities[i3 + 2] += (Math.random() - 0.5) * 0.1;

    emitterPositions[i3 + 0] += emitterVelocities[i3 + 0];
    emitterPositions[i3 + 1] += emitterVelocities[i3 + 1];
    emitterPositions[i3 + 2] += emitterVelocities[i3 + 2];

    // Dampen velocities for smoother motion
    emitterVelocities[i3 + 0] *= 0.95;
    emitterVelocities[i3 + 1] *= 0.95;
    emitterVelocities[i3 + 2] *= 0.95;
  }

  emitterGeometry.attributes.position.needsUpdate = true;
}
