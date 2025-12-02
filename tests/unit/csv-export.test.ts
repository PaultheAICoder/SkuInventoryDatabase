/**
 * Unit tests for CSV export functions
 * Tests toCSV and CSV escaping
 */
import { describe, it, expect } from 'vitest'
import { toCSV, type CSVColumn } from '@/services/export'

interface TestData {
  name: string
  value: number
  description: string | null
}

const testColumns: CSVColumn<TestData>[] = [
  { header: 'Name', accessor: (d) => d.name },
  { header: 'Value', accessor: (d) => d.value },
  { header: 'Description', accessor: (d) => d.description },
]

describe('toCSV', () => {
  it('generates CSV with headers and data rows', () => {
    const data: TestData[] = [
      { name: 'Widget', value: 100, description: 'A widget' },
      { name: 'Gadget', value: 50, description: 'A gadget' },
    ]

    const result = toCSV(data, testColumns)

    const lines = result.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('Name,Value,Description')
    expect(lines[1]).toBe('Widget,100,A widget')
    expect(lines[2]).toBe('Gadget,50,A gadget')
  })

  it('handles null values as empty strings', () => {
    const data: TestData[] = [{ name: 'Widget', value: 100, description: null }]

    const result = toCSV(data, testColumns)
    const lines = result.split('\n')

    expect(lines[1]).toBe('Widget,100,')
  })

  it('escapes fields containing commas', () => {
    const data: TestData[] = [{ name: 'Widget, Inc', value: 100, description: 'Test' }]

    const result = toCSV(data, testColumns)
    const lines = result.split('\n')

    expect(lines[1]).toBe('"Widget, Inc",100,Test')
  })

  it('escapes fields containing quotes', () => {
    const data: TestData[] = [{ name: 'Widget "Pro"', value: 100, description: 'Test' }]

    const result = toCSV(data, testColumns)
    const lines = result.split('\n')

    expect(lines[1]).toBe('"Widget ""Pro""",100,Test')
  })

  it('escapes fields containing newlines', () => {
    const data: TestData[] = [{ name: 'Widget', value: 100, description: 'Line 1\nLine 2' }]

    const result = toCSV(data, testColumns)
    const lines = result.split('\n')

    // The description should be quoted due to newline
    expect(lines[1]).toContain('"Line 1')
  })

  it('handles empty data array', () => {
    const result = toCSV([], testColumns)

    expect(result).toBe('Name,Value,Description')
  })

  it('escapes header values if they contain special characters', () => {
    const columnsWithSpecialHeaders: CSVColumn<TestData>[] = [
      { header: 'Name, Full', accessor: (d) => d.name },
    ]

    const data: TestData[] = [{ name: 'Widget', value: 100, description: null }]

    const result = toCSV(data, columnsWithSpecialHeaders)
    const lines = result.split('\n')

    expect(lines[0]).toBe('"Name, Full"')
  })

  it('handles undefined values as empty strings', () => {
    interface DataWithUndefined {
      name: string
      optionalField: string | undefined
    }

    const undefinedColumns: CSVColumn<DataWithUndefined>[] = [
      { header: 'Name', accessor: (d) => d.name },
      { header: 'Optional', accessor: (d) => d.optionalField },
    ]

    const data: DataWithUndefined[] = [{ name: 'Widget', optionalField: undefined }]

    const result = toCSV(data, undefinedColumns)
    const lines = result.split('\n')

    expect(lines[1]).toBe('Widget,')
  })

  it('handles numeric zero values correctly', () => {
    const data: TestData[] = [{ name: 'Widget', value: 0, description: 'Zero value' }]

    const result = toCSV(data, testColumns)
    const lines = result.split('\n')

    expect(lines[1]).toBe('Widget,0,Zero value')
  })

  it('handles large numbers', () => {
    const data: TestData[] = [{ name: 'Widget', value: 1000000, description: 'Large' }]

    const result = toCSV(data, testColumns)
    const lines = result.split('\n')

    expect(lines[1]).toBe('Widget,1000000,Large')
  })

  it('handles carriage return characters', () => {
    const data: TestData[] = [{ name: 'Widget', value: 100, description: 'Line 1\rLine 2' }]

    const result = toCSV(data, testColumns)

    // Should be quoted because of carriage return
    expect(result).toContain('"Line 1')
  })

  it('handles combined special characters', () => {
    const data: TestData[] = [{ name: 'Widget "Pro", Ltd', value: 100, description: 'Test' }]

    const result = toCSV(data, testColumns)
    const lines = result.split('\n')

    // Should escape both quotes and wrap in quotes due to comma
    expect(lines[1]).toBe('"Widget ""Pro"", Ltd",100,Test')
  })

  it('handles multiple rows with various escaping needs', () => {
    const data: TestData[] = [
      { name: 'Normal', value: 1, description: 'Normal text' },
      { name: 'Has, comma', value: 2, description: 'Text' },
      { name: 'Has "quotes"', value: 3, description: 'Text' },
      { name: 'Normal again', value: 4, description: null },
    ]

    const result = toCSV(data, testColumns)
    const lines = result.split('\n')

    expect(lines).toHaveLength(5) // header + 4 rows
    expect(lines[0]).toBe('Name,Value,Description')
    expect(lines[1]).toBe('Normal,1,Normal text')
    expect(lines[2]).toBe('"Has, comma",2,Text')
    expect(lines[3]).toBe('"Has ""quotes""",3,Text')
    expect(lines[4]).toBe('Normal again,4,')
  })
})

describe('CSV round-trip compatibility', () => {
  it('exported CSV can be parsed back (component format)', async () => {
    // Dynamically import parseCSV to avoid module resolution issues in unit test
    const { parseCSV } = await import('@/services/import')

    const exportedCSV = `Name,SKU Code,Category,Cost Per Unit
"Widget, Pro",WP-001,Electronics,25.50`

    const parsed = parseCSV(exportedCSV)

    expect(parsed[1][0]).toBe('Widget, Pro')
    expect(parsed[1][1]).toBe('WP-001')
    expect(parsed[1][2]).toBe('Electronics')
    expect(parsed[1][3]).toBe('25.50')
  })

  it('handles quoted fields in round-trip', async () => {
    const { parseCSV } = await import('@/services/import')

    const exportedCSV = `Name,Description
"Widget ""Pro""","A ""special"" widget"`

    const parsed = parseCSV(exportedCSV)

    expect(parsed[1][0]).toBe('Widget "Pro"')
    expect(parsed[1][1]).toBe('A "special" widget')
  })
})
