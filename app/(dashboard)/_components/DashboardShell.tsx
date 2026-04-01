'use client'

import React, { useState } from 'react'
import {
    LayoutDashboard,
    BookOpen,
    TrendingUp,
    ShieldAlert,
    LogOut,
    Activity,
    Settings,
    History,
    Clock,
    User as UserIcon,
    ClipboardList,
    PanelLeftClose,
    PanelLeftOpen,
    CandlestickChart,
    GraduationCap,
    Search,
    Zap,
    Share2,
    Newspaper,
    BookMarked,
    Scale,
    Calendar,
    Layers,
    FlaskConical,
    Radio,
    ScrollText,
} from 'lucide-react'
import LinkNext from 'next/link'
import { usePathname } from 'next/navigation'
import { AccountSwitcher } from '@/components/dashboard/AccountSwitcher'

interface DashboardShellProps {
    children: React.ReactNode
    user: any
}

export function DashboardShell({ children, user }: DashboardShellProps) {
    const [isCollapsed, setIsCollapsed] = useState(false)
    const pathname = usePathname()

    const navItems = [
        { label: 'Dashboard', href: '/', icon: LayoutDashboard },
        { label: 'Calendar', href: '/calendar', icon: Calendar },
        { label: 'Story', href: '/story', icon: ScrollText },
        { label: 'Trading Gurus', href: '/trading-gurus', icon: GraduationCap },
        { label: 'Market News', href: '/news', icon: Newspaper },
        { label: 'Indicator Optimization', href: '/indicator-optimization', icon: FlaskConical },
        { label: 'Trade', href: '/trade', icon: Zap },
        { label: 'Journal', href: '/journal', icon: BookOpen },
        { label: 'Positions', href: '/positions', icon: Activity },
        { label: 'Analytics', href: '/pnl', icon: TrendingUp },
        { label: 'Risk Rules', href: '/risk-rules', icon: ShieldAlert },
        { label: 'Execution Log', href: '/execution-log', icon: History },
        { label: 'AI Usage', href: '/ai-usage', icon: Layers },
        { label: 'References', href: '/references', icon: BookMarked },
        { label: 'Settings', href: '/settings', icon: Settings },
    ]

    return (
        <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
            {/* Sidebar */}
            <aside
                className={`bg-neutral-900 border-r border-neutral-800 flex flex-col transition-all duration-300 ease-in-out relative ${isCollapsed ? 'w-20' : 'w-64'}`}
            >
                <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                    <LinkNext href="/" className={`flex items-center gap-3 group ${isCollapsed ? 'hidden' : 'flex'}`}>
                        <div className="w-9 h-9 rounded-xl bg-neutral-800/50 p-1 flex items-center justify-center shadow-lg shadow-blue-500/10 group-hover:scale-105 transition-transform shrink-0 border border-neutral-700/50">
                            <img src="/logo.png" alt="TradeDesk CFD Logo" className="w-full h-full object-contain rounded-lg" />
                        </div>
                        {!isCollapsed && <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">TradeDesk CFD</span>}
                    </LinkNext>

                    {isCollapsed && (
                        <div className="w-10 h-10 rounded-xl bg-neutral-800/50 p-1.5 flex items-center justify-center shadow-lg shadow-blue-500/10 mb-2 border border-neutral-700/50 hover:scale-105 transition-transform cursor-pointer" onClick={() => setIsCollapsed(false)}>
                            <img src="/logo.png" alt="TradeDesk CFD" className="w-full h-full object-contain rounded-lg" />
                        </div>
                    )}

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className={`p-2 rounded-xl hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all ${isCollapsed ? 'hidden' : ''}`}
                            title={isCollapsed ? "Expand" : "Collapse"}
                        >
                            {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                        </button>

                        {isCollapsed && (
                            <button
                                onClick={() => setIsCollapsed(false)}
                                className="p-2 rounded-xl hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all"
                                title="Expand"
                            >
                                <PanelLeftOpen size={20} />
                            </button>
                        )}
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto overflow-x-hidden scrollbar-none">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href
                        return (
                            <div key={item.label} className="relative group">
                                <LinkNext
                                    href={item.href}
                                    className={`flex items-center rounded-xl transition-all h-11 ${isCollapsed ? 'justify-center px-0' : 'px-3 gap-3'
                                        } ${isActive
                                            ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20'
                                            : 'hover:bg-neutral-800 text-neutral-400 hover:text-white border border-transparent'
                                        }`}
                                    title={isCollapsed ? item.label : ""}
                                >
                                    <item.icon size={20} className={`shrink-0 ${isActive ? 'text-blue-400' : 'text-neutral-500'}`} />
                                    {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.label}</span>}
                                </LinkNext>
                                {isCollapsed && (
                                    <div className="absolute left-full ml-4 px-2 py-1 bg-neutral-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap font-bold uppercase tracking-widest border border-neutral-700">
                                        {item.label}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </nav>

                <div className="p-4 mt-auto border-t border-neutral-800">
                    <div className={`flex items-center rounded-xl bg-neutral-800/30 mb-4 transition-all ${isCollapsed ? 'justify-center p-2' : 'px-3 py-3 gap-3'}`}>
                        <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center overflow-hidden shrink-0">
                            <UserIcon size={18} className="text-neutral-400" />
                        </div>
                        {!isCollapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{user.email}</p>
                            </div>
                        )}
                    </div>

                    <form action="/auth/signout" method="post">
                        <button
                            type="submit"
                            className={`flex items-center text-neutral-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all h-10 w-full ${isCollapsed ? 'justify-center' : 'px-3 gap-3'
                                }`}
                            title={isCollapsed ? "Sign Out" : ""}
                        >
                            <LogOut size={20} className="shrink-0" />
                            {!isCollapsed && <span className="font-medium whitespace-nowrap">Sign Out</span>}
                        </button>
                    </form>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-14 border-b border-neutral-800 flex items-center px-6 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <h2 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em]">
                            {navItems.find(i => i.href === pathname)?.label || 'Terminal'}
                        </h2>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <AccountSwitcher />
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">System Ready</span>
                        </div>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    {children}
                </div>
            </main>
        </div>
    )
}
