import { BottomNav } from '@/components/layout/BottomNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f3f0] pb-24">
      <main className="max-w-lg mx-auto safe-top">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
