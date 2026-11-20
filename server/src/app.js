const path = require('path');
const fs = require('fs');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const fastifyStatic = require('@fastify/static');
const config = require('./config/env');
const { authenticate } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

// Route Modules
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const taxonomyRoutes = require('./routes/categories');
const pricingRoutes = require('./routes/pricing');
const adminRoutes = require('./routes/admin');
const cartRoutes = require('./routes/cart');
const checkoutRoutes = require('./routes/checkout');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const prescriptionRoutes = require('./routes/prescriptions');
const optometristRoutes = require('./routes/optometrist');
const fulfillmentRoutes = require('./routes/fulfillment');
const inventoryRoutes = require('./routes/inventory');
const appointmentRoutes = require('./routes/appointments');
const webhookRoutes = require('./routes/webhooks');
const storageRoutes = require('./routes/storage');
const notificationRoutes = require('./routes/notifications');

// Content-Security-Policy for the served Stitch panels + /assets.
// Asset inventory (checked against the real pages, main @ ee790df):
//   - scripts: same-origin /assets/js/* (incl. vendored assets/vendor/three.min.js)
//     plus https://cdn.tailwindcss.com (Tailwind Play CDN).
//   - styles: same-origin, https://fonts.googleapis.com, Tailwind CDN.
//   - fonts: https://fonts.gstatic.com (Google Fonts files).
//   - images: same-origin /assets, https://lh3.googleusercontent.com
//     (Stitch panel photography), data: (inline webp) and blob: (camera/
//     canvas previews via URL.createObjectURL).
//   - XHR/fetch: same-origin /api/* only, plus https://lh3.googleusercontent.com
//     (snapshot download in assets/js/eyekart-actions.js fetches the catalog
//     image bytes from that host; img-src alone does not cover fetch()).
//     No WebSockets, no workers.
//   - WebAssembly: 'wasm-unsafe-eval' on script-src — the vendored MediaPipe
//     bundle (assets/vendor/mediapipe/vision_wasm_internal.wasm, loaded by
//     assets/js/vto-engine.js via FilesetResolver) compiles WASM with
//     WebAssembly.instantiateStreaming/instantiate. Without this keyword
//     browsers that enforce CSP block compilation, so FaceLandmarker never
//     initialises on either the GPU or the CPU path (both use the same WASM).
//     This is narrower than 'unsafe-eval': eval() / new Function() stay blocked.
//   - No <iframe>/<embed>/<object> and no cross-origin form posts.
// KNOWN WEAKNESS — 'unsafe-inline' is required on script-src and style-src:
// the panels ship ~41 inline <script> blocks (incl. 22 inline
// tailwind-config blocks) plus 22 <style> blocks and inline style=""
// attributes, so a nonce/hash CSP would break the site today. Follow-up:
// move inline code into /assets/js files and inline styles into classes,
// then replace 'unsafe-inline' with per-request nonces. Until then CSP
// still blocks the dangerous cases: cross-origin scripts, plugins
// (object-src 'none'), framing by other origins, and form exfiltration.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.tailwindcss.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "media-src 'self' blob:",
  "connect-src 'self' https://lh3.googleusercontent.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'"
].join('; ');

// Strict-Transport-Security: production only. Render terminates TLS in
// front of the app, so browsers must only ever reach it over HTTPS once
// they have seen this header. Never sent in local dev (plain HTTP), where
// it would pin the browser to HTTPS for a host that serves none.
// max-age 1 year + includeSubDomains; no `preload` (the domain has not
// been submitted to the HSTS preload list — that is a separate, deliberate
// decision, not an oversight).
const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

function buildApp(opts = {}) {
  const redactPaths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    '*.password',
    '*.password_hash',
    '*.passwordHash',
    '*.salt',
    '*.secret',
    '*.token',
    '*.rawToken',
    '*.apiKey',
    '*.api_key',
    '*.cvv',
    '*.creditCard',
    '*.credit_card',
    '*.mpesaPasskey',
    '*.consumerSecret',
    '*.securityCredential'
  ];

  const defaultLogger = {
    level: config.isProd ? 'info' : (config.env === 'development' ? 'debug' : 'info'),
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]'
    }
  };

  const app = Fastify({
    logger: opts.logger !== undefined ? opts.logger : defaultLogger,
    trustProxy: config.server?.trustProxy ?? false,
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const incoming = req.headers['x-correlation-id'] || req.headers['x-request-id'];
      if (incoming && typeof incoming === 'string' && incoming.trim() !== '') {
        return incoming.trim();
      }
      return `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    },
    bodyLimit: 15728640, // 15MB request body limit for secure document uploads
    ...opts
  });

  // 1. Security Headers Hook & Request Correlation
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    // NOTE: X-XSS-Protection intentionally NOT set — it is deprecated and
    // ignored by Chrome/Edge; Content-Security-Policy below is its
    // replacement. Sending it can even re-enable a buggy legacy filter.
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    if (config.isProd) {
      reply.header('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
    }
    if (request.id) {
      reply.header('x-request-id', request.id);
      reply.header('x-correlation-id', request.id);
    }
    return payload;
  });

  // 1b. Request Lifecycle Structured Visibility
  app.addHook('onResponse', async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url === '/health' || request.url === '/ready') {
      const durationMs = Math.round(reply.elapsedTime);
      const actorId = request.user?.id || 'ANONYMOUS';
      const actorRole = request.user?.role || 'ANONYMOUS';
      request.log.info({
        correlationId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs,
        actorId,
        actorRole
      }, `[Request Lifecycle] ${request.method} ${request.url} -> ${reply.statusCode} (${durationMs}ms)`);
    }
  });

  // 2. CORS Plugin with Strict Origin Validation
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow non-browser requests (same-origin, curl, server-to-server)
      if (!origin) return cb(null, true);

      const allowed = config.cors?.origin || [];
      if (allowed.includes(origin) || allowed.includes('*')) {
        return cb(null, true);
      }
      return cb(new Error(`Origin '${origin}' not permitted by EyeKart CORS policy.`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // 3. Cookie Plugin
  app.register(cookie, {
    secret: config.session.cookieSecret,
    parseOptions: {}
  });

  // Support empty body or missing content-type on JSON and generic POST requests
  app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    if (!body || body.trim() === '') {
      done(null, {});
    } else {
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  });

  // 4. Global Authentication Pre-Handler
  app.addHook('preHandler', authenticate);

  // 5. Centralized Error Handler (Rule 12)
  app.setErrorHandler(errorHandler);

  // 6. Register Routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(productRoutes);
  app.register(taxonomyRoutes);
  app.register(pricingRoutes);
  app.register(adminRoutes);
  app.register(cartRoutes);
  app.register(checkoutRoutes);
  app.register(orderRoutes);
  app.register(paymentRoutes);
  app.register(prescriptionRoutes);
  app.register(optometristRoutes);
  app.register(fulfillmentRoutes);
  app.register(inventoryRoutes);
  app.register(appointmentRoutes);
  app.register(webhookRoutes);
  app.register(storageRoutes);
  app.register(notificationRoutes);

  // 7. Static Asset Serving (Frontend Unified Same-Origin Deployment)
  const projectRoot = path.resolve(__dirname, '../../');
  const assetsDir = path.join(projectRoot, 'assets');
  const stitchDir = path.join(projectRoot, 'Stitch');

  if (fs.existsSync(assetsDir)) {
    app.register(fastifyStatic, {
      root: assetsDir,
      prefix: '/assets/',
      decorateReply: true
    });
  }

  if (fs.existsSync(stitchDir)) {
    app.register(fastifyStatic, {
      root: stitchDir,
      prefix: '/Stitch/',
      decorateReply: false
    });
  }

  // Alias /Stitch/assets/ -> /assets/ to match legacy relative panel paths
  if (fs.existsSync(assetsDir)) {
    app.register(fastifyStatic, {
      root: assetsDir,
      prefix: '/Stitch/assets/',
      decorateReply: false
    });
  }

  // Root & Homepage Routes
  const homepagePanelRelPath = 'stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/code.html';
  const homepageFullPath = path.join(stitchDir, homepagePanelRelPath);

  app.get('/', async (req, reply) => {
    if (fs.existsSync(homepageFullPath)) {
      return reply.sendFile(homepagePanelRelPath, stitchDir);
    }
    const rootIndex = path.join(projectRoot, 'index.html');
    if (fs.existsSync(rootIndex)) {
      return reply.sendFile('index.html', projectRoot);
    }
    return reply.status(200).send({ message: 'EyeKart API Ready' });
  });

  app.get('/index.html', async (req, reply) => {
    if (fs.existsSync(homepageFullPath)) {
      return reply.sendFile(homepagePanelRelPath, stitchDir);
    }
    const rootIndex = path.join(projectRoot, 'index.html');
    if (fs.existsSync(rootIndex)) {
      return reply.sendFile('index.html', projectRoot);
    }
    return reply.status(200).send({ message: 'EyeKart API Ready' });
  });

  const faviconPath = path.join(projectRoot, 'favicon.ico');
  app.get('/favicon.ico', async (req, reply) => {
    if (fs.existsSync(faviconPath)) {
      return reply.sendFile('favicon.ico', projectRoot);
    }
    return reply.status(204).send();
  });

  return app;
}

module.exports = { buildApp };
