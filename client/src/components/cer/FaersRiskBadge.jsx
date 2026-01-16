import React from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

/**
 * FAERS Risk Badge Component
 *
 * Displays a visual indicator of the risk level associated with a product
 * based on FAERS adverse event data analysis
 */
export function FaersRiskBadge({ riskLevel = 'medium', score = 3.0 }) {
  // Define colors and icons based on risk level
  const getConfig = () => {
    switch (riskLevel.toLowerCase()) {
      case 'low':
        return {
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          borderColor: 'border-green-200',
          icon: <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />,
          label: 'Low Risk',
        };
      case 'medium':
        return {
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-800',
          borderColor: 'border-yellow-200',
          icon: <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />,
          label: 'Medium Risk',
        };
      case 'high':
        return {
          bgColor: 'bg-orange-100',
          textColor: 'text-orange-800',
          borderColor: 'border-orange-200',
          icon: <AlertCircle className="h-5 w-5 text-orange-500 mr-2" />,
          label: 'High Risk',
        };
      case 'critical':
        return {
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          borderColor: 'border-red-200',
          icon: <XCircle className="h-5 w-5 text-red-500 mr-2" />,
          label: 'Critical Risk',
        };
      default:
        return {
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-800',
          borderColor: 'border-blue-200',
          icon: <AlertTriangle className="h-5 w-5 text-blue-500 mr-2" />,
          label: 'Unknown Risk',
        };
    }
  };

  const config = getConfig();

  return (
    <div
      className={`flex items-center px-4 py-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}
    >
      {config.icon}
      <div>
        <div className={`font-semibold ${config.textColor}`}>{config.label}</div>
        <div className="text-sm text-gray-500">Risk Score: {score.toFixed(1)}</div>
      </div>
    </div>
  );
}
