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


// DOM elements
const demosSection = document.getElementById("demos")! as HTMLElement;
const video = document.getElementById("webcam") as HTMLVideoElement;
const canvasElement = document.getElementById(
  "output_canvas"
) as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d", { alpha: true })!;

// State
let faceLandmarker: FaceLandmarker;
let poseLandmarker: PoseLandmarker;
let segmenter: ImageSegmenter;
let webcamRunning = false;
const videoWidth = 480;

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
const m01Image     = Object.assign(new Image(), { src: "/assets/M 01.png" });
const perro101Image = Object.assign(new Image(), { src: "/assets/PERRO 101.png" });

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
  const resolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

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
  poseLandmarker = await PoseLandmarker.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    outputSegmentationMasks: false,
  });

  segmenter = await ImageSegmenter.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
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

function enableCam() {
  if (webcamRunning) return;
  webcamRunning = true;
  navigator.mediaDevices.getUserMedia({ video:{ width:1280,height:720 } }).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predict);
  });
}

let lastVideoTime = -1;
const bleedingArea = 200; // Define the bleeding area in pixels

async function predict() {
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

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
  }

  // --- Segmentation: Remove background ---
  const segNow = Date.now();
  const segResult = await segmenter.segmentForVideo(video, segNow);

  const mask = segResult.categoryMask;
  if (mask) {
    // Added null check for mask
    const maskData = mask.getAsUint8Array(); // 0 = background, 15 = person, etc.

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    // Draw video frame to canvas with bleeding area offset
    canvasCtx.drawImage(
      video,
      bleedingArea,
      bleedingArea,
      video.videoWidth,
      video.videoHeight
    );
    const frame = canvasCtx.getImageData(
      bleedingArea,
      bleedingArea,
      video.videoWidth,
      video.videoHeight
    );

    for (let i = 0; i < maskData.length; i++) {
      const segValue = maskData[i];
      const j = i * 4;
      if (segValue === 0) {
        // background: set to transparent
        frame.data[j + 3] = 0; // Alpha channel (transparency)
      }
    }
    canvasCtx.putImageData(frame, bleedingArea, bleedingArea);
  }

  // --- Continue with overlays ---
  const now = performance.now();
  const faceRes = await faceLandmarker.detectForVideo(video, now);
  const poseRes = await poseLandmarker.detectForVideo(video, now);

  // Draw crown + Maluma logo using face landmarks
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

    // Position textDorado below the chin (landmark 152)
    const chin = lm[152];
    const chinX = chin.x * video.videoWidth + bleedingArea;
    const chinY = chin.y * video.videoHeight + bleedingArea;
    drawOverlayImage(textDorado, chinX, chinY + faceW * 0.5, crownW, true);

    // Position dogLeft at the left ear (landmark 234)
    const leftEar = lm[234];
    const leftEarX = leftEar.x * video.videoWidth + bleedingArea;
    const leftEarY = leftEar.y * video.videoHeight + bleedingArea;
    drawOverlayImage(
      dogLeft,
      leftEarX - faceW * 0.5,
      leftEarY + faceW * 0.25,
      crownW * 2
    );

    // Position dogRight at the right ear (landmark 454)
    const rightEar = lm[454];
    const rightEarX = rightEar.x * video.videoWidth + bleedingArea;
    const rightEarY = rightEar.y * video.videoHeight + bleedingArea;
    drawOverlayImage(
      dogRight,
      rightEarX + faceW * 0.5,
      rightEarY + faceW * 0.25,
      crownW * 2
    );
  }

  // Debug: inspect poseRes to see its shape
  //console.log("poseRes →", poseRes);

  const rawPoseLandmarks =
    (poseRes as any).landmarks ?? (poseRes as any).landmarks;

  if (Array.isArray(rawPoseLandmarks) && rawPoseLandmarks.length > 0) {
    // const pl = rawPoseLandmarks[0];
    // const ls = pl[11], rs = pl[12], le = pl[13], re = pl[14];
  
    // // ancho del overlay (15% del ancho del canvas)
    // const overlayW = canvasElement.width * 0.15;
    // // desplazamiento lateral mayor, para que queden bien afuera
    // const offX = overlayW * -0.5;
  
    // // punto medio hombro–codo izquierdo
    // const midLX = ((ls.x + le.x) / 2) * video.videoWidth  + bleedingArea;
    // const midLY = ((ls.y + le.y) / 2) * video.videoHeight + bleedingArea;
    // // mueve la imagen aún más hacia la izquierda (afuera del cuerpo)
    // drawOverlayImage(perro101Image, midLX - offX, midLY, overlayW);
  
    // // punto medio hombro–codo derecho
    // const midRX = ((rs.x + re.x) / 2) * video.videoWidth  + bleedingArea;
    // const midRY = ((rs.y + re.y) / 2) * video.videoHeight + bleedingArea;
    // // mueve la imagen aún más hacia la derecha (afuera del cuerpo)
    // drawOverlayImage(m01Image, midRX + offX, midRY, overlayW);
  } else {
    console.warn("❗ No se detectaron pose landmarks:", rawPoseLandmarks);
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
    const screenshot = await html2canvas(document.body, {
      backgroundColor: null,
      ignoreElements: (el) => {
        return (
          el.id === "loading-overlay" ||
          el.classList.contains("capture-btn")
        );
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
