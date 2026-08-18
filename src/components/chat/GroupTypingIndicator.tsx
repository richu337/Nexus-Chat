import { useMemo } from 'react'

interface GroupTypingIndicatorProps {
  typingNames: string[]
}

export function GroupTypingIndicator({ typingNames }: GroupTypingIndicatorProps) {
  const text = useMemo(() => {
    if (typingNames.length === 0) return ''
    if (typingNames.length === 1) return `${typingNames[0]} is typing`
    if (typingNames.length === 2) return `${typingNames[0]} and ${typingNames[1]} are typing`
    return `${typingNames[0]} and ${typingNames.length - 1} others are typing`
  }, [typingNames])

  if (!text) return null

  return (
    <span className="text-xs text-slate-500 dark:text-slate-400 italic">
      {text}...
    </span>
  )
}
