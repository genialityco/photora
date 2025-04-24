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
import { initStreams, updateStreams, streamPoints } from "./streams";
import { updateEmitters, setEmitterScene } from "./emitters";
import { createPosePointMaterial } from "./posePointMaterial";

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

// Inicialización de la escena Three.js
// function init_action_buttons() {
//   poseGroup = new THREE.Group();
//   poseGroup.renderOrder = 1;

// }

// init_action_buttons();

// Configuración de la webcam y elementos de la interfaz

const canvasElement = document.getElementById("webgl") as HTMLCanvasElement;
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// --- Add this block to style video and canvas for overlap ---
const styleForOverlap = () => {
  // Ensure the canvas and video are absolutely positioned and overlap
  canvasElement.style.position = "absolute";
  canvasElement.style.top = "0";
  canvasElement.style.left = "0";
  canvasElement.style.width = "100vw";
  canvasElement.style.height = "100vh";
  canvasElement.style.zIndex = "2";

  video.style.position = "absolute";
  video.style.top = "0";
  video.style.left = "0";
  video.style.width = "100vw";
  video.style.height = "100vh";
  video.style.objectFit = "cover";
  video.style.zIndex = "1"; // Video above canvas

  // Optionally, pointer events none so video doesn't block UI
  video.style.pointerEvents = "none";
};
styleForOverlap();
// --- End of block ---

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

init();

// Initialize pose landmarker
async function initPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
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
          // Invert X to match video direction
          basePositions[i3 + 0] = ((1 - point.x) - 0.5) * 2 * 100; // <-- X is flipped here
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
  setEmitterScene(scene);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.z = 300;

  const canvas = document.getElementById("webgl") as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0); // <-- Set alpha to 0 for full transparency
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Initialize particle system
  const geometry = new THREE.BufferGeometry();
  particlePositions = new Float32Array(33 * 3); // 33 landmarks * 3 coordinates
  basePositions = new Float32Array(33 * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

  const material = createPosePointMaterial();

  points = new THREE.Points(geometry, material);
  scene.add(points);

  // Set up postprocessing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  window.addEventListener("resize", onResize);

  // Initialize pose landmarker and webcam
  await initPoseLandmarker();
  enableWebcam();

  //initStreams();
  if (streamPoints && streamPoints instanceof THREE.Object3D) {
    scene.add(streamPoints);
  }

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
