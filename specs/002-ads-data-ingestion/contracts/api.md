# API Contracts: Amazon Ads Data Ingestion Foundation

**Feature**: 002-ads-data-ingestion
**Date**: 2025-12-12

## Base URL

```
/api
```

## Authentication

All endpoints require session authentication (existing auth system). Integration management endpoints require `admin` role.

---

## Amazon Ads Integration

### POST /api/integrations/amazon-ads/connect

Initiates OAuth flow for Amazon Ads connection.

**Authorization**: Admin only

**Request Body**:
```json
{
  "brandId": "string (optional, defaults to user's primary brand)"
}
```

**Response** `200 OK`:
```json
{
  "authUrl": "https://www.amazon.com/ap/oa?client_id=...",
  "state": "string (CSRF token)"
}
```

**Response** `403 Forbidden`:
```json
{
  "error": "Admin permission required"
}
```

---

### GET /api/integrations/amazon-ads/callback

OAuth callback handler (redirected from Amazon).

**Query Parameters**:
- `code`: Authorization code
- `state`: CSRF state token

**Response**: Redirect to `/integrations?status=connected` or `/integrations?error=...`

---

### POST /api/integrations/amazon-ads/disconnect

Disconnects Amazon Ads integration.

**Authorization**: Admin only

**Request Body**:
```json
{
  "credentialId": "string"
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "message": "Amazon Ads disconnected successfully"
}
```

---

### POST /api/integrations/amazon-ads/sync

Triggers manual sync for Amazon Ads data.

**Authorization**: Admin or Ops

**Request Body**:
```json
{
  "credentialId": "string",
  "syncType": "full | incremental",
  "dateRange": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }
}
```

**Response** `202 Accepted`:
```json
{
  "syncLogId": "string",
  "status": "started",
  "message": "Sync initiated. Check sync log for progress."
}
```

---

### GET /api/integrations/amazon-ads/status

Gets current connection status and sync history.

**Authorization**: Any authenticated user

**Query Parameters**:
- `credentialId`: string (optional, returns all if not specified)
- `brandId`: string (optional, filter by brand)

**Response** `200 OK`:
```json
{
  "credentials": [
    {
      "id": "string",
      "brandId": "string",
      "brandName": "string",
      "status": "active | expired | revoked | error",
      "externalAccountName": "string",
      "lastSyncAt": "2024-01-15T10:30:00Z",
      "lastSyncStatus": "completed | failed | partial",
      "lastError": "string | null",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

## Shopify Integration

### POST /api/integrations/shopify/connect

Initiates OAuth flow for Shopify connection.

**Authorization**: Admin only

**Request Body**:
```json
{
  "shopName": "mystore.myshopify.com",
  "brandId": "string (optional)"
}
```

**Response** `200 OK`:
```json
{
  "authUrl": "https://mystore.myshopify.com/admin/oauth/authorize?...",
  "state": "string"
}
```

---

### GET /api/integrations/shopify/callback

OAuth callback handler (redirected from Shopify).

**Query Parameters**:
- `code`: Authorization code
- `shop`: Shop domain
- `state`: CSRF state token

**Response**: Redirect to `/integrations?status=shopify_connected`

---

### POST /api/integrations/shopify/sync

Triggers manual sync for Shopify orders.

**Authorization**: Admin or Ops

**Request Body**:
```json
{
  "connectionId": "string",
  "dateRange": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }
}
```

**Response** `202 Accepted`:
```json
{
  "syncLogId": "string",
  "status": "started"
}
```

---

## CSV Upload

### POST /api/csv/upload

Uploads and processes a keyword CSV file.

**Authorization**: Admin or Ops

**Content-Type**: `multipart/form-data`

**Request**:
- `file`: CSV file (max 50MB)
- `source`: `amazon_search_term | zonguru | helium10`
- `brandId`: string (optional)
- `dateRange`: JSON string `{"startDate": "...", "endDate": "..."}`

**Response** `202 Accepted`:
```json
{
  "uploadId": "string",
  "syncLogId": "string",
  "status": "processing",
  "totalRows": 50000,
  "message": "Upload started. Processing in background."
}
```

**Response** `400 Bad Request`:
```json
{
  "error": "Validation failed",
  "details": {
    "missingColumns": ["Impressions", "Clicks"],
    "invalidRows": [
      { "row": 15, "error": "Invalid number format in Spend column" }
    ]
  }
}
```

---

### GET /api/csv/upload/:uploadId/status

Gets status of CSV upload processing.

**Response** `200 OK`:
```json
{
  "uploadId": "string",
  "status": "processing | completed | failed",
  "progress": {
    "processedRows": 25000,
    "totalRows": 50000,
    "percentComplete": 50
  },
  "result": {
    "recordsCreated": 24500,
    "recordsUpdated": 500,
    "recordsFailed": 0,
    "errors": []
  }
}
```

---

## ASIN-SKU Mapping

### GET /api/asin-mapping

Lists ASIN-SKU mappings with optional filtering.

**Authorization**: Any authenticated user

**Query Parameters**:
- `brandId`: string (optional)
- `unmappedOnly`: boolean (default: false)
- `asin`: string (search filter)

**Response** `200 OK`:
```json
{
  "mappings": [
    {
      "id": "string",
      "asin": "B08XYZ1234",
      "productName": "Amazon Product Name",
      "skuId": "string | null",
      "skuCode": "string | null",
      "skuName": "string | null",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "unmappedAsins": [
    {
      "asin": "B08ABC5678",
      "productName": "Unmapped Product",
      "suggestedSkus": [
        { "id": "string", "code": "SKU-001", "name": "Similar Product", "similarity": 0.85 }
      ]
    }
  ]
}
```

---

### POST /api/asin-mapping

Creates a new ASIN-SKU mapping.

**Authorization**: Admin or Ops

**Request Body**:
```json
{
  "brandId": "string",
  "asin": "B08XYZ1234",
  "skuId": "string",
  "productName": "string (optional)"
}
```

**Response** `201 Created`:
```json
{
  "id": "string",
  "asin": "B08XYZ1234",
  "skuId": "string",
  "skuCode": "SKU-001",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

### DELETE /api/asin-mapping/:id

Removes an ASIN-SKU mapping.

**Authorization**: Admin only

**Response** `204 No Content`

---

## Sync Logs

### GET /api/sync-logs

Lists sync operation history.

**Authorization**: Any authenticated user

**Query Parameters**:
- `credentialId`: string (optional)
- `syncType`: string (optional)
- `status`: string (optional)
- `limit`: number (default: 50)
- `offset`: number (default: 0)

**Response** `200 OK`:
```json
{
  "logs": [
    {
      "id": "string",
      "syncType": "amazon_ads_full",
      "status": "completed",
      "startedAt": "2024-01-15T03:00:00Z",
      "completedAt": "2024-01-15T03:04:30Z",
      "recordsProcessed": 15000,
      "recordsCreated": 14500,
      "recordsUpdated": 500,
      "recordsFailed": 0,
      "errorMessage": null,
      "triggeredBy": "Scheduled"
    }
  ],
  "total": 100
}
```

---

## Notifications

### GET /api/notifications

Lists notifications for current user.

**Authorization**: Any authenticated user

**Query Parameters**:
- `unreadOnly`: boolean (default: false)
- `limit`: number (default: 20)

**Response** `200 OK`:
```json
{
  "notifications": [
    {
      "id": "string",
      "type": "sync_failure",
      "title": "Amazon Ads Sync Failed",
      "message": "Unable to sync data. Please reconnect your account.",
      "relatedType": "credential",
      "relatedId": "string",
      "read": false,
      "createdAt": "2024-01-15T03:05:00Z"
    }
  ],
  "unreadCount": 1
}
```

---

### PATCH /api/notifications/:id

Marks notification as read or dismissed.

**Authorization**: Any authenticated user

**Request Body**:
```json
{
  "read": true
}
```
or
```json
{
  "dismissed": true
}
```

**Response** `200 OK`:
```json
{
  "id": "string",
  "read": true,
  "readAt": "2024-01-15T10:30:00Z"
}
```

---

## Cron Endpoints

### POST /api/cron/ads-sync

Scheduled endpoint for daily sync. Called by external scheduler.

**Authorization**: Cron secret header `X-Cron-Secret`

**Response** `200 OK`:
```json
{
  "syncsTriggered": 3,
  "credentials": ["id1", "id2", "id3"]
}
```

---

### POST /api/cron/retention-cleanup

Scheduled endpoint for data retention cleanup.

**Authorization**: Cron secret header `X-Cron-Secret`

**Response** `200 OK`:
```json
{
  "keywordMetricsDeleted": 15000,
  "salesDailyDeleted": 365,
  "cutoffDate": "2023-01-15"
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Human readable error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

Common error codes:
- `UNAUTHORIZED`: Not authenticated
- `FORBIDDEN`: Not authorized for this action
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Request validation failed
- `INTEGRATION_ERROR`: External API error
- `RATE_LIMITED`: Too many requests
