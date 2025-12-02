# API Contracts: V1 Inventory & BOM Tracker

**Date**: 2025-12-01
**Branch**: `001-inventory-bom-tracker`
**Base URL**: `/api`

## Authentication

All endpoints require authentication via NextAuth.js session cookie.

**Headers**:
- `Cookie`: Session cookie (automatically set by NextAuth)

**Unauthorized Response** (401):
```json
{
  "error": "Unauthorized",
  "message": "Please log in to access this resource"
}
```

## Role-Based Access

| Role | Components | SKUs/BOMs | Transactions | Users | Settings |
|------|------------|-----------|--------------|-------|----------|
| Admin | CRUD | CRUD | CRUD | CRUD | CRUD |
| Ops | CRUD | CRUD | CRUD | - | Read |
| Viewer | Read | Read | Read | - | - |

## Common Response Formats

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "pageSize": 50
  }
}
```

### Error Response
```json
{
  "error": "ValidationError",
  "message": "Human-readable error message",
  "details": [
    { "field": "name", "message": "Name is required" }
  ]
}
```

## Pagination

Query parameters for list endpoints:
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 50, max: 100)
- `sortBy`: Field to sort by
- `sortOrder`: 'asc' or 'desc'

---

## Endpoints by Resource

### Components

#### List Components
```
GET /api/components
```

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| search | string | Search in name, skuCode |
| category | string | Filter by category |
| isActive | boolean | Filter by active status |
| reorderStatus | string | 'critical', 'warning', 'ok' |

**Response** (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Medium Tool",
      "skuCode": "TT-MED-TOOL",
      "category": "tool",
      "unitOfMeasure": "each",
      "costPerUnit": "2.5000",
      "reorderPoint": 100,
      "leadTimeDays": 14,
      "quantityOnHand": 250,
      "reorderStatus": "ok",
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:00:00Z"
    }
  ],
  "meta": { "total": 50, "page": 1, "pageSize": 50 }
}
```

#### Get Component
```
GET /api/components/:id
```

**Response** (200):
```json
{
  "data": {
    "id": "uuid",
    "name": "Medium Tool",
    "skuCode": "TT-MED-TOOL",
    "category": "tool",
    "unitOfMeasure": "each",
    "costPerUnit": "2.5000",
    "reorderPoint": 100,
    "leadTimeDays": 14,
    "notes": "Vendor: XYZ Corp",
    "quantityOnHand": 250,
    "reorderStatus": "ok",
    "isActive": true,
    "usedInSkus": [
      { "id": "uuid", "name": "TT Single Pack", "quantityPerUnit": "1.0000" }
    ],
    "recentTransactions": [ ... ],
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z",
    "createdBy": { "id": "uuid", "name": "John Doe" }
  }
}
```

#### Create Component
```
POST /api/components
```

**Request Body**:
```json
{
  "name": "Medium Tool",
  "skuCode": "TT-MED-TOOL",
  "category": "tool",
  "unitOfMeasure": "each",
  "costPerUnit": 2.50,
  "reorderPoint": 100,
  "leadTimeDays": 14,
  "notes": "Vendor: XYZ Corp"
}
```

**Response** (201): Created component object

#### Update Component
```
PATCH /api/components/:id
```

**Request Body**: Partial component fields

**Response** (200): Updated component object

#### Delete Component
```
DELETE /api/components/:id
```

**Response** (200):
```json
{ "message": "Component deactivated" }
```

**Error** (400): If component is used in active BOMs

---

### SKUs

#### List SKUs
```
GET /api/skus
```

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| search | string | Search in name, internalCode |
| salesChannel | string | Filter by channel |
| isActive | boolean | Filter by active status |

**Response** (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "TT 3-Pack Amazon",
      "internalCode": "TT-3PK-AMZ",
      "salesChannel": "Amazon",
      "isActive": true,
      "activeBom": {
        "id": "uuid",
        "versionName": "v2",
        "unitCost": "12.5000"
      },
      "maxBuildableUnits": 150
    }
  ]
}
```

#### Get SKU
```
GET /api/skus/:id
```

**Response**: Full SKU with BOM versions and history

#### Create SKU
```
POST /api/skus
```

**Request Body**:
```json
{
  "name": "TT 3-Pack Amazon",
  "internalCode": "TT-3PK-AMZ",
  "salesChannel": "Amazon",
  "externalIds": { "asin": "B0123456789" },
  "notes": "Amazon-specific packaging"
}
```

#### Update SKU
```
PATCH /api/skus/:id
```

#### Delete SKU
```
DELETE /api/skus/:id
```

---

### BOM Versions

#### List BOM Versions for SKU
```
GET /api/skus/:skuId/bom-versions
```

#### Get BOM Version
```
GET /api/bom-versions/:id
```

**Response** (200):
```json
{
  "data": {
    "id": "uuid",
    "skuId": "uuid",
    "versionName": "v2",
    "effectiveStartDate": "2025-01-01",
    "effectiveEndDate": null,
    "isActive": true,
    "unitCost": "12.5000",
    "lines": [
      {
        "id": "uuid",
        "component": { "id": "uuid", "name": "Medium Tool", "costPerUnit": "2.5000" },
        "quantityPerUnit": "1.0000",
        "lineCost": "2.5000"
      }
    ],
    "notes": "Switched to cheaper mailer"
  }
}
```

#### Create BOM Version
```
POST /api/skus/:skuId/bom-versions
```

**Request Body**:
```json
{
  "versionName": "v2",
  "effectiveStartDate": "2025-01-15",
  "isActive": true,
  "notes": "Switched to cheaper mailer",
  "lines": [
    { "componentId": "uuid", "quantityPerUnit": 1.0 },
    { "componentId": "uuid", "quantityPerUnit": 2.0 }
  ]
}
```

#### Clone BOM Version
```
POST /api/bom-versions/:id/clone
```

**Request Body**:
```json
{
  "versionName": "v3"
}
```

#### Activate BOM Version
```
POST /api/bom-versions/:id/activate
```

**Response**: Activates this version, deactivates previous active version

---

### Transactions

#### List Transactions
```
GET /api/transactions
```

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| type | string | 'receipt', 'build', 'adjustment' |
| componentId | string | Filter by component |
| skuId | string | Filter by SKU |
| dateFrom | date | Start date (inclusive) |
| dateTo | date | End date (inclusive) |

**Response** (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "build",
      "date": "2025-01-15",
      "sku": { "id": "uuid", "name": "TT 3-Pack Amazon" },
      "unitsBuild": 50,
      "unitBomCost": "12.5000",
      "totalBomCost": "625.0000",
      "createdAt": "2025-01-15T10:30:00Z",
      "createdBy": { "id": "uuid", "name": "John Doe" }
    }
  ]
}
```

#### Get Transaction
```
GET /api/transactions/:id
```

**Response**: Full transaction with all lines

#### Create Receipt Transaction
```
POST /api/transactions/receipt
```

**Request Body**:
```json
{
  "date": "2025-01-15",
  "componentId": "uuid",
  "quantity": 100,
  "supplier": "XYZ Corp",
  "costPerUnit": 2.50,
  "updateComponentCost": true,
  "notes": "PO #12345"
}
```

#### Create Build Transaction
```
POST /api/transactions/build
```

**Request Body**:
```json
{
  "date": "2025-01-15",
  "skuId": "uuid",
  "unitsBuild": 50,
  "salesChannel": "Amazon",
  "notes": "Shipment to FBA"
}
```

**Response** (200): Transaction with lines and cost snapshot

**Error** (400): If insufficient inventory (unless override setting enabled)

#### Create Adjustment Transaction
```
POST /api/transactions/adjustment
```

**Request Body**:
```json
{
  "date": "2025-01-15",
  "componentId": "uuid",
  "quantity": -10,
  "reason": "Damaged goods",
  "notes": "Found during inventory count"
}
```

---

### Import/Export

#### Export Components
```
GET /api/export/components
```

**Response**: CSV file download

#### Export SKUs
```
GET /api/export/skus
```

#### Export Transactions
```
GET /api/export/transactions?dateFrom=2025-01-01&dateTo=2025-01-31
```

#### Download Import Template
```
GET /api/import/template/:type
```

**Types**: 'components', 'skus'

**Response**: CSV template file

#### Import Components
```
POST /api/import/components
Content-Type: multipart/form-data
```

**Request Body**: CSV file upload

**Response** (200):
```json
{
  "imported": 45,
  "skipped": 2,
  "errors": [
    { "row": 12, "message": "Duplicate SKU code" }
  ]
}
```

---

### Dashboard

#### Get Dashboard Data
```
GET /api/dashboard
```

**Response** (200):
```json
{
  "data": {
    "componentStats": {
      "total": 150,
      "critical": 5,
      "warning": 12,
      "ok": 133
    },
    "criticalComponents": [
      { "id": "uuid", "name": "Medium Tool", "quantityOnHand": 10, "reorderPoint": 50 }
    ],
    "topBuildableSkus": [
      { "id": "uuid", "name": "TT 3-Pack", "maxBuildableUnits": 500 }
    ],
    "recentTransactions": [ ... ]
  }
}
```

---

### Users (Admin only)

#### List Users
```
GET /api/users
```

#### Create User
```
POST /api/users
```

**Request Body**:
```json
{
  "email": "user@tonsil.tech",
  "name": "Jane Doe",
  "role": "ops",
  "password": "temporary123"
}
```

#### Update User
```
PATCH /api/users/:id
```

#### Deactivate User
```
DELETE /api/users/:id
```

---

### Settings (Admin only)

#### Get Settings
```
GET /api/settings
```

#### Update Settings
```
PATCH /api/settings
```

**Request Body**:
```json
{
  "blockNegativeInventory": true
}
```
