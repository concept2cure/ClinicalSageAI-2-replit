import React, { useState } from 'react';
import { Link } from 'wouter';
import { BookOpen, MessageSquare, FileText, UploadCloud, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const ICHWizSidebar = ({ activeItem, onItemClick }) => {
  const navigationItems = [
    { id: 'chat', name: 'Chat with ICH Wiz', icon: <MessageSquare size={18} />, href: '/ich-wiz' },
    {
      id: 'guidelines',
      name: 'Browse Guidelines',
      icon: <BookOpen size={18} />,
      href: '/ich-wiz/guidelines',
    },
    {
      id: 'documents',
      name: 'My Documents',
      icon: <FileText size={18} />,
      href: '/ich-wiz/documents',
    },
    {
      id: 'upload',
      name: 'Upload Documents',
      icon: <UploadCloud size={18} />,
      href: '/ich-wiz/upload',
    },
  ];

  // Style definitions
  const styles = {
    sidebar: {
      padding: '1rem',
      backgroundColor: '#ffffff',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    },
    navigationList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    },
    navItem: {
      display: 'flex',
      alignItems: 'center',
      padding: '0.5rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    navItemActive: {
      backgroundColor: '#e0f2fe',
    },
    navItemIcon: {
      marginRight: '0.5rem',
      color: '#64748b',
    },
    navItemText: {
      fontSize: '0.875rem',
    },
  };

  return (
    <div style={styles.sidebar}>
      <h3 className="text-lg font-medium mb-4">ICH Wiz Navigator</h3>
      <p className="text-sm text-gray-500 mb-6">Your Digital Compliance Coach for ICH Guidelines</p>

      <div style={styles.navigationList}>
        {navigationItems.map(item => (
          <Link key={item.id} href={item.href}>
            <a
              className={`flex items-center p-2 rounded-md text-sm hover:bg-blue-50 ${
                activeItem === item.id ? 'bg-blue-100 text-blue-900' : 'text-gray-700'
              }`}
              onClick={() => onItemClick && onItemClick(item.id)}
            >
              <span className="mr-2 text-gray-500">{item.icon}</span>
              <span>{item.name}</span>
            </a>
          </Link>
        ))}
      </div>

      <Separator className="my-4" />

      <div className="mt-auto">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <Info className="h-4 w-4 mr-2" />
              About ICH Wiz
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>About ICH Wiz</AlertDialogTitle>
              <AlertDialogDescription>
                <p>
                  ICH Wiz is an advanced Digital Compliance Coach powered by AI. It provides
                  accurate, up-to-date guidance on ICH regulations and helps you ensure your
                  documents comply with all requirements.
                </p>

                <div className="mt-4 text-sm text-gray-500">
                  <p className="mt-2">Version: 1.0.0</p>
                  <p>Last Updated: April 2025</p>
                  <p className="mt-4">© 2025 Lumen Biosciences. All rights reserved.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>Close</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default ICHWizSidebar;
