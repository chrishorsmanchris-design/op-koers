import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[#1a1a1a] rounded-3xl p-4',
        onClick && 'cursor-pointer active:scale-[0.98] transition-transform',
        className
      )}
    >
      {children}
    </div>
  )
}
