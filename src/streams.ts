import * as THREE from "three";

export let streamGeometry: THREE.BufferGeometry;
export let streamPositions: Float32Array;
export let streamVelocities: Float32Array;
export let streamPoints: THREE.Points;

export function initStreams() {
  streamGeometry = new THREE.BufferGeometry();
  streamPositions = new Float32Array(33 * 3 * 10); // 33 landmarks * 3 coordinates * 10 particles per stream
  streamVelocities = new Float32Array(33 * 3 * 10);
  streamGeometry.setAttribute('position', new THREE.BufferAttribute(streamPositions, 3));

  const streamMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec3 vColor;
      void main() {
        vColor = vec3(0.5, 0.5, 1.0); // Milky Way color
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 3.0 * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float glow = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor, glow * 0.8);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  streamPoints = new THREE.Points(streamGeometry, streamMaterial);
}

export function updateStreams(smoothedLandmarks: any[]) {
  if (!streamGeometry) return;

  for (let i = 0; i < smoothedLandmarks.length; i++) {
    const point = smoothedLandmarks[i];
    const i3 = i * 3;

    for (let j = 0; j < 10; j++) { // 10 particles per stream
      const index = i3 * 10 + j * 3;
      if (j === 0) {
        // Anchor the first particle to the landmark
        streamPositions[index + 0] = (point.x - 0.5) * 2 * 100;
        streamPositions[index + 1] = -(point.y - 0.5) * 2 * 100;
        streamPositions[index + 2] = -point.z * 100;
      } else {
        // Move subsequent particles along the stream
        streamVelocities[index + 0] += (Math.random() - 0.5) * 0.05;
        streamVelocities[index + 1] += (Math.random() - 0.5) * 0.05;
        streamVelocities[index + 2] += (Math.random() - 0.5) * 0.05;

        streamPositions[index + 0] += streamVelocities[index + 0];
        streamPositions[index + 1] += streamVelocities[index + 1];
        streamPositions[index + 2] += streamVelocities[index + 2];

        // Dampen velocities for smoother motion
        streamVelocities[index + 0] *= 0.95;
        streamVelocities[index + 1] *= 0.95;
        streamVelocities[index + 2] *= 0.95;

        // Pull particles back toward the previous particle
        const prevIndex = index - 3;
        streamPositions[index + 0] += (streamPositions[prevIndex + 0] - streamPositions[index + 0]) * 0.1;
        streamPositions[index + 1] += (streamPositions[prevIndex + 1] - streamPositions[index + 1]) * 0.1;
        streamPositions[index + 2] += (streamPositions[prevIndex + 2] - streamPositions[index + 2]) * 0.1;
      }
    }
  }

  streamGeometry.attributes.position.needsUpdate = true;
}
