# EYEKART — PHASE 6.1 API SPECIFICATION
## Fastify RESTful Service Contract & Schema Reference
**Authoritative API Reference**  
**Version:** 1.0  
**Date:** September 15, 2026  
**Status:** COMPLETE & AUTHORITATIVE  

---

## 1. GLOBAL CONVENTIONS & HEADERS

- **Base URL:** `http://127.0.0.1:3001`
- **Content-Type:** `application/json`
- **Authentication:** HTTP-only cookie `eyekart_session=<token>` or `Authorization: Bearer <token>`
- **Security Response Headers:**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`

---

## 2. ENDPOINT DIRECTORY

### 2.1 Health Check
- **Endpoint:** `GET /api/health`
- **Authentication:** None (Public)
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "service": "EyeKart Production API Foundation",
    "version": "1.0.0",
    "environment": "development",
    "database": {
      "connected": true,
      "name": "eyekart_dev",
      "engine": "PostgreSQL"
    },
    "timestamp": "2026-09-15T02:49:59.444Z"
  }
  ```

### 2.2 Customer Registration
- **Endpoint:** `POST /api/auth/register`
- **Authentication:** None (Public; Rate limited to 5 requests / 60s per IP)
- **Request Body:**
  ```json
  {
    "email": "customer@eyekart.ke",
    "password": "SecurePassword123!",
    "fullName": "Zawadi Kamau",
    "phone": "+254712345678"
  }
  ```
- **Validation Rules:**
  - `email`: Required, valid email format.
  - `password`: Required, minimum 8 characters.
  - `fullName`: Required, minimum 2 characters.
  - `role`: Must be omitted or `CUSTOMER`. Submitting any privileged role returns `400 Bad Request` (`UNAUTHORIZED_ROLE_ASSIGNMENT`).
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Account successfully registered.",
    "token": "<32-byte-hex-token>",
    "user": {
      "id": "91667982-e09f-4888-84b9-4dd04a7727ca",
      "email": "customer@eyekart.ke",
      "phone": "+254712345678",
      "fullName": "Zawadi Kamau",
      "role": "CUSTOMER",
      "createdAt": "2026-09-15T02:50:20.000Z"
    }
  }
  ```

### 2.3 User Login
- **Endpoint:** `POST /api/auth/login`
- **Authentication:** None (Public; Rate limited to 5 requests / 60s per IP)
- **Request Body:**
  ```json
  {
    "email": "dev-customer@eyekart.test",
    "password": "EyeKartDevCustomer2026!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Authentication successful.",
    "token": "<32-byte-hex-token>",
    "user": {
      "id": "...",
      "email": "dev-customer@eyekart.test",
      "fullName": "Development Customer (TEST ONLY)",
      "role": "CUSTOMER"
    }
  }
  ```
- **Errors:** `401 Unauthorized` (`INVALID_CREDENTIALS`), `429 Too Many Requests` (`RATE_LIMITED`).

### 2.4 User Logout
- **Endpoint:** `POST /api/auth/logout`
- **Authentication:** Required (Valid session token)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Session invalidated and logged out successfully."
  }
  ```

### 2.5 Current User Profile
- **Endpoint:** `GET /api/me`
- **Authentication:** Required
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "user": {
      "id": "...",
      "email": "dev-customer@eyekart.test",
      "fullName": "Development Customer (TEST ONLY)",
      "role": "CUSTOMER"
    }
  }
  ```
- **Errors:** `401 Unauthorized` (`UNAUTHENTICATED`).

### 2.6 Products List
- **Endpoint:** `GET /api/products`
- **Authentication:** None (Public)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "count": 3,
    "data": [
      {
        "sku": "EK-902",
        "name": "Kibera Minimalist Titanium",
        "price": 18500,
        "sourceConflict": "EK-902 SOURCE CONFLICT — BUSINESS CONFIRMATION REQUIRED",
        "variants": [...]
      }
    ]
  }
  ```

### 2.7 Product Details
- **Endpoint:** `GET /api/products/:sku`
- **Authentication:** None (Public)
- **Response (200 OK):** Full product entity with dimensions, diopter ranges, and variants.
- **Errors:** `404 Not Found` (`PRODUCT_NOT_FOUND`).

### 2.8 Authoritative Pricing Quote
- **Endpoint:** `POST /api/pricing/quote`
- **Authentication:** None (Public)
- **Request Body:**
  ```json
  {
    "items": [
      {
        "sku": "EK-902",
        "variant": "Brushed Champagne Titanium",
        "qty": 1,
        "totalPrice": 100,
        "lensConfig": {
          "lensType": "Digital Single Vision",
          "index": "1.67",
          "coatings": ["BlueShield 420nm", "Anti-Glare AR"]
        }
      }
    ]
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "subtotal": 30000,
      "vat": 4800,
      "deliveryFee": 0,
      "total": 34800,
      "currency": "KES",
      "itemCount": 1,
      "items": [
        {
          "sku": "EK-902",
          "authoritativeFramePrice": 18500,
          "authoritativeLensPrice": 11500,
          "authoritativeItemTotal": 30000,
          "clientSubmittedTotalIgnored": 100
        }
      ]
    }
  }
  ```

### 2.9 Admin Audit Logs
- **Endpoint:** `GET /api/admin/audit-logs`
- **Authentication:** Required (Role: `ADMIN`)
- **Response (200 OK for Admin):**
  ```json
  {
    "success": true,
    "count": 3,
    "data": [
      {
        "action": "LOGIN_SUCCESS",
        "entity": "User",
        "actor_role": "ADMIN",
        "created_at": "..."
      }
    ]
  }
  ```
- **Errors:** `401 Unauthorized` (anonymous), `403 Forbidden` (`FORBIDDEN`, for `CUSTOMER` role).
