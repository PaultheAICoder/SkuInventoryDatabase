'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Bug, Lightbulb, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import type { FeedbackType, FeedbackStep } from '@/types/feedback'
import { WHO_BENEFITS_OPTIONS } from '@/types/feedback'

// Response validation helper
function isValidApiResponse<T>(data: unknown, validator: (d: unknown) => d is T): data is { data: T } {
  return (
    data !== null &&
    typeof data === 'object' &&
    'data' in data &&
    validator((data as { data: unknown }).data)
  )
}

// Type guards for API responses
function isClarifyData(data: unknown): data is { questions: string[] } {
  return (
    data !== null &&
    typeof data === 'object' &&
    'questions' in data &&
    Array.isArray((data as { questions: unknown }).questions)
  )
}

function isSubmitFeedbackData(data: unknown): data is { issueUrl: string; issueNumber: number } {
  return (
    data !== null &&
    typeof data === 'object' &&
    'issueUrl' in data &&
    typeof (data as { issueUrl: unknown }).issueUrl === 'string' &&
    'issueNumber' in data &&
    typeof (data as { issueNumber: unknown }).issueNumber === 'number'
  )
}

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [step, setStep] = useState<FeedbackStep>('select-type')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [feedbackType, setFeedbackType] = useState<FeedbackType | ''>('')
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [issueUrl, setIssueUrl] = useState('')

  // New structured fields
  const [pageUrl, setPageUrl] = useState('')
  const [title, setTitle] = useState('')
  // Bug-specific fields
  const [expectedBehavior, setExpectedBehavior] = useState('')
  const [actualBehavior, setActualBehavior] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState('')
  // Feature-specific fields
  const [whoBenefits, setWhoBenefits] = useState('')
  const [desiredAction, setDesiredAction] = useState('')
  const [businessValue, setBusinessValue] = useState('')

  // Capture page URL when dialog opens
  useEffect(() => {
    if (open) {
      setPageUrl(window.location.href)
    }
  }, [open])

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Small delay to allow animation to complete
      const timer = setTimeout(() => {
        setStep('select-type')
        setFeedbackType('')
        setQuestions([])
        setAnswers([])
        setIssueUrl('')
        setError(null)
        // Reset structured fields
        setPageUrl('')
        setTitle('')
        setExpectedBehavior('')
        setActualBehavior('')
        setStepsToReproduce('')
        setScreenshotUrl('')
        setWhoBenefits('')
        setDesiredAction('')
        setBusinessValue('')
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  const handleTypeSelect = (type: FeedbackType) => {
    setFeedbackType(type)
    setStep('structured-fields')
  }

  // Validation function for structured fields
  const isStructuredFieldsValid = () => {
    if (title.length < 5) return false

    if (feedbackType === 'bug') {
      return expectedBehavior.length >= 10 &&
             actualBehavior.length >= 10 &&
             stepsToReproduce.length >= 10
    } else {
      return whoBenefits !== '' &&
             desiredAction.length >= 10 &&
             businessValue.length >= 10
    }
  }

  const handleStructuredFieldsSubmit = async () => {
    if (!isStructuredFieldsValid()) {
      setError('Please fill in all required fields')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const requestBody = {
        type: feedbackType,
        pageUrl,
        title,
        ...(feedbackType === 'bug' && {
          expectedBehavior,
          actualBehavior,
          stepsToReproduce,
          screenshotUrl: screenshotUrl || undefined,
        }),
        ...(feedbackType === 'feature' && {
          whoBenefits,
          desiredAction,
          businessValue,
        }),
      }

      const res = await fetch('/api/feedback/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to get clarifying questions')
      }

      const data = await res.json()

      // Validate response structure
      if (!isValidApiResponse(data, isClarifyData)) {
        throw new Error('Invalid response from server. Please try again.')
      }

      // Initialize answers array based on number of questions received
      setQuestions(data.data.questions)
      setAnswers(new Array(data.data.questions.length).fill(''))
      setStep('clarify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    // Validate all answers provided
    if (answers.some((a) => a.trim().length === 0)) {
      setError('Please answer all questions')
      return
    }

    setIsLoading(true)
    setError(null)
    setStep('submitting')

    try {
      const requestBody = {
        type: feedbackType,
        pageUrl,
        title,
        ...(feedbackType === 'bug' && {
          expectedBehavior,
          actualBehavior,
          stepsToReproduce,
          screenshotUrl: screenshotUrl || undefined,
        }),
        ...(feedbackType === 'feature' && {
          whoBenefits,
          desiredAction,
          businessValue,
        }),
        answers,
      }

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to submit feedback')
      }

      const data = await res.json()

      // Validate response structure
      if (!isValidApiResponse(data, isSubmitFeedbackData)) {
        throw new Error('Invalid response from server. Your feedback may have been submitted. Please check GitHub.')
      }

      setIssueUrl(data.data.issueUrl)
      setStep('success')
      toast.success('Feedback submitted!', {
        description: `Issue #${data.data.issueNumber} created successfully.`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStep('error')
      toast.error('Submission failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    if (step === 'structured-fields') {
      setStep('select-type')
      setFeedbackType('')
    } else if (step === 'clarify') {
      setStep('structured-fields')
    } else if (step === 'error') {
      setStep('clarify')
    }
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {/* Step 1: Select Type */}
        {step === 'select-type' && (
          <>
            <DialogHeader>
              <DialogTitle>Submit Feedback</DialogTitle>
              <DialogDescription>
                Help us improve! What type of feedback do you have?
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <button
                type="button"
                onClick={() => handleTypeSelect('bug')}
                className="flex items-center gap-4 rounded-lg border p-4 text-left hover:bg-muted transition-colors"
              >
                <Bug className="h-8 w-8 text-destructive" />
                <div>
                  <p className="font-medium">Report a Bug</p>
                  <p className="text-sm text-muted-foreground">
                    Something isn&apos;t working as expected
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTypeSelect('feature')}
                className="flex items-center gap-4 rounded-lg border p-4 text-left hover:bg-muted transition-colors"
              >
                <Lightbulb className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="font-medium">Request a Feature</p>
                  <p className="text-sm text-muted-foreground">
                    Suggest a new feature or improvement
                  </p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* Step 2: Structured Fields */}
        {step === 'structured-fields' && (
          <>
            <DialogHeader>
              <DialogTitle>
                {feedbackType === 'bug' ? 'Report a Bug' : 'Request a Feature'}
              </DialogTitle>
              <DialogDescription>
                Please provide details about your {feedbackType === 'bug' ? 'issue' : 'request'}.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 max-h-[400px] overflow-y-auto">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Page URL (read-only) */}
              <div className="grid gap-2">
                <Label htmlFor="pageUrl">Page URL</Label>
                <Input
                  id="pageUrl"
                  value={pageUrl}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-captured from current page
                </p>
              </div>

              {/* Title */}
              <div className="grid gap-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="Brief summary of your feedback"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={255}
                />
                <p className="text-xs text-muted-foreground">
                  {title.length}/255 characters (minimum 5)
                </p>
              </div>

              {/* Bug-specific fields */}
              {feedbackType === 'bug' && (
                <>
                  {/* Expected Behavior */}
                  <div className="grid gap-2">
                    <Label htmlFor="expectedBehavior">What should happen? *</Label>
                    <Textarea
                      id="expectedBehavior"
                      placeholder="Describe the expected behavior..."
                      value={expectedBehavior}
                      onChange={(e) => setExpectedBehavior(e.target.value)}
                      className="min-h-[80px]"
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground">
                      {expectedBehavior.length}/2000 characters (minimum 10)
                    </p>
                  </div>

                  {/* Actual Behavior */}
                  <div className="grid gap-2">
                    <Label htmlFor="actualBehavior">What actually happens? *</Label>
                    <Textarea
                      id="actualBehavior"
                      placeholder="Describe what's actually happening..."
                      value={actualBehavior}
                      onChange={(e) => setActualBehavior(e.target.value)}
                      className="min-h-[80px]"
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground">
                      {actualBehavior.length}/2000 characters (minimum 10)
                    </p>
                  </div>

                  {/* Steps to Reproduce */}
                  <div className="grid gap-2">
                    <Label htmlFor="stepsToReproduce">Steps to reproduce *</Label>
                    <Textarea
                      id="stepsToReproduce"
                      placeholder={"1. Go to...\n2. Click on...\n3. See error..."}
                      value={stepsToReproduce}
                      onChange={(e) => setStepsToReproduce(e.target.value)}
                      className="min-h-[100px]"
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground">
                      {stepsToReproduce.length}/2000 characters (minimum 10)
                    </p>
                  </div>

                  {/* Screenshot URL (optional) */}
                  <div className="grid gap-2">
                    <Label htmlFor="screenshotUrl">Screenshot URL (optional)</Label>
                    <Input
                      id="screenshotUrl"
                      type="url"
                      placeholder="https://..."
                      value={screenshotUrl}
                      onChange={(e) => setScreenshotUrl(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Feature-specific fields */}
              {feedbackType === 'feature' && (
                <>
                  {/* Who Benefits */}
                  <div className="grid gap-2">
                    <Label htmlFor="whoBenefits">Who would benefit from this? *</Label>
                    <Select value={whoBenefits} onValueChange={setWhoBenefits}>
                      <SelectTrigger id="whoBenefits">
                        <SelectValue placeholder="Select who benefits" />
                      </SelectTrigger>
                      <SelectContent>
                        {WHO_BENEFITS_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Desired Action */}
                  <div className="grid gap-2">
                    <Label htmlFor="desiredAction">What action do you want to be able to do? *</Label>
                    <Textarea
                      id="desiredAction"
                      placeholder="Describe what you'd like to be able to do..."
                      value={desiredAction}
                      onChange={(e) => setDesiredAction(e.target.value)}
                      className="min-h-[100px]"
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground">
                      {desiredAction.length}/2000 characters (minimum 10)
                    </p>
                  </div>

                  {/* Business Value */}
                  <div className="grid gap-2">
                    <Label htmlFor="businessValue">Why does this matter? *</Label>
                    <Textarea
                      id="businessValue"
                      placeholder="Explain the benefits and why this is important..."
                      value={businessValue}
                      onChange={(e) => setBusinessValue(e.target.value)}
                      className="min-h-[100px]"
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground">
                      {businessValue.length}/2000 characters (minimum 10)
                    </p>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Button
                type="button"
                onClick={handleStructuredFieldsSubmit}
                disabled={isLoading || !isStructuredFieldsValid()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Getting Questions...
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Answer Clarifying Questions */}
        {step === 'clarify' && (
          <>
            <DialogHeader>
              <DialogTitle>A Few Quick Questions</DialogTitle>
              <DialogDescription>
                Help us understand your {feedbackType === 'bug' ? 'issue' : 'request'} better.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 max-h-[400px] overflow-y-auto">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {questions.map((question, index) => (
                <div key={index} className="grid gap-2">
                  <Label htmlFor={`answer-${index}`} className="text-sm font-medium">
                    {question}
                  </Label>
                  <Textarea
                    id={`answer-${index}`}
                    placeholder="Your answer..."
                    value={answers[index] || ''}
                    onChange={(e) => {
                      const newAnswers = [...answers]
                      newAnswers[index] = e.target.value
                      setAnswers(newAnswers)
                    }}
                    className="min-h-[80px]"
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || answers.some((a) => a.trim().length === 0)}
              >
                Submit Feedback
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 4: Submitting */}
        {step === 'submitting' && (
          <>
            <DialogHeader>
              <DialogTitle>Submitting Feedback</DialogTitle>
              <DialogDescription>
                Creating your GitHub issue...
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Please wait...</p>
            </div>
          </>
        )}

        {/* Step 5: Success */}
        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Thank You!</DialogTitle>
              <DialogDescription>
                Your feedback has been submitted successfully.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="mt-4 text-center text-sm text-muted-foreground">
                A GitHub issue has been created for your feedback.
              </p>
              {issueUrl && (
                <a
                  href={issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  View Issue
                </a>
              )}
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 6: Error */}
        {step === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>Submission Failed</DialogTitle>
              <DialogDescription>
                We couldn&apos;t submit your feedback.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="mt-4 text-center text-sm text-destructive">
                {error || 'An unexpected error occurred. Please try again.'}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleBack}>
                Try Again
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
