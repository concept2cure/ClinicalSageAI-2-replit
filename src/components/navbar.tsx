import { useState } from 'react';
import { Link } from 'wouter';
import {
  FileSearch,
  BarChart2,
  FileText,
  Menu,
  X,
  Layers,
  DollarSign,
  Lightbulb,
  Code,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex h-16 items-center justify-between px-4 md:px-6">
      <Link href="/" className="flex items-center">
        <FileSearch className="h-6 w-6 text-primary" />
        <span className="ml-2 text-xl font-semibold">TrialSage</span>
      </Link>
      <div className="flex items-center gap-4">
        {/* Use Case Library Link */}
        <Link
          href="/use-cases"
          className="hidden md:flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors"
        >
          <BookOpen className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">Use Case Library</span>
        </Link>

        <div className="hidden md:flex gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 cursor-pointer">
              Product
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <Link href="/features">
                <DropdownMenuItem className="cursor-pointer">
                  <Layers className="mr-2 h-4 w-4" />
                  <span>Features</span>
                </DropdownMenuItem>
              </Link>
              <Link href="/pricing">
                <DropdownMenuItem className="cursor-pointer">
                  <DollarSign className="mr-2 h-4 w-4" />
                  <span>Pricing</span>
                </DropdownMenuItem>
              </Link>
              <Link href="/use-cases">
                <DropdownMenuItem className="cursor-pointer">
                  <Lightbulb className="mr-2 h-4 w-4" />
                  <span>Use Cases</span>
                </DropdownMenuItem>
              </Link>
              <Link href="/api">
                <DropdownMenuItem className="cursor-pointer">
                  <Code className="mr-2 h-4 w-4" />
                  <span>API</span>
                </DropdownMenuItem>
              </Link>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/reports">Reports</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/protocol-generator">Protocol Generator</Link>
        </div>
        <div className="hidden md:flex gap-2">
          <Link href="/dashboard">
            <Button variant="outline">Dashboard</Button>
          </Link>
          <Button>Sign Up</Button>
        </div>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>TrialSage</SheetTitle>
              <SheetDescription>AI-Powered CSR Intelligence Platform</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="font-medium px-1 py-2">Product</div>
              <Link href="/features" onClick={() => setIsOpen(false)}>
                <div className="flex items-center gap-2 py-2 pl-3">
                  <Layers className="h-5 w-5" />
                  <span>Features</span>
                </div>
              </Link>
              <Link href="/pricing" onClick={() => setIsOpen(false)}>
                <div className="flex items-center gap-2 py-2 pl-3">
                  <DollarSign className="h-5 w-5" />
                  <span>Pricing</span>
                </div>
              </Link>
              <Link href="/use-cases" onClick={() => setIsOpen(false)}>
                <div className="flex items-center gap-2 py-2 pl-3">
                  <Lightbulb className="h-5 w-5" />
                  <span>Use Cases</span>
                </div>
              </Link>
              <Link href="/api" onClick={() => setIsOpen(false)}>
                <div className="flex items-center gap-2 py-2 pl-3">
                  <Code className="h-5 w-5" />
                  <span>API</span>
                </div>
              </Link>

              <Separator />

              <div className="font-medium px-1 py-2">Platform</div>
              <Link href="/reports" onClick={() => setIsOpen(false)}>
                <div className="flex items-center gap-2 py-2 pl-3">
                  <FileText className="h-5 w-5" />
                  <span>Reports</span>
                </div>
              </Link>
              <Link href="/analytics" onClick={() => setIsOpen(false)}>
                <div className="flex items-center gap-2 py-2 pl-3">
                  <BarChart2 className="h-5 w-5" />
                  <span>Analytics</span>
                </div>
              </Link>
              <Link href="/protocol-generator" onClick={() => setIsOpen(false)}>
                <div className="flex items-center gap-2 py-2 pl-3">
                  <FileText className="h-5 w-5" />
                  <span>Protocol Generator</span>
                </div>
              </Link>
              <Separator />

              {/* Mobile Use Case Library Link */}
              <Link href="/use-cases" onClick={() => setIsOpen(false)}>
                <div className="flex items-center gap-2 py-2 px-1">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">Use Case Library</span>
                </div>
              </Link>

              <Separator className="my-2" />

              <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                <Button variant="outline" className="w-full">
                  Dashboard
                </Button>
              </Link>
              <Button className="w-full">Sign Up</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
