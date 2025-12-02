/**
 * Test Data Fixtures
 * Factory functions for generating test data
 */
import { Prisma } from '@prisma/client'

/**
 * Create a test component with default values that can be overridden
 */
export function createTestComponent(
  overrides: Partial<{
    name: string
    skuCode: string
    category: string | null
    unitOfMeasure: string
    costPerUnit: number
    reorderPoint: number
    leadTimeDays: number
    notes: string | null
  }> = {}
) {
  return {
    name: overrides.name ?? `Test Component ${Date.now()}`,
    skuCode: overrides.skuCode ?? `TC-${Date.now()}`,
    category: overrides.category ?? 'Test Category',
    unitOfMeasure: overrides.unitOfMeasure ?? 'each',
    costPerUnit: new Prisma.Decimal(overrides.costPerUnit ?? 10.0),
    reorderPoint: overrides.reorderPoint ?? 100,
    leadTimeDays: overrides.leadTimeDays ?? 7,
    notes: overrides.notes ?? null,
  }
}

/**
 * Create a test SKU with default values that can be overridden
 */
export function createTestSKU(
  overrides: Partial<{
    name: string
    internalCode: string
    salesChannel: string
    notes: string | null
  }> = {}
) {
  return {
    name: overrides.name ?? `Test SKU ${Date.now()}`,
    internalCode: overrides.internalCode ?? `SKU-${Date.now()}`,
    salesChannel: overrides.salesChannel ?? 'Amazon',
    externalIds: {},
    notes: overrides.notes ?? null,
  }
}

/**
 * Create a test BOM line
 */
export function createTestBOMLine(componentId: string, quantityPerUnit: number = 2) {
  return {
    componentId,
    quantityPerUnit: new Prisma.Decimal(quantityPerUnit),
    notes: null,
  }
}

/**
 * Create a test receipt transaction request
 */
export function createTestReceiptTransaction(
  overrides: Partial<{
    quantity: number
    supplier: string
    date: Date
    notes: string | null
  }> = {}
) {
  return {
    quantity: overrides.quantity ?? 100,
    supplier: overrides.supplier ?? 'Test Supplier',
    date: overrides.date ?? new Date(),
    notes: overrides.notes ?? null,
    updateComponentCost: false,
  }
}

/**
 * CSV test data for import/export testing
 */
export const TEST_CSV = {
  validComponents: `Name,SKU Code,Category,Unit of Measure,Cost Per Unit,Reorder Point,Lead Time (Days),Notes
Widget A,WIDGET-001,Electronics,each,25.50,50,14,Test widget
Gadget B,GADGET-002,Hardware,each,15.00,100,7,Test gadget`,

  invalidComponents: `Name,SKU Code,Category
,MISSING-NAME,Test
Has Name,,Test`,

  validSKUs: `Name,Internal Code,Sales Channel,Notes
Product X,PROD-X,Amazon,Test product
Product Y,PROD-Y,Shopify,Another product`,

  invalidSKUs: `Name,Internal Code,Sales Channel
Product Z,PROD-Z,InvalidChannel`,

  specialCharacters: `Name,SKU Code,Category,Notes
"Widget with ""quotes""",QT-001,Test,"Notes with, commas"
Simple Widget,SW-001,Test,Normal notes`,

  emptyCSV: `Name,SKU Code`,

  csvWithExtraSpaces: `Name,SKU Code,Category
  Widget  ,  W-001  ,  Electronics  `,
}
