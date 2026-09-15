# EYEKART — FUNCTIONAL COVERAGE MATRIX
**Protocol Version:** 1.1  
**Verification Standard:** Explicit State Classification & Traceability  
**Visual Drift Allowance:** STRICTLY ZERO  

---

## 1. Classification Taxonomy

In compliance with Section 12 of the Visual Freeze Enforcement Protocol:
- **`VERIFIED WORKING`**: Feature is fully implemented, connected to state, and verified end-to-end.
- **`PARTIALLY FUNCTIONAL`**: Feature UI is hooked to state; secondary capabilities (e.g. edge-case error recovery) pending.
- **`DEMO / SIMULATION`**: Feature functions authentically in sandbox/demo mode (M-PESA, KRA, Telemetry, Pre-Auth).
- **`REQUIRES CREDENTIALS`**: Live integration requires third-party API keys (Safaricom Daraja API, KRA eTIMS, Carrier SMS).
- **`REQUIRES BUSINESS INPUT`**: Production copy, official doctor registration numbers, or legal terms needed from project owner.
- **`NOT IMPLEMENTED`**: Visual element is present in Stitch but lacks functional runtime bindings.

---

## 2. Comprehensive Panel Interaction Matrix

| Panel Identifier | Interactive Element | Current Prototype Behaviour | Expected Runtime Behaviour | Technical Implementation Hook | Status Classification | Visual Change Required? |
|---|---|---|---|---|---|---|
| **01. Homepage** | Brand Logo link | `href="#"` | Navigates to Homepage (`home`) | `a[data-path="home"]` $\to$ Router | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | Main Nav Links (Eyeglasses, Sunglasses, etc.) | `href="#"` | Filters catalog or navigates to designated category | `a[data-path]` $\to$ `Router.navigate(path)` | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | Search Input & "KSh Finder" | Static text input | Searches catalog by SKU, frame silhouette, or price | Input handler $\to$ Catalog search filter | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | Wishlist Heart Icon Badge | Displays static number `3` | Displays dynamic count of `Store.wishlist.length` | Store subscriber updating `#wishlist-count-badge` | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | Cart Bag Icon Badge | Displays static number `1` | Displays dynamic count of items in `Store.cart` | Store subscriber updating `#cart-count-badge` | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | User Profile Avatar / "My Portal" | `href="#"` | Navigates to Customer Account Portal (`my-account`) | `a[data-path="user-profile"]` $\to$ Router | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | Hero 3D Finish Swatch Buttons | Toggles local CSS class | Updates active finish name, SKU label, and hero frame view | `.swatch-btn` $\to$ `Store.selectVariant(sku, finish)` | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | Caliper Dimension HUD Toggle | Toggles overlay opacity | Shows/hides millimetre frame dimension HUD lines | `#btn-dimension-hud` $\to$ DOM class toggle | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | "Explore 3D Atelier" CTA | `href="#"` | Opens 3D Product Detail Studio for hero SKU | `a[data-path="product-details"]?sku=EK-902` | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | "Virtual Try-On" CTA | `href="#"` | Opens Live Camera VTO Studio for hero SKU | `a[data-path="virtual-try-on"]?sku=EK-902` | `VERIFIED WORKING` | **NO** |
| **01. Homepage** | Clinic Booking Form | Static HTML form | Validates patient details & saves appointment to store | `#clinic-booking-form` submit handler | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Gender Filter Pills (Unisex, Men, Women) | Static button clicks | Filters catalog grid by gender metadata | `.filter-gender` $\to$ `CatalogService.filter()` | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Silhouette Checkboxes (Aviator, Round, etc.) | Static checkboxes | Filters catalog grid by shape metadata | `input[name="shape"]` $\to$ `CatalogService.filter()` | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Material Checkboxes (Titanium, Acetate, etc.) | Static checkboxes | Filters catalog grid by material grade | `input[name="material"]` $\to$ `CatalogService.filter()` | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Bridge Size Slider (15mm - 21mm) | Updates text label only | Dynamically filters frames within bridge millimeter range | `input[type="range"]` $\to$ `CatalogService.filter()` | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Price Range Slider (KSh 8,000 - KSh 35,000) | Static slider | Filters frames within price range | `input[type="range"].price` $\to$ Filter engine | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Frame Card Click / "View Studio" | `href="#"` | Navigates to 3D Studio passing clicked SKU | `.product-card a` $\to$ `Router.toProduct(sku)` | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Frame Card Wishlist Heart Toggle | Static icon | Adds/removes SKU from wishlist, triggers toast feedback | `.btn-wishlist` $\to$ `Store.toggleWishlist(sku)` | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Frame Card "Quick CAD Blueprint" Button | `href="#"` | Opens Quick View CAD Blueprint modal for that SKU | `.btn-quick-view` $\to$ Open Quick View modal | `VERIFIED WORKING` | **NO** |
| **02. Catalog** | Frame Card "Try-On" Button | `href="#"` | Launches VTO Studio with clicked frame active | `.btn-vto` $\to$ `Router.toVTO(sku)` | `VERIFIED WORKING` | **NO** |
| **03. Quick View** | Perspective Angle Buttons (Front, 45°, CAD) | Toggles CSS transform | Switches between technical perspective blueprints | `.view-mode-btn` $\to$ DOM display update | `VERIFIED WORKING` | **NO** |
| **03. Quick View** | Blueprint CAD Grid Toggle | Toggles overlay | Toggles optical caliper measurement lines | `#toggle-blueprint-btn` $\to$ HUD overlay toggle | `VERIFIED WORKING` | **NO** |
| **03. Quick View** | "Add to Optical Bag" Action | Static button | Adds frame to `Store.cart` and updates badge | `#btn-quick-add-bag` $\to$ `Store.cart.addItem()` | `VERIFIED WORKING` | **NO** |
| **03. Quick View** | "Configure Custom Lenses" Action | Static button | Transitions to Lens Configurator with this SKU | `a[data-path="lens-customizer"]?sku=...` | `VERIFIED WORKING` | **NO** |
| **04. 3D Studio** | 360° Angle Selector Chips | Changes 2D angle | Controls interactive 3D camera rotation angle | `.angle-btn` $\to$ `Studio3D.setAngle(deg)` | `VERIFIED WORKING` | **NO** |
| **04. 3D Studio** | Lighting Mode Switcher (Daylight, Warm, LED) | Changes preview tint | Adjusts environment lighting shader / color balance | `.light-mode-btn` $\to$ `Studio3D.setLight(mode)` | `VERIFIED WORKING` | **NO** |
| **04. 3D Studio** | Finish Swatch Selector | Changes label only | Switches 3D material finish texture & updates price | `.swatch-chip` $\to$ `Studio3D.setFinish(finish)` | `VERIFIED WORKING` | **NO** |
| **04. 3D Studio** | "Configure Lenses & Add to Bag" | Static button | Navigates to Lens Configurator with active SKU | `#btn-configure-lenses` $\to$ Router | `VERIFIED WORKING` | **NO** |
| **04. 3D Studio** | "Buy Frame Only (KSh 11,500)" | Shows static toast | Adds frame without prescription lenses to `Store.cart` | `#btn-buy-frame-only` $\to$ `Store.cart.addItem()` | `VERIFIED WORKING` | **NO** |
| **04. 3D Studio** | "Compare Specs" Action | Static button | Adds SKU to comparison tray and opens matrix | `#btn-compare-spec` $\to$ `Store.addToCompare(sku)` | `VERIFIED WORKING` | **NO** |
| **05. Active VTO** | Catalog Frame Thumbnails Carousel | Selects card border | Changes frame overlay rendered on active portrait | `.frame-card` $\to$ `Store.selectSku(sku)` | `VERIFIED WORKING` | **NO** |
| **05. Active VTO** | Turn -15° / Turn +15° / Front Controls | Mock buttons | Rotates model portrait and frame overlay perspective | `.vto-angle-btn` $\to$ Canvas yaw rotation | `VERIFIED WORKING` | **NO** |
| **06. Live VTO** | Camera Activation Permission Flow | Static canvas | Requests `navigator.mediaDevices.getUserMedia` | `VTOService.startCamera(videoElement)` | `VERIFIED WORKING` | **NO** |
| **06. Live VTO** | Camera Fallback Mode | N/A | Falls back to high-res Kenyan model portrait if denied | `VTOService.useFallbackPortrait()` | `VERIFIED WORKING` | **NO** |
| **06. Live VTO** | Lighting Presets (4000K, 5600K, 2700K) | Static opacity toggle | Adjusts color temperature matrix on camera feed | `.btn-vto-light` $\to$ Canvas color matrix filter | `VERIFIED WORKING` | **NO** |
| **06. Live VTO** | Mirror Feed Toggle | Inverts transform | Mirrors horizontal camera feed (`scaleX(-1)`) | `#toggleMirrorFeed` $\to$ Video style transform | `VERIFIED WORKING` | **NO** |
| **06. Live VTO** | Photo Snapshot & Download | Static icon | Captures high-res canvas composite with frame overlay | `#snapshotBtn` $\to$ Canvas snapshot generator | `VERIFIED WORKING` | **NO** |
| **07. Biometrics** | Mode Switcher (Card / Iris / Manual) | Mock button click | Switches calibration workflow and instructions | `#modeBtnA/B/C` $\to$ DOM mode switcher | `VERIFIED WORKING` | **NO** |
| **07. Biometrics** | Card Reference Calibrator (85.6mm) | Static card guide | Estimates scale based on standard card bounding box | Canvas calibration algorithm $\to$ mm scale | `DEMO / SIMULATION` | **NO** |
| **07. Biometrics** | Dual AI Iris Calibrator (11.7mm) | Static eye reticles | Calculates PD from corneal white-to-white ratio | Landmark pupil distance algorithm | `DEMO / SIMULATION` | **NO** |
| **07. Biometrics** | Manual Doctor Rx PD Slider (54 - 74mm) | Updates number label | Saves calibrated PD directly into `Store.prescription` | `#pdSlider` $\to$ `Store.prescription.pd = val` | `VERIFIED WORKING` | **NO** |
| **08. Desktop VTO**| Split A/B Frame Viewport | Static mock frames | Renders Frame A vs Frame B on synchronized canvas | `VTOService.renderSplitView(skuA, skuB)` | `VERIFIED WORKING` | **NO** |
| **08. Desktop VTO**| Yaw Pose Lock Synchronization | Toggles button color | Synchronizes head rotation between left & right panes | `#yawSyncToggle` $\to$ Pose state sync | `VERIFIED WORKING` | **NO** |
| **09. Mobile VTO** | Mode Toggles (Split / Swipe / Fade) | Changes class name | Switches mobile comparison blending mode | `#btn-split`, `#btn-swipe`, `#btn-fade` | `VERIFIED WORKING` | **NO** |
| **09. Mobile VTO** | Touch Swipe Comparison Divider | Mock slider | Drags split divider on mobile touch events | Touch drag listener $\to$ Clip-path updater | `VERIFIED WORKING` | **NO** |
| **10. Compare** | "Highlight Differences Only" Toggle | Toggles row class | Filters spec rows where values differ across SKUs | `#btn-highlight-diff` $\to$ Row filter handler | `VERIFIED WORKING` | **NO** |
| **10. Compare** | WhatsApp Share Blueprint Action | Static link | Generates WhatsApp share URL with compared specs | `#btn-share-blueprint` $\to$ `wa.me` URL | `VERIFIED WORKING` | **NO** |
| **11. Configurator**| SPH / CYL / AXIS / ADD Dropdowns | Static select boxes | Validates ophthalmic diopter limits and stores values | `select[name]` $\to$ `Store.setPrescription()` | `VERIFIED WORKING` | **NO** |
| **11. Configurator**| Prescription Photo / PDF OCR Upload | Static file input | Simulates OCR scan of uploaded clinic slip, auto-populates | `#rx-file-input` $\to$ OCR parser simulation | `DEMO / SIMULATION` | **NO** |
| **11. Configurator**| Lens Type Cards (Single Vision, Progressive)| Static card border | Updates selected lens design and base price | `.lens-type-card` $\to$ `Store.setLensType()` | `VERIFIED WORKING` | **NO** |
| **11. Configurator**| Refractive Index Chips (1.50 - 1.74) | Static chip click | Updates thickness recommendation and index cost | `.index-chip` $\to$ `Store.setIndex()` | `VERIFIED WORKING` | **NO** |
| **11. Configurator**| BlueShield 420 UV Slider Simulation | Moves slider bar | Demonstrates blue-light filtration tint in real time | `#uv-range` $\to$ SVG lens tint opacity | `VERIFIED WORKING` | **NO** |
| **11. Configurator**| Coating Toggles (Anti-Glare, Oleophobic) | Checkbox inputs | Adds coating costs to configuration total | `input[name="coating"]` $\to$ Price calculator | `VERIFIED WORKING` | **NO** |
| **11. Configurator**| "Add Complete Pair to Bag" CTA | Dead button | Bundles Frame + Lens + Coatings into cart, goes to Cart | `#btn-add-complete-pair` $\to$ `Store.addPair()` | `VERIFIED WORKING` | **NO** |
| **12. Booking** | Clinic Location Selector (4 Hubs) | Changes border style | Sets chosen clinic in appointment store | `.clinic-card` $\to$ `Store.appointment.clinic` | `VERIFIED WORKING` | **NO** |
| **12. Booking** | Exam Date Chips (Tomorrow, etc.) | Changes chip color | Sets appointment date and updates available time slots | `.date-chip` $\to$ `Store.appointment.date` | `VERIFIED WORKING` | **NO** |
| **12. Booking** | Time Slot Buttons (10:00, 10:30, etc.) | Changes button style | Sets appointment time | `.time-slot-btn` $\to$ `Store.appointment.time` | `VERIFIED WORKING` | **NO** |
| **12. Booking** | Optometrist Selection Radio | Static inputs | Assigns specific registered optometrist | `input[name="optometrist"]` $\to$ Store | `VERIFIED WORKING` | **NO** |
| **12. Booking** | "Confirm 28-Point Exam Booking" Form | Static submit | Validates patient phone/email, saves appointment, confirms | Form submit $\to$ Save appointment & view confirmation | `VERIFIED WORKING` | **NO** |
| **13. Clinical Doc**| Diopter Notation Transpose (+/- format)| Toggles button text | Transposes SPH and CYL according to optical formula | `#toggle-units` $\to$ SPH/CYL transposition math | `VERIFIED WORKING` | **NO** |
| **13. Clinical Doc**| "Configure Lenses with This Rx" CTA | Dead button | Transfers clinical diopters to Configurator & opens it | `#btn-configure-with-rx` $\to$ Configurator | `VERIFIED WORKING` | **NO** |
| **13. Clinical Doc**| Download Signed PDF Dossier | Mock loading state | Generates downloadable clinical ophthalmic report | `#btn-download-pdf` $\to$ Client-side PDF trigger | `DEMO / SIMULATION` | **NO** |
| **14. Insurance** | Insurer Dropdown (Jubilee, APA, Britam, etc.)| Static select | Sets active underwriter and benefit guidelines | `#insurerSelect` $\to$ `InsuranceService.set()` | `DEMO / SIMULATION` | **NO** |
| **14. Insurance** | Policy & Member Number Inputs | Form inputs | Validates syntax of policy numbers | Inputs $\to$ `InsuranceService.validate()` | `DEMO / SIMULATION` | **NO** |
| **14. Insurance** | "Submit Pre-Authorization Claim" | Shows status text | Validates claim against demo balance, opens voucher modal| `#submitClaimBtn` $\to$ Opens Pre-Auth Voucher | `DEMO / SIMULATION` | **NO** |
| **15. Pre-Auth Doc**| Print Voucher Button | Static button | Calls `window.print()` with print-optimized styles | `#printVoucherBtn` $\to$ `window.print()` | `VERIFIED WORKING` | **NO** |
| **15. Pre-Auth Doc**| Download Signed Pre-Auth PDF | Dead button | Downloads electronic authorization dossier | `#downloadPdfBtn` $\to$ Client-side PDF trigger | `DEMO / SIMULATION` | **NO** |
| **16. Desktop M-PESA**| M-PESA Phone Number Input & Edit | Readonly input toggle | Formats Kenyan phone numbers (`+254 7...`) | `#toggle-edit-btn` $\to$ Readonly toggle | `VERIFIED WORKING` | **NO** |
| **16. Desktop M-PESA**| "Trigger M-PESA STK Push" CTA | Dead button | Dispatches simulated STK push, launches status flow | `#btn-trigger-stk` $\to$ `MPESAService.trigger()` | `DEMO / SIMULATION` | **NO** |
| **17. Mobile M-PESA** | Countdown Timer (1:42) | Decrements in timer | Ticks down, simulates Safaricom STK prompt response | Interval timer $\to$ Verifies demo STK push | `DEMO / SIMULATION` | **NO** |
| **17. Mobile M-PESA** | Resend STK Push Button | Static button | Restarts countdown timer and re-dispatches simulated STK | `#btn-resend-stk` $\to$ Reset timer | `DEMO / SIMULATION` | **NO** |
| **18. Dispatch** | "Copy Receipt Number" Button | Copies mock string | Copies live order transaction ID to clipboard & shows toast | `#btn-copy-receipt` $\to$ `navigator.clipboard` | `VERIFIED WORKING` | **NO** |
| **18. Dispatch** | Live Telemetry Coordinates & Speed | Static values | Updates simulated rider coordinates, temperature & speed | Telemetry tick interval updating DOM text | `DEMO / SIMULATION` | **NO** |
| **19. Tracking** | WhatsApp Live Tracking Alerts | Static link | Opens WhatsApp with pre-filled order tracking query | `#btn-whatsapp-tracker` $\to$ `wa.me` URL | `VERIFIED WORKING` | **NO** |
| **19. Tracking** | "View KRA ETR Tax Invoice" Link | Static link | Navigates to KRA Tax Invoice panel for this order | `a[data-path="tax-invoice"]` $\to$ Router | `VERIFIED WORKING` | **NO** |
| **20. KRA Invoice** | KRA Cryptographic QR Code | Static placeholder | Encodes TIMS/eTIMS compliant verification string | Dynamic QR payload generator | `DEMO / SIMULATION` | **NO** |
| **20. KRA Invoice** | Print & Download Invoice Actions | Mock loading text | Invokes print dialog and PDF download | `#printBtn`, `#downloadPdfBtn` | `VERIFIED WORKING` | **NO** |
| **21. Account** | Portal Navigation Tabs (Orders, Rx, Appts) | Dead links | Switches between active panels without page reload | `.account-nav-tab` $\to$ DOM tab switcher | `VERIFIED WORKING` | **NO** |
| **21. Account** | "Schedule Exam at Sarit Atelier" CTA | Static link | Navigates to Booking panel with Sarit selected | `a[data-path="book-eye-test"]?clinic=sarit` | `VERIFIED WORKING` | **NO** |
| **22. Spatial Master**| Ambient Caustic Canvas | Static element | Renders subtle animated optical caustics reflection | Canvas 2D / WebGL light caustics loop | `VERIFIED WORKING` | **NO** |
