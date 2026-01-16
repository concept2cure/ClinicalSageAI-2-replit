import * as React from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react'

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleTrigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleTrigger> & {
    showIcon?: boolean;
  }
>(({ className, children, showIcon = true, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleTrigger
    ref={ref}
    className={cn(
      'flex w-full items-center justify-between py-2 font-medium transition-all hover:text-primary [&[data-state=open]>svg]:rotate-180',
      className
    )}
    {...props}
  >
    {children}
    {showIcon && <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-300" />}
  </CollapsiblePrimitive.CollapsibleTrigger>
));
CollapsibleTrigger.displayName = CollapsiblePrimitive.CollapsibleTrigger.displayName;

const CollapsibleContentWrapper = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>(({ className, children, ...props }, ref) => (
  <AnimatePresence>
    <CollapsiblePrimitive.CollapsibleContent ref={ref} className={cn(className)} {...props}>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{
          height: 'auto',
          opacity: 1,
          transition: {
            height: { duration: 0.3 },
            opacity: { duration: 0.2, delay: 0.1 },
          },
        }}
        exit={{
          height: 0,
          opacity: 0,
          transition: {
            height: { duration: 0.3 },
            opacity: { duration: 0.2 },
          },
        }}
        className="overflow-hidden"
      >
        <div className="pt-2 pb-1">{children}</div>
      </motion.div>
    </CollapsiblePrimitive.CollapsibleContent>
  </AnimatePresence>
));
CollapsibleContentWrapper.displayName = 'CollapsibleContentWrapper';

// For backwards compatibility
const CollapsibleContent = CollapsibleContentWrapper;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
