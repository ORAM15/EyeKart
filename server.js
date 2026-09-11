import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Base directory for Stitch screens
const STITCH_DIR = path.join(__dirname, 'Stitch', 'stitch_eyekart_optical_commerce_platform');

// Page registry
const PAGES = {
  home: {
    title: 'EyeKart — Grand Optical Storefront & Atelier',
    folder: 'eyekart_grand_optical_homepage',
    route: '/'
  },
  spatial: {
    title: 'EyeKart — 3D Spatial Optical Master Experience',
    folder: 'eyekart_integrated_spatial_optical_master_experience',
    route: '/spatial'
  },
  catalog: {
    title: 'EyeKart — Eyeglasses Catalog & Faceted Filters',
    folder: 'eyekart_optical_catalog_faceted_filters',
    route: '/catalog'
  },
  product: {
    title: 'EyeKart — 3D Product Detail Studio & Specs',
    folder: 'eyekart_3d_product_detail_studio',
    route: '/product'
  },
  'lens-configurator': {
    title: 'EyeKart — Precision Lens Configurator (OD/OS)',
    folder: 'eyekart_precision_lens_configurator',
    route: '/lens-configurator'
  },
  'try-on': {
    title: 'EyeKart — Live Camera Virtual Try-On Studio (VTO)',
    folder: 'eyekart_live_camera_virtual_try_on_vto_studio',
    route: '/try-on'
  },
  'pd-scanner': {
    title: 'EyeKart — Biometric Pupillary Distance (PD) Scanner',
    folder: 'eyekart_vto_calibration_pd_biometric_scanner',
    route: '/pd-scanner'
  },
  'split-screen': {
    title: 'EyeKart — Split-Screen Comparison (Frame A vs B)',
    folder: 'eyekart_split_screen_comparison_vto_frame_a_vs_frame_b',
    route: '/split-screen'
  },
  'comparison-matrix': {
    title: 'EyeKart — Multi-SKU Technical Spec Studio',
    folder: 'eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio',
    route: '/comparison-matrix'
  },
  appointment: {
    title: 'EyeKart — 28-Point Optical Exam Booking (Sarit/Junction)',
    folder: 'eyekart_clinic_appointment_28_point_eye_exam_booking',
    route: '/appointment'
  },
  insurance: {
    title: 'EyeKart — Corporate Optical Insurance Pre-Authorization',
    folder: 'eyekart_corporate_optical_insurance_claim_pre_authorization',
    route: '/insurance'
  },
  'insurance-letter': {
    title: 'EyeKart — Electronic Pre-Auth Letter & Approval Certificate',
    folder: 'eyekart_claim_approved_electronic_pre_auth_letter_modal',
    route: '/insurance-letter'
  },
  'clinical-report': {
    title: 'EyeKart — Precision Diopter Clinical Report',
    folder: 'eyekart_clinical_examination_report_precision_diopter_summary',
    route: '/clinical-report'
  },
  checkout: {
    title: 'EyeKart — Desktop M-PESA Express STK Checkout',
    folder: 'eyekart_desktop_m_pesa_express_checkout',
    route: '/checkout'
  },
  'mobile-checkout': {
    title: 'EyeKart — Mobile M-PESA STK Push Checkout',
    folder: 'eyekart_mobile_m_pesa_stk_push_checkout',
    route: '/mobile-checkout'
  },
  'order-confirmation': {
    title: 'EyeKart — Live Nairobi Courier Tracking & Rider Map',
    folder: 'eyekart_order_confirmation_live_nairobi_courier_tracking',
    route: '/order-confirmation'
  },
  'courier-dispatch': {
    title: 'EyeKart — Payment Verified & Courier Dispatch',
    folder: 'eyekart_m_pesa_payment_verified_live_courier_dispatch',
    route: '/courier-dispatch'
  },
  account: {
    title: 'EyeKart — Patient Portal: Orders & Prescriptions Vault',
    folder: 'eyekart_customer_account_orders_prescriptions_management',
    route: '/account'
  },
  'catalog-live-tryon': {
    title: 'EyeKart — Catalog Collection Live Try-On Active Mode',
    folder: 'eyekart_catalog_collection_live_try_on_studio_active_mode',
    route: '/catalog-live-tryon'
  },
  'quick-view': {
    title: 'EyeKart — Dimension Blueprint Quick View',
    folder: 'eyekart_optical_catalog_quick_view_dimension_blueprint',
    route: '/quick-view'
  },
  'mobile-split-screen': {
    title: 'EyeKart — Mobile Split-Screen VTO Comparison',
    folder: 'eyekart_mobile_split_screen_vto_comparison',
    route: '/mobile-split-screen'
  },
  invoice: {
    title: 'EyeKart — KRA ETR Tax Invoice & Clinical Ophthalmic Certificate',
    folder: 'eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate',
    route: '/invoice'
  }
};

// Injection snippet: client navigation + floating experience dock + camera helper
function getInjectedCode(currentKey) {
  const navItems = Object.entries(PAGES).map(([key, page]) => ({
    key,
    title: page.title.replace('EyeKart — ', ''),
    route: page.route,
    active: key === currentKey
  }));

  return `
<!-- EyeKart Injected Platform Navigation & Experience Hub -->
<style>
#eyekart-nav-dock {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 999999;
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
}
#eyekart-dock-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #111418;
  color: #ffffff;
  padding: 10px 18px;
  border-radius: 9999px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.15);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  border: none;
  backdrop-filter: blur(12px);
}
#eyekart-dock-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 36px rgba(0,0,0,0.38);
  background: #0047BA;
}
#eyekart-dock-menu {
  display: none;
  position: absolute;
  bottom: 54px;
  right: 0;
  width: 320px;
  max-height: 480px;
  overflow-y: auto;
  background: #ffffff;
  color: #111418;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06);
  padding: 12px;
}
#eyekart-dock-menu.open {
  display: block;
}
.eyekart-nav-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  text-decoration: none;
  color: #2A2E35;
  transition: all 0.15s ease;
  margin-bottom: 2px;
}
.eyekart-nav-link:hover {
  background: #eff4ff;
  color: #0047BA;
}
.eyekart-nav-link.active {
  background: #0047BA;
  color: #ffffff;
  font-weight: 600;
}
.eyekart-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #00A859;
  color: #ffffff;
  font-weight: 700;
  text-transform: uppercase;
}
</style>

<div id="eyekart-nav-dock">
  <div id="eyekart-dock-menu">
    <div style="padding: 6px 12px 10px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 700; font-size: 13px; color: #111418; letter-spacing: -0.01em;">EYEKART ATELIER</div>
        <div style="font-size: 11px; color: #64748b;">Kenya Luxury Optics • 22 Views</div>
      </div>
      <span class="eyekart-badge">Live Nairobi</span>
    </div>
    <div style="max-height: 380px; overflow-y: auto;">
      ${navItems
        .map(
          (item) => `
        <a href="${item.route}" class="eyekart-nav-link ${item.active ? 'active' : ''}">
          <span>${item.title}</span>
          ${item.active ? '<span style="font-size: 11px;">●</span>' : ''}
        </a>
      `
        )
        .join('')}
    </div>
  </div>
  <button id="eyekart-dock-btn" type="button" aria-label="Toggle EyeKart Navigation">
    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#00A859;"></span>
    <span>Explore Views (${navItems.length})</span>
    <span style="font-size: 11px; opacity: 0.8;">▲</span>
  </button>
</div>

<script>
(function() {
  // 1. Toggle Dock Menu
  const btn = document.getElementById('eyekart-dock-btn');
  const menu = document.getElementById('eyekart-dock-menu');
  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.classList.remove('open');
      }
    });
  }

  // 2. Client-side Navigation Path Routing for [data-path] links
  const pathMap = {
    'home': '/',
    'eyeglasses-collection': '/catalog',
    'eyeglasses': '/catalog',
    'sunglasses-collection': '/catalog?category=sunglasses',
    'sunglasses': '/catalog?category=sunglasses',
    'screen-glasses': '/catalog?category=screen-glasses',
    'kids-teens-optics': '/catalog?category=kids',
    'kids-teens': '/catalog?category=kids',
    'contact-lenses': '/catalog?category=contacts',
    'premium-atelier': '/catalog?category=atelier',
    'nairobi-edit': '/catalog?category=nairobi-edit',
    'virtual-try-on': '/try-on',
    'try-on-studio': '/try-on',
    'ai-frame-finder': '/spatial',
    'book-eye-test': '/appointment',
    'clinics-nairobi': '/appointment',
    'upload-prescription': '/lens-configurator',
    'lens-customizer': '/lens-configurator',
    'checkout': '/checkout',
    'cart': '/checkout',
    'cart-bag': '/checkout',
    'my-account': '/account',
    'user-profile': '/account',
    'order-tracking': '/order-confirmation',
    'pd-scanner': '/pd-scanner',
    'split-screen': '/split-screen',
    'comparison-matrix': '/comparison-matrix',
    'insurance-claim': '/insurance',
    'dispatch': '/courier-dispatch'
  };

  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-path]');
    if (target) {
      const p = target.getAttribute('data-path');
      if (pathMap[p]) {
        e.preventDefault();
        window.location.href = pathMap[p];
      }
    }
  });

  // 3. Optional real webcam helper for VTO and PD scanner if requested
  const videoFeedPlaceholder = document.getElementById('arModelFace');
  if (videoFeedPlaceholder && (window.location.pathname === '/try-on' || window.location.pathname === '/pd-scanner')) {
    const parent = videoFeedPlaceholder.parentElement;
    if (parent && !document.getElementById('webcam-toggle-btn')) {
      const camBtn = document.createElement('button');
      camBtn.id = 'webcam-toggle-btn';
      camBtn.type = 'button';
      camBtn.innerHTML = '📷 Live Camera Stream';
      camBtn.style.cssText = 'position:absolute; top:16px; left:16px; z-index:40; padding:6px 12px; background:rgba(0,0,0,0.65); color:#fff; border-radius:9999px; font-size:11px; font-weight:600; border:1px solid rgba(255,255,255,0.25); cursor:pointer; backdrop-filter:blur(8px);';
      
      let videoEl = null;
      let stream = null;

      camBtn.addEventListener('click', async () => {
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            videoEl = document.createElement('video');
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoEl.muted = true;
            videoEl.srcObject = stream;
            videoEl.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:5;';
            parent.appendChild(videoEl);
            camBtn.innerHTML = '⏹ Switch to Model Portrait';
            camBtn.style.background = '#00A859';
          } catch(err) {
            console.warn('Camera access not granted or not available:', err);
            alert('Camera access preview: ' + (err.message || 'Camera permission denied'));
          }
        } else {
          stream.getTracks().forEach(t => t.stop());
          stream = null;
          if (videoEl) videoEl.remove();
          camBtn.innerHTML = '📷 Live Camera Stream';
          camBtn.style.background = 'rgba(0,0,0,0.65)';
        }
      });
      parent.appendChild(camBtn);
    }
  }
})();
</script>
`;
}

// Serve individual page helper
function renderPage(pageKey, res) {
  const page = PAGES[pageKey];
  if (!page) return res.status(404).send('Page not found');

  const filePath = path.join(STITCH_DIR, page.folder, 'code.html');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found: ' + page.folder);
  }

  let html = fs.readFileSync(filePath, 'utf-8');

  // Clean any markdown code fence artifacts
  html = html.replace(/```html\s*/g, '').replace(/```\s*$/g, '');

  // Inject navigation & experience switcher dock right before </body>
  const injected = getInjectedCode(pageKey);
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${injected}</body>`);
  } else {
    html += injected;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// Register all page routes
Object.entries(PAGES).forEach(([key, page]) => {
  app.get(page.route, (req, res) => {
    renderPage(key, res);
  });
});

// Aliases for user convenience
app.get('/home', (req, res) => renderPage('home', res));
app.get('/eyeglasses', (req, res) => renderPage('catalog', res));
app.get('/sunglasses', (req, res) => renderPage('catalog', res));
app.get('/vto', (req, res) => renderPage('try-on', res));
app.get('/lens-customizer', (req, res) => renderPage('lens-configurator', res));
app.get('/book-exam', (req, res) => renderPage('appointment', res));
app.get('/tracking', (req, res) => renderPage('order-confirmation', res));
app.get('/my-account', (req, res) => renderPage('account', res));
app.get('/patient-portal', (req, res) => renderPage('account', res));

// Brand Logo SVG endpoint
app.get('/logo.svg', (req, res) => {
  const logoPath = path.join(STITCH_DIR, 'eyekart_brand_logo', 'code.html');
  if (fs.existsSync(logoPath)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(fs.readFileSync(logoPath, 'utf-8'));
  } else {
    res.status(404).send('Logo not found');
  }
});

// Portrait image endpoint
app.get('/portrait.png', (req, res) => {
  const pPath = path.join(STITCH_DIR, 'close_up_professional_studio_portrait_headshot_of_a_stylish_modern_kenyan_woman', 'screen.png');
  if (fs.existsSync(pPath)) {
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(pPath);
  } else {
    res.status(404).send('Portrait not found');
  }
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'EyeKart — Luxury Optical & Eye Care Platform',
    currency: 'KES',
    daraja_m_pesa_gateway: 'Till 889211 (Active)',
    serverTime: new Date().toISOString()
  });
});

app.post('/api/mpesa/simulate-stk', (req, res) => {
  const { phone, amount } = req.body || {};
  res.json({
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
    MerchantRequestID: `EK-${Date.now()}`,
    CheckoutRequestID: `ws_CO_${Math.floor(Math.random() * 8999999 + 1000000)}`,
    CustomerMessage: `STK Push prompt sent to ${phone || '+254700393527'} for KSh ${amount || 18500}`
  });
});

// Static assets from Stitch and public
app.use('/Stitch', express.static(path.join(__dirname, 'Stitch')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// Express v5 catch-all SPA fallback
app.get('*all', (req, res) => {
  renderPage('home', res);
});

// Start listening on port 3000 and 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[EyeKart] Optical Commerce server listening on http://0.0.0.0:${PORT}`);
});
