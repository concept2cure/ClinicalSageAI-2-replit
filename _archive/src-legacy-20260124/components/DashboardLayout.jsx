import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Home, BarChart2, FileText, User, Settings, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Dashboard Layout Component
 *
 * Provides a consistent layout for dashboard pages with:
 * - Header with title and back button
 * - Sidebar for navigation
 * - Main content area
 */
export default function DashboardLayout({ children, title, backTo }) {
  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b">
        <div className="flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-4">
            {backTo && (
              <Link href={backTo}>
                <Button variant="ghost" size="icon" className="mr-2">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
            )}
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
              {title || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* User profile or other header actions could go here */}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r hidden md:flex flex-col bg-white dark:bg-gray-900">
          <div className="flex-1 p-4">
            <ul className="space-y-2">
              <li>
                <Link href="/dashboard">
                  <a className="flex items-center gap-3 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-muted/50 rounded-md text-sm">
                    <Home className="h-4 w-4" />
                    Dashboard Home
                  </a>
                </Link>
              </li>
              <li>
                <Link href="/submissions">
                  <a className="flex items-center gap-3 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-muted/50 rounded-md text-sm">
                    <FileText className="h-4 w-4" />
                    Submissions
                  </a>
                </Link>
              </li>
              <li>
                <Link href="/analytics">
                  <a className="flex items-center gap-3 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-muted/50 rounded-md text-sm">
                    <BarChart2 className="h-4 w-4" />
                    Analytics
                  </a>
                </Link>
              </li>
              <li>
                <Link href="/profile">
                  <a className="flex items-center gap-3 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-muted/50 rounded-md text-sm">
                    <User className="h-4 w-4" />
                    Profile
                  </a>
                </Link>
              </li>
              <li>
                <Link href="/settings">
                  <a className="flex items-center gap-3 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-muted/50 rounded-md text-sm">
                    <Settings className="h-4 w-4" />
                    Settings
                  </a>
                </Link>
              </li>
            </ul>
          </div>
          <div className="p-4 border-t">
            <div className="flex items-center gap-3 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-muted/50 rounded-md text-sm cursor-pointer">
              <HelpCircle className="h-4 w-4" />
              Help & Support
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
