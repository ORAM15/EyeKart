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
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
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
