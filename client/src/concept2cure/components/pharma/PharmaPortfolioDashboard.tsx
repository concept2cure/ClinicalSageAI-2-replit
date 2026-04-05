/**
 * @fileoverview Pharma Global Regulatory Portfolio
 * @module concept2cure/components/pharma/PharmaPortfolioDashboard
 * @version 1.0.0
 *
 * @description
 * Dashboard designed for how PHARMA companies actually operate:
 * 
 * PHARMA REALITY:
 * - Large portfolio of products across therapeutic areas
 * - Global footprint - registrations in 50+ countries
 * - Lifecycle management is continuous (sNDAs, variations, renewals)
 * - Heavy regulatory commitment burden (PMCs, PMRs, REMS, PSURs)
 * - PDUFA dates are board-level visibility items
 * - Multiple therapeutic area VPs need roll-up views
 *
 * KEY USE CASES:
 * 1. "Show me all PDUFA dates in the next 6 months"
 * 2. "What's the global registration status of Product X?"
 * 3. "Which post-marketing commitments are at risk?"
 * 4. "Roll up the oncology portfolio status"
 * 5. "What variations are pending in EU?"
 *
 * This reflects the matrix organization of pharma:
 * - By Therapeutic Area (Oncology, Cardio, etc.)
 * - By Product (lifecycle across regions)
 * - By Region (US, EU, JP, ROW)
 * - By Function (RA, Medical, Safety)
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Building2,
  Globe,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  Filter,
  LayoutGrid,
  List,
  Flag,
  Shield,
  ArrowUpRight,
  Pill,
  Target,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - Reflecting Pharma Reality
// ═══════════════════════════════════════════════════════════════════════════════

export type RegulatoryRegion = 'us' | 'eu' | 'jp' | 'cn' | 'ca' | 'au' | 'br' | 'row';

export type RegistrationStatus = 
  | 'not_applicable'
  | 'not_started'
  | 'dossier_prep'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export type CommitmentType = 
  | 'pmc'           // Post-Marketing Commitment
  | 'pmr'           // Post-Marketing Requirement
  | 'rems'          // Risk Evaluation and Mitigation Strategy
  | 'annual_report' // Annual Report
  | 'psur'          // Periodic Safety Update Report
  | 'pbrer'         // Periodic Benefit-Risk Evaluation Report
  | 'dsur'          // Development Safety Update Report
  | 'pediatric'     // Pediatric Study
  | 'label_update'; // Required Label Update

export interface PDUFADate {
  id: string;
  productId: string;
  productName: string;
  submissionType: string;   // NDA, sNDA, BLA, etc.
  applicationNumber: string;
  pdfuaDate: string;
  priority: boolean;        // Priority review?
  advisoryCommittee?: string;
  advisoryCommitteeDate?: string;
  status: 'on_track' | 'at_risk' | 'extension_requested';
  notes?: string;
}

export interface RegulatoryCommitment {
  id: string;
  productId: string;
  productName: string;
  commitmentType: CommitmentType;
  description: string;
  region: RegulatoryRegion;
  dueDate: string;
  originalDueDate?: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'fulfilled' | 'overdue' | 'extension_granted';
  agencyTrackingNumber?: string;
  notes?: string;
}

export interface GlobalRegistration {
  productId: string;
  region: RegulatoryRegion;
  status: RegistrationStatus;
  approvalDate?: string;
  expiryDate?: string;
  applicationNumber?: string;
  pendingVariations?: number;
  lastAction?: string;
  lastActionDate?: string;
}

export interface PharmaProduct {
  id: string;
  brandName: string;
  genericName: string;
  therapeuticArea: string;
  indication: string;
  modality: string;
  launchYear?: number;
  annualRevenue?: number;  // $M
  
  // Global Registration Matrix
  registrations: GlobalRegistration[];
  
  // Key Dates
  pdufaDates: PDUFADate[];
  commitments: RegulatoryCommitment[];
  
  // Health Score (0-100)
  healthScore: number;
  
  // Flags
  isKeyProduct: boolean;
  hasRems: boolean;
  hasPediatricCommitment: boolean;
}

export interface TherapeuticAreaPortfolio {
  id: string;
  name: string;
  products: PharmaProduct[];
  totalRevenue: number;
  upcomingPDUFAs: number;
  overdueCommitments: number;
  healthScore: number;
}

interface PharmaPortfolioDashboardProps {
  portfolios: TherapeuticAreaPortfolio[];
  onProductClick?: (product: PharmaProduct) => void;
  onPDUFAClick?: (pdufa: PDUFADate) => void;
  onCommitmentClick?: (commitment: RegulatoryCommitment) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const REGION_CONFIG: Record<RegulatoryRegion, {
  label: string;
  flag: string;
  agency: string;
}> = {
  us: { label: 'United States', flag: '🇺🇸', agency: 'FDA' },
  eu: { label: 'European Union', flag: '🇪🇺', agency: 'EMA' },
  jp: { label: 'Japan', flag: '🇯🇵', agency: 'PMDA' },
  cn: { label: 'China', flag: '🇨🇳', agency: 'NMPA' },
  ca: { label: 'Canada', flag: '🇨🇦', agency: 'Health Canada' },
  au: { label: 'Australia', flag: '🇦🇺', agency: 'TGA' },
  br: { label: 'Brazil', flag: '🇧🇷', agency: 'ANVISA' },
  row: { label: 'Rest of World', flag: '🌍', agency: 'Various' },
};

const STATUS_CONFIG: Record<RegistrationStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  not_applicable: { label: 'N/A', color: 'text-stone-400', bgColor: 'bg-stone-100' },
  not_started: { label: 'Not Started', color: 'text-stone-500', bgColor: 'bg-stone-100' },
  dossier_prep: { label: 'Dossier Prep', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  submitted: { label: 'Submitted', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  under_review: { label: 'Under Review', color: 'text-stone-600', bgColor: 'bg-stone-200' },
  approved: { label: 'Approved', color: 'text-stone-700', bgColor: 'bg-stone-100' },
  rejected: { label: 'Rejected', color: 'text-stone-700', bgColor: 'bg-stone-100' },
  withdrawn: { label: 'Withdrawn', color: 'text-stone-500', bgColor: 'bg-stone-100' },
};

const COMMITMENT_CONFIG: Record<CommitmentType, {
  label: string;
  shortLabel: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}> = {
  pmc: { label: 'Post-Marketing Commitment', shortLabel: 'PMC', severity: 'high' },
  pmr: { label: 'Post-Marketing Requirement', shortLabel: 'PMR', severity: 'critical' },
  rems: { label: 'REMS', shortLabel: 'REMS', severity: 'critical' },
  annual_report: { label: 'Annual Report', shortLabel: 'Annual', severity: 'medium' },
  psur: { label: 'PSUR', shortLabel: 'PSUR', severity: 'high' },
  pbrer: { label: 'PBRER', shortLabel: 'PBRER', severity: 'high' },
  dsur: { label: 'DSUR', shortLabel: 'DSUR', severity: 'medium' },
  pediatric: { label: 'Pediatric Study', shortLabel: 'Peds', severity: 'high' },
  label_update: { label: 'Label Update', shortLabel: 'Label', severity: 'medium' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getDaysUntil = (date: string): number => {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatCurrency = (amount: number): string => {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}B`;
  return `$${amount}M`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// PDUFA CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const PDUFACalendar: React.FC<{
  pdufaDates: PDUFADate[];
  onPDUFAClick?: (pdufa: PDUFADate) => void;
}> = ({ pdufaDates, onPDUFAClick }) => {
  // Group by month
  const byMonth = useMemo(() => {
    const groups: Record<string, PDUFADate[]> = {};
    
    pdufaDates
      .filter(p => getDaysUntil(p.pdfuaDate) >= 0)
      .sort((a, b) => new Date(a.pdfuaDate).getTime() - new Date(b.pdfuaDate).getTime())
      .forEach(pdufa => {
        const month = new Date(pdufa.pdfuaDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        if (!groups[month]) groups[month] = [];
        groups[month].push(pdufa);
      });
    
    return groups;
  }, [pdufaDates]);
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-stone-700" />
        PDUFA Dates
      </h3>
      
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        {Object.entries(byMonth).map(([month, dates]) => (
          <div key={month}>
            <p className="text-xs font-medium text-stone-500 mb-2">{month}</p>
            <div className="space-y-2">
              {dates.map(pdufa => {
                const daysUntil = getDaysUntil(pdufa.pdfuaDate);
                const isUrgent = daysUntil <= 30;
                
                return (
                  <button
                    key={pdufa.id}
                    onClick={() => onPDUFAClick?.(pdufa)}
                    className={cn(
                      'w-full p-3 rounded-lg border-l-4 text-left transition-colors duration-150',
                      pdufa.status === 'at_risk'
                        ? 'border-l-stone-1000 bg-stone-100 hover:bg-stone-100'
                        : isUrgent
                          ? 'border-l-stone-1000 bg-stone-100 hover:bg-stone-100'
                          : 'border-l-stone-1000 bg-stone-50 hover:bg-stone-100'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{pdufa.productName}</p>
                        <p className="text-xs text-stone-500">{pdufa.submissionType} • {pdufa.applicationNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'text-lg font-semibold',
                          isUrgent ? 'text-stone-700' : 'text-stone-900'
                        )}>
                          {daysUntil}d
                        </p>
                        <p className="text-xs text-stone-500">{formatDate(pdufa.pdfuaDate)}</p>
                      </div>
                    </div>
                    {pdufa.priority && (
                      <span className="mt-2 inline-block px-2 py-0.5 text-xs font-medium text-stone-700 bg-stone-200 rounded-full">
                        Priority Review
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        
        {Object.keys(byMonth).length === 0 && (
          <p className="text-sm text-stone-500 italic text-center py-4">No upcoming PDUFA dates</p>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMMITMENT TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

const CommitmentTracker: React.FC<{
  commitments: RegulatoryCommitment[];
  onCommitmentClick?: (commitment: RegulatoryCommitment) => void;
}> = ({ commitments, onCommitmentClick }) => {
  const overdue = commitments.filter(c => c.status === 'overdue');
  const atRisk = commitments.filter(c => getDaysUntil(c.dueDate) <= 30 && c.status !== 'fulfilled' && c.status !== 'submitted');
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
          <Flag className="w-4 h-4 text-stone-600" />
          Regulatory Commitments
        </h3>
        {overdue.length > 0 && (
          <span className="px-2 py-1 text-xs font-semibold text-stone-800 bg-stone-100 rounded-full">
            {overdue.length} OVERDUE
          </span>
        )}
      </div>
      
      <div className="space-y-2 max-h-[350px] overflow-y-auto">
        {commitments
          .filter(c => c.status !== 'fulfilled')
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
          .slice(0, 10)
          .map(commitment => {
            const config = COMMITMENT_CONFIG[commitment.commitmentType];
            const daysUntil = getDaysUntil(commitment.dueDate);
            const isOverdue = daysUntil < 0;
            const isUrgent = daysUntil <= 30 && !isOverdue;
            
            return (
              <button
                key={commitment.id}
                onClick={() => onCommitmentClick?.(commitment)}
                className={cn(
                  'w-full p-3 rounded-lg border text-left transition-colors duration-150',
                  isOverdue && 'border-stone-300 bg-stone-100',
                  isUrgent && !isOverdue && 'border-stone-300 bg-stone-100',
                  !isOverdue && !isUrgent && 'border-stone-200 hover:bg-stone-50'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded',
                        config.severity === 'critical' && 'bg-stone-100 text-stone-800',
                        config.severity === 'high' && 'bg-stone-100 text-stone-700',
                        config.severity === 'medium' && 'bg-stone-100 text-stone-700',
                        config.severity === 'low' && 'bg-stone-100 text-stone-600'
                      )}>
                        {config.shortLabel}
                      </span>
                      <span className="text-xs text-stone-500">{REGION_CONFIG[commitment.region].flag}</span>
                    </div>
                    <p className="text-sm font-medium text-stone-900 truncate">{commitment.productName}</p>
                    <p className="text-xs text-stone-500 truncate">{commitment.description}</p>
                  </div>
                  
                  <div className={cn(
                    'text-right ml-3',
                    isOverdue && 'text-stone-700',
                    isUrgent && !isOverdue && 'text-stone-600',
                    !isOverdue && !isUrgent && 'text-stone-600'
                  )}>
                    <p className="text-sm font-semibold">
                      {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `${daysUntil}d`}
                    </p>
                    <p className="text-xs">{formatDate(commitment.dueDate)}</p>
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL REGISTRATION MATRIX
// ═══════════════════════════════════════════════════════════════════════════════

const GlobalRegistrationMatrix: React.FC<{
  products: PharmaProduct[];
  onProductClick?: (product: PharmaProduct) => void;
}> = ({ products, onProductClick }) => {
  const regions: RegulatoryRegion[] = ['us', 'eu', 'jp', 'cn', 'ca', 'au'];
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200">
        <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
          <Globe className="w-4 h-4 text-stone-600" />
          Global Registration Status
        </h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50">
              <th className="text-left text-xs font-medium text-stone-500 px-4 py-2 sticky left-0 bg-stone-50">Product</th>
              {regions.map(region => (
                <th key={region} className="text-center text-xs font-medium text-stone-500 px-2 py-2 min-w-[80px]">
                  <span className="block text-lg">{REGION_CONFIG[region].flag}</span>
                  {REGION_CONFIG[region].agency}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(product => (
              <tr
                key={product.id}
                className="border-t border-stone-200 hover:bg-stone-50 cursor-pointer"
                onClick={() => onProductClick?.(product)}
              >
                <td className="px-4 py-3 sticky left-0 bg-white">
                  <p className="text-sm font-medium text-stone-900">{product.brandName}</p>
                  <p className="text-xs text-stone-500">{product.genericName}</p>
                </td>
                {regions.map(region => {
                  const reg = product.registrations.find(r => r.region === region);
                  const status = reg?.status || 'not_applicable';
                  const config = STATUS_CONFIG[status];
                  
                  return (
                    <td key={region} className="text-center px-2 py-3">
                      <span className={cn(
                        'inline-block px-2 py-1 text-xs font-medium rounded-full',
                        config.bgColor,
                        config.color
                      )}>
                        {status === 'approved' ? '✓' : status === 'not_applicable' ? '—' : config.label}
                      </span>
                      {reg?.pendingVariations && reg.pendingVariations > 0 && (
                        <p className="text-xs text-stone-600 mt-0.5">
                          {reg.pendingVariations} variation{reg.pendingVariations > 1 ? 's' : ''}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// THERAPEUTIC AREA CARD
// ═══════════════════════════════════════════════════════════════════════════════

const TherapeuticAreaCard: React.FC<{
  portfolio: TherapeuticAreaPortfolio;
  onProductClick?: (product: PharmaProduct) => void;
}> = ({ portfolio, onProductClick }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors duration-150"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-stone-800 flex items-center justify-center">
            <Pill className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-stone-900">{portfolio.name}</h3>
            <p className="text-sm text-stone-500">{portfolio.products.length} products</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Revenue */}
          <div className="text-right">
            <p className="text-xs text-stone-500">Revenue</p>
            <p className="text-lg font-semibold text-stone-900">{formatCurrency(portfolio.totalRevenue)}</p>
          </div>
          
          {/* Health Score */}
          <div className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold',
            portfolio.healthScore >= 80 && 'bg-stone-100 text-stone-800',
            portfolio.healthScore >= 60 && portfolio.healthScore < 80 && 'bg-stone-100 text-stone-700',
            portfolio.healthScore < 60 && 'bg-stone-100 text-stone-800'
          )}>
            {portfolio.healthScore}
          </div>
          
          {/* Alerts */}
          <div className="flex items-center gap-2">
            {portfolio.upcomingPDUFAs > 0 && (
              <span className="px-2 py-1 text-xs font-medium text-stone-700 bg-stone-100 rounded-full">
                {portfolio.upcomingPDUFAs} PDUFA
              </span>
            )}
            {portfolio.overdueCommitments > 0 && (
              <span className="px-2 py-1 text-xs font-medium text-stone-800 bg-stone-100 rounded-full">
                {portfolio.overdueCommitments} Overdue
              </span>
            )}
          </div>
          
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-stone-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-stone-400" />
          )}
        </div>
      </button>
      
      {/* Expanded Products */}
      {expanded && (
        <div className="border-t border-stone-200 bg-stone-50 p-4">
          <div className="grid grid-cols-2 gap-3">
            {portfolio.products.map(product => (
              <button
                key={product.id}
                onClick={() => onProductClick?.(product)}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-stone-200 hover:border-stone-300 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-stone-900">{product.brandName}</p>
                  <p className="text-xs text-stone-500">{product.indication}</p>
                </div>
                <div className="flex items-center gap-2">
                  {product.hasRems && (
                    <Shield className="w-4 h-4 text-stone-1000" title="Has REMS" />
                  )}
                  {product.isKeyProduct && (
                    <Target className="w-4 h-4 text-stone-1000" title="Key Product" />
                  )}
                  <span className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold',
                    product.healthScore >= 80 && 'bg-stone-100 text-stone-800',
                    product.healthScore >= 60 && product.healthScore < 80 && 'bg-stone-100 text-stone-700',
                    product.healthScore < 60 && 'bg-stone-100 text-stone-800'
                  )}>
                    {product.healthScore}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const PharmaPortfolioDashboard: React.FC<PharmaPortfolioDashboardProps> = ({
  portfolios,
  onProductClick,
  onPDUFAClick,
  onCommitmentClick,
  className,
}) => {
  const [view, setView] = useState<'portfolio' | 'matrix'>('portfolio');
  
  // Aggregate metrics across all portfolios
  const metrics = useMemo(() => {
    const allProducts = portfolios.flatMap(p => p.products);
    const allPDUFAs = allProducts.flatMap(p => p.pdufaDates);
    const allCommitments = allProducts.flatMap(p => p.commitments);
    
    const upcomingPDUFAs = allPDUFAs.filter(p => getDaysUntil(p.pdfuaDate) >= 0 && getDaysUntil(p.pdfuaDate) <= 90);
    const overdueCommitments = allCommitments.filter(c => c.status === 'overdue');
    const atRiskCommitments = allCommitments.filter(c => getDaysUntil(c.dueDate) <= 30 && c.status !== 'fulfilled');
    const totalRevenue = portfolios.reduce((sum, p) => sum + p.totalRevenue, 0);
    
    return {
      totalProducts: allProducts.length,
      upcomingPDUFAs: upcomingPDUFAs.length,
      overdueCommitments: overdueCommitments.length,
      atRiskCommitments: atRiskCommitments.length,
      totalRevenue,
      allPDUFAs,
      allCommitments,
      allProducts,
    };
  }, [portfolios]);
  
  return (
    <div className={cn('flex flex-col h-full bg-stone-50', className)}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-stone-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-base font-medium text-stone-900">Global Regulatory Portfolio</h1>
            <p className="text-sm text-stone-500">Enterprise-wide view across therapeutic areas</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('portfolio')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150',
                view === 'portfolio' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'
              )}
            >
              <LayoutGrid className="w-4 h-4 inline mr-1" />
              Portfolio
            </button>
            <button
              onClick={() => setView('matrix')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150',
                view === 'matrix' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'
              )}
            >
              <Globe className="w-4 h-4 inline mr-1" />
              Global Matrix
            </button>
          </div>
        </div>
        
        {/* Key Metrics Bar */}
        <div className="grid grid-cols-5 gap-4">
          <div className="p-3 bg-stone-100 rounded-lg">
            <p className="text-xs text-stone-600">Total Revenue</p>
            <p className="text-base font-medium text-stone-700">{formatCurrency(metrics.totalRevenue)}</p>
          </div>
          <div className="p-3 bg-stone-100 rounded-lg">
            <p className="text-xs text-stone-500">Products</p>
            <p className="text-base font-medium text-stone-900">{metrics.totalProducts}</p>
          </div>
          <div className={cn(
            'p-3 rounded-lg',
            metrics.upcomingPDUFAs > 0 ? 'bg-stone-100' : 'bg-stone-100'
          )}>
            <p className={cn('text-xs', metrics.upcomingPDUFAs > 0 ? 'text-stone-600' : 'text-stone-500')}>
              PDUFA (90d)
            </p>
            <p className={cn('text-base font-medium', metrics.upcomingPDUFAs > 0 ? 'text-stone-700' : 'text-stone-900')}>
              {metrics.upcomingPDUFAs}
            </p>
          </div>
          <div className={cn(
            'p-3 rounded-lg',
            metrics.overdueCommitments > 0 ? 'bg-stone-100' : 'bg-stone-100'
          )}>
            <p className={cn('text-xs', metrics.overdueCommitments > 0 ? 'text-stone-700' : 'text-stone-500')}>
              Overdue Commitments
            </p>
            <p className={cn('text-base font-medium', metrics.overdueCommitments > 0 ? 'text-stone-800' : 'text-stone-900')}>
              {metrics.overdueCommitments}
            </p>
          </div>
          <div className="p-3 bg-stone-100 rounded-lg">
            <p className="text-xs text-stone-600">At Risk (30d)</p>
            <p className="text-base font-medium text-stone-700">{metrics.atRiskCommitments}</p>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        {view === 'portfolio' ? (
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column: Therapeutic Areas */}
            <div className="col-span-2 space-y-4">
              {portfolios.map(portfolio => (
                <TherapeuticAreaCard
                  key={portfolio.id}
                  portfolio={portfolio}
                  onProductClick={onProductClick}
                />
              ))}
            </div>
            
            {/* Right Column: PDUFA & Commitments */}
            <div className="space-y-6">
              <PDUFACalendar
                pdufaDates={metrics.allPDUFAs}
                onPDUFAClick={onPDUFAClick}
              />
              <CommitmentTracker
                commitments={metrics.allCommitments}
                onCommitmentClick={onCommitmentClick}
              />
            </div>
          </div>
        ) : (
          <GlobalRegistrationMatrix
            products={metrics.allProducts}
            onProductClick={onProductClick}
          />
        )}
      </div>
    </div>
  );
};

export default PharmaPortfolioDashboard;
