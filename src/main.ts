import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const { FilesetResolver, FaceLandmarker, PoseLandmarker } = vision;

// DOM elements
const demosSection  = document.getElementById("demos")! as HTMLElement;
const video         = document.getElementById("webcam")         as HTMLVideoElement;
const canvasElement = document.getElementById("output_canvas") as HTMLCanvasElement;
const canvasCtx     = canvasElement.getContext("2d")!;

// State
let faceLandmarker: FaceLandmarker;
let poseLandmarker: PoseLandmarker;
let webcamRunning = false;
const videoWidth = 480;

// Preload overlay images
const crownImage = Object.assign(new Image(), { src: "/assets/CORONA.png" });
const malumaLogo = Object.assign(new Image(), { src: "/assets/LOGO-MALUMA.png" });
const dogLeft    = Object.assign(new Image(), { src: "/assets/PERRO 201.png" });
const dogRight   = Object.assign(new Image(), { src: "/assets/PERRO 303.png" });
const m01        = Object.assign(new Image(), { src: "/assets/M 01.png" });
const dog101     = Object.assign(new Image(), { src: "/assets/PERRO 101.png" });
const textDorado = Object.assign(new Image(), { src: "/assets/TEXTO-DORADO.png" });

// Utility to draw an image centered at (cx, cy) with given width, preserving aspect
function drawOverlayImage(img: HTMLImageElement, cx: number, cy: number, w: number) {
  if (!img.complete) return;
  const h = w * (img.naturalHeight / img.naturalWidth);
  canvasCtx.drawImage(img, cx - w/2, cy - h/2, w, h);
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
    outputSegmentation: false,
  });

  // Show UI and start camera
  demosSection.classList.remove("invisible");
  enableCam();
}

init();

function enableCam() {
  if (webcamRunning) return;
  webcamRunning = true;
  navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predict);
  });
}

let lastVideoTime = -1;
async function predict() {
  // Resize to square based on height
  const ratio = video.videoHeight / video.videoWidth;
  video.style.width  = `${videoWidth}px`;
  video.style.height = `${videoWidth * ratio}px`;

  canvasElement.width  = video.videoWidth;
  canvasElement.height = video.videoHeight;
  canvasElement.style.width  = video.style.width;
  canvasElement.style.height = video.style.height;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
  }

  const now     = performance.now();
  const faceRes = await faceLandmarker.detectForVideo(video, now);
  const poseRes = await poseLandmarker.detectForVideo(video, now);

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // Draw crown + Maluma logo using face landmarks
  if (faceRes.faceLandmarks?.length) {
    const lm        = faceRes.faceLandmarks[0];
    const f         = lm[10];
    const wNorm     = Math.abs(lm[234].x - lm[454].x);
    const faceW     = wNorm * canvasElement.width;
    const crownW    = faceW * 1.5;
    const crownH    = crownW * (crownImage.naturalHeight / crownImage.naturalWidth);
    const crownX    = f.x * canvasElement.width - crownW/2;
    const crownY    = f.y * canvasElement.height - crownH*1.1;
    canvasCtx.drawImage(crownImage, crownX, crownY, crownW, crownH);
    drawOverlayImage(malumaLogo, crownX + crownW/2, crownY - crownH*0.6, crownW);
  }

  // Debug: inspect poseRes to see its shape
  console.log("poseRes →", poseRes);

  // Support both camelCase and snake_case
  const rawPoseLandmarks = (poseRes as any).landmarks ?? (poseRes as any).landmarks;

  if (Array.isArray(rawPoseLandmarks) && rawPoseLandmarks.length > 0) {
    const pl      = rawPoseLandmarks[0];
    const lsX     = pl[11].x * canvasElement.width;
    const lsY     = pl[11].y * canvasElement.height;
    const rsX     = pl[12].x * canvasElement.width;
    const rsY     = pl[12].y * canvasElement.height;
    const torsoW  = Math.hypot(rsX - lsX, rsY - lsY);

    // Dogs on shoulders
    drawOverlayImage(dogLeft,  lsX, lsY,       torsoW * 0.6);
    drawOverlayImage(dogRight, rsX, rsY,      torsoW * 0.6);
    // Beneath dogs
    drawOverlayImage(m01,      lsX, lsY + torsoW,   torsoW * 0.5);
    drawOverlayImage(dog101,   rsX, rsY + torsoW,   torsoW * 0.5);
    // Text on chest (mid-shoulder + offset)
    const chestX = (lsX + rsX) / 2;
    const chestY = (lsY + rsY) / 2 + torsoW * 0.2;
    drawOverlayImage(textDorado, chestX, chestY, torsoW * 1.2);
  } else {
    console.warn("❗ No se detectaron pose landmarks:", rawPoseLandmarks);
  }

  if (webcamRunning) {
    requestAnimationFrame(predict);
  }
}
