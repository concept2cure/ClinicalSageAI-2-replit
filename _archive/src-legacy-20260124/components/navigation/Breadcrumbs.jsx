import React from 'react';
import { Link } from 'wouter';
import './Breadcrumbs.css';

export default function Breadcrumbs({ items = [] }) {
  return (
    <nav aria-label="breadcrumb" className="breadcrumbs">
      {items.map((it, i) => (
        <span key={i} className="crumb">
          {it.to ? <Link href={it.to}>{it.label}</Link> : <span>{it.label}</span>}
          {i < items.length - 1 && <span className="sep">›</span>}
        </span>
      ))}
    </nav>
  );
}
