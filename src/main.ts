import {
  ImageSegmenter,
  FilesetResolver,
  FaceLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import {
  ref as storageRef,
  uploadString,
  getDownloadURL,
  updateMetadata
} from "firebase/storage";
import { storage } from "./firebaseConfig";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { setupCameraConfig } from "./cameraConfig";


// DOM elements
const demosSection = document.getElementById("demos")! as HTMLElement;
const video = document.getElementById("webcam") as HTMLVideoElement;
const canvasElement = document.getElementById(
  "output_canvas"
) as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d", { alpha: true })!;

// State
let faceLandmarker: FaceLandmarker;
//let poseLandmarker: PoseLandmarker;
let segmenter: ImageSegmenter;
let webcamRunning = false;
const videoWidth = window.innerWidth;

// Preload overlay images
const crownImage = Object.assign(new Image(), { src: "/assets/CORONA.png" });
const malumaLogo = Object.assign(new Image(), {
  src: "/assets/LOGO-MALUMA.png",
});
const dogLeft = Object.assign(new Image(), { src: "/assets/PERRO 201.png" });
const dogRight = Object.assign(new Image(), { src: "/assets/PERRO 303.png" });
const textDorado = Object.assign(new Image(), {
  src: "/assets/TEXTO-DORADO.png",
});
// const m01Image     = Object.assign(new Image(), { src: "/assets/M 01.png" });
// const perro101Image = Object.assign(new Image(), { src: "/assets/PERRO 101.png" });

// Utility to draw an image centered at (cx, cy) with given width, preserving aspect
function drawOverlayImage(
  img: HTMLImageElement,
  cx: number,
  cy: number,
  w: number,
  mirrorHorizontally = false
) {
  if (!img.complete) return;
  const h = w * (img.naturalHeight / img.naturalWidth);

  canvasCtx.save();
  if (mirrorHorizontally) {
    canvasCtx.scale(-1, 1);
    cx = -cx; // Flip the x-coordinate for mirroring
  }
  canvasCtx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  canvasCtx.restore();
}

async function init() {
  // "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  const resolver = await FilesetResolver.forVisionTasks('/wasm');

  // FaceLandmarker
  faceLandmarker = await FaceLandmarker.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    outputFaceBlendshapes: false,
    numFaces: 1,
  });

  // PoseLandmarker (lite)
  // poseLandmarker = await PoseLandmarker.createFromOptions(resolver, {
  //   baseOptions: {
  //     modelAssetPath:
  //       "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  //     delegate: "GPU",
  //   },
  //   runningMode: "VIDEO",
  //   numPoses: 1,
  //   outputSegmentationMasks: false,
  // });
//    "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",

let segmenterModelPath = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
  segmenter = await ImageSegmenter.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath:segmenterModelPath,
    },
    runningMode: "VIDEO",
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });

  // Show UI and start camera
  demosSection.classList.remove("invisible");
  enableCam();
}

// === Crear modal ===
const modal = document.createElement("div");
modal.id = "preview-modal";
modal.innerHTML = `
  <div class="modal-content">
    <button class="close-btn">&times;</button>
    <img id="preview-img" src="" alt="Previsualización" />
    <div id="qr-code"></div>
  </div>
`;
document.body.appendChild(modal);


// Cerrar modal al hacer click en la “X” o fuera del contenido
modal
  .querySelector(".close-btn")!
  .addEventListener("click", () => (modal.style.display = "none"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

init();

function enableCam(deviceId?: string) {
  if (webcamRunning) {
    webcamRunning = false; // Stop the current prediction loop
    video.srcObject = null; // Clear the current video stream
  }

  const constraints: MediaStreamConstraints = {
    video: deviceId ? { deviceId: { exact: deviceId }, width: 1280, height: 720 } : { width: 1280, height: 720 },
  };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      webcamRunning = true; // Restart the prediction loop
      requestAnimationFrame(predict);
    };
  }).catch((err) => {
    console.error("Error accessing webcam:", err);
  });
}

let lastVideoTime = -1;
const bleedingArea = 200; // Define the bleeding area in pixels

// Create an offscreen canvas for processing
const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d", { alpha: true })!;

// Utility to process video frames offscreen
function processOffscreen(video: HTMLVideoElement) {
  offscreenCanvas.width = video.videoWidth;
  offscreenCanvas.height = video.videoHeight;
  offscreenCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
  return offscreenCtx.getImageData(0, 0, video.videoWidth, video.videoHeight);
}

async function predict() {
  if (!video.videoWidth || !video.videoHeight) {
    // Skip processing if video dimensions are invalid
    if (webcamRunning) requestAnimationFrame(predict);
    return;
  }

  if (video.currentTime === lastVideoTime) {
    // Skip processing if the video frame hasn't changed
    if (webcamRunning) requestAnimationFrame(predict);
    return;
  }
  lastVideoTime = video.currentTime;

  // Resize to square based on height
  const ratio = video.videoHeight / video.videoWidth;
  video.style.width = `${videoWidth}px`;
  video.style.height = `${videoWidth * ratio}px`;

  canvasElement.width = video.videoWidth + bleedingArea * 2;
  canvasElement.height = video.videoHeight + bleedingArea;

  canvasElement.style.width = `${
    parseInt(video.style.width) + bleedingArea * 2
  }px`;
  canvasElement.style.height = `${
    parseInt(video.style.height) + bleedingArea
  }px`;

  try {
    // --- Segmentation: Remove background ---
    const segNow = Date.now();
    const segResult = await segmenter.segmentForVideo(video, segNow);

    const mask = segResult.categoryMask;
    if (mask) {
      const maskData = mask.getAsUint8Array(); // 0 = background, 15 = person, etc.

      // Use offscreen canvas for processing
      const frame = processOffscreen(video);

      for (let i = 0; i < maskData.length; i++) {
        const segValue = maskData[i];
        const j = i * 4;
        if (segValue === 0) {
          // background: set to transparent
          frame.data[j + 3] = 0; // Alpha channel (transparency)
        }
      }
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.putImageData(frame, bleedingArea, bleedingArea);
    }

    // --- Continue with overlays ---
    const now = performance.now();
    const faceRes = await faceLandmarker.detectForVideo(video, now);

    if (faceRes.faceLandmarks?.length) {
      const lm = faceRes.faceLandmarks[0];
      const f = lm[10];
      const wNorm = Math.abs(lm[234].x - lm[454].x);
      const faceW = wNorm * video.videoWidth;
      const crownW = faceW * 1.5;
      const crownH =
        crownW * (crownImage.naturalHeight / crownImage.naturalWidth);
      const crownX = f.x * video.videoWidth - crownW / 2 + bleedingArea;
      const crownY = f.y * video.videoHeight - crownH * 1.1 + bleedingArea;
      canvasCtx.drawImage(crownImage, crownX, crownY, crownW, crownH);
      drawOverlayImage(
        malumaLogo,
        crownX + crownW / 2,
        crownY - crownH * 0.1,
        crownW,
        true
      );

      const chin = lm[152];
      const chinX = chin.x * video.videoWidth + bleedingArea;
      const chinY = chin.y * video.videoHeight + bleedingArea;
      drawOverlayImage(textDorado, chinX, chinY + faceW * 0.5, crownW, true);

      const leftEar = lm[234];
      const leftEarX = leftEar.x * video.videoWidth + bleedingArea;
      const leftEarY = leftEar.y * video.videoHeight + bleedingArea;
      drawOverlayImage(
        dogLeft,
        leftEarX - faceW * 0.75,
        leftEarY + faceW * 0.25,
        dogLeft.naturalWidth * 0.15
      );

      const rightEar = lm[454];
      const rightEarX = rightEar.x * video.videoWidth + bleedingArea;
      const rightEarY = rightEar.y * video.videoHeight + bleedingArea;
      drawOverlayImage(
        dogRight,
        rightEarX + faceW * 0.75,
        rightEarY + faceW * 0.25,
        dogRight.naturalWidth * 0.15
      );
    }
  } catch (err) {
    console.error("Error during prediction:", err);
  }

  if (webcamRunning) {
    requestAnimationFrame(predict);
  }
}

async function captureAndUpload() {
  const overlay = document.getElementById("loading-overlay")!;

  // 1) Muestra el spinner
  overlay.classList.add("visible");
  
  try {
    // 2) Captura TODO el <body> pero excluye spinner y botón
    const area = document.getElementById("capture-area")!;

    const screenshot = await html2canvas(area, {
      backgroundColor: null,
      ignoreElements: (el) => {
        return (
          el.id === "loading-overlay" ||
          el.classList.contains("capture-btn") ||
          el.classList.contains("back-btn"))
      },
    });

    const dataUrl = screenshot.toDataURL("image/png");
    const ref     = storageRef(storage, `snapshots/scene_${Date.now()}.png`);

    // 3) Súbelo y fuerza descarga
    await uploadString(ref, dataUrl, "data_url");
    await updateMetadata(ref, {
      contentDisposition: 'attachment; filename="snapshot.png"',
    });
    const url = await getDownloadURL(ref);

    // 4) Muestra el modal con la imagen y el QR
    showModal(url);

  } catch (err) {
    console.error(err);
  } finally {
    // 5) Oculta el spinner y regresa el botón a su estado normal
    overlay.classList.remove("visible");
  }
}


function showModal(url: string) {
  const img = document.getElementById("preview-img") as HTMLImageElement;
  img.src = url;

  const qrDiv = document.getElementById("qr-code")!;
  qrDiv.innerHTML = "";     // limpia contenido anterior

  // 1) Crea un canvas dentro de qrDiv
  const canvas = document.createElement("canvas");
  qrDiv.appendChild(canvas);

  // 2) Genera el QR en ese canvas
  QRCode.toCanvas(canvas, url, { width: 200 })
    .catch(err => console.error("Error generando QR:", err));

  // 3) Muestra el modal
  modal.style.display = "flex";
}


// Desactivar eventos en video/canvas
video.style.pointerEvents = "none";
canvasElement.style.pointerEvents = "none";

// Crear botón con clase
const btn = document.createElement("button");
btn.className = "capture-btn";
btn.textContent = "📸";
document.body.appendChild(btn);

// Al hacer click, dispara captura + subida
btn.addEventListener("click", () => {
  console.log("📸 Tomando foto…");
  captureAndUpload();
});

// lo añadimos a body (no a demosSection)
document.body.appendChild(btn);

// Initialize camera configuration logic
setupCameraConfig(video, enableCam);
