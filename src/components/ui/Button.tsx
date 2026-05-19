'use client'
import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-semibold rounded-2xl transition-all active:scale-95',
          {
            'bg-[#f97316] text-white hover:bg-[#ea6c0a]': variant === 'primary',
            'bg-[#f0ede8] text-[#1a1612] hover:bg-[#e8e3dc]': variant === 'secondary',
            'text-[#a09990] hover:text-[#1a1612] hover:bg-[#f0ede8]': variant === 'ghost',
            'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
            'bg-green-500 text-white': variant === 'success',
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-3 text-base': size === 'md',
            'px-6 py-4 text-lg w-full': size === 'lg',
            'opacity-50 cursor-not-allowed active:scale-100': disabled || loading,
          },
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {children}
          </span>
        ) : children}
      </button>
    )
  }
)
Button.displayName = 'Button'
