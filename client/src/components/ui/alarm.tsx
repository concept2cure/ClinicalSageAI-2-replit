import * as React from 'react';
import { AlertTriangle, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface AppAlarmProps extends React.HTMLAttributes<HTMLDivElement> {
 title?: string;
 message?: string;
 isActive: boolean;
 onRestart?: () => void;
 onFix?: () => void;
}

/**
 * Application Alarm Component
 *
 * This component displays a prominent error message when the application
 * has been detected as being unavailable or unstable.
 */
export function AppAlarm({
 title = 'Application Error',
 message = 'The application is currently experiencing technical difficulties. Please try again or contact support.',
 isActive,
 onRestart,
 onFix,
 className,
 ...props
}: AppAlarmProps) {
 if (!isActive) return null;

 return (
 <div
 className={cn(
 'fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4',
 className
 )}
 {...props}
 >
 <div className="max-w-md w-full bg-white dark:bg-stone-950 shadow-sm rounded-lg overflow-hidden animate-pulse">
 <div className="bg-stone-700 dark:bg-stone-800 p-4 flex items-center space-x-3">
 <AlertTriangle className="h-6 w-6 text-white" />
 <h2 className="text-lg font-bold text-white">{title}</h2>
 </div>

 <Alert variant="destructive" className="border-0 rounded-none">
 <AlertTitle className="text-lg font-bold mb-2">STABILITY ALARM ACTIVATED</AlertTitle>
 <AlertDescription className="text-base">{message}</AlertDescription>
 </Alert>

 <div className="p-4 bg-stone-50 dark:bg-stone-900 flex flex-col space-y-3">
 <p className="text-sm text-stone-600 dark:text-stone-400">
 This alarm indicates that the application has become unstable or unresponsive. All
 development should stop immediately to address this critical issue.
 </p>

 <div className="flex space-x-2 justify-end">
 {onRestart && (
 <Button variant="outline" onClick={onRestart} className="flex items-center space-x-1">
 <ArrowUpCircle className="h-4 w-4 mr-1" />
 <span>Restart Server</span>
 </Button>
 )}

 {onFix && (
 <Button variant="destructive" onClick={onFix} className="font-bold">
 FIX NOW
 </Button>
 )}
 </div>
 </div>
 </div>
 </div>
 );
}
