'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessageSquare, ClipboardList } from 'lucide-react'
import { QuickEntryForm } from './QuickEntryForm'
import { ConversationalInput } from './ConversationalInput'
import { ParsedTransactionPreview } from './ParsedTransactionPreview'
import type { ParseTransactionResponse, ParsedTransaction } from '@/types/parser'

type EntryMode = 'form' | 'conversational' | 'preview'

export function QuickEntryWrapper() {
  const router = useRouter()
  const [mode, setMode] = useState<EntryMode>('form')
  const [parsedResult, setParsedResult] = useState<ParseTransactionResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

  const handleParsed = (result: ParseTransactionResponse) => {
    setParsedResult(result)
    setMode('preview')
    setSubmitError(null)
    setSubmitSuccess(null)
  }

  const handleEditManually = () => {
    // Navigate to form mode with pre-filled data via URL params
    if (parsedResult) {
      const parsed = parsedResult.parsed
      const params = new URLSearchParams()
      params.set('type', parsed.transactionType.value)

      if (parsed.transactionType.value === 'outbound' && parsed.itemId.value) {
        params.set('skuId', parsed.itemId.value)
        if (parsed.salesChannel?.value) {
          params.set('channel', parsed.salesChannel.value)
        }
      } else if (parsed.itemId.value) {
        params.set('componentId', parsed.itemId.value)
      }

      // Navigate with params
      router.push(`/transactions/new?${params.toString()}`)
      setMode('form')
    }
  }

  const handleCancel = () => {
    setMode('conversational')
    setParsedResult(null)
    setSubmitError(null)
  }

  const submitParsedTransaction = useCallback(async (parsed: ParsedTransaction) => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      let endpoint: string
      let payload: Record<string, unknown>

      const transactionType = parsed.transactionType.value
      const date = parsed.date.value instanceof Date
        ? parsed.date.value.toISOString().split('T')[0]
        : new Date(parsed.date.value).toISOString().split('T')[0]

      if (transactionType === 'receipt') {
        endpoint = '/api/transactions/receipt'
        payload = {
          componentId: parsed.itemId.value,
          date,
          quantity: parsed.quantity.value,
          supplier: parsed.supplier?.value || 'Unknown',
          notes: parsed.notes?.value || `Parsed from: "${parsed.originalInput}"`,
        }
      } else if (transactionType === 'outbound') {
        endpoint = '/api/transactions/outbound'
        payload = {
          skuId: parsed.itemId.value,
          date,
          quantity: parsed.quantity.value,
          salesChannel: parsed.salesChannel?.value || 'Generic',
          notes: parsed.notes?.value || `Parsed from: "${parsed.originalInput}"`,
        }
      } else {
        // adjustment
        endpoint = '/api/transactions/adjustment'
        payload = {
          componentId: parsed.itemId.value,
          date,
          quantity: -Math.abs(parsed.quantity.value), // Default to negative for adjustments
          reason: parsed.reason?.value || 'Adjustment',
          notes: parsed.notes?.value || `Parsed from: "${parsed.originalInput}"`,
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to record transaction')
      }

      // Success
      setSubmitSuccess(`Transaction recorded successfully! (${transactionType})`)
      return true
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An error occurred')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const handleConfirm = async () => {
    if (!parsedResult) return

    const success = await submitParsedTransaction(parsedResult.parsed)
    if (success) {
      // Stay in preview mode showing success, or reset for another
    }
  }

  const handleRecordAnother = () => {
    setParsedResult(null)
    setSubmitSuccess(null)
    setSubmitError(null)
    setMode('conversational')
  }

  // If we successfully submitted, show success state
  if (submitSuccess && mode === 'preview') {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-green-50 border border-green-200 p-4 text-green-800 dark:bg-green-950 dark:border-green-900 dark:text-green-200">
          <p className="font-medium">{submitSuccess}</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleRecordAnother}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Record Another
          </button>
          <button
            onClick={() => router.push('/transactions')}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          >
            View Transactions
          </button>
        </div>
      </div>
    )
  }

  return (
    <Tabs
      value={mode === 'preview' ? 'conversational' : mode}
      onValueChange={(value) => {
        if (value === 'form' || value === 'conversational') {
          setMode(value)
          if (value === 'form') {
            setParsedResult(null)
          }
        }
      }}
      className="space-y-4"
    >
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="form" className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Quick Entry
        </TabsTrigger>
        <TabsTrigger value="conversational" className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Natural Language
        </TabsTrigger>
      </TabsList>

      <TabsContent value="form" className="space-y-4">
        <QuickEntryForm />
      </TabsContent>

      <TabsContent value="conversational" className="space-y-4">
        {mode === 'preview' && parsedResult ? (
          <div className="space-y-4">
            {submitError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}
            <ParsedTransactionPreview
              result={parsedResult}
              onConfirm={handleConfirm}
              onEdit={handleEditManually}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          </div>
        ) : (
          <ConversationalInput
            onParsed={handleParsed}
            disabled={isSubmitting}
          />
        )}
      </TabsContent>
    </Tabs>
  )
}
