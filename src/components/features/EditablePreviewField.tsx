'use client'

import { useState, useRef, useEffect } from 'react'
import { Check, X, AlertCircle, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface EditableFieldOption {
  value: string
  label: string
}

export interface EditablePreviewFieldProps {
  label: string
  icon: React.ReactNode
  value: string | null
  onChange: (value: string) => void
  options: EditableFieldOption[]
  isLoading?: boolean
  onSearch?: (query: string) => void
  placeholder?: string
  required?: boolean
  allowFreeText?: boolean
}

export function EditablePreviewField({
  label,
  icon,
  value,
  onChange,
  options,
  isLoading = false,
  onSearch,
  placeholder = 'Select...',
  required = false,
  allowFreeText = false,
}: EditablePreviewFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [freeTextValue, setFreeTextValue] = useState(value || '')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // When value changes externally, update local state
  useEffect(() => {
    setFreeTextValue(value || '')
  }, [value])

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && allowFreeText && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing, allowFreeText])

  // Handle search with debounce
  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    if (onSearch) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        onSearch(query)
      }, 300)
    }
  }

  // Handle selection from dropdown
  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue)
    setIsEditing(false)
    setSearchQuery('')
  }

  // Handle free text submission
  const handleFreeTextSubmit = () => {
    if (freeTextValue.trim()) {
      onChange(freeTextValue.trim())
    }
    setIsEditing(false)
  }

  // Handle key press in free text mode
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleFreeTextSubmit()
    } else if (e.key === 'Escape') {
      setFreeTextValue(value || '')
      setIsEditing(false)
    }
  }

  const isMissing = !value || value === ''
  const showMissingIndicator = isMissing && required
  const showOptionalIndicator = isMissing && !required

  // Render the display mode
  if (!isEditing) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className={cn(
            'flex items-center gap-2 px-2 py-1 rounded-md transition-colors',
            'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            showMissingIndicator && 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900',
            showOptionalIndicator && 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900',
            !isMissing && 'hover:bg-muted'
          )}
        >
          {showMissingIndicator ? (
            <>
              <X className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-600 dark:text-red-400">Required - click to select</span>
            </>
          ) : showOptionalIndicator ? (
            <>
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-amber-600 dark:text-amber-400 italic">Not specified</span>
            </>
          ) : (
            <>
              <span className="text-sm">{value}</span>
              <Check className="h-4 w-4 text-green-500" />
            </>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    )
  }

  // Render edit mode
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {allowFreeText ? (
          // Free text input with suggestions
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              type="text"
              value={freeTextValue}
              onChange={(e) => {
                setFreeTextValue(e.target.value)
                handleSearchChange(e.target.value)
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleFreeTextSubmit}
              placeholder={placeholder}
              className="h-8 w-48 text-sm"
              list={`${label}-options`}
            />
            {options.length > 0 && (
              <datalist id={`${label}-options`}>
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </datalist>
            )}
          </div>
        ) : (
          // Standard dropdown select
          <div className="flex flex-col gap-1">
            {onSearch && (
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search..."
                className="h-7 w-48 text-sm"
              />
            )}
            <Select
              value={value || ''}
              onValueChange={handleSelect}
              disabled={isLoading}
            >
              <SelectTrigger className="h-8 w-48">
                <SelectValue placeholder={isLoading ? 'Loading...' : placeholder} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setFreeTextValue(value || '')
            setSearchQuery('')
            setIsEditing(false)
          }}
          className="p-1 rounded hover:bg-muted"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}
