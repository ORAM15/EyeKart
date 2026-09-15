/**
 * EyeKart Production Fastify Application Builder
 * Phase 6.1 Backend Foundation
 */
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
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

function buildApp(opts = {}) {
  const app = Fastify({
    logger: opts.logger !== undefined ? opts.logger : (config.env === 'development'),
    bodyLimit: 15728640, // 15MB request body limit for secure document uploads (Phase 6.6)
    ...opts
  });

  // 1. Security Headers Hook (Rule 13)
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  // 2. CORS Plugin
  app.register(cors, {
    origin: config.cors.origin,
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

  return app;
}

module.exports = { buildApp };
