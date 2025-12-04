'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import type { ParseTransactionResponse } from '@/types/parser'

interface ConversationalInputProps {
  onParsed: (result: ParseTransactionResponse) => void
  disabled?: boolean
}

const EXAMPLE_PROMPTS = [
  'Today I shipped 10 casepacks of 3pks to Amazon',
  'Received 500 bottles from XYZ supplier yesterday',
  'We had 15 3pk Shopify orders today',
  'Built 20 units of the 6-pack for TikTok',
  'Got in 1000 labels from our vendor',
]

export function ConversationalInput({ onParsed, disabled }: ConversationalInputProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!input.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/transactions/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Failed to parse input')
      }

      onParsed(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExampleClick = (example: string) => {
    setInput(example)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Conversational Entry
        </CardTitle>
        <CardDescription>
          Describe your transaction in natural language
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Today I shipped 10 casepacks of 3pks to Amazon"
          className="min-h-[100px]"
          disabled={disabled || isLoading}
        />

        {/* Example prompts */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Examples (click to use):</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.slice(0, 3).map((example, i) => (
              <Button
                key={i}
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-auto py-1 px-2"
                onClick={() => handleExampleClick(example)}
                disabled={disabled || isLoading}
              >
                {example.length > 35 ? `${example.substring(0, 35)}...` : example}
              </Button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Press Ctrl+Enter to submit
          </p>
          <Button
            onClick={handleSubmit}
            disabled={disabled || isLoading || !input.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Parse Transaction
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
