import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackDialog } from '@/components/features/FeedbackDialog'

// Mock the sonner toast (avoid side effects)
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper function to fill bug structured fields
async function fillBugFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title *'), 'Test bug title description')
  await user.type(screen.getByLabelText(/What should happen/), 'Expected behavior text here')
  await user.type(screen.getByLabelText(/What actually happens/), 'Actual behavior text here')
  await user.type(screen.getByLabelText(/Steps to reproduce/), 'Step 1\nStep 2\nStep 3')
}

// Note: fillFeatureFields helper removed due to Radix UI Select component issues with jsdom.
// Feature fields testing is done separately without full Select interaction.

describe('FeedbackDialog', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initial rendering', () => {
    it('renders dialog when open is true', () => {
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not render dialog when open is false', () => {
      render(<FeedbackDialog open={false} onOpenChange={() => {}} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('displays "Submit Feedback" title on initial step', () => {
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)
      expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
    })

    it('shows bug and feature type options', () => {
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)
      expect(screen.getByText('Report a Bug')).toBeInTheDocument()
      expect(screen.getByText('Request a Feature')).toBeInTheDocument()
    })
  })

  describe('state machine transitions', () => {
    it('transitions from select-type to structured-fields when bug selected', async () => {
      const user = userEvent.setup()
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))

      expect(screen.getByText('Report a Bug')).toBeInTheDocument()
      expect(screen.getByLabelText('Title *')).toBeInTheDocument()
      expect(screen.getByLabelText(/What should happen/)).toBeInTheDocument()
    })

    it('transitions from select-type to structured-fields when feature selected', async () => {
      const user = userEvent.setup()
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Request a Feature'))

      expect(screen.getByText('Request a Feature')).toBeInTheDocument()
      expect(screen.getByLabelText('Title *')).toBeInTheDocument()
    })

    it('transitions from structured-fields to clarify after valid bug submission', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { questions: ['Q1?', 'Q2?'] }
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })
    })

    it('transitions to error state on submission failure', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'GitHub API failed' })
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      // Complete flow to submission
      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      // Fill answers
      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        expect(screen.getByText('Submission Failed')).toBeInTheDocument()
      })
    })

    it('transitions to success state on successful submission', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { issueUrl: 'https://github.com/test/123', issueNumber: 123 }
          })
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        expect(screen.getByText('Thank You!')).toBeInTheDocument()
      })
    })

    it('back button returns from structured-fields to select-type', async () => {
      const user = userEvent.setup()
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      expect(screen.getByLabelText('Title *')).toBeInTheDocument()

      await user.click(screen.getByText('Back'))
      expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
    })

    it('back button returns from clarify to structured-fields', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { questions: ['Q1?', 'Q2?'] }
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Back'))
      expect(screen.getByLabelText('Title *')).toBeInTheDocument()
    })
  })

  describe('structured fields validation', () => {
    describe('bug fields validation', () => {
      it('displays page URL as read-only field', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))

        const pageUrlInput = screen.getByLabelText('Page URL')
        expect(pageUrlInput).toBeInTheDocument()
        expect(pageUrlInput).toBeDisabled()
      })

      it('displays character count for title', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        expect(screen.getByText('0/255 characters (minimum 5)')).toBeInTheDocument()
      })

      it('updates title character count as user types', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Title *'), 'Test')

        expect(screen.getByText('4/255 characters (minimum 5)')).toBeInTheDocument()
      })

      it('disables Continue button when required fields not filled', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))

        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
      })

      it('enables Continue button when all required bug fields filled', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)

        expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled()
      })
    })

    describe('feature fields validation', () => {
      // Note: Radix UI Select has a known issue with jsdom where hasPointerCapture is not a function
      // These tests verify the UI renders correctly but skip the actual select interaction
      it('shows Who Benefits dropdown element', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Request a Feature'))

        // Verify the combobox is present (but don't click to open due to jsdom limitation)
        expect(screen.getByRole('combobox')).toBeInTheDocument()
        expect(screen.getByText('Select who benefits')).toBeInTheDocument()
      })

      it('disables Continue button when required feature fields not filled', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Request a Feature'))
        await user.type(screen.getByLabelText('Title *'), 'Test feature')

        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
      })

      it('shows feature-specific fields', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Request a Feature'))

        // Verify feature-specific fields are present
        expect(screen.getByLabelText(/Who would benefit/)).toBeInTheDocument()
        expect(screen.getByLabelText(/What action do you want/)).toBeInTheDocument()
        expect(screen.getByLabelText(/Why does this matter/)).toBeInTheDocument()
      })
    })

    describe('answer validation', () => {
      it('disables Submit button when not all answers provided', async () => {
        const user = userEvent.setup()
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        // Only fill 1 of 2 answers
        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')

        expect(screen.getByRole('button', { name: 'Submit Feedback' })).toBeDisabled()
      })

      it('enables Submit button when all answers provided', async () => {
        const user = userEvent.setup()
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')

        expect(screen.getByRole('button', { name: 'Submit Feedback' })).not.toBeDisabled()
      })

      it('displays questions from API response', async () => {
        const user = userEvent.setup()
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Custom Q1?', 'Custom Q2?'] }
          })
        })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('Custom Q1?')).toBeInTheDocument()
          expect(screen.getByText('Custom Q2?')).toBeInTheDocument()
        })
      })
    })
  })

  describe('loading states', () => {
    it('shows "Getting Questions..." during clarify API call', async () => {
      const user = userEvent.setup()
      // Create a promise we can control
      let resolvePromise: (value: unknown) => void
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValueOnce(pendingPromise)

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      expect(screen.getByText('Getting Questions...')).toBeInTheDocument()

      // Cleanup - wrap in act to handle async state updates
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
      })
    })

    it('shows spinner during clarify API call', async () => {
      const user = userEvent.setup()
      let resolvePromise: (value: unknown) => void
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValueOnce(pendingPromise)

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      // Loader2 icon with animate-spin class indicates loading
      const button = screen.getByRole('button', { name: /Getting Questions/i })
      expect(button).toBeDisabled()

      // Cleanup - wrap in act to handle async state updates
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
      })
    })

    it('shows "Submitting Feedback" step during submission', async () => {
      const user = userEvent.setup()
      let resolveSubmit: (value: unknown) => void
      const pendingSubmit = new Promise((resolve) => {
        resolveSubmit = resolve
      })

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockReturnValueOnce(pendingSubmit)

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      expect(screen.getByText('Submitting Feedback')).toBeInTheDocument()
      expect(screen.getByText('Creating your GitHub issue...')).toBeInTheDocument()

      // Cleanup - wrap in act to handle async state updates
      await act(async () => {
        resolveSubmit!({
          ok: true,
          json: () => Promise.resolve({
            data: { issueUrl: 'https://github.com/test/123', issueNumber: 123 }
          })
        })
      })
    })

    it('shows "Please wait..." message during submission', async () => {
      const user = userEvent.setup()
      let resolveSubmit: (value: unknown) => void
      const pendingSubmit = new Promise((resolve) => {
        resolveSubmit = resolve
      })

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockReturnValueOnce(pendingSubmit)

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      expect(screen.getByText('Please wait...')).toBeInTheDocument()

      // Cleanup - wrap in act to handle async state updates
      await act(async () => {
        resolveSubmit!({
          ok: true,
          json: () => Promise.resolve({
            data: { issueUrl: 'https://github.com/test/123', issueNumber: 123 }
          })
        })
      })
    })
  })

  describe('success and error states', () => {
    describe('success state', () => {
      it('displays "Thank You!" message on success', async () => {
        const user = userEvent.setup()
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { questions: ['Q1?', 'Q2?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { issueUrl: 'https://github.com/test/123', issueNumber: 123 }
            })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.click(screen.getByText('Submit Feedback'))

        await waitFor(() => {
          expect(screen.getByText('Thank You!')).toBeInTheDocument()
        })
      })

      it('displays issue URL link on success', async () => {
        const user = userEvent.setup()
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { questions: ['Q1?', 'Q2?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { issueUrl: 'https://github.com/owner/repo/issues/123', issueNumber: 123 }
            })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.click(screen.getByText('Submit Feedback'))

        await waitFor(() => {
          const link = screen.getByRole('link', { name: 'View Issue' })
          expect(link).toBeInTheDocument()
          expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/issues/123')
          expect(link).toHaveAttribute('target', '_blank')
        })
      })

      it('shows Close button on success', async () => {
        const user = userEvent.setup()
        const mockOnOpenChange = vi.fn()
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { questions: ['Q1?', 'Q2?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { issueUrl: 'https://github.com/test/123', issueNumber: 123 }
            })
          })

        render(<FeedbackDialog open={true} onOpenChange={mockOnOpenChange} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.click(screen.getByText('Submit Feedback'))

        await waitFor(() => {
          expect(screen.getByText('Thank You!')).toBeInTheDocument()
        })

        // Click the Close button in the footer (not the X close button)
        const closeButtons = screen.getAllByRole('button', { name: 'Close' })
        // The last one should be the actual "Close" text button in the footer
        await user.click(closeButtons[closeButtons.length - 1])
        expect(mockOnOpenChange).toHaveBeenCalledWith(false)
      })
    })

    describe('error state', () => {
      it('displays "Submission Failed" on error', async () => {
        const user = userEvent.setup()
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { questions: ['Q1?', 'Q2?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ message: 'GitHub API failed' })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.click(screen.getByText('Submit Feedback'))

        await waitFor(() => {
          expect(screen.getByText('Submission Failed')).toBeInTheDocument()
        })
      })

      it('displays error message from API', async () => {
        const user = userEvent.setup()
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { questions: ['Q1?', 'Q2?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ message: 'Rate limit exceeded' })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.click(screen.getByText('Submit Feedback'))

        await waitFor(() => {
          expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
        })
      })

      it('shows Cancel and Try Again buttons on error', async () => {
        const user = userEvent.setup()
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { questions: ['Q1?', 'Q2?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ message: 'Error' })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.click(screen.getByText('Submit Feedback'))

        await waitFor(() => {
          expect(screen.getByText('Submission Failed')).toBeInTheDocument()
        })

        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
      })

      it('Try Again returns to clarify step', async () => {
        const user = userEvent.setup()
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              data: { questions: ['Q1?', 'Q2?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ message: 'Error' })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await fillBugFields(user)
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.click(screen.getByText('Submit Feedback'))

        await waitFor(() => {
          expect(screen.getByText('Submission Failed')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: 'Try Again' }))
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })
    })
  })

  describe('accessibility', () => {
    it('dialog has role="dialog"', () => {
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('form inputs have associated labels', async () => {
      const user = userEvent.setup()
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))

      const titleInput = screen.getByLabelText('Title *')
      expect(titleInput).toBeInTheDocument()
      expect(titleInput.tagName.toLowerCase()).toBe('input')
    })

    it('answer textareas have proper labels', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { questions: ['Question 1?', 'Question 2?'] }
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('Question 1?')).toBeInTheDocument()
      })

      // Each question serves as a label for its textarea
      const q1Label = screen.getByText('Question 1?')
      expect(q1Label.tagName.toLowerCase()).toBe('label')
    })

    it('type selection buttons are keyboard accessible', async () => {
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      const bugButton = screen.getByText('Report a Bug').closest('button')
      const featureButton = screen.getByText('Request a Feature').closest('button')

      expect(bugButton).toHaveAttribute('type', 'button')
      expect(featureButton).toHaveAttribute('type', 'button')
    })

    it('error messages are visible to screen readers', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'API Error' })
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        // Error message should be visible
        expect(screen.getByText('API Error')).toBeInTheDocument()
      })
    })

    it('dialog has proper title and description', () => {
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
      expect(screen.getByText('Help us improve! What type of feedback do you have?')).toBeInTheDocument()
    })
  })

  describe('dialog reset behavior', () => {
    it('resets to select-type step when dialog closes', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      // Navigate to structured-fields step
      await user.click(screen.getByText('Report a Bug'))
      expect(screen.getByLabelText('Title *')).toBeInTheDocument()

      // Close dialog
      rerender(<FeedbackDialog open={false} onOpenChange={() => {}} />)

      // Wait for reset (200ms delay in component) - wrap in act to handle async state updates
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300))
      })

      // Reopen and verify reset
      rerender(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
      expect(screen.getByText('Report a Bug')).toBeInTheDocument()
    })

    it('clears title when dialog closes', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Title *'), 'Test title')

      expect(screen.getByDisplayValue('Test title')).toBeInTheDocument()

      // Close dialog
      rerender(<FeedbackDialog open={false} onOpenChange={() => {}} />)

      // Wait for reset - wrap in act to handle async state updates
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 250))
      })

      rerender(<FeedbackDialog open={true} onOpenChange={() => {}} />)
      await user.click(screen.getByText('Report a Bug'))

      expect(screen.getByLabelText('Title *')).toHaveValue('')
    })

    it('clears error state when dialog closes', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'Test Error' })
        })

      const { rerender } = render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      // Navigate to error state
      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        expect(screen.getByText('Submission Failed')).toBeInTheDocument()
      })

      // Close dialog
      rerender(<FeedbackDialog open={false} onOpenChange={() => {}} />)

      // Wait for reset - wrap in act to handle async state updates
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 250))
      })

      // Reopen
      rerender(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
      expect(screen.queryByText('Submission Failed')).not.toBeInTheDocument()
      expect(screen.queryByText('Test Error')).not.toBeInTheDocument()
    })
  })

  describe('clarify API error handling', () => {
    it('displays error in structured-fields step when clarify fails', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          message: 'Failed to get clarifying questions'
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        // Should stay on structured-fields step and show error
        expect(screen.getByText('Failed to get clarifying questions')).toBeInTheDocument()
        expect(screen.getByLabelText('Title *')).toBeInTheDocument()
      })
    })

    it('handles malformed clarify response (null data)', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null })  // Malformed: data is null
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        // Should show error and stay on structured-fields step
        expect(screen.getByText(/Invalid response/i)).toBeInTheDocument()
        expect(screen.getByLabelText('Title *')).toBeInTheDocument()
      })
    })

    it('handles malformed clarify response (missing questions property)', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { wrongProperty: 'value' } })  // Missing questions
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText(/Invalid response/i)).toBeInTheDocument()
        expect(screen.getByLabelText('Title *')).toBeInTheDocument()
      })
    })

    it('handles malformed clarify response (questions is not array)', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { questions: 'not an array' } })  // Wrong type
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText(/Invalid response/i)).toBeInTheDocument()
        expect(screen.getByLabelText('Title *')).toBeInTheDocument()
      })
    })

    it('handles JSON parse failure gracefully', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.reject(new Error('Invalid JSON'))  // JSON parse fails
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        // Should show default error message since JSON parsing failed
        expect(screen.getByText('Failed to get clarifying questions')).toBeInTheDocument()
      })
    })
  })

  describe('submit API error handling', () => {
    it('handles malformed submit response (missing data property)', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ wrongShape: true })  // Missing data property
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        // Should show error state
        expect(screen.getByText('Submission Failed')).toBeInTheDocument()
        expect(screen.getByText(/Invalid response/i)).toBeInTheDocument()
      })
    })

    it('handles malformed submit response (missing issueUrl)', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { issueNumber: 123 } })  // Missing issueUrl
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        expect(screen.getByText('Submission Failed')).toBeInTheDocument()
      })
    })

    it('handles malformed submit response (missing issueNumber)', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { issueUrl: 'https://github.com/test/123' } })  // Missing issueNumber
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await fillBugFields(user)
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        expect(screen.getByText('Submission Failed')).toBeInTheDocument()
      })
    })
  })
})
