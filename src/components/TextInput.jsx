import React, { useRef, useEffect } from 'react'

/**
 * Marathi / Devanagari-safe text input for Capacitor Android.
 *
 * WHY TWO BUGS EXISTED BEFORE:
 *
 * Bug 1 — captureInput:true in capacitor.config.json
 *   That setting intercepts keyboard events for hardware keyboards.
 *   For Gboard's Devanagari soft-keyboard it blocks the IME channel
 *   so characters never reach the WebView at all. Fixed in config.
 *
 * Bug 2 — blocking onChange when isComposing === true
 *   Gboard Marathi holds isComposing=true for the entire word-suggestion
 *   session. The old guard `if (!isComposing) onChange()` meant onChange
 *   was never called while typing — search didn't filter, forms only saved
 *   stale values until the user tapped away.
 *
 * THIS COMPONENT'S STRATEGY:
 *   - Use `defaultValue` (uncontrolled) so React NEVER overwrites the DOM
 *     value after the initial render. This is the only thing that truly
 *     prevents the "character appears then vanishes" bug.
 *   - Pass `onChange` straight through — fires on every keystroke, keeps
 *     parent state in sync in real time (search filtering works).
 *   - `useEffect` syncs external value → DOM **only when not focused**
 *     (handles programmatic reset / form-clear from the parent).
 *   - `onBlur` fires onChange once more to guarantee the final committed
 *     value reaches the parent even if a keyboard committed silently.
 */
export default function TextInput({
  value,
  onChange,
  className = 'form-input',
  onFocus: onFocusProp,
  onBlur:  onBlurProp,
  ...props
}) {
  const inputRef  = useRef(null)
  const isFocused = useRef(false)

  // Sync only when the parent changes the value from outside
  // (e.g. form reset, clear button) — never overwrite while the user is typing
  useEffect(() => {
    const el = inputRef.current
    if (el && !isFocused.current && el.value !== (value ?? '')) {
      el.value = value ?? ''
    }
  }, [value])

  return (
    <input
      ref={inputRef}
      className={className}
      defaultValue={value ?? ''}
      onChange={onChange}
      onFocus={e => {
        isFocused.current = true
        onFocusProp?.(e)
      }}
      onBlur={e => {
        isFocused.current = false
        onChange?.(e)     // guarantee final committed value reaches parent
        onBlurProp?.(e)
      }}
      {...props}
    />
  )
}
