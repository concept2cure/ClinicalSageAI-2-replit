import React from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, Command, CreditCard, File, FileText, HelpCircle, Image, Laptop, Loader2, Moon, MoreVertical, Pizza, Plus, Settings, SunMedium, Trash, Twitter, User, X, CheckCircle } from 'lucide-react'

export const Icons = {
  logo: Command,
  close: X,
  spinner: Loader2,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  trash: Trash,
  settings: Settings,
  billing: CreditCard,
  ellipsis: MoreVertical,
  add: Plus,
  warning: AlertTriangle,
  user: User,
  arrowRight: ArrowRight,
  help: HelpCircle,
  pizza: Pizza,
  sun: SunMedium,
  moon: Moon,
  laptop: Laptop,
  check: Check,
  checkCircle: CheckCircle,
  file: File,
  fileText: FileText,
  image: Image,
  twitter: Twitter,

  // Add the spinner for loading states
  spinner: props => <Loader2 {...props} className={`animate-spin ${props.className || ''}`} />,

  // Add any other icons you need
  alertTriangle: AlertTriangle,
};
