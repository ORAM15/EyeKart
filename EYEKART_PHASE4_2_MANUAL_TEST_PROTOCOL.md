# EyeKart — Phase 4.2: Real Virtual Try-On (VTO)
## Manual Real-World Verification Protocol

**Version:** 1.0  
**Status:** ACTIVE  
**Engine:** MediaPipe Tasks Vision (`FaceLandmarker` v0.10.x, 478 3D Mesh Landmarks)  
**Host Target:** `http://127.0.0.1:3000/Stitch/stitch_eyekart_optical_commerce_platform/eyekart_live_camera_virtual_try_on_vto_studio/code.html`

---

## 1. Overview & Objectives

This protocol provides human optical evaluators, QA engineers, and optometrists with a step-by-step physical test procedure to verify the **Real Virtual Try-On (VTO)** engine using an actual physical webcam, desktop computer, and mobile device.

### Verification Goals
1. Verify genuine client-side camera access and stream initialization.
2. Confirm dynamic, sub-35ms facial landmark tracking responding to natural head movement.
3. Validate optical scale, roll, pitch, and yaw alignment of parametric frames.
4. Verify graceful portrait fallback when camera permission is denied or revoked.
5. Confirm zero biometric persistence and 100% privacy compliance.

---

## 2. Prerequisites & Hardware Setup

### Hardware Requirements
- **Webcam:** Integrated laptop webcam (720p/1080p) or USB webcam (Logitech C920 or equivalent).
- **Lighting:** Standard indoor office lighting (300–500 lux); avoid direct backlight behind the user.
- **Display:** Minimum 1280x800 resolution for desktop; iOS Safari / Android Chrome for mobile.
- **Network / Local Server:** Python local HTTP server running at `http://127.0.0.1:3000/` (`python serve.py`).

### Browser Requirements
- Google Chrome (v115+), Microsoft Edge (v115+), Apple Safari (v16.4+), or Mozilla Firefox (v118+).
- WebGL 2.0 enabled (`chrome://gpu` or `edge://gpu` showing Hardware Accelerated WebGL).

---

## 3. Step-by-Step Test Scenarios

### Scenario 1: First-Time Camera Launch & Stream Initialization
1. Open the browser to:
   `http://127.0.0.1:3000/Stitch/stitch_eyekart_optical_commerce_platform/eyekart_live_camera_virtual_try_on_vto_studio/code.html?sku=EK-902`
2. **Observe:** The browser displays a permission prompt asking: *"Use your camera"*.
3. Click **"Allow"**.
4. **Expected Observations:**
   - The `<video id="vto-camera-feed">` element unhides and streams the live video feed inside the viewport stage.
   - The fallback Kenyan model portrait (`#arModelFace`) is cleanly replaced by the live video feed.
   - The green HUD live indicator displays *"ACTIVE CAMERA FEED"*.
   - A toast notification confirms: *"Live camera feed mounted with real-time AR tracking"*.
   - The frame overlay renders over your face, positioned naturally on the bridge of your nose.

---

### Scenario 2: Dynamic Facial Tracking & Head Roll
1. Look straight into the webcam from approximately 50–65 cm away.
2. Slowly tilt your head to the right by ~15–20 degrees.
3. Slowly tilt your head to the left by ~15–20 degrees.
4. **Expected Observations:**
   - The eyewear overlay rotates smoothly to match your head tilt (roll angle $\theta$).
   - The bridge remains anchored at the nasion (MediaPipe landmark 168).
   - Eyewear movement is fluid and smooth without jitter (damped by exponential moving average $\alpha = 0.35$).
   - The SVG HUD pupil reticles (`#hudPupilRight` and `#hudPupilLeft`) track your pupils in real-time.

---

### Scenario 3: Distance Scaling (Z-Axis Depth Sensitivity)
1. Sit at standard viewing distance (~60 cm).
2. Slowly move forward toward the webcam (to ~35 cm).
3. Slowly lean back away from the webcam (to ~90 cm).
4. **Expected Observations:**
   - As you lean forward, the inter-pupillary distance in pixel space expands; the eyewear smoothly scales up proportionally.
   - As you lean back, the inter-pupillary distance contracts; the eyewear smoothly scales down proportionally.
   - The frame temple ends stay aligned with the lateral edges of your face.

---

### Scenario 4: Dynamic SKU Switching
1. In the bottom carousel, click each frame thumbnail in turn:
   - **Card 1 (EK-902):** The Voyager Round Titanium
   - **Card 2 (EK-915):** The Mara Aviator
   - **Card 3 (EK-804):** The Westlands Octagonal
   - **Card 4 (EK-102):** The Rift Bold Acetate
2. **Expected Observations:**
   - The rendered overlay geometry updates instantaneously on the live face:
     - EK-902 renders round pantoscopic titanium wire rims.
     - EK-915 renders teardrop aviator lenses with a top brow bar and keyhole bridge.
     - EK-804 renders geometric 8-sided faceted octagonal contours.
     - EK-102 renders thick acetate rims with dark structural volume.
   - The right-hand product specification panel updates instantly with matching SKU title, dimensions, and price.

---

### Scenario 5: Finish Swatch Material Updates
1. Select **EK-902**.
2. Click through the 4 finish swatches:
   - Swatch 1: *Brushed Champagne Titanium* (`#E5D7B7` metallic gold)
   - Swatch 2: *Matte Obsidian Black* (`#202224` dark charcoal)
   - Swatch 3: *Rift Rose Gold* (`#E0A899` warm rose)
   - Swatch 4: *Raw Matte Silver* (`#D1D5DB` cool platinum)
3. **Expected Observations:**
   - The stroke and gradient shading of the live frame overlay shifts in real time to match the selected metallic or acetate finish.
   - The swatch circle enlarges (`scale-110`) and the active finish label updates.

---

### Scenario 6: Anti-Reflective Glare Coat Toggle
1. Click the **"Anti-Reflective Coat"** pill button in the HUD controls.
2. **Expected Observations:**
   - When enabled, lenses display a subtle blue/violet cyan reflex sheen (simulating Crizal Sapphire AR).
   - When toggled off, lenses show standard specular white environmental reflections.
   - A toast notification confirms: *"Crizal Sapphire anti-glare coat active"*.

---

### Scenario 7: Vertical Optical Center (OC) Slider
1. Drag the **Vertical Offset** slider from `0.0 mm` upward to `+4.0 mm`.
2. Drag the slider downward to `-4.0 mm`.
3. **Expected Observations:**
   - The frame shifts vertically relative to the pupil center, allowing physical fitting calibration for progressive and high-index lenses.
   - The digital readout updates in real-time (`+2.5 mm`, `-1.5 mm`).
   - SVG pupil reticles shift synchronously with the offset.

---

### Scenario 8: Bare-Face Hold-to-Compare
1. Click and hold down the **"Hold for Bare Face"** button.
2. **Expected Observations:**
   - The eyewear overlay vanishes immediately while the button is held down.
   - A high-contrast *"BARE FACE COMPARISON — HOLD TO PREVIEW"* indicator appears on the viewport.
   - Release the button: the eyewear overlay immediately reappears in perfect alignment with your face.

---

### Scenario 9: Lighting Condition Simulation
1. Click through the lighting presets: **Office**, **Sunlight**, **Sunset**.
2. **Expected Observations:**
   - **Office:** Neutral, un-tinted studio rendering.
   - **Sunlight:** Warm cyan/amber equatorial lighting overlay (`rgba(6, 182, 212, 0.08)`).
   - **Sunset:** Golden hour warm glow overlay (`rgba(255, 183, 125, 0.16)`).

---

### Scenario 10: Snapshot Capture & High-Res Composite Export
1. Align your face comfortably and click the camera snapshot icon button.
2. **Expected Observations:**
   - The shutter triggers with visual feedback.
   - A JPEG file named `EyeKart_[SKU]_[Finish]_TryOn.jpg` automatically downloads to your local Downloads folder.
   - Opening the downloaded image reveals the combined camera video frame with the overlaid eyewear and the gold EyeKart Atelier brand watermark seal.
   - The success toast appears: *"Snapshot saved to gallery / downloads"*.

---

### Scenario 11: Camera Denial & Graceful Fallback
1. Open a new Incognito / InPrivate window and navigate to the VTO URL.
2. When prompted for camera permission, click **"Block"** or **"Deny"**.
3. **Expected Observations:**
   - The interface does not crash or throw unhandled errors.
   - The system automatically displays the high-resolution calibrated Kenyan studio portrait reference (`#arModelFace`).
   - The eyewear overlay anchors precisely on the model's eyes and nose.
   - All interactive controls (swatches, SKU switcher, offset slider, AR coat) continue to function perfectly on the calibrated fallback portrait.
   - A toast informs the user: *"Calibrated Kenyan studio portrait reference active"*.

---

### Scenario 12: Privacy & Teardown Verification
1. Navigate away from the VTO page to the catalog or configurator.
2. Open DevTools (`F12`) -> **Application** tab:
   - Inspect **Local Storage** -> verify zero face landmarks, coordinates, or camera images.
   - Inspect **Session Storage** -> verify zero biometric entries.
   - Inspect **Cookies** -> verify zero biometric tracking cookies.
3. Observe laptop hardware camera LED:
   - The green/white physical camera LED must turn off immediately upon navigating away, confirming all `MediaStreamTrack` instances were explicitly terminated via `track.stop()`.

---

## 4. Reporting Issues

If any unexpected behavior occurs during physical testing, record:
1. **Device & OS:** e.g., MacBook Pro M2 (macOS 14), Dell XPS 15 (Windows 11), iPhone 14 Pro (iOS 17).
2. **Browser Version:** e.g., Chrome 128.0, Edge 128.0, Safari 17.5.
3. **Lighting Context:** e.g., Dim lighting, strong backlight, bright sunlit window.
4. **Console Output:** Press `F12` -> Console, copy any errors or warnings.
5. **Observed Symptom:** e.g., Landmark drift, jitter during fast rotation, camera permission modal not reappearing.
