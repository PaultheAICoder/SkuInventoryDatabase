/**
 * CSV Export Service
 * Handles generating CSV files for components, SKUs, and transactions
 */

export interface CSVColumn<T> {
  header: string
  accessor: (item: T) => string | number | null | undefined
}

/**
 * Convert an array of objects to CSV format
 */
export function toCSV<T>(data: T[], columns: CSVColumn<T>[]): string {
  // Header row
  const headers = columns.map((col) => escapeCSVField(col.header))
  const rows: string[] = [headers.join(',')]

  // Data rows
  for (const item of data) {
    const row = columns.map((col) => {
      const value = col.accessor(item)
      return escapeCSVField(value)
    })
    rows.push(row.join(','))
  }

  return rows.join('\n')
}

/**
 * Escape a field for CSV format
 * - Wrap in quotes if contains comma, newline, or quote
 * - Double any existing quotes
 */
function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = String(value)

  // Check if we need to wrap in quotes
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    // Escape existing quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Component export columns definition
 */
export interface ComponentExportData {
  id: string
  name: string
  skuCode: string
  category: string | null
  unitOfMeasure: string
  costPerUnit: string
  reorderPoint: number
  leadTimeDays: number
  quantityOnHand: number
  reorderStatus: string
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export const componentExportColumns: CSVColumn<ComponentExportData>[] = [
  { header: 'ID', accessor: (c) => c.id },
  { header: 'Name', accessor: (c) => c.name },
  { header: 'SKU Code', accessor: (c) => c.skuCode },
  { header: 'Category', accessor: (c) => c.category },
  { header: 'Unit of Measure', accessor: (c) => c.unitOfMeasure },
  { header: 'Cost Per Unit', accessor: (c) => c.costPerUnit },
  { header: 'Reorder Point', accessor: (c) => c.reorderPoint },
  { header: 'Lead Time (Days)', accessor: (c) => c.leadTimeDays },
  { header: 'Quantity On Hand', accessor: (c) => c.quantityOnHand },
  { header: 'Reorder Status', accessor: (c) => c.reorderStatus },
  { header: 'Notes', accessor: (c) => c.notes },
  { header: 'Active', accessor: (c) => (c.isActive ? 'Yes' : 'No') },
  { header: 'Created At', accessor: (c) => c.createdAt },
  { header: 'Updated At', accessor: (c) => c.updatedAt },
]

/**
 * SKU export columns definition
 */
export interface SKUExportData {
  id: string
  name: string
  internalCode: string
  salesChannel: string
  notes: string | null
  isActive: boolean
  bomCost: string | null
  maxBuildableUnits: number | null
  finishedGoodsOnHand: number
  createdAt: string
  updatedAt: string
}

export const skuExportColumns: CSVColumn<SKUExportData>[] = [
  { header: 'ID', accessor: (s) => s.id },
  { header: 'Name', accessor: (s) => s.name },
  { header: 'Internal Code', accessor: (s) => s.internalCode },
  { header: 'Sales Channel', accessor: (s) => s.salesChannel },
  { header: 'BOM Cost', accessor: (s) => s.bomCost },
  { header: 'Max Buildable Units', accessor: (s) => s.maxBuildableUnits },
  { header: 'Finished Goods On Hand', accessor: (s) => s.finishedGoodsOnHand },
  { header: 'Notes', accessor: (s) => s.notes },
  { header: 'Active', accessor: (s) => (s.isActive ? 'Yes' : 'No') },
  { header: 'Created At', accessor: (s) => s.createdAt },
  { header: 'Updated At', accessor: (s) => s.updatedAt },
]

/**
 * Transaction export columns definition
 */
export interface TransactionExportData {
  id: string
  type: string
  date: string
  skuName: string | null
  skuCode: string | null
  salesChannel: string | null
  unitsBuild: number | null
  unitBomCost: string | null
  totalBomCost: string | null
  supplier: string | null
  reason: string | null
  notes: string | null
  defectCount: number | null
  defectNotes: string | null
  affectedUnits: number | null
  createdAt: string
  createdByName: string
  // Transfer-specific fields
  fromLocationName: string | null
  toLocationName: string | null
  // Flattened component lines
  componentName: string
  componentSkuCode: string
  quantityChange: string
  costPerUnit: string | null
}

export const transactionExportColumns: CSVColumn<TransactionExportData>[] = [
  { header: 'Transaction ID', accessor: (t) => t.id },
  { header: 'Type', accessor: (t) => t.type },
  { header: 'Date', accessor: (t) => t.date },
  { header: 'Component Name', accessor: (t) => t.componentName },
  { header: 'Component SKU', accessor: (t) => t.componentSkuCode },
  { header: 'Quantity Change', accessor: (t) => t.quantityChange },
  { header: 'Cost Per Unit', accessor: (t) => t.costPerUnit },
  { header: 'SKU Name', accessor: (t) => t.skuName },
  { header: 'SKU Code', accessor: (t) => t.skuCode },
  { header: 'Sales Channel', accessor: (t) => t.salesChannel },
  { header: 'Units Built', accessor: (t) => t.unitsBuild },
  { header: 'Unit BOM Cost', accessor: (t) => t.unitBomCost },
  { header: 'Total BOM Cost', accessor: (t) => t.totalBomCost },
  { header: 'Supplier', accessor: (t) => t.supplier },
  { header: 'Reason', accessor: (t) => t.reason },
  { header: 'From Location', accessor: (t) => t.fromLocationName },
  { header: 'To Location', accessor: (t) => t.toLocationName },
  { header: 'Notes', accessor: (t) => t.notes },
  { header: 'Defect Count', accessor: (t) => t.defectCount },
  { header: 'Defect Notes', accessor: (t) => t.defectNotes },
  { header: 'Affected Units', accessor: (t) => t.affectedUnits },
  { header: 'Created At', accessor: (t) => t.createdAt },
  { header: 'Created By', accessor: (t) => t.createdByName },
]

/**
 * Lot export columns definition
 */
export interface LotExportData {
  id: string
  lotNumber: string
  componentName: string
  componentSkuCode: string
  expiryDate: string | null
  receivedQuantity: string
  balance: string
  supplier: string | null
  status: string
  notes: string | null
  createdAt: string
}

export const lotExportColumns: CSVColumn<LotExportData>[] = [
  { header: 'ID', accessor: (l) => l.id },
  { header: 'Lot Number', accessor: (l) => l.lotNumber },
  { header: 'Component Name', accessor: (l) => l.componentName },
  { header: 'Component SKU', accessor: (l) => l.componentSkuCode },
  { header: 'Expiry Date', accessor: (l) => l.expiryDate },
  { header: 'Received Quantity', accessor: (l) => l.receivedQuantity },
  { header: 'Current Balance', accessor: (l) => l.balance },
  { header: 'Supplier', accessor: (l) => l.supplier },
  { header: 'Status', accessor: (l) => l.status },
  { header: 'Notes', accessor: (l) => l.notes },
  { header: 'Created At', accessor: (l) => l.createdAt },
]

/**
 * Generate a filename for export
 */
export function generateExportFilename(type: 'components' | 'skus' | 'transactions' | 'lots'): string {
  const date = new Date().toISOString().split('T')[0]
  return `${type}-export-${date}.csv`
}
