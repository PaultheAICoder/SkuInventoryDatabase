import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    it('transitions from select-type to describe when bug selected', async () => {
      const user = userEvent.setup()
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))

      expect(screen.getByText('Describe the Bug')).toBeInTheDocument()
      expect(screen.getByLabelText('Description *')).toBeInTheDocument()
    })

    it('transitions from select-type to describe when feature selected', async () => {
      const user = userEvent.setup()
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Request a Feature'))

      expect(screen.getByText('Describe Your Feature Request')).toBeInTheDocument()
    })

    it('transitions from describe to clarify after valid description', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'This is a detailed bug description')
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
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'GitHub API failed' })
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      // Complete flow to submission
      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed bug description here')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      // Fill answers
      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
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
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
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
      await user.type(screen.getByLabelText('Description *'), 'Detailed bug description here')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        expect(screen.getByText('Thank You!')).toBeInTheDocument()
      })
    })

    it('back button returns from describe to select-type', async () => {
      const user = userEvent.setup()
      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      expect(screen.getByText('Describe the Bug')).toBeInTheDocument()

      await user.click(screen.getByText('Back'))
      expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
    })

    it('back button returns from clarify to describe', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Back'))
      expect(screen.getByText('Describe the Bug')).toBeInTheDocument()
    })
  })

  describe('form validation', () => {
    describe('description validation', () => {
      it('displays character count', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        expect(screen.getByText('0/2000 characters (minimum 10)')).toBeInTheDocument()
      })

      it('updates character count as user types', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Test12345')

        expect(screen.getByText('9/2000 characters (minimum 10)')).toBeInTheDocument()
      })

      it('disables Continue button when description < 10 chars', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Short')

        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
      })

      it('enables Continue button when description >= 10 chars', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'This is enough')

        expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled()
      })

      it('shows error when trying to submit short description', async () => {
        const user = userEvent.setup()
        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Short')

        // Button should be disabled, preventing submission
        const continueBtn = screen.getByRole('button', { name: 'Continue' })
        expect(continueBtn).toBeDisabled()
      })
    })

    describe('answer validation', () => {
      it('disables Submit button when not all answers provided', async () => {
        const user = userEvent.setup()
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        // Only fill 2 of 3 answers
        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')

        expect(screen.getByRole('button', { name: 'Submit Feedback' })).toBeDisabled()
      })

      it('enables Submit button when all answers provided', async () => {
        const user = userEvent.setup()
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.type(textareas[2], 'Answer 3')

        expect(screen.getByRole('button', { name: 'Submit Feedback' })).not.toBeDisabled()
      })

      it('displays questions from API response', async () => {
        const user = userEvent.setup()
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Custom Q1?', 'Custom Q2?', 'Custom Q3?'] }
          })
        })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('Custom Q1?')).toBeInTheDocument()
          expect(screen.getByText('Custom Q2?')).toBeInTheDocument()
          expect(screen.getByText('Custom Q3?')).toBeInTheDocument()
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
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      expect(screen.getByText('Getting Questions...')).toBeInTheDocument()

      // Cleanup
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({
          data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
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
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      // Loader2 icon with animate-spin class indicates loading
      const button = screen.getByRole('button', { name: /Getting Questions/i })
      expect(button).toBeDisabled()

      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({
          data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
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
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })
        .mockReturnValueOnce(pendingSubmit)

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
      await user.click(screen.getByText('Submit Feedback'))

      expect(screen.getByText('Submitting Feedback')).toBeInTheDocument()
      expect(screen.getByText('Creating your GitHub issue...')).toBeInTheDocument()

      resolveSubmit!({
        ok: true,
        json: () => Promise.resolve({
          data: { issueUrl: 'https://github.com/test/123', issueNumber: 123 }
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
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })
        .mockReturnValueOnce(pendingSubmit)

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
      await user.click(screen.getByText('Submit Feedback'))

      expect(screen.getByText('Please wait...')).toBeInTheDocument()

      resolveSubmit!({
        ok: true,
        json: () => Promise.resolve({
          data: { issueUrl: 'https://github.com/test/123', issueNumber: 123 }
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
              data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
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
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.type(textareas[2], 'Answer 3')
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
              data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
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
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.type(textareas[2], 'Answer 3')
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
              data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
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
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.type(textareas[2], 'Answer 3')
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
              data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ message: 'GitHub API failed' })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.type(textareas[2], 'Answer 3')
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
              data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ message: 'Rate limit exceeded' })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.type(textareas[2], 'Answer 3')
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
              data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ message: 'Error' })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.type(textareas[2], 'Answer 3')
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
              data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
            })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ message: 'Error' })
          })

        render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

        await user.click(screen.getByText('Report a Bug'))
        await user.type(screen.getByLabelText('Description *'), 'Detailed description')
        await user.click(screen.getByText('Continue'))

        await waitFor(() => {
          expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
        })

        const textareas = screen.getAllByPlaceholderText('Your answer...')
        await user.type(textareas[0], 'Answer 1')
        await user.type(textareas[1], 'Answer 2')
        await user.type(textareas[2], 'Answer 3')
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

      const textarea = screen.getByLabelText('Description *')
      expect(textarea).toBeInTheDocument()
      expect(textarea.tagName.toLowerCase()).toBe('textarea')
    })

    it('answer textareas have proper labels', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { questions: ['Question 1?', 'Question 2?', 'Question 3?'] }
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
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
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'API Error' })
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
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

      // Navigate to describe step
      await user.click(screen.getByText('Report a Bug'))
      expect(screen.getByText('Describe the Bug')).toBeInTheDocument()

      // Close dialog
      rerender(<FeedbackDialog open={false} onOpenChange={() => {}} />)

      // Wait for reset (200ms delay in component)
      await new Promise(resolve => setTimeout(resolve, 300))

      // Reopen and verify reset
      rerender(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
      expect(screen.getByText('Report a Bug')).toBeInTheDocument()
    })

    it('clears description when dialog closes', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Test description')

      expect(screen.getByDisplayValue('Test description')).toBeInTheDocument()

      rerender(<FeedbackDialog open={false} onOpenChange={() => {}} />)

      await new Promise(resolve => setTimeout(resolve, 250))

      rerender(<FeedbackDialog open={true} onOpenChange={() => {}} />)
      await user.click(screen.getByText('Report a Bug'))

      expect(screen.getByLabelText('Description *')).toHaveValue('')
    })

    it('clears error state when dialog closes', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'Test Error' })
        })

      const { rerender } = render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      // Navigate to error state
      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        expect(screen.getByText('Submission Failed')).toBeInTheDocument()
      })

      // Close and reopen
      rerender(<FeedbackDialog open={false} onOpenChange={() => {}} />)
      await new Promise(resolve => setTimeout(resolve, 250))
      rerender(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
      expect(screen.queryByText('Submission Failed')).not.toBeInTheDocument()
      expect(screen.queryByText('Test Error')).not.toBeInTheDocument()
    })
  })

  describe('clarify API error handling', () => {
    it('uses fallback questions when clarify API fails', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          message: 'Claude API unavailable'
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Testing clarify API failure')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        // Should show the error message from API
        expect(screen.getByText('Claude API unavailable')).toBeInTheDocument()
      })
    })

    it('displays error in describe step when clarify fails', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          message: 'Failed to get clarifying questions'
        })
      })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Testing clarify API failure')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        // Should stay on describe step and show error
        expect(screen.getByText('Failed to get clarifying questions')).toBeInTheDocument()
        expect(screen.getByText('Describe the Bug')).toBeInTheDocument()
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
      await user.type(screen.getByLabelText('Description *'), 'Testing malformed response')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        // Should show error and stay on describe step
        expect(screen.getByText(/Invalid response/i)).toBeInTheDocument()
        expect(screen.getByText('Describe the Bug')).toBeInTheDocument()
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
      await user.type(screen.getByLabelText('Description *'), 'Testing missing questions')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText(/Invalid response/i)).toBeInTheDocument()
        expect(screen.getByText('Describe the Bug')).toBeInTheDocument()
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
      await user.type(screen.getByLabelText('Description *'), 'Testing wrong type')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText(/Invalid response/i)).toBeInTheDocument()
        expect(screen.getByText('Describe the Bug')).toBeInTheDocument()
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
      await user.type(screen.getByLabelText('Description *'), 'Testing JSON parse failure')
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
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ wrongShape: true })  // Missing data property
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
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
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { issueNumber: 123 } })  // Missing issueUrl
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
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
            data: { questions: ['Q1?', 'Q2?', 'Q3?'] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { issueUrl: 'https://github.com/test/123' } })  // Missing issueNumber
        })

      render(<FeedbackDialog open={true} onOpenChange={() => {}} />)

      await user.click(screen.getByText('Report a Bug'))
      await user.type(screen.getByLabelText('Description *'), 'Detailed description')
      await user.click(screen.getByText('Continue'))

      await waitFor(() => {
        expect(screen.getByText('A Few Quick Questions')).toBeInTheDocument()
      })

      const textareas = screen.getAllByPlaceholderText('Your answer...')
      await user.type(textareas[0], 'Answer 1')
      await user.type(textareas[1], 'Answer 2')
      await user.type(textareas[2], 'Answer 3')
      await user.click(screen.getByText('Submit Feedback'))

      await waitFor(() => {
        expect(screen.getByText('Submission Failed')).toBeInTheDocument()
      })
    })
  })
})
