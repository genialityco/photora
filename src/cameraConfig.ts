export function setupCameraConfig(video: HTMLVideoElement, enableCam: (deviceId?: string) => void) {
  // Create configuration button
  const configBtn = document.createElement("button");
  configBtn.className = "config-btn";
  configBtn.textContent = "⚙️";
  configBtn.style.position = "absolute";
  configBtn.style.top = "10px";
  configBtn.style.right = "10px";
  configBtn.style.zIndex = "99999"; // Ensure popup appears above other elements
  document.body.appendChild(configBtn);

  // Create configuration popup
  const configPopup = document.createElement("div");
  configPopup.className = "config-popup";
  configPopup.style.display = "none";
  configPopup.style.position = "absolute";
  configPopup.style.top = "50px";
  configPopup.style.right = "10px";
  configPopup.style.backgroundColor = "white";
  configPopup.style.border = "1px solid #ccc";
  configPopup.style.padding = "10px";
  configPopup.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
  configPopup.style.zIndex = "99999"; // Ensure popup appears above other elements
  configPopup.innerHTML = `
    <label for="camera-select">Select Camera:</label>
    <select id="camera-select"></select>
    <button id="apply-camera-btn">Apply</button>
  `;
  document.body.appendChild(configPopup);

  // Toggle popup visibility
  configBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent event propagation
    configPopup.style.display =
      configPopup.style.display === "none" ? "block" : "none";
  });

  // Close popup when clicking outside
  document.addEventListener("click", (e) => {
    if (!configPopup.contains(e.target as Node) && e.target !== configBtn) {
      configPopup.style.display = "none";
    }
  });

  // Populate camera options
  async function populateCameraOptions() {
    const cameraSelect = document.getElementById("camera-select") as HTMLSelectElement;
    cameraSelect.innerHTML = ""; // Clear existing options

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");

    videoDevices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${cameraSelect.length + 1}`;
      cameraSelect.appendChild(option);
    });
  }

  // Apply selected camera
  document.getElementById("apply-camera-btn")!.addEventListener("click", async () => {
    const cameraSelect = document.getElementById("camera-select") as HTMLSelectElement;
    const selectedDeviceId = cameraSelect.value;

    if (selectedDeviceId) {
      // Stop the current webcam and prediction loop
      video.srcObject = null;
      enableCam(selectedDeviceId); // Use the provided enableCam function
    }

    configPopup.style.display = "none"; // Hide popup
  });

  // Initialize camera options on load
  populateCameraOptions();
}
