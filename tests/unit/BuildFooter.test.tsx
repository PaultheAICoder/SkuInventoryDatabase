import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BuildFooter } from '@/components/ui/BuildFooter'

// version.json is mocked globally in tests/setup.ts

describe('BuildFooter', () => {
  it('renders without crashing', () => {
    render(<BuildFooter />)
    const footer = screen.getByRole('contentinfo')
    expect(footer).toBeInTheDocument()
  })

  it('displays the version number', () => {
    render(<BuildFooter />)
    // Look for "Build" text and version separately since they may be in different text nodes
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toContain('Build')
    expect(footer.textContent).toMatch(/\d+\.\d+\.\d+/)
  })

  it('displays a formatted timestamp', () => {
    render(<BuildFooter />)
    const footer = screen.getByRole('contentinfo')
    // The timestamp should be formatted with month, year
    expect(footer.textContent).toMatch(/\d{4}/)
  })

  it('renders the separator between version and timestamp', () => {
    render(<BuildFooter />)
    expect(screen.getByText('|')).toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    render(<BuildFooter className="custom-class" />)
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveClass('custom-class')
  })

  it('has the correct base styling classes', () => {
    render(<BuildFooter />)
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveClass('border-t')
    expect(footer).toHaveClass('text-center')
    expect(footer).toHaveClass('text-xs')
  })

  it('merges custom className with base classes', () => {
    render(<BuildFooter className="mt-4" />)
    const footer = screen.getByRole('contentinfo')
    // Should have both the base class and the custom class
    expect(footer).toHaveClass('border-t')
    expect(footer).toHaveClass('mt-4')
  })
})
