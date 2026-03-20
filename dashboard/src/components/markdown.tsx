import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  children: string
  className?: string
  /** Compact mode: tighter spacing, smaller text for inline/card previews */
  compact?: boolean
}

export function Markdown({ children, className, compact }: MarkdownProps) {
  return (
    <div className={cn(
      'prose prose-sm dark:prose-invert max-w-none',
      'prose-p:my-1.5 prose-headings:mb-2 prose-headings:mt-4 prose-headings:first:mt-0',
      'prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5',
      'prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-md prose-pre:p-3',
      'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none',
      'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
      'prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground',
      'prose-table:text-sm prose-th:text-left',
      'prose-hr:my-3',
      compact && 'prose-p:my-0.5 prose-headings:text-sm text-xs leading-relaxed',
      className
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
