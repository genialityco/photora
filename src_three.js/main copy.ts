import "./style.css";
import * as THREE from "three";


//Estos imports son para la auraconcamara
import { Noise } from "noisejs";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { PoseLandmarker, FilesetResolver } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

//import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { saveMessage } from "./firebaseMessages";

const demosSection = document.getElementById("demos");

type RunningMode = "IMAGE" | "VIDEO";



const noise = new Noise(Math.random());
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer;
let points: THREE.Points;
let particlePositions: Float32Array;
let basePositions: Float32Array;
let composer: EffectComposer;
let emitterGeometry: THREE.BufferGeometry;
let emitterPositions: Float32Array;
let emitterVelocities: Float32Array;
let emitterPoints: THREE.Points;

let streamGeometry: THREE.BufferGeometry;
let streamPositions: Float32Array;
let streamVelocities: Float32Array;
let streamPoints: THREE.Points;

let poseLandmarker: PoseLandmarker;
let lastVideoTime = -1;
const smoothingFactor = 0.8;
let previousLandmarks = [];
const video = document.getElementById("webcam") as HTMLVideoElement;

// Variables de la detección de pose
let runningMode = "IMAGE";
let enableWebcamButton: HTMLButtonElement;
let detectionActive = true;
let webcamRunning: boolean = false;
const videoHeight = "200px";
const videoWidth = "320px";

// Parámetros para Three.js
const connectionMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
const pointSize = 0.05;

// Grupo para los objetos de la pose
let poseGroup: THREE.Group;

// Función para crear la textura de glow (aura)
function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 0, 1)");
  gradient.addColorStop(0.5, "rgba(255, 255, 0, 0.5)");
  gradient.addColorStop(1, "rgba(255, 255, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
const glowTexture = createGlowTexture();

function animateStarAt(position: THREE.Vector3) {
  const starMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 1,
  });
  const starSprite = new THREE.Sprite(starMaterial);
  starSprite.position.copy(position);
  starSprite.scale.set(0.5, 0.5, 0.5);
  scene.add(starSprite);

  const totalDuration = 12000;

  // Dividimos la animación en 3 fases:
  const phase1Ratio = 0.3;
  const phase2Ratio = 0.4;
  const phase3Ratio = 0.3;
  const startTime = performance.now();
  const origin = position.clone();

  // Movimiento
  const moveRadiusX = 1.5;
  const moveRadiusY = 1.0;
  const totalRotationDuringPhase2 = 4 * Math.PI;

  function animate() {
    const elapsed = performance.now() - startTime;
    const tTotal = Math.min(elapsed / totalDuration, 1);

    if (tTotal < phase1Ratio) {
      //Expansión Inicial
      const tPhase1 = tTotal / phase1Ratio;
      const easeOut = 1 - Math.pow(1 - tPhase1, 3);
      const scale = 0.5 + easeOut * 2.5;
      starSprite.scale.set(scale, scale, scale);
      starSprite.position.copy(origin);
      starMaterial.opacity = 1;
      starSprite.rotation.x += easeOut * 0.05;
      starSprite.rotation.y += easeOut * 0.05;
      starSprite.rotation.z += easeOut * 0.05;
    } else if (tTotal < phase1Ratio + phase2Ratio) {
      const tPhase2 = (tTotal - phase1Ratio) / phase2Ratio;
      const angle = totalRotationDuringPhase2 * tPhase2;
      starSprite.position.set(
        origin.x + moveRadiusX * Math.cos(angle),
        origin.y + moveRadiusY * Math.sin(angle),
        origin.z
      );
      const baseScale = 0.5 + 2.5;
      const pulsation = 1 + 0.05 * Math.sin(8 * Math.PI * tPhase2);
      starSprite.scale.set(baseScale * pulsation, baseScale * pulsation, baseScale * pulsation);
      starSprite.rotation.x += 0.05;
      starSprite.rotation.y += 0.05;
      starSprite.rotation.z += 0.05;

      const blink = 0.5 + 0.5 * Math.abs(Math.sin(4 * Math.PI * tPhase2));
      starMaterial.opacity = tPhase2 < 0.5 ? 1 : blink;
    } else {
      const tPhase3 = (tTotal - phase1Ratio - phase2Ratio) / phase3Ratio;
      const exitOffsetY = 2.0;
      starSprite.position.y += exitOffsetY * tPhase3;
      starSprite.rotation.x += 0.1;
      starSprite.rotation.y += 0.1;
      starSprite.rotation.z += 0.1;

      starMaterial.opacity = 1 - tPhase3;
    }

    renderer.render(scene, camera);

    if (tTotal < 1) {
      requestAnimationFrame(animate);
    } else {
      scene.remove(starSprite);
      const audio4 = new Audio("/Estrellas-4.mp3");
      audio4.play().catch((error) => {
        console.log("La reproducción del audio Estrellas-4 fue bloqueada:", error);
      });
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }
  animate();
}

// Inicialización de la escena Three.js
function init_action_buttons() {
  // scene = new THREE.Scene();

  // camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  // camera.position.z = 5;

  // renderer = new THREE.WebGLRenderer({ alpha: true });
  // renderer.setSize(window.innerWidth, window.innerHeight);
  // renderer.setClearColor(0x000000, 0);
  // document.getElementById("three-container")!.appendChild(renderer.domElement);

  // Obtener elementos del modal
  const signatureButton = document.getElementById("signatureButton") as HTMLButtonElement;
  const signatureModal = document.getElementById("signatureModal") as HTMLDivElement;
  const signatureSubmit = document.getElementById("signatureSubmit") as HTMLButtonElement;
  const signatureClose = document.getElementById("signatureClose") as HTMLButtonElement;
  const signatureInput = document.getElementById("signatureInput") as HTMLTextAreaElement;

  signatureButton.addEventListener("click", () => {
    signatureModal.classList.remove("hidden");
  });

  signatureClose.addEventListener("click", () => {
    signatureModal.classList.add("hidden");
  });
  signatureSubmit.addEventListener("click", async () => {
    const mensaje = signatureInput.value.trim();
    if (!mensaje) {
      alert("Por favor ingresa un mensaje antes de enviar.");
      return;
    }
    console.log("Mensaje recibido:", mensaje);
    await saveMessage(mensaje);
    signatureModal.classList.add("hidden");
    signatureInput.value = "";
    const audio3 = new Audio("/Estrellas-3.mp3");
    audio3.play().catch((error) => {
      console.log("La reproducción del audio Estrellas-3 fue bloqueada: ", error);
    });
    detectionActive = false;
    webcamRunning = false;
    const stream = video.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (poseGroup) {
      poseGroup.clear();
    }
    animateStarAt(new THREE.Vector3(0, 0, 0));
  });

  poseGroup = new THREE.Group();
  poseGroup.renderOrder = 1;
  //scene.add(poseGroup);
}

init_action_buttons();

// Creamos el poseLandmarker esta función se ejecuta cuando el usuario presione "Comenzar"
const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: runningMode as RunningMode,
    numPoses: 2,
  });
  console.log("Termino de cargar, mostrando modelo");
  demosSection!.classList.remove("invisible");
};

// Configuración de la webcam y elementos de la interfaz

const canvasElement = document.getElementById("webgl") as HTMLCanvasElement;
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// Control de overlays
const welcomeScreen = document.getElementById("welcomeScreen") as HTMLDivElement;
const instructionScreen = document.getElementById("instructionScreen") as HTMLDivElement;
const startButton = document.getElementById("startButton") as HTMLButtonElement;

// REPRODUCIR AUDIO EN LA PRIMERA PANTALLA
if (welcomeScreen) {
  const audio = new Audio("/Estrellas-1.mp3");
  audio.play().catch((error) => {
    console.log("Autoplay del audio fue bloqueado: ", error);
  });
}

// Maneja el flujo de la pantalla de bienvenida
startButton.addEventListener("click", async () => {
  welcomeScreen.classList.add("hidden");
  instructionScreen.classList.remove("hidden");
  const audio2 = new Audio("/Estrellas-2.mp3");
  audio2.play().catch((error) => {
    console.log("Autoplay del audio Estrellas-2 fue bloqueado: ", error);
  });

  setTimeout(async () => {
    instructionScreen.classList.add("hidden");
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) {
      loadingScreen.classList.remove("hidden");
    }

    init();
    //await createPoseLandmarker();
    //startCamera();
  },0 );11000
});

// function startCamera() {
//   if (hasGetUserMedia()) {
//     enableWebcamButton = document.getElementById("webcamButton") as HTMLButtonElement;
//     enableWebcamButton.innerText = "■";
//     webcamRunning = true;
//     const bgAudio = new Audio("/melody-back.mp3");
//     bgAudio.loop = true;
//     bgAudio.play().catch((error) => {
//       console.log("La reproducción del audio de fondo fue bloqueada: ", error);
//     });
//     const constraints = { video: true };
//     navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
//       video.srcObject = stream;
//       // Cuando el video cargue sus datos, ocultamos el loadingScreen y comenzamos la detección
//       video.addEventListener("loadeddata", () => {
//         const loadingScreen = document.getElementById("loadingScreen");
//         if (loadingScreen) {
//           loadingScreen.classList.add("hidden");
//         }
//         predictWebcam();
//       });
//     });
//   } else {
//     console.warn("getUserMedia() is not supported by your browser");
//   }
// }


// Initialize pose landmarker
async function initPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// Enable webcam and start pose detection
async function enableWebcam() {
  const constraints = { video: { width: 640, height: 480 } }; // Ensure valid video dimensions
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  // Style the video element to display in the corner

  video.style.zIndex = "10"; // Ensure it appears above the canvas
  //video.style.border = "2px solid white";
  //video.style.borderRadius = "8px";
  //video.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";


  // Wait for the video to load metadata before playing
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });

  webcamRunning = true;
  predictWebcam();
}

// Predict landmarks from webcam
async function predictWebcam() {
  if (!poseLandmarker || !webcamRunning || video.readyState < 2) {
    // Ensure the video is ready before processing
    requestAnimationFrame(predictWebcam);
    return;
  }

  const currentTime = video.currentTime;
  if (lastVideoTime !== currentTime) {
    lastVideoTime = currentTime;

    try {
      const result = await poseLandmarker.detectForVideo(video, performance.now());
      if (result.landmarks.length > 0) {
        const smoothedLandmarks = [];
        const landmarks = result.landmarks[0];

        for (let i = 0; i < landmarks.length; i++) {
          const currentPoint = landmarks[i];
          if (previousLandmarks[i]) {
            const previousPoint = previousLandmarks[i];
            smoothedLandmarks.push({
              x: smoothingFactor * previousPoint.x + (1 - smoothingFactor) * currentPoint.x,
              y: smoothingFactor * previousPoint.y + (1 - smoothingFactor) * currentPoint.y,
              z: smoothingFactor * previousPoint.z + (1 - smoothingFactor) * currentPoint.z,
            });
          } else {
            smoothedLandmarks.push(currentPoint);
          }
        }

        previousLandmarks = smoothedLandmarks;

        // Update particle positions
        basePositions = new Float32Array(smoothedLandmarks.length * 3);
        for (let i = 0; i < smoothedLandmarks.length; i++) {
          const point = smoothedLandmarks[i];
          const i3 = i * 3;
          basePositions[i3 + 0] = (point.x - 0.5) * 2 * 100; // Scale and center
          basePositions[i3 + 1] = -(point.y - 0.5) * 2 * 100; // Flip Y and scale
          basePositions[i3 + 2] = -point.z * 100; // Scale Z
        }

        particlePositions.set(basePositions);
        points.geometry.attributes.position.needsUpdate = true;

        // Update emitters for glow effect
        updateEmitters(smoothedLandmarks);

        // Update streams for Milky Way effect
        updateStreams(smoothedLandmarks);
      }
    } catch (error) {
      console.error("Pose detection failed:", error);
    }
  }

  requestAnimationFrame(predictWebcam);
}

async function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.z = 300;

  const canvas = document.getElementById('webgl') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0.8);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Initialize particle system
  const geometry = new THREE.BufferGeometry();
  particlePositions = new Float32Array(33 * 3); // 33 landmarks * 3 coordinates
  basePositions = new Float32Array(33 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec3 vColor;
      void main() {
        vColor = vec3(0.0, 1.0, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 5.0 * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float glow = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor, glow * 0.5);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);

  // Set up postprocessing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  //composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.5, 0.8, 0.7));

  window.addEventListener('resize', onResize);

  // Initialize pose landmarker and webcam
  await initPoseLandmarker();
  enableWebcam();

  initStreams(); // Initialize the particle stream system

  animateaura();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function animateaura() {
  requestAnimationFrame(animateaura);

  const time = performance.now() * 0.001;
  (points.material as THREE.ShaderMaterial).uniforms.time.value = time;
  if (emitterPoints) {
    (emitterPoints.material as THREE.ShaderMaterial).uniforms.time.value = time;
  }

  composer.render();
}



// Update particle system to simulate energy dispersion
function updateEmitters(smoothedLandmarks: any[]) {
  if (!emitterGeometry) {
    emitterGeometry = new THREE.BufferGeometry();
    emitterPositions = new Float32Array(smoothedLandmarks.length * 3);
    emitterVelocities = new Float32Array(smoothedLandmarks.length * 3);
    emitterGeometry.setAttribute('position', new THREE.BufferAttribute(emitterPositions, 3));
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
    scene.add(emitterPoints);
  }

  for (let i = 0; i < smoothedLandmarks.length; i++) {
    const point = smoothedLandmarks[i];
    const i3 = i * 3;
    emitterPositions[i3 + 0] = (point.x - 0.5) * 2 * 100; // Scale and center
    emitterPositions[i3 + 1] = -(point.y - 0.5) * 2 * 100; // Flip Y and scale
    emitterPositions[i3 + 2] = -point.z * 100; // Scale Z

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

// Initialize particle stream system
function initStreams() {
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
  scene.add(streamPoints);
}

// Update particle streams to flow between landmarks
function updateStreams(smoothedLandmarks: any[]) {
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




async function predictWebcamxxxx() {
  if (!scene) {
    initThreeJS();
  }
  if (!detectionActive) return;
  canvasElement.style.display = "none";
  video.style.height = videoHeight;
  video.style.width = videoWidth;
  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await poseLandmarker!.setOptions({ runningMode: "VIDEO" });
  }
  const oscFactor = 1 + 0.1 * Math.sin(performance.now() / 200);
  const startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    if (poseGroup) {
      scene.remove(poseGroup);
      poseGroup = new THREE.Group();
      poseGroup.renderOrder = 1;
      scene.add(poseGroup);
    }
    poseLandmarker!.detectForVideo(video, startTimeMs, (result: { landmarks: any }) => {
      for (const landmark of result.landmarks) {
        const vertices: number[] = [];
        for (const point of landmark) {
          vertices.push((point.x - 0.5) * 2, -(point.y - 0.5) * 2, -point.z);
        }
        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        const pointsMaterial = new THREE.PointsMaterial({
          color: 0xff0000,
          size: pointSize,
        });
        const pointsObj = new THREE.Points(pointsGeometry, pointsMaterial);
        poseGroup.add(pointsObj);
        const spriteMaterial = new THREE.SpriteMaterial({
          map: glowTexture,
          blending: THREE.AdditiveBlending,
          transparent: true,
        });
        for (let i = 0; i < landmark.length; i++) {
          const pt = landmark[i];
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.scale.set(pointSize * 8 * oscFactor, pointSize * 8 * oscFactor, 1);
          sprite.position.set((pt.x - 0.5) * 2, -(pt.y - 0.5) * 2, -pt.z);
          poseGroup.add(sprite);
        }
        const connections = PoseLandmarker.POSE_CONNECTIONS;
        for (const connection of connections) {
          const startIndex = connection.start;
          const endIndex = connection.end;
          if (startIndex < landmark.length && endIndex < landmark.length) {
            const startPt = landmark[startIndex];
            const endPt = landmark[endIndex];
            const v1 = new THREE.Vector3((startPt.x - 0.5) * 2, -(startPt.y - 0.5) * 2, -startPt.z);
            const v2 = new THREE.Vector3((endPt.x - 0.5) * 2, -(endPt.y - 0.5) * 2, -endPt.z);
            const lineGeom = new THREE.BufferGeometry().setFromPoints([v1, v2]);
            const line = new THREE.Line(lineGeom, connectionMaterial);
            poseGroup.add(line);
            const center = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
            const baseScale = 1.5;
            const lineScale = baseScale * oscFactor;
            const auraV1 = new THREE.Vector3().subVectors(v1, center).multiplyScalar(lineScale).add(center);
            const auraV2 = new THREE.Vector3().subVectors(v2, center).multiplyScalar(lineScale).add(center);
            const auraLineGeom = new LineGeometry();
            auraLineGeom.setPositions([auraV1.x, auraV1.y, auraV1.z, auraV2.x, auraV2.y, auraV2.z]);
            const auraLineMaterial = new LineMaterial({
              color: 0xffff00,
              transparent: true,
              opacity: 0.3,
              linewidth: 10,
            });
            auraLineMaterial.resolution.set(window.innerWidth, window.innerHeight);
            const auraLine = new Line2(auraLineGeom, auraLineMaterial);
            poseGroup.add(auraLine);
          }
        }
      }
      renderer.render(scene, camera);
    });
  }
  if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
  }
}
