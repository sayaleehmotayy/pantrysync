import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, ChefHat, MessageCircle, Settings, Clock, Activity, MoreHorizontal, X, Sparkles, Tag, Receipt, DollarSign, History } from 'lucide-react';
import pantrySyncLogo from '@/assets/pantry-sync-logo.png';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/pantry', icon: Package, label: 'Pantry' },
  { to: '/shopping', icon: ShoppingCart, label: 'Shopping' },
  { to: '/recipes', icon: ChefHat, label: 'Recipes' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
];

const moreItems = [
  { to: '/shopping-history', icon: History, label: 'History' },
  { to: '/spending', icon: DollarSign, label: 'Spending' },
  { to: '/receipts', icon: Receipt, label: 'Receipts' },
  { to: '/coupons', icon: Tag, label: 'Coupons' },
  { to: '/ai', icon: Sparkles, label: 'AI Assistant' },
  { to: '/expiry', icon: Clock, label: 'Expiry' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const allSidebarItems = [...navItems, ...moreItems];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = moreItems.some(i => i.to === location.pathname);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-border bg-card p-4 gap-1">
        <div className="flex items-center gap-2 px-3 py-4 mb-4">
          <div className="w-8 h-8 rounded-xl overflow-hidden">
            <img src={pantrySyncLogo} alt="PantrySync" className="w-8 h-8 object-contain" />
          </div>
          <span className="font-display font-bold text-lg">PantrySync</span>
        </div>
        {allSidebarItems.map(item => {
          const active = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          );
        })}
      </aside>

      {/* Main content */}
      <main
        className="flex-1 p-4 md:pb-4 md:p-6 max-w-3xl md:mx-auto w-full"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)',
        }}
      >
        {children}
      </main>

      {/* Mobile "More" overlay */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div
            className="relative w-full bg-card rounded-t-2xl p-4 animate-slide-up shadow-xl max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-sm">More</h3>
              <button onClick={() => setMoreOpen(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {moreItems.map(item => {
                const active = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border px-1 pt-1 z-40"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.25rem)' }}
      >
        <div className="grid grid-cols-6">
          {navItems.map(item => {
            const active = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-all duration-200 truncate w-full ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className={`w-5 h-5 transition-transform duration-200 ${active ? 'text-primary scale-110' : ''}`} />
                <span className="truncate max-w-full">{item.label}</span>
              </NavLink>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-all duration-200 w-full ${
              moreActive ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <MoreHorizontal className={`w-5 h-5 transition-transform duration-200 ${moreActive ? 'text-primary scale-110' : ''}`} />
            <span className="truncate max-w-full">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
