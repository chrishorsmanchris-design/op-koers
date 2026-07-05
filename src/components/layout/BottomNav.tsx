'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Sun, CalendarDays, Zap, Settings } from 'lucide-react'

const nav = [
  { href: '/dashboard', label: 'Vandaag', icon: Sun },
  { href: '/schema', label: 'Plan', icon: CalendarDays },
  { href: '/activiteiten', label: 'Activiteiten', icon: Zap },
  { href: '/instellingen', label: 'Instellingen', icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1b1b27] border-t border-[#2d2d3e] safe-bottom z-50">
      <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-5 py-1.5 rounded-2xl transition-colors',
                active ? 'text-[#f97316]' : 'text-[#55556a]'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
