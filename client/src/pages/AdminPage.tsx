import React from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { Shield } from 'lucide-react'

export default function AdminPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center mb-8 border-b pb-4">
        <Shield className="h-8 w-8 mr-3 text-primary" />
        <h1 className="text-3xl font-bold">Administrator Dashboard</h1>
      </div>

      <AdminPanel />
    </div>
  );
}
