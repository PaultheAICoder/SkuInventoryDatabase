# Data Model: V1 Inventory & BOM Tracker

**Date**: 2025-12-01
**Branch**: `001-inventory-bom-tracker`

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐
│   Company   │───────│    Brand    │
└─────────────┘       └─────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │ Component │  │    SKU    │  │   User    │
       └───────────┘  └───────────┘  └───────────┘
              │             │             │
              │             ▼             │
              │      ┌────────────┐       │
              │      │ BOMVersion │       │
              │      └────────────┘       │
              │             │             │
              │             ▼             │
              │      ┌────────────┐       │
              └──────│  BOMLine   │       │
                     └────────────┘       │
              │                           │
              ▼                           ▼
       ┌─────────────────────────────────────┐
       │            Transaction              │
       └─────────────────────────────────────┘
                      │
                      ▼
       ┌─────────────────────────────────────┐
       │         TransactionLine             │
       └─────────────────────────────────────┘
```

## Entities

### Company

Organization using the system. V1 has single company but entity exists for V2+ multi-tenant support.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| name | String(100) | NOT NULL, UNIQUE | Company name |
| settings | JSON | DEFAULT {} | Company-wide settings (e.g., blockNegativeInventory) |
| createdAt | DateTime | NOT NULL | Creation timestamp |
| updatedAt | DateTime | NOT NULL | Last update timestamp |

### Brand

Product line within a company. V1 has single brand but entity exists for future expansion.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| companyId | UUID | FK → Company, NOT NULL | Parent company |
| name | String(100) | NOT NULL | Brand name |
| isActive | Boolean | DEFAULT true | Soft delete flag |
| createdAt | DateTime | NOT NULL | Creation timestamp |
| updatedAt | DateTime | NOT NULL | Last update timestamp |

**Unique Constraint**: (companyId, name)

### Component

Inventory item that can be stocked and used in BOMs.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| brandId | UUID | FK → Brand, NOT NULL | Parent brand |
| name | String(100) | NOT NULL | Component name (e.g., "Medium Tool") |
| skuCode | String(50) | NOT NULL | Internal SKU code |
| category | String(50) | NULL | Category (packaging, tool, documentation) |
| unitOfMeasure | String(20) | NOT NULL, DEFAULT 'each' | Unit (each, box, etc.) |
| costPerUnit | Decimal(10,4) | NOT NULL, DEFAULT 0 | Current cost in USD |
| reorderPoint | Integer | NOT NULL, DEFAULT 0 | Quantity triggering reorder alert |
| leadTimeDays | Integer | NOT NULL, DEFAULT 0 | Supplier lead time |
| notes | Text | NULL | Free-form notes |
| isActive | Boolean | DEFAULT true | Soft delete flag |
| createdAt | DateTime | NOT NULL | Creation timestamp |
| updatedAt | DateTime | NOT NULL | Last update timestamp |
| createdById | UUID | FK → User, NOT NULL | User who created |
| updatedById | UUID | FK → User, NOT NULL | User who last updated |

**Unique Constraints**:
- (brandId, name)
- (brandId, skuCode)

**Computed Fields** (not stored):
- `quantityOnHand`: Sum of all transaction line quantities for this component
- `reorderStatus`: 'critical' | 'warning' | 'ok' based on quantityOnHand vs reorderPoint

### SKU

Sellable product configuration, often channel-specific.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| brandId | UUID | FK → Brand, NOT NULL | Parent brand |
| name | String(100) | NOT NULL | SKU name (e.g., "TT 3-Pack Amazon") |
| internalCode | String(50) | NOT NULL | Internal SKU code |
| salesChannel | String(50) | NOT NULL | Channel (Amazon, Shopify, TikTok, Generic) |
| externalIds | JSON | DEFAULT {} | External identifiers {asin, shopifyHandle, etc.} |
| notes | Text | NULL | Free-form notes |
| isActive | Boolean | DEFAULT true | Soft delete flag |
| createdAt | DateTime | NOT NULL | Creation timestamp |
| updatedAt | DateTime | NOT NULL | Last update timestamp |
| createdById | UUID | FK → User, NOT NULL | User who created |
| updatedById | UUID | FK → User, NOT NULL | User who last updated |

**Unique Constraint**: (brandId, internalCode)

**Computed Fields** (not stored):
- `activeBom`: Current active BOM version (is_active = true)
- `unitBomCost`: Sum of (component.costPerUnit × bomLine.quantityPerUnit) for active BOM
- `maxBuildableUnits`: Min across all BOM lines of floor(component.quantityOnHand / bomLine.quantityPerUnit)

### BOMVersion

A specific bill of materials configuration for a SKU.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| skuId | UUID | FK → SKU, NOT NULL | Parent SKU |
| versionName | String(50) | NOT NULL | Version identifier (e.g., "v1", "cheap-mailer") |
| effectiveStartDate | Date | NOT NULL | When this BOM became/becomes active |
| effectiveEndDate | Date | NULL | When this BOM was deactivated (NULL = current) |
| isActive | Boolean | DEFAULT false | Whether this is the current active BOM |
| notes | Text | NULL | Reason for change, defect notes |
| createdAt | DateTime | NOT NULL | Creation timestamp |
| updatedAt | DateTime | NOT NULL | Last update timestamp |
| createdById | UUID | FK → User, NOT NULL | User who created |

**Unique Constraint**: Partial unique index on (skuId) WHERE isActive = true
(Enforces only one active BOM per SKU)

**Computed Fields** (not stored):
- `unitCost`: Sum of (component.costPerUnit × bomLine.quantityPerUnit)

### BOMLine

Single component and quantity within a BOM version.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| bomVersionId | UUID | FK → BOMVersion, NOT NULL | Parent BOM version |
| componentId | UUID | FK → Component, NOT NULL | Component used |
| quantityPerUnit | Decimal(10,4) | NOT NULL | Quantity needed per finished unit |
| notes | Text | NULL | Line-specific notes |

**Unique Constraint**: (bomVersionId, componentId)

### Transaction

Immutable record of inventory change. Core audit entity.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| companyId | UUID | FK → Company, NOT NULL | Company for multi-tenant support |
| type | Enum | NOT NULL | 'receipt', 'build', 'adjustment', 'initial' |
| date | Date | NOT NULL | Business date of transaction |
| skuId | UUID | FK → SKU, NULL | For build transactions |
| bomVersionId | UUID | FK → BOMVersion, NULL | For build transactions |
| salesChannel | String(50) | NULL | For build transactions |
| unitsBuild | Integer | NULL | For build transactions |
| unitBomCost | Decimal(10,4) | NULL | Snapshot for build transactions |
| totalBomCost | Decimal(10,4) | NULL | Snapshot for build transactions |
| supplier | String(100) | NULL | For receipt transactions |
| reason | String(200) | NULL | For adjustment transactions |
| notes | Text | NULL | Free-form notes |
| createdAt | DateTime | NOT NULL | Creation timestamp (immutable) |
| createdById | UUID | FK → User, NOT NULL | User who created |

**Index**: (companyId, createdAt DESC) for transaction log queries

### TransactionLine

Individual component quantity change within a transaction.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| transactionId | UUID | FK → Transaction, NOT NULL | Parent transaction |
| componentId | UUID | FK → Component, NOT NULL | Affected component |
| quantityChange | Decimal(10,4) | NOT NULL | Positive for receipts, negative for builds |
| costPerUnit | Decimal(10,4) | NULL | Cost snapshot at transaction time |

**Note**: A receipt transaction has one line. A build transaction has one line per BOM component. An adjustment has one line.

### User

System user with role-based access.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| companyId | UUID | FK → Company, NOT NULL | User's company |
| email | String(255) | NOT NULL, UNIQUE | Login email |
| passwordHash | String(255) | NOT NULL | bcrypt hash |
| name | String(100) | NOT NULL | Display name |
| role | Enum | NOT NULL | 'admin', 'ops', 'viewer' |
| isActive | Boolean | DEFAULT true | Account active flag |
| lastLoginAt | DateTime | NULL | Last successful login |
| createdAt | DateTime | NOT NULL | Creation timestamp |
| updatedAt | DateTime | NOT NULL | Last update timestamp |

### SecurityEvent

Audit log for security-related actions.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| companyId | UUID | FK → Company, NOT NULL | Company context |
| userId | UUID | FK → User, NULL | User involved (NULL for failed logins) |
| eventType | String(50) | NOT NULL | 'login', 'logout', 'login_failed', 'role_change' |
| ipAddress | String(45) | NULL | Client IP |
| userAgent | String(500) | NULL | Browser/client info |
| details | JSON | DEFAULT {} | Event-specific details |
| createdAt | DateTime | NOT NULL | Event timestamp |

## State Transitions

### Component Status
```
Active ──(deactivate)──► Inactive
Inactive ──(reactivate)──► Active
```
Note: Cannot delete components used in active BOMs.

### BOM Version Status
```
Draft ──(activate)──► Active ──(supersede)──► Archived
                         │
                         └──(deactivate)──► Inactive
```
Activation of new version automatically archives previous active version.

### Reorder Status (Computed)
```
quantityOnHand <= reorderPoint           → Critical (red)
quantityOnHand <= reorderPoint * 1.5     → Warning (yellow)
quantityOnHand > reorderPoint * 1.5      → OK (green)
```

## Validation Rules

### Component
- Name: 1-100 characters, unique per brand
- SKU Code: 1-50 characters, alphanumeric + hyphen/underscore, unique per brand
- Cost: >= 0
- Reorder Point: >= 0
- Lead Time: >= 0

### SKU
- Name: 1-100 characters
- Internal Code: 1-50 characters, unique per brand
- Sales Channel: Must be one of predefined values

### BOM Version
- Version Name: 1-50 characters
- Must have at least one BOM line
- Effective Start Date: Required
- Only one active BOM per SKU (enforced by DB constraint)

### BOM Line
- Quantity Per Unit: > 0
- Component must be active
- No duplicate components within same BOM version

### Transaction
- Date: Required, cannot be future date
- Receipt: Must have supplier, at least one line with positive quantity
- Build: Must have SKU, BOM version, units > 0, all line quantities negative
- Adjustment: Must have reason, exactly one line

## Prisma Schema Preview

```prisma
model Component {
  id            String   @id @default(uuid())
  brandId       String
  brand         Brand    @relation(fields: [brandId], references: [id])
  name          String   @db.VarChar(100)
  skuCode       String   @db.VarChar(50)
  category      String?  @db.VarChar(50)
  unitOfMeasure String   @default("each") @db.VarChar(20)
  costPerUnit   Decimal  @default(0) @db.Decimal(10, 4)
  reorderPoint  Int      @default(0)
  leadTimeDays  Int      @default(0)
  notes         String?  @db.Text
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdById   String
  createdBy     User     @relation("ComponentCreatedBy", fields: [createdById], references: [id])
  updatedById   String
  updatedBy     User     @relation("ComponentUpdatedBy", fields: [updatedById], references: [id])

  bomLines         BOMLine[]
  transactionLines TransactionLine[]

  @@unique([brandId, name])
  @@unique([brandId, skuCode])
  @@index([brandId, isActive])
}
```

(Full Prisma schema will be generated during implementation)
