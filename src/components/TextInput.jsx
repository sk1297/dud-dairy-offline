import React, { useRef, useEffect } from 'react'

/**
 * IME-safe text input — fixes Marathi / Devanagari keyboard input.
 *
 * React controlled inputs fire onChange during IME composition which
 * causes a re-render that resets the partially-typed character.
 * This component buffers the value locally during composition and only
 * calls onChange once the IME commits the final character.
 */
export default function TextInput({ value, onChange, className = 'form-input', ...props }) {
  const composing = useRef(false)
  const inputRef  = useRef(null)

  // Keep the DOM in sync with external value changes (e.g. form reset)
  // but never overwrite while the user is mid-composition.
  useEffect(() => {
    if (!composing.current && inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value ?? ''
    }
  }, [value])

  return (
    <input
      ref={inputRef}
      className={className}
      defaultValue={value}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={e => {
        composing.current = false
        onChange?.(e)
      }}
      onChange={e => {
        if (!composing.current) onChange?.(e)
      }}
      onBlur={e => {
        // Ensure value is synced on blur in case compositionEnd didn't fire
        if (composing.current) {
          composing.current = false
          onChange?.(e)
        }
      }}
      {...props}
    />
  )
}
