/**
 * Unit tests for CSV import functions
 * Tests parseCSV, processComponentImport, processSKUImport, and processInitialInventoryImport
 */
import { describe, it, expect } from 'vitest'
import { parseCSV, processComponentImport, processSKUImport, processInitialInventoryImport } from '@/services/import'

describe('parseCSV', () => {
  it('parses simple CSV correctly', () => {
    const csv = 'Name,Code\nWidget,W-001\nGadget,G-001'
    const result = parseCSV(csv)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(['Name', 'Code'])
    expect(result[1]).toEqual(['Widget', 'W-001'])
    expect(result[2]).toEqual(['Gadget', 'G-001'])
  })

  it('handles quoted fields with commas', () => {
    const csv = 'Name,Description\n"Widget, Inc",A widget company'
    const result = parseCSV(csv)

    expect(result[1][0]).toBe('Widget, Inc')
    expect(result[1][1]).toBe('A widget company')
  })

  it('handles escaped quotes within quoted fields', () => {
    const csv = 'Name,Description\n"Widget ""Pro""",Premium widget'
    const result = parseCSV(csv)

    expect(result[1][0]).toBe('Widget "Pro"')
  })

  it('handles Windows line endings (CRLF)', () => {
    const csv = 'Name,Code\r\nWidget,W-001\r\nGadget,G-001'
    const result = parseCSV(csv)

    expect(result).toHaveLength(3)
    expect(result[1]).toEqual(['Widget', 'W-001'])
  })

  it('filters out empty lines', () => {
    const csv = 'Name,Code\n\nWidget,W-001\n\n'
    const result = parseCSV(csv)

    expect(result).toHaveLength(2)
  })

  it('trims whitespace from fields', () => {
    const csv = 'Name,Code\n  Widget  ,  W-001  '
    const result = parseCSV(csv)

    expect(result[1]).toEqual(['Widget', 'W-001'])
  })

  it('handles empty fields', () => {
    const csv = 'Name,Code,Category\nWidget,W-001,\nGadget,,Electronics'
    const result = parseCSV(csv)

    expect(result[1]).toEqual(['Widget', 'W-001', ''])
    expect(result[2]).toEqual(['Gadget', '', 'Electronics'])
  })

  it('handles single column CSV', () => {
    const csv = 'Name\nWidget\nGadget'
    const result = parseCSV(csv)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(['Name'])
    expect(result[1]).toEqual(['Widget'])
  })

  it('handles quoted field at end of line', () => {
    const csv = 'Name,Notes\nWidget,"A special note"'
    const result = parseCSV(csv)

    expect(result[1][1]).toBe('A special note')
  })

  it('handles multiline content in quotes - treated as separate lines', () => {
    // Note: The current parseCSV implementation splits on newlines first,
    // so multiline content in quotes is treated as separate lines.
    // This is acceptable for our use case as we expect single-line CSV values.
    const csv = 'Name,Notes\n"Widget","Line 1\nLine 2"'
    const result = parseCSV(csv)

    // First data row gets truncated at the newline
    expect(result[1][0]).toBe('Widget')
    expect(result[1][1]).toBe('Line 1')
    // "Line 2" becomes a separate row (the trailing quote is handled correctly)
    expect(result[2][0]).toBe('Line 2')
  })
})

describe('processComponentImport', () => {
  it('processes valid component CSV', () => {
    const csv = `Name,SKU Code,Category,Unit of Measure,Cost Per Unit,Reorder Point,Lead Time (Days),Notes
Widget A,WIDGET-001,Electronics,each,25.50,50,14,Test widget`

    const result = processComponentImport(csv)

    expect(result.total).toBe(1)
    expect(result.successful).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.results[0].success).toBe(true)
    expect(result.results[0].data).toMatchObject({
      name: 'Widget A',
      skuCode: 'WIDGET-001',
      category: 'Electronics',
      costPerUnit: 25.5,
    })
  })

  it('reports validation errors for invalid rows', () => {
    const csv = `Name,SKU Code
,MISSING-NAME
Has Name,`

    const result = processComponentImport(csv)

    expect(result.total).toBe(2)
    expect(result.failed).toBe(2)
    expect(result.results[0].success).toBe(false)
    expect(result.results[0].errors.some((e) => e.includes('name') || e.includes('Name'))).toBe(true)
  })

  it('returns empty result for CSV with only headers', () => {
    const csv = 'Name,SKU Code'

    const result = processComponentImport(csv)

    expect(result.total).toBe(0)
    expect(result.results).toEqual([])
  })

  it('handles optional fields with defaults', () => {
    const csv = `Name,SKU Code
Minimal Widget,MIN-001`

    const result = processComponentImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data).toMatchObject({
      name: 'Minimal Widget',
      skuCode: 'MIN-001',
      unitOfMeasure: 'each',
      costPerUnit: 0,
      reorderPoint: 0,
    })
  })

  it('processes multiple rows correctly', () => {
    const csv = `Name,SKU Code,Category
Widget A,W-001,Electronics
Widget B,W-002,Hardware
Widget C,W-003,Software`

    const result = processComponentImport(csv)

    expect(result.total).toBe(3)
    expect(result.successful).toBe(3)
    expect(result.failed).toBe(0)
  })

  it('handles mixed valid and invalid rows', () => {
    const csv = `Name,SKU Code
Valid Widget,W-001
,MISSING-NAME
Another Valid,W-002`

    const result = processComponentImport(csv)

    expect(result.total).toBe(3)
    expect(result.successful).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.results[0].success).toBe(true)
    expect(result.results[1].success).toBe(false)
    expect(result.results[2].success).toBe(true)
  })

  it('handles decimal cost values', () => {
    const csv = `Name,SKU Code,Cost Per Unit
Widget,W-001,99.99`

    const result = processComponentImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data?.costPerUnit).toBe(99.99)
  })
})

describe('processSKUImport', () => {
  it('processes valid SKU CSV', () => {
    const csv = `Name,Internal Code,Sales Channel,Notes
Product X,PROD-X,Amazon,Test product`

    const result = processSKUImport(csv)

    expect(result.total).toBe(1)
    expect(result.successful).toBe(1)
    expect(result.results[0].data).toMatchObject({
      name: 'Product X',
      internalCode: 'PROD-X',
      salesChannel: 'Amazon',
    })
  })

  it('validates sales channel enum', () => {
    const csv = `Name,Internal Code,Sales Channel
Product X,PROD-X,InvalidChannel`

    const result = processSKUImport(csv)

    expect(result.failed).toBe(1)
    expect(result.results[0].success).toBe(false)
    expect(result.results[0].errors.some((e) => e.includes('sales_channel') || e.includes('Sales'))).toBe(
      true
    )
  })

  it('accepts all valid sales channels', () => {
    const csv = `Name,Internal Code,Sales Channel
P1,SKU-1,Amazon
P2,SKU-2,Shopify
P3,SKU-3,TikTok
P4,SKU-4,Generic`

    const result = processSKUImport(csv)

    expect(result.successful).toBe(4)
    expect(result.failed).toBe(0)
  })

  it('returns empty result for CSV with only headers', () => {
    const csv = 'Name,Internal Code,Sales Channel'

    const result = processSKUImport(csv)

    expect(result.total).toBe(0)
    expect(result.results).toEqual([])
  })

  it('reports row numbers correctly', () => {
    const csv = `Name,Internal Code,Sales Channel
Product X,PROD-X,Amazon
,MISSING-NAME,Amazon`

    const result = processSKUImport(csv)

    // Row 2 is the first data row (after header)
    expect(result.results[0].rowNumber).toBe(2)
    expect(result.results[1].rowNumber).toBe(3)
  })

  it('handles notes field', () => {
    const csv = `Name,Internal Code,Sales Channel,Notes
Product X,PROD-X,Amazon,"Important note with, comma"`

    const result = processSKUImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data?.notes).toBe('Important note with, comma')
  })

  it('handles missing optional notes field', () => {
    const csv = `Name,Internal Code,Sales Channel
Product X,PROD-X,Amazon`

    const result = processSKUImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data?.notes).toBeNull()
  })
})

describe('processInitialInventoryImport', () => {
  it('processes valid initial inventory CSV', () => {
    const csv = `Component SKU Code,Quantity,Cost Per Unit,Date,Notes
COMP-001,100,10.50,2025-01-01,Opening balance`

    const result = processInitialInventoryImport(csv)

    expect(result.total).toBe(1)
    expect(result.successful).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.results[0].success).toBe(true)
    expect(result.results[0].data).toMatchObject({
      componentSkuCode: 'COMP-001',
      quantity: 100,
      costPerUnit: 10.5,
    })
  })

  it('reports validation errors for missing quantity', () => {
    const csv = `Component SKU Code,Quantity
COMP-001,`

    const result = processInitialInventoryImport(csv)

    expect(result.failed).toBe(1)
    expect(result.results[0].success).toBe(false)
  })

  it('reports validation errors for negative quantity', () => {
    const csv = `Component SKU Code,Quantity
COMP-001,-50`

    const result = processInitialInventoryImport(csv)

    expect(result.failed).toBe(1)
    expect(result.results[0].success).toBe(false)
  })

  it('returns empty result for CSV with only headers', () => {
    const csv = 'Component SKU Code,Quantity'

    const result = processInitialInventoryImport(csv)

    expect(result.total).toBe(0)
    expect(result.results).toEqual([])
  })

  it('handles optional cost per unit field', () => {
    const csv = `Component SKU Code,Quantity,Cost Per Unit
COMP-001,100,`

    const result = processInitialInventoryImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data?.costPerUnit).toBeUndefined()
  })

  it('handles optional date field with default to today', () => {
    const csv = `Component SKU Code,Quantity,Cost Per Unit,Date
COMP-001,100,10.50,`

    const result = processInitialInventoryImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data?.date).toBeInstanceOf(Date)
  })

  it('handles decimal quantity values', () => {
    const csv = `Component SKU Code,Quantity
COMP-001,99.5`

    const result = processInitialInventoryImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data?.quantity).toBe(99.5)
  })

  it('reports row numbers correctly', () => {
    const csv = `Component SKU Code,Quantity
COMP-001,100
COMP-002,50`

    const result = processInitialInventoryImport(csv)

    expect(result.results[0].rowNumber).toBe(2)
    expect(result.results[1].rowNumber).toBe(3)
  })

  it('handles mixed valid and invalid rows', () => {
    const csv = `Component SKU Code,Quantity
COMP-001,100
,50
COMP-002,75`

    const result = processInitialInventoryImport(csv)

    expect(result.total).toBe(3)
    expect(result.successful).toBe(2)
    expect(result.failed).toBe(1)
  })

  it('handles valid date format', () => {
    const csv = `Component SKU Code,Quantity,Cost Per Unit,Date
COMP-001,100,10.50,2025-06-15`

    const result = processInitialInventoryImport(csv)

    expect(result.successful).toBe(1)
    const parsedDate = result.results[0].data?.date
    expect(parsedDate).toBeInstanceOf(Date)
    expect(parsedDate?.getFullYear()).toBe(2025)
  })

  it('handles optional notes field', () => {
    const csv = `Component SKU Code,Quantity,Cost Per Unit,Date,Notes
COMP-001,100,10.50,2025-01-01,Opening balance from warehouse`

    const result = processInitialInventoryImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data?.notes).toBe('Opening balance from warehouse')
  })

  it('handles empty notes field', () => {
    const csv = `Component SKU Code,Quantity,Cost Per Unit,Date,Notes
COMP-001,100,10.50,2025-01-01,`

    const result = processInitialInventoryImport(csv)

    expect(result.successful).toBe(1)
    expect(result.results[0].data?.notes).toBeNull()
  })
})
