/**
 * EyeKart Phase 6.1 Database Schema & Migration Runner
 * Establishes the minimal, secure production foundation.
 */
const { query } = require('./pool');

const SCHEMA_SQL = `
-- 1. Roles table
CREATE TABLE IF NOT EXISTS roles (
  name VARCHAR(32) PRIMARY KEY,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(32) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL REFERENCES roles(name) DEFAULT 'CUSTOMER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3. Sessions table for stateful token revocation & tracking
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 4. Categories table
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(128) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Collections table
CREATE TABLE IF NOT EXISTS collections (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Products table (canonical authoritative catalog)
CREATE TABLE IF NOT EXISTS products (
  sku VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  brand VARCHAR(64) NOT NULL DEFAULT 'EyeKart Nairobi Atelier',
  category_id VARCHAR(64) REFERENCES categories(id) ON DELETE SET NULL,
  collection_id VARCHAR(64) REFERENCES collections(id) ON DELETE SET NULL,
  gender VARCHAR(16) NOT NULL DEFAULT 'unisex',
  shape VARCHAR(32) NOT NULL,
  material VARCHAR(255) NOT NULL,
  base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
  compare_at_price NUMERIC(12, 2),
  dimensions VARCHAR(32) NOT NULL,
  weight VARCHAR(16),
  bridge INTEGER,
  temple INTEGER,
  lens_width INTEGER,
  lens_height INTEGER,
  pantoscopic_angle VARCHAR(16),
  base_curve VARCHAR(16),
  frame_total_width INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  source_conflict VARCHAR(255),
  source_conflict_details TEXT,
  gallery JSONB DEFAULT '[]'::jsonb,
  prescription_compatibility JSONB DEFAULT '{}'::jsonb,
  asset_3d JSONB DEFAULT '{}'::jsonb,
  asset_vto JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Product Variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(64) NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  color_hex VARCHAR(16) NOT NULL,
  sku_suffix VARCHAR(16) NOT NULL,
  price_delta NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_product_variant_suffix UNIQUE (sku, sku_suffix)
);

CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);

-- 8. Audit Logs table (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(32) NOT NULL DEFAULT 'ANONYMOUS',
  ip_address VARCHAR(45),
  user_agent TEXT,
  action VARCHAR(64) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);

-- 9. Carts table (Phase 6.2)
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_session ON carts(session_id);

-- 10. Cart Items table (Phase 6.2)
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  sku VARCHAR(64) NOT NULL REFERENCES products(sku),
  variant VARCHAR(64) NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  lens_config JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_sku ON cart_items(sku);

-- 11. Orders table (Phase 6.2)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(64) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cart_id UUID REFERENCES carts(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
  currency VARCHAR(8) NOT NULL DEFAULT 'KES',
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  vat NUMERIC(12, 2) NOT NULL CHECK (vat >= 0),
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  delivery_address TEXT NOT NULL,
  gate_protocol TEXT,
  customer_snapshot JSONB NOT NULL,
  requires_prescription_review BOOLEAN NOT NULL DEFAULT FALSE,
  prescription_status VARCHAR(32) NOT NULL DEFAULT 'NOT_APPLICABLE',
  prescription_snapshot JSONB DEFAULT NULL,
  tracking JSONB DEFAULT '{}'::jsonb,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- 12. Order Items table - Immutable Snapshot (Phase 6.2)
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku VARCHAR(64) NOT NULL REFERENCES products(sku),
  name VARCHAR(128) NOT NULL,
  variant VARCHAR(64) NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  frame_price NUMERIC(12, 2) NOT NULL CHECK (frame_price >= 0),
  lens_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (lens_price >= 0),
  total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
  lens_config JSONB DEFAULT NULL,
  product_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 13. Payment Attempts table (Phase 6.2)
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL DEFAULT 'DEMO',
  payment_rail VARCHAR(64) NOT NULL DEFAULT 'Safaricom Daraja 2.0 (Demo Rail)',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'KES',
  status VARCHAR(32) NOT NULL DEFAULT 'INITIATED',
  transaction_ref VARCHAR(64),
  failure_reason TEXT,
  idempotency_key VARCHAR(128),
  checkout_request_id VARCHAR(64),
  merchant_request_id VARCHAR(64),
  mpesa_receipt_number VARCHAR(64),
  phone_number VARCHAR(32),
  callback_received_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_idemp ON payment_attempts(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_checkout_req ON payment_attempts(checkout_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempts_mpesa_receipt ON payment_attempts(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;

-- 14. Idempotency Keys table (Phase 6.2)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(128) PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  route VARCHAR(128) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_user ON idempotency_keys(user_id);

-- 15. Prescriptions table (Phase 6.3)
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  current_revision INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  prescription_mode VARCHAR(32) NOT NULL DEFAULT 'USER_ENTERED',
  source VARCHAR(64) NOT NULL DEFAULT 'MANUAL_ENTRY',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_user ON prescriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_order ON prescriptions(order_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);

-- 16. Prescription Revisions table (Phase 6.3 Immutable History)
CREATE TABLE IF NOT EXISTS prescription_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  od_sph NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  od_cyl NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  od_axis INTEGER CHECK (od_axis IS NULL OR (od_axis >= 1 AND od_axis <= 180)),
  od_add NUMERIC(5, 2),
  os_sph NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  os_cyl NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  os_axis INTEGER CHECK (os_axis IS NULL OR (os_axis >= 1 AND os_axis <= 180)),
  os_add NUMERIC(5, 2),
  pd NUMERIC(5, 2) NOT NULL DEFAULT 63.00,
  patient_note TEXT,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_rx_revision UNIQUE (prescription_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_rx_revisions_rx ON prescription_revisions(prescription_id);

-- 17. Prescription Reviews table (Phase 6.3 Optometrist Review Log)
CREATE TABLE IF NOT EXISTS prescription_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_role VARCHAR(32) NOT NULL DEFAULT 'OPTOMETRIST',
  reviewer_name VARCHAR(128) NOT NULL,
  action VARCHAR(32) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rx_reviews_rx ON prescription_reviews(prescription_id);
CREATE INDEX IF NOT EXISTS idx_rx_reviews_reviewer ON prescription_reviews(reviewer_id);

-- Add reserved_stock to products if not exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0;

-- 17b. Inventory Reservations table (Phase 6.4 & Phase 4)
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  sku VARCHAR(64) NOT NULL REFERENCES products(sku),
  qty INTEGER NOT NULL CHECK (qty > 0),
  status VARCHAR(32) NOT NULL DEFAULT 'RESERVED',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_res_order ON inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_sku ON inventory_reservations(sku);
CREATE INDEX IF NOT EXISTS idx_inv_res_status ON inventory_reservations(status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_status ON payment_attempts(order_id, status);

-- 18. Fulfillments table (Phase 6.4)
CREATE TABLE IF NOT EXISTS fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  tracking_number VARCHAR(64) UNIQUE NOT NULL,
  carrier VARCHAR(128) NOT NULL DEFAULT 'Westlands Central Lab Express Dispatch (DEMO)',
  rider_name VARCHAR(128) DEFAULT 'Westlands Central Lab Dispatch',
  rider_phone VARCHAR(64) DEFAULT '+254 700 918 274',
  vehicle_reg VARCHAR(64) DEFAULT 'Electric Moto Transporter #EK-E12',
  shipping_address TEXT NOT NULL,
  notes TEXT,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_order_fulfillment UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_fulfillments_order ON fulfillments(order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_status ON fulfillments(status);
CREATE INDEX IF NOT EXISTS idx_fulfillments_tracking ON fulfillments(tracking_number);

-- 19. Fulfillment Events table (Phase 6.4 Event Timeline)
CREATE TABLE IF NOT EXISTS fulfillment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id UUID NOT NULL REFERENCES fulfillments(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  stage_title VARCHAR(128) NOT NULL,
  stage_number INTEGER NOT NULL DEFAULT 1,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(32) NOT NULL,
  actor_name VARCHAR(128),
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_events_f ON fulfillment_events(fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_created ON fulfillment_events(created_at ASC);

-- 20. Inventory Reservations table (Phase 6.4)
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  sku VARCHAR(64) NOT NULL REFERENCES products(sku),
  qty INTEGER NOT NULL CHECK (qty > 0),
  status VARCHAR(32) NOT NULL DEFAULT 'RESERVED',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_res_order ON inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_sku ON inventory_reservations(sku);
CREATE INDEX IF NOT EXISTS idx_inv_res_status ON inventory_reservations(status);

-- 21. Clinics table (Phase 6.4)
CREATE TABLE IF NOT EXISTS clinics (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  lead_clinician VARCHAR(128),
  address TEXT NOT NULL,
  phone VARCHAR(32),
  timezone VARCHAR(32) NOT NULL DEFAULT 'Africa/Nairobi',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 22. Appointment Types table (Phase 6.4)
CREATE TABLE IF NOT EXISTS appointment_types (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  price NUMERIC(12, 2) NOT NULL DEFAULT 3500.00,
  rebate_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 23. Appointment Slots table (Phase 6.4)
CREATE TABLE IF NOT EXISTS appointment_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  practitioner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  practitioner_name VARCHAR(128),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(32) NOT NULL DEFAULT 'Africa/Nairobi',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_clinic_slot UNIQUE (clinic_id, start_time)
);

CREATE INDEX IF NOT EXISTS idx_slots_clinic ON appointment_slots(clinic_id);
CREATE INDEX IF NOT EXISTS idx_slots_available ON appointment_slots(is_available, start_time);

-- 24. Appointments table (Phase 6.4)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference VARCHAR(64) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  slot_id UUID REFERENCES appointment_slots(id) ON DELETE SET NULL,
  appointment_type_id VARCHAR(64) NOT NULL REFERENCES appointment_types(id),
  practitioner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  practitioner_name VARCHAR(128),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(32) NOT NULL DEFAULT 'Africa/Nairobi',
  status VARCHAR(32) NOT NULL DEFAULT 'BOOKED',
  patient_name VARCHAR(128) NOT NULL,
  patient_phone VARCHAR(32) NOT NULL,
  patient_email VARCHAR(255),
  national_id VARCHAR(64),
  notes TEXT,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  rescheduled_from_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_ref ON appointments(booking_reference);

-- 23. Stored Documents table (Phase 6.6 Secure Storage Abstraction)
CREATE TABLE IF NOT EXISTS stored_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(64) NOT NULL DEFAULT 'PRESCRIPTION',
  object_key VARCHAR(512) NOT NULL UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_provider VARCHAR(32) NOT NULL DEFAULT 'LOCAL',
  storage_path TEXT NOT NULL,
  is_quarantined BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stored_documents_user ON stored_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_stored_documents_purpose ON stored_documents(purpose);

-- 24. Notifications table (Phase 8 Notifications, Communication & Event Delivery)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient VARCHAR(255) NOT NULL,
  channel VARCHAR(32) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(64) NOT NULL DEFAULT 'TEST',
  provider_message_id VARCHAR(128),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  error_details JSONB,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_idemp ON notifications(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications(event_type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 25. Notification Outbox table (Phase 8 Transactional Outbox Pattern)
CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  event_type VARCHAR(64) NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON notification_outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON notification_outbox(created_at ASC);

-- 26. Notification Preferences table (Phase 8 Customer Communication Controls)
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  transactional_email BOOLEAN NOT NULL DEFAULT TRUE,
  transactional_sms BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_email BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_sms BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_pref_transactional_email_true CHECK (transactional_email = TRUE),
  CONSTRAINT chk_pref_transactional_sms_true CHECK (transactional_sms = TRUE)
);
`;

async function runMigrations() {
  console.info('[EyeKart Migration] Initializing Phase 6.6 Database Schema...');

  // Phase 6 & Phase 7 idempotent column & constraint additions for existing databases before indices
  try {
    await query(`
      ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS checkout_request_id VARCHAR(64);
      ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS merchant_request_id VARCHAR(64);
      ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS mpesa_receipt_number VARCHAR(64);
      ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
      ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS default_shipping_address TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES stored_documents(id) ON DELETE SET NULL;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_reserved_stock') THEN
          ALTER TABLE products ADD CONSTRAINT chk_products_reserved_stock CHECK (reserved_stock >= 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_nonneg') THEN
          ALTER TABLE products ADD CONSTRAINT chk_products_stock_nonneg CHECK (stock >= 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inv_res_qty_pos') THEN
          ALTER TABLE inventory_reservations ADD CONSTRAINT chk_inv_res_qty_pos CHECK (qty > 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pref_transactional_email_true') THEN
          ALTER TABLE notification_preferences ADD CONSTRAINT chk_pref_transactional_email_true CHECK (transactional_email = TRUE);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pref_transactional_sms_true') THEN
          ALTER TABLE notification_preferences ADD CONSTRAINT chk_pref_transactional_sms_true CHECK (transactional_sms = TRUE);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_audit_action_date ON audit_logs(action, created_at DESC);
    `);
  } catch (err) {
    // If tables don't exist yet, SCHEMA_SQL will create them
  }

  await query(SCHEMA_SQL);

  console.info('[EyeKart Migration] Schema migration completed successfully.');
  return { success: true };
}

async function dropAllTables() {
  console.warn('[EyeKart Migration] Dropping all tables (Test/Reset mode)...');
  await query(`
    DROP TABLE IF EXISTS notification_outbox CASCADE;
    DROP TABLE IF EXISTS notifications CASCADE;
    DROP TABLE IF EXISTS notification_preferences CASCADE;
    DROP TABLE IF EXISTS stored_documents CASCADE;
    DROP TABLE IF EXISTS appointments CASCADE;
    DROP TABLE IF EXISTS appointment_slots CASCADE;
    DROP TABLE IF EXISTS appointment_types CASCADE;
    DROP TABLE IF EXISTS clinics CASCADE;
    DROP TABLE IF EXISTS inventory_reservations CASCADE;
    DROP TABLE IF EXISTS fulfillment_events CASCADE;
    DROP TABLE IF EXISTS fulfillments CASCADE;
    DROP TABLE IF EXISTS prescription_reviews CASCADE;
    DROP TABLE IF EXISTS prescription_revisions CASCADE;
    DROP TABLE IF EXISTS prescriptions CASCADE;
    DROP TABLE IF EXISTS idempotency_keys CASCADE;
    DROP TABLE IF EXISTS payment_attempts CASCADE;
    DROP TABLE IF EXISTS order_items CASCADE;
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS cart_items CASCADE;
    DROP TABLE IF EXISTS carts CASCADE;
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS product_variants CASCADE;
    DROP TABLE IF EXISTS products CASCADE;
    DROP TABLE IF EXISTS collections CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS roles CASCADE;
  `);
}

module.exports = {
  runMigrations,
  dropAllTables
};

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.info('[EyeKart Migration CLI] Schema migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[EyeKart Migration CLI] Schema migration failed:', err.message);
      process.exit(1);
    });
}
