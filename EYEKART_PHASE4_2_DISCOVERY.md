# EYEKART — PHASE 4.2
## REAL VIRTUAL TRY-ON (VTO)
### TECHNICAL AUDIT & DISCOVERY REPORT
**Version:** 1.0  
**Authority:** Phase 4.0/4.1 Acceptance & Visual Freeze Protocol v1.1  
**Audited Runtime:** Microsoft Edge via Chrome DevTools Protocol (CDP) / Local `serve.py`  
**Classification Standard:** Absolute Honesty Rule & Zero Visual Drift  

---

## Executive Summary

Pursuant to Directive Phase 4.2, an exhaustive read-only technical discovery was performed across all Stitch Virtual Try-On (VTO) templates, JavaScript runtime controllers, asset directories, and computer-vision dependencies in the EyeKart repository.

### High-Level Discovery Verdict:
* **Camera API (`getUserMedia`)**: **Present in `vto-engine.js`**, but inactive on page load and lacks explicit user activation/stop lifecycle handlers.
* **Computer Vision / MediaPipe**: **Completely Absent on Disk**. 0 `.wasm`, 0 `.task`, 0 MediaPipe JavaScript libraries exist in the repository.
* **Face Landmarks**: **Zero Real Tracking**. The current interface uses a decorative static SVG overlay with hardcoded pupil coordinates ($OD = [330, 275]$, $OS = [470, 275]$, $PD = 63.5\text{ mm}$).
* **Eyewear Overlay Assets**: **Zero Transparent Overlay Assets on Disk**. No `.png`, `.webp`, or `.glb` models exist for any frame SKU (e.g. `/assets/vto/ek902_vto.png` returns HTTP 404).
* **Snapshot & Upload**: Snapshot is simulated with toast feedback; no photo upload input exists in the DOM.

---

## 1. Current Camera Implementation

* **API Utilized**: `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } })`.
* **Location**: Defined inside `VTOEngine.prototype.startCamera()` in `assets/js/vto-engine.js` (lines 74–115).
* **Lifecycle State**:
  * `startCamera()` is **not invoked automatically** upon page initialization.
  * No explicit "Start Camera" or "Enable Webcam" button is linked to this function in the static Stitch template.
  * There is no stream teardown logic (tracks are not stopped when leaving the route or unmounting).
* **Permission Fallback**:
  * On error or permission denial, `startCamera()` calls `this.useFallbackPortrait()`, hiding the dynamic video element and revealing the Kenyan model portrait (`#arModelFace`).

---

## 2. Current Video Implementation

* **Element State**:
  * In the static HTML (`eyekart_live_camera_virtual_try_on_vto_studio/code.html`), **no `<video>` tag exists**.
  * `startCamera()` dynamically creates `<video id="vto-camera-feed">` with classes `w-full h-full object-cover object-center hidden` and appends it to `#vtoViewportStage`.
* **Mirror Axis Control**:
  * `#toggleMirrorFeed` toggles `scaleX(-1)` on the video element and the fallback image.
  * Duplicate event listeners exist in both `vto-engine.js` and the inline script in `code.html`.

---

## 3. Current Overlay Implementation

* **Overlay Architecture**:
  * Static SVG HUD (`<svg class="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 800 600">`).
* **Coordinates & Reticles**:
  * Right eye OD reticle: Fixed at $(330, 275)$ with CSS rotating dotted ring (`origin-[330px_275px]`).
  * Left eye OS reticle: Fixed at $(470, 275)$ with CSS rotating dotted ring (`origin-[470px_275px]`).
  * Nasal bridge apex: Fixed at $(400, 278)$ with nasion offset label `0.0mm`.
  * Interpupillary Distance: Fixed at $63.5\text{ mm}$ spanning $140\text{ px}$.
* **Eyewear Representation**:
  * In the static Stitch template, the model in the photograph (`#arModelFace`) is already wearing glasses.
  * **There is NO separate eyewear overlay element (neither `<img>` nor `<canvas>`) rendered over the camera stream.** When the camera activates, the user's face is completely unadorned.

---

## 4. Whether MediaPipe Exists

* **Disk Audit**: An exhaustive recursive scan of the repository returned **0 MediaPipe files**.
* **Runtime Audit**:
  * `typeof window.FaceLandmarker === 'undefined'`
  * `typeof window.FilesetResolver === 'undefined'`
  * `typeof window.FaceMesh === 'undefined'`
* **Evaluation**: MediaPipe is not present in the repository.

---

## 5. Whether Any Other Computer-Vision Library Exists

* **Audit Results**:
  * OpenCV / OpenCV.js: **None**
  * Tracking.js: **None**
  * Clmtrackr: **None**
  * Face-api.js: **None**
  * TensorFlow.js: **None**
* **Conclusion**: Zero computer-vision engines exist in the project.

---

## 6. Whether Face Landmarks Currently Exist

* **Audit Results**:
  * In the DOM: Only static SVG elements with hardcoded pixel coordinates.
  * In JavaScript: Zero landmark data structures, zero vertex buffers.
* **Conclusion**: No dynamic face landmarks exist.

---

## 7. Whether Any Landmark Model Asset Exists

* **Disk Audit**:
  * `*.task`: **0 files**
  * `*.tflite`: **0 files**
  * `*.bin`: **0 files**
* **Conclusion**: No facial landmark AI model assets exist in the repository.

---

## 8. Whether Eyewear Overlay Assets Exist

* **Audit Results**:
  * `catalog-data.js` references `assetVTO: { overlayUrl: "assets/vto/ek902_vto.png" }`.
  * Disk check: Directory `assets/vto/` does not exist on disk.
  * HTTP fetch: `GET /assets/vto/ek902_vto.png` returns HTTP 404 Not Found.
* **Conclusion**: No eyewear overlay asset files exist.

---

## 9. Whether Transparent Frame Assets Exist

* **Audit Results**:
  * All 24 image files in the repository are Stitch page mockups (`screen.png`).
  * Canonical product images in `catalog-data.js` are opaque JPEG photographs (`image/jpeg`) hosted on remote Google Cloud CDN.
* **Conclusion**: Zero transparent PNG or SVG frame cutouts exist on disk.

---

## 10. Whether 3D VTO Assets Exist

* **Audit Results**:
  * In accordance with Phase 4.1 audit: 0 `.glb`, 0 `.gltf`, 0 `.obj` files exist in the repository.
* **Conclusion**: No 3D VTO assets exist.

---

## 11. Whether 2D VTO Assets Exist

* **Audit Results**:
  * No isolated 2D eyewear sprites exist.
* **Conclusion**: No 2D VTO assets exist on disk.

---

## 12. Existing SKU Synchronization

* **Carousel Binding**:
  * 5 frame cards are rendered in `.frame-selector-card`:
    1. Kibera Titanium EK-902
    2. The Mara Round 01 (mapped in code to `EK-612`)
    3. Westlands Octagonal EK-804
    4. The Karen Aviator (mapped in code to `EK-915`)
    5. Muthaiga Lucent Poly (mapped in code to `EK-102`)
* **State Synchronization**:
  * Clicking updates `EyeKartStore.setSelectedSku(sku)`.
  * However, the right-hand panel (Title, Price, Spec Breakdown) does not dynamically update when selecting frames 2–5; it statically displays EK-902 metadata.

---

## 13. Existing Variant Synchronization

* **Swatches**:
  * 4 finish swatches (`.finish-swatch`): Brushed Champagne Titanium (`#E5D7B7`), Matte Obsidian Black (`#232323`), Rift Rose Gold (`#E0A899`), Raw Matte Silver (`#9E9E9E`).
* **State Synchronization**:
  * Updates `#currentFinishLabel.textContent` and `EyeKartStore.setActiveVariant(finish)`.
  * Does not visually alter the viewport because no overlay element is mounted.

---

## 14. Existing Snapshot Functionality

* **Button**: `#btnCaptureSnapshot`.
* **Behavior**: Triggers `#snapshotSuccessToast` CSS transition and displays toast "AR try-on portrait snapshot captured".
* **Reality**: Purely decorative feedback. No image canvas is composited, no file is exported, and no blob is generated.

---

## 15. Existing Upload Fallback

* **Audit**:
  * A search across all HTML files revealed **zero `<input type="file">` elements** in the VTO templates.
* **Reality**: There is no photo upload or file selection UI in the frozen Stitch layout. The only fallback is the static Kenyan model portrait (`#arModelFace`).

---

## 16. Existing VTO UI Controls

| Selector | Control Purpose | Current Implementation Status |
|---|---|---|
| `#btnLightOffice` | 4000K Office lighting preset | Functional CSS background tint |
| `#btnLightSun` | 5600K Equatorial Sun preset | Functional CSS background tint |
| `#btnLightSunset` | 3200K Golden Hour preset | Functional CSS background tint |
| `#toggleAntiReflect` | Glare coat toggle | Functional button active state toggle |
| `#toggleMirrorFeed` | Mirror axis flip | Functional CSS transform on video/img |
| `#toggleBareFace` | Compare bare face (hold/click) | Functional scrim display (`#bareFaceNotice`) |
| `#toggleFullscreenVTO`| Fullscreen viewport toggle | Functional `requestFullscreen()` |
| `#verticalOffsetSlider`| Nose elevation calibration | Functional slider, updates HUD translateY |
| `.finish-swatch` | Finish color selection | Functional swatch active state & store sync |
| `.frame-selector-card` | Eyewear carousel cards | Functional card selection & store sync |
| `#btnCaptureSnapshot` | Snapshot trigger | Decorative toast notification |
| `#btnShareLook` | Share look | Unbound |
| `#toggleCalibrationHelp`| Measurement Protocol info | Toast notification |
| `a[data-path="lens-customizer"]` | Choose Lenses CTA | Functional navigation with query params |

---

## 17. Browser Support for Required APIs

* **`navigator.mediaDevices.getUserMedia`**: Supported natively in modern browsers.
* **`HTMLCanvasElement` & WebGL / WebGL2**: Supported natively.
* **WebAssembly (WASM) & SIMD**: Supported natively in Chromium/Edge.
* **`requestVideoFrameCallback`**: Supported natively in Chromium/Edge for frame-synchronized inference.

---

## 18. Performance Constraints

* **Inference Rate**: Running full 468-point mesh inference on every frame (60 FPS) on the CPU can cause UI stutter. The optimal design decouples video display (60 FPS) from landmark inference (throttled to 25–30 FPS).
* **Smoothing**: Raw landmark coordinates jitter by 1–3 pixels frame-to-frame. An Exponential Moving Average (EMA) or One Euro filter is required to stabilize eyewear overlay placement.

---

## 19. Security & Privacy Implications

* **Client-Side Isolation**: All webcam frames and landmark inference must remain strictly on-device in browser memory.
* **Zero Persistence**: No biometric coordinates, facial measurements, or video frames may be written to `localStorage`, `sessionStorage`, or cookies.
* **Console Hygiene**: No landmark coordinate arrays or biometric dumps may be emitted to `console.log`.
* **Teardown**: MediaStream tracks must be explicitly stopped on page unload or route exit to turn off the hardware camera indicator.

---

## 20. Exact Implementation Blockers

1. **Vendor Dependency Blocker**: MediaPipe tasks-vision bundle and WASM runtime are not vendored locally in `assets/vendor/`.
2. **Model Asset Blocker**: `face_landmarker.task` is missing from disk.
3. **Eyewear Asset Blocker**: No transparent PNG eyewear assets exist in `assets/vto/`.
   - *Technical Resolution*: Per Section 9 ("B. Canvas-based eyewear rendering"), an algorithmic parametric eyewear renderer calibrated to exact catalog dimensions (lens width, bridge width, temple angle) will be rendered to an overlay canvas aligned with detected ocular landmarks.
4. **Lifecycle Trigger Blocker**: `startCamera()` needs to be initiated responsibly with permission handling and automatic cleanup.

---

## Next Steps for Phase 4.2 Implementation

1. **Vendor MediaPipe Vision Runtime**: Download and vendor `@mediapipe/tasks-vision` and `face_landmarker.task` locally into `assets/vendor/mediapipe/` for zero-latency, offline execution.
2. **Implement Real Face Landmarker Engine**: Upgrade `assets/js/vto-engine.js` with real MediaPipe Face Landmarker inference, landmark extraction, and head pose estimation.
3. **Implement Live Eyewear Overlay Canvas**: Mount `<canvas id="vto-overlay-canvas">` non-destructively over `#vto-camera-feed`, rendering calibrated frame geometry dynamically aligned to pupil and nasion landmarks.
4. **Implement Temporal Smoothing**: Apply exponential moving average filters to translation, scale, and roll angle to eliminate jitter.
5. **Implement Real Snapshot Compositing**: Draw video frame + overlay canvas into an offscreen canvas and export real snapshot image data.
6. **Physical Verification**: Execute real Edge CDP automated tests covering all 30 assertions.
