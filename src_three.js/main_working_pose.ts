// import "./style.css";
// import * as THREE from 'three';

// // Copyright 2023 The MediaPipe Authors.
// // Licensed under the Apache License, Version 2.0 (the "License");
// // you may not use this file except in compliance with the License.
// // You may obtain a copy of the License at
// //
// // http://www.apache.org/licenses/LICENSE-2.0
// //
// // Unless required by applicable law or agreed to in writing, software
// // distributed under the License is distributed on an "AS IS" BASIS,
// // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// // See the License for the specific language governing permissions and
// // limitations under the License.

// import { PoseLandmarker, FilesetResolver } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// const demosSection = document.getElementById("demos");

// let poseLandmarker: PoseLandmarker = undefined;
// let runningMode = "IMAGE";
// let enableWebcamButton: HTMLButtonElement;
// let webcamRunning: Boolean = false;
// const videoHeight = "360px";
// const videoWidth = "480px";

// // Three.js variables
// let scene: THREE.Scene;
// let camera: THREE.PerspectiveCamera;
// let renderer: THREE.WebGLRenderer;
// let points: THREE.Points;
// let lines: THREE.Line[] = [];
// const pointSize = 0.05;
// const connectionMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });

// // Initialize Three.js scene
// function initThreeJS() {
//   // Scene
//   scene = new THREE.Scene();
  
//   // Camera
//   camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
//   camera.position.z = 5;
  
//   // Renderer with transparency
//   renderer = new THREE.WebGLRenderer({ alpha: true }); // Enable alpha channel
//   renderer.setSize(window.innerWidth, window.innerHeight);
//   renderer.setClearColor(0x000000, 0); // Set background color to transparent
//   document.body.appendChild(renderer.domElement);
  
//   // Add axes helper
//   const axesHelper = new THREE.AxesHelper(5);
//   scene.add(axesHelper);
// }

// // Create pose landmarker
// const createPoseLandmarker = async () => {
//     const vision = await FilesetResolver.forVisionTasks(
//         "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
//     );
//     poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
//         baseOptions: {
//             modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
//             delegate: "GPU",
//         },
//         runningMode: runningMode,
//         numPoses: 2,
//     });
//     demosSection.classList.remove("invisible");
// };
// createPoseLandmarker();

// // Webcam setup
// const video = document.getElementById("webcam") as HTMLVideoElement;
// const canvasElement = document.getElementById("output_canvas") as HTMLCanvasElement;

// // Check if webcam access is supported.
// const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// // If webcam supported, add event listener to button for when user
// // wants to activate it.
// if (hasGetUserMedia()) {
//     enableWebcamButton = document.getElementById("webcamButton");
//     enableWebcamButton.addEventListener("click", enableCam);
// } else {
//     console.warn("getUserMedia() is not supported by your browser");
// }

// // Enable the live webcam view and start detection.
// function enableCam(event) {
//     if (!poseLandmarker) {
//         console.log("Wait! poseLandmaker not loaded yet.");
//         return;
//     }

//     if (webcamRunning === true) {
//         webcamRunning = false;
//         enableWebcamButton.innerText = "ENABLE PREDICTIONS";
//     } else {
//         webcamRunning = true;
//         enableWebcamButton.innerText = "DISABLE PREDICTIONS";
//     }

//     // getUsermedia parameters.
//     const constraints = {
//         video: true,
//     };

//     // Activate the webcam stream.
//     navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
//         video.srcObject = stream;
//         video.addEventListener("loadeddata", predictWebcam);
//     });
// }

// let lastVideoTime = -1;


// async function predictWebcam() {
//   if (!scene) {
//       initThreeJS();
//   }

//   canvasElement.style.height = videoHeight;
//   video.style.height = videoHeight;
//   canvasElement.style.width = videoWidth;
//   video.style.width = videoWidth;
  
//   if (runningMode === "IMAGE") {
//       runningMode = "VIDEO";
//       await poseLandmarker.setOptions({ runningMode: "VIDEO" });
//   }
  
//   let startTimeMs = performance.now();
//   if (lastVideoTime !== video.currentTime) {
//       lastVideoTime = video.currentTime;
//       poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
//           // Clear previous points and lines
//           if (points) scene.remove(points);
//           lines.forEach(line => scene.remove(line));
//           lines = [];
          
//           for (const landmark of result.landmarks) {
//               // Create points geometry
//               const pointsGeometry = new THREE.BufferGeometry();
//               const pointsMaterial = new THREE.PointsMaterial({
//                   color: 0xff0000,
//                   size: pointSize,
//               });
              
//               // Convert landmarks to Three.js vertices with corrected Y-axis
//               const vertices = [];
//               for (const point of landmark) {
//                   // Flip Y to match Three.js coordinate system
//                   // Flip Z to make it more intuitive (negative Z = away from camera)
//                   vertices.push(point.x, -point.y, -point.z);
//               }
              
//               pointsGeometry.setAttribute(
//                   'position',
//                   new THREE.Float32BufferAttribute(vertices, 3)
//               );
              
//               points = new THREE.Points(pointsGeometry, pointsMaterial);
//               scene.add(points);
              
//               // Create connections between landmarks
//               const connections = PoseLandmarker.POSE_CONNECTIONS;
//               for (const connection of connections) {
//                   const startIndex = connection.start;
//                   const endIndex = connection.end;
                  
//                   if (startIndex < landmark.length && endIndex < landmark.length) {
//                       const startPoint = landmark[startIndex];
//                       const endPoint = landmark[endIndex];
                      
//                       const lineGeometry = new THREE.BufferGeometry().setFromPoints([
//                           // Apply same coordinate conversion to connection points
//                           new THREE.Vector3(startPoint.x, -startPoint.y, -startPoint.z),
//                           new THREE.Vector3(endPoint.x, -endPoint.y, -endPoint.z)
//                       ]);
                      
//                       const line = new THREE.Line(lineGeometry, connectionMaterial);
//                       scene.add(line);
//                       lines.push(line);
//                   }
//               }
//           }
          
//           // Render the scene
//           renderer.render(scene, camera);
//       });
//   }
  
//   if (webcamRunning === true) {
//       window.requestAnimationFrame(predictWebcam);
//   }
// }