import React, { useRef, useEffect } from 'react';
import './App.css';
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
  FaceLandmarker
} from "@mediapipe/tasks-vision";

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  let poseLandmarker: PoseLandmarker | null = null;
  let faceLandmarker: FaceLandmarker | null = null;
  let runningMode: "IMAGE" | "VIDEO" = "VIDEO";
  let enableWebcam: boolean = true;

  async function initializeMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: "GPU"
      },
      runningMode: runningMode,
      numPoses: 1
    });

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: runningMode,
      numFaces: 1
    });

    await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    await faceLandmarker.setOptions({ runningMode: "VIDEO" });
  }

  useEffect(() => {
    initializeMediaPipe().then(() => {
      console.log("MediaPipe initialized");
    });
  }, []);

  useEffect(() => {
    if (enableWebcam) {
      const constraints = {
        video: true,
      };

      navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", predictWebcam);
        }
      });
    }
  }, [enableWebcam]);

  async function predictWebcam() {
    if (!poseLandmarker || !faceLandmarker) {
      console.log("Wait for poseLandmarker and faceLandmarker to load before clicking!");
      return;
    }

    if (runningMode === "IMAGE") {
      runningMode = "VIDEO";
      await poseLandmarker.setOptions({ runningMode: "VIDEO" });
      await faceLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    let lastVideoTime = -1;
    let results = null;
    let faceResults = null;
    const video = videoRef.current;
    const canvasElement = canvasRef.current;

    if (!video || !canvasElement) return;

    let nowInMs = Date.now();
    if (video?.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      results = poseLandmarker.detectForVideo(video, nowInMs);
      faceResults = faceLandmarker.detectForVideo(video, nowInMs);
    }

    const canvasCtx = canvasElement.getContext("2d");
    canvasCtx?.save();
    canvasCtx?.clearRect(0, 0, canvasElement.width, canvasElement.height);

    canvasElement.style.height = video.videoHeight;
    canvasElement.style.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    canvasElement.width = video.videoWidth;

    if (results && results.landmarks) {
      for (const landmarks of results.landmarks) {
        DrawingUtils.drawConnectors(canvasCtx, landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "#00FF00", lineWidth: 5 });
        DrawingUtils.drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2 });
      }
    }

    if (faceResults && faceResults.faceLandmarks) {
      for (const landmarks of faceResults.faceLandmarks) {
        DrawingUtils.drawConnectors(canvasCtx, landmarks, FaceLandmarker.FACE_LANDMARKS, { color: "#C0C0C0", lineWidth: 1 });
        DrawingUtils.drawLandmarks(canvasCtx, landmarks, {
          color: "#E0E0E0",
          lineWidth: 0.5
        });
      }
    }

    canvasCtx?.restore();

    window.requestAnimationFrame(predictWebcam);
  }

  return (
    <div className="App">
      <header className="App-header">
        <video
          ref={videoRef}
          style={{ display: 'none' }}
          autoPlay={true}
          muted={true}
          width="640"
          height="480"
        ></video>
        <canvas
          ref={canvasRef}
          width="640"
          height="480"
          style={{ position: 'absolute', left: 0, top: 0 }}
        ></canvas>
      </header>
    </div>
  );
}

export default App;
