'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, CalendarDays, Dumbbell, Settings } from 'lucide-react'

const nav = [
  { href: '/dashboard', label: 'Vandaag', icon: LayoutDashboard },
  { href: '/schema', label: 'Schema', icon: CalendarDays },
  { href: '/fysio', label: 'Fysio', icon: Dumbbell },
  { href: '/instellingen', label: 'Profiel', icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8e3dc] safe-bottom z-50">
      <div className="flex items-center justify-around px-2 py-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-1 rounded-2xl transition-colors',
                active ? 'text-[#f97316]' : 'text-[#a09990]'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
