import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  BarChart2,
  PieChart,
  Layout,
  Beaker, // Using Beaker instead of Flask since Flask is not available
  FileCheck,
  Layers,
  Search,
  User,
  Settings,
  LogOut,
  Menu,
  Bell,
  Sun,
  Moon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [location] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState("light");
  const { toast } = useToast();

  const isActive = (path: string) => {
    return location === path;
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark");
  };

  const menuItems = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: <Layout size={20} />
    },
    {
      name: "CSR Intelligence",
      path: "/csr-intelligence",
      icon: <FileText size={20} />
    },
    {
      name: "Protocol Optimizer",
      path: "/protocol-optimization",
      icon: <FileCheck size={20} />
    },
    {
      name: "IND Submissions",
      path: "/ind-automation",
      icon: <Layers size={20} />
    },
    {
      name: "CER Reports",
      path: "/cer-dashboard",
      icon: <FileText size={20} />
    },
    {
      name: "Analytics",
      path: "/success-rate-analytics",
      icon: <BarChart2 size={20} />
    },
    {
      name: "CSR Library",
      path: "/csr-library",
      icon: <Search size={20} />
    },
    {
      name: "Assistant",
      path: "/assistant",
      icon: <Beaker size={20} />
    }
  ];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900">
      {/* Sidebar */}
      <div
        className={`fixed h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 z-20 ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
            {!sidebarCollapsed && (
              <Link href="/">
                <a className="text-emerald-600 dark:text-emerald-500 font-bold text-xl">
                  TrialSage
                </a>
              </Link>
            )}
            {sidebarCollapsed && (
              <Link href="/">
                <a className="text-emerald-600 dark:text-emerald-500 font-bold text-xl">
                  TS
                </a>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </Button>
          </div>

          {/* Navigation links */}
          <div className="flex-1 overflow-y-auto py-4">
            <nav className="space-y-1 px-2">
              {menuItems.map((item) => (
                <Link key={item.path} href={item.path}>
                  <a
                    className={`flex items-center ${
                      sidebarCollapsed ? "justify-center" : "justify-start"
                    } px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(item.path)
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-500"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
                  </a>
                </Link>
              ))}
            </nav>
          </div>

          {/* Bottom actions */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className="space-y-3">
              <Link href="/settings">
                <a
                  className={`flex items-center ${
                    sidebarCollapsed ? "justify-center" : "justify-start"
                  } px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 transition-colors`}
                >
                  <Settings size={20} />
                  {!sidebarCollapsed && <span className="ml-3">Settings</span>}
                </a>
              </Link>
              <button
                onClick={toggleTheme}
                className={`flex items-center ${
                  sidebarCollapsed ? "justify-center w-full" : "justify-start"
                } px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 transition-colors`}
              >
                {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                {!sidebarCollapsed && (
                  <span className="ml-3">{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        className={`flex flex-col flex-1 transition-all duration-300 ${
          sidebarCollapsed ? "ml-16" : "ml-64"
        }`}
      >
        {/* Top navbar */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 z-10">
          <div className="flex items-center">
            <button
              className="lg:hidden mr-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <Menu size={20} />
            </button>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
              {menuItems.find((item) => isActive(item.path))?.name || "Dashboard"}
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                // toast call replaced
  // Original: toast({
                  title: "Notifications",
                  description: "No new notifications at this time."
                })
  console.log('Toast would show:', {
                  title: "Notifications",
                  description: "No new notifications at this time."
                });
              }}
              aria-label="Notifications"
            >
              <Bell size={20} />
            </Button>
            <Link href="/profile">
              <a className="flex items-center text-gray-700 dark:text-gray-200 hover:text-emerald-600 dark:hover:text-emerald-500">
                <User size={20} />
                <span className="ml-2 hidden md:inline">Profile</span>
              </a>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;