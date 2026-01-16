import React from 'react';
import { Link } from 'wouter';
import { ChevronLeft, ChevronRight, Home, Search } from 'lucide-react'

export default function UnifiedTopNavV4({ tabs = [] }) {
  const goBack = () => window.history.back();
  const goForward = () => window.history.forward();
  const pathname = window.location.pathname;

  return (
    <header className="utnv4-header">
      <div className="utnv4-controls">
        <button onClick={goBack} aria-label="Back" className="flex items-center">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </button>
        <button onClick={goForward} aria-label="Forward" className="flex items-center">
          <ChevronRight className="h-4 w-4 mr-1" /> Forward
        </button>
        <Link href="/client-portal" className="utnv4-home flex items-center">
          <Home className="h-4 w-4 mr-1" /> Client Portal
        </Link>
        <Link href="/switch-module" className="utnv4-switch flex items-center">
          <Search className="h-4 w-4 mr-1" /> Switch Module
        </Link>
      </div>

      <nav className="utnv4-breadcrumbs">
        {/* You could generate these dynamically from pathname */}
        <Link href="/">TrialSage™</Link> ›<Link href="/coauthor">eCTD Co-Author™</Link> ›
        <Link href="/coauthor?module=2">Module 2</Link> ›<span>Section 2.7</span>
      </nav>

      <ul className="utnv4-tabs">
        {tabs.map(t => (
          <li key={t.path} className={pathname === t.path ? 'active' : ''}>
            <Link href={t.path}>{t.label}</Link>
          </li>
        ))}
      </ul>
    </header>
  );
}
