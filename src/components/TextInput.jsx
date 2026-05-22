import React, { useRef, useEffect } from 'react'

/**
 * IME-safe text input — fixes Marathi / Devanagari keyboard input on Android.
 *
 * WHY THIS EXISTS:
 * Android WebView (Capacitor) does NOT reliably fire compositionstart /
 * compositionend events for Gboard / Devanagari IME. The old composition-
 * event approach breaks — the keyboard commits a character, React re-renders
 * with the old value, and the typed Marathi character disappears.
 *
 * FIX:
 * - Use an uncontrolled input (defaultValue, not value) so React never
 *   overwrites the DOM during active typing.
 * - Listen to the native `onInput` event and check `e.nativeEvent.isComposing`
 *   which works at the browser engine level even when composition events
 *   don't fire (Android WebView behaviour).
 * - Sync external value → DOM only when the input is NOT focused
 *   (e.g. form reset, programmatic clear).
 * - Always sync on blur so the parent state is fully up to date.
 */
export default function TextInput({ value, onChange, className = 'form-input', ...props }) {
  const inputRef  = useRef(null)
  const isFocused = useRef(false)

  // Sync external value changes into the DOM — only when not focused
  useEffect(() => {
    const el = inputRef.current
    if (!el || isFocused.current) return
    if (el.value !== (value ?? '')) {
      el.value = value ?? ''
    }
  }, [value])

  return (
    <input
      ref={inputRef}
      className={className}
      defaultValue={value}
      onFocus={() => { isFocused.current = true }}
      onBlur={e => {
        isFocused.current = false
        // Always fire onChange on blur so parent state is fully in sync
        onChange?.(e)
      }}
      onInput={e => {
        // isComposing works in Android WebView even when compositionstart /
        // compositionend events do not fire reliably for Devanagari IME
        if (!e.nativeEvent.isComposing) {
          onChange?.(e)
        }
      }}
      {...props}
    />
  )
}
