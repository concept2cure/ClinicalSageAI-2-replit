import React from 'react';
import { Menu, Bell, User, Search, Settings, Database, Bot } from 'lucide-react';
import { useResearchCompanion } from '@/hooks/use-research-companion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface TopNavbarProps {
  toggleSidebar: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function TopNavbar({ toggleSidebar, searchQuery, setSearchQuery }: TopNavbarProps) {
  const { toggleCompanion, isEnabled } = useResearchCompanion();
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center flex-shrink-0">
            <button
              type="button"
              className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40 lg:hidden dark:hover:bg-slate-800 dark:hover:text-slate-300"
              onClick={toggleSidebar}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 mx-4 lg:mx-6 xl:mx-8">
            <div className="max-w-lg w-full lg:max-w-xs relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <Input
                type="search"
                className="pl-10 h-9 text-sm border-slate-200 bg-slate-50 focus-visible:ring-primary/30 dark:bg-slate-800 dark:border-slate-700"
                placeholder="Search reports, biomarkers, endpoints..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className={`relative rounded-full h-9 w-9 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                isEnabled ? '' : 'opacity-50'
              }`}
              onClick={toggleCompanion}
              title={
                isEnabled ? 'Open Research Companion' : 'Enable Research Companion in Settings'
              }
            >
              <Bot className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative rounded-full h-9 w-9 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Bell className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  <Badge
                    className="absolute top-1.5 right-1.5 h-2 w-2 p-0 bg-red-500 border-white"
                    variant="destructive"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex justify-between items-center">
                  <span>Notifications</span>
                  <Badge variant="outline" className="text-xs font-normal">
                    2 new
                  </Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-80 overflow-y-auto">
                  <DropdownMenuItem className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                    <div className="flex gap-3 items-start">
                      <div className="bg-green-100 p-2 rounded-full dark:bg-green-900/30">
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          CSR Processing Complete
                        </p>
                        <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                          Your uploaded CSR "Tofersen Phase 3" has been processed successfully.
                        </p>
                        <p className="text-xs text-slate-400 mt-2 dark:text-slate-500">
                          10 minutes ago
                        </p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                    <div className="flex gap-3 items-start">
                      <div className="bg-blue-100 p-2 rounded-full dark:bg-blue-900/30">
                        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          New Analytics Available
                        </p>
                        <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                          Predictive analysis for your ALS trials is now available.
                        </p>
                        <p className="text-xs text-slate-400 mt-2 dark:text-slate-500">
                          1 hour ago
                        </p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="justify-center hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <span className="text-xs font-medium text-primary">View all notifications</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
                >
                  <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-white text-sm">
                      JD
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:block text-sm font-medium">John Doe</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1">
                <DropdownMenuLabel className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  john.doe@example.com
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="focus:bg-slate-50 dark:focus:bg-slate-800 cursor-pointer flex items-center gap-2 py-1.5">
                  <User className="h-4 w-4 text-slate-500" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="focus:bg-slate-50 dark:focus:bg-slate-800 cursor-pointer flex items-center gap-2 py-1.5">
                  <Settings className="h-4 w-4 text-slate-500" />
                  <span>Account Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="focus:bg-slate-50 dark:focus:bg-slate-800 cursor-pointer flex items-center gap-2 py-1.5">
                  <Database className="h-4 w-4 text-slate-500" />
                  <span>API Keys</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="focus:bg-red-50 dark:focus:bg-red-900/20 cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 py-1.5">
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
