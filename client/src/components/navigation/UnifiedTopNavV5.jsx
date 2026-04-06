import React from 'react';
import { Link, useLocation } from 'wouter';
import './UnifiedTopNavV5.css';

export default function UnifiedTopNavV5({ tabs = [] }) {
 const [location] = useLocation();

 // Note: Adapting for wouter instead of react-router-dom
 const goBack = () => {
 window.history.back();
 };

 const goForward = () => {
 window.history.forward();
 };

 return (
 <header className="utnv5-header">
 <div className="utnv5-controls">
 <button onClick={goBack} aria-label="Back">
 ←
 </button>
 <button onClick={goForward} aria-label="Forward">
 →
 </button>
 <Link href="/dashboard" className="utnv5-home">
 🏠 Dashboard
 </Link>
 <Link href="/switch-module" className="utnv5-switch">
 🔀 Switch Module
 </Link>
 <Link href="/cerv2?tab=reports" className="utnv5-reports">
 <span className="flex items-center">
 <span className="mr-1">📊</span>
 <span>Reports</span>
 <span className="ml-1.5 bg-stone-100 text-stone-700 text-xs px-1.5 py-0.5 rounded-full">
 New
 </span>
 </span>
 </Link>
 </div>
 <nav className="utnv5-tabs">
 {tabs.map(t => (
 <Link key={t.path} href={t.path} className={location === t.path ? 'active' : ''}>
 {t.label}
 </Link>
 ))}
 </nav>
 </header>
 );
}
