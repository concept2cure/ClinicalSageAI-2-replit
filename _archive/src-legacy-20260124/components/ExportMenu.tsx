import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu";
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  FileBadge, 
  FileCode, 
  FileStack, 
  FileJson, 
  FileType, 
  FilePlus,
  FileSymlink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

interface ExportMenuProps {
  title?: string;
  protocolData?: any;
  indication?: string;
  phase?: string;
  recommendations?: any;
  csrInsights?: any[];
  academicReferences?: any[];
  className?: string;
}

const ExportMenu = ({
  title,
  protocolData,
  indication, 
  phase,
  recommendations,
  csrInsights = [],
  academicReferences = [],
  className
}: ExportMenuProps) => {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const formatContent = (content: any) => {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content.map((item, i) => {
        if (typeof item === 'string') {
          return `<p>${item}</p>`;
        } else if (typeof item === 'object') {
          const keys = Object.keys(item);
          return `
            <div class="recommendation-item">
              ${keys.map(key => `
                <div class="recommendation-${key}">
                  <strong>${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()}:</strong> 
                  ${typeof item[key] === 'string' ? item[key] : JSON.stringify(item[key])}
                </div>
              `).join('')}
            </div>
          `;
        }
        return `<p>${JSON.stringify(item)}</p>`;
      }).join('');
    }
    
    if (typeof content === 'object') {
      const sections = Object.keys(content);
      return sections.map(section => {
        const sectionData = content[section];
        return `
          <div class="recommendation-section">
            <h3>${section.charAt(0).toUpperCase() + section.slice(1).replace(/([A-Z])/g, ' $1').trim()}</h3>
            ${typeof sectionData === 'string' 
              ? `<p>${sectionData}</p>` 
              : typeof sectionData === 'object' && !Array.isArray(sectionData)
                ? Object.keys(sectionData).map(key => `
                    <div class="recommendation-${key}">
                      <strong>${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()}:</strong> 
                      ${Array.isArray(sectionData[key]) 
                        ? `<ul>${sectionData[key].map((item: string) => `<li>${item}</li>`).join('')}</ul>` 
                        : typeof sectionData[key] === 'string' 
                          ? `<p>${sectionData[key]}</p>` 
                          : `<p>${JSON.stringify(sectionData[key])}</p>`}
                    </div>
                  `).join('')
                : Array.isArray(sectionData)
                  ? `<ul>${sectionData.map((item: string) => `<li>${item}</li>`).join('')}</ul>`
                  : `<p>${JSON.stringify(sectionData)}</p>`}
          </div>
        `;
      }).join('');
    }
    
    return JSON.stringify(content, null, 2);
  };

  const exportToPDF = async () => {
    try {
      setIsExporting(true);
      
      const formattedContent = formatContent(recommendations);
      
      const exportData = {
        title: title || `Protocol Recommendations for ${indication} Study (${phase})`,
        content: formattedContent,
        indication,
        phase,
        csrInsights,
        academicReferences
      };
      
      const response = await axios.post('/api/export/pdf', exportData, {
        responseType: 'blob',
      });
      
      // Create a URL for the blob and trigger a download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${exportData.title}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // toast call replaced
  // Original: toast({
        title: "PDF exported successfully",
        description: "Your protocol recommendations have been exported to PDF format.",
      })
  console.log('Toast would show:', {
        title: "PDF exported successfully",
        description: "Your protocol recommendations have been exported to PDF format.",
      });
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      // toast call replaced
  // Original: toast({
        title: "Export failed",
        description: "Failed to export to PDF. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export failed",
        description: "Failed to export to PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToWord = async () => {
    try {
      setIsExporting(true);
      
      const formattedContent = formatContent(recommendations);
      
      const exportData = {
        title: title || `Protocol Recommendations for ${indication} Study (${phase})`,
        content: formattedContent,
        indication,
        phase,
        csrInsights,
        academicReferences
      };
      
      const response = await axios.post('/api/export/word', exportData, {
        responseType: 'blob',
      });
      
      // Create a URL for the blob and trigger a download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${exportData.title}.doc`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // toast call replaced
  // Original: toast({
        title: "Word document exported successfully",
        description: "Your protocol recommendations have been exported to Word format.",
      })
  console.log('Toast would show:', {
        title: "Word document exported successfully",
        description: "Your protocol recommendations have been exported to Word format.",
      });
    } catch (error) {
      console.error('Error exporting to Word:', error);
      // toast call replaced
  // Original: toast({
        title: "Export failed",
        description: "Failed to export to Word format. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export failed",
        description: "Failed to export to Word format. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = async () => {
    try {
      setIsExporting(true);
      
      const exportData = {
        title: title || `Protocol Recommendations for ${indication} Study (${phase})`,
        indication,
        phase,
        csrInsights
      };
      
      const response = await axios.post('/api/export/csv', exportData, {
        responseType: 'blob',
      });
      
      // Create a URL for the blob and trigger a download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${exportData.title}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // toast call replaced
  // Original: toast({
        title: "CSV exported successfully",
        description: "Your CSR data has been exported to CSV format for analysis.",
      })
  console.log('Toast would show:', {
        title: "CSV exported successfully",
        description: "Your CSR data has been exported to CSV format for analysis.",
      });
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      // toast call replaced
  // Original: toast({
        title: "Export failed",
        description: "Failed to export to CSV format. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export failed",
        description: "Failed to export to CSV format. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToBibTeX = async () => {
    try {
      setIsExporting(true);
      
      if (!academicReferences || academicReferences.length === 0) {
        // toast call replaced
  // Original: toast({
          title: "No references available",
          description: "There are no academic references available to export.",
          variant: "destructive",
        })
  console.log('Toast would show:', {
          title: "No references available",
          description: "There are no academic references available to export.",
          variant: "destructive",
        });
        return;
      }
      
      const response = await axios.post('/api/export/bibtex', {
        academicReferences,
        title: title || `Protocol Recommendations for ${indication} Study (${phase})`,
        indication,
        phase
      }, {
        responseType: 'blob',
      });
      
      // Create a URL for the blob and trigger a download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'protocol_references.bib');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // toast call replaced
  // Original: toast({
        title: "BibTeX exported successfully",
        description: "Your academic references have been exported to BibTeX format.",
      })
  console.log('Toast would show:', {
        title: "BibTeX exported successfully",
        description: "Your academic references have been exported to BibTeX format.",
      });
    } catch (error) {
      console.error('Error exporting to BibTeX:', error);
      // toast call replaced
  // Original: toast({
        title: "Export failed",
        description: "Failed to export to BibTeX format. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export failed",
        description: "Failed to export to BibTeX format. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };
  
  const exportToRIS = async () => {
    try {
      setIsExporting(true);
      
      if (!academicReferences || academicReferences.length === 0) {
        // toast call replaced
  // Original: toast({
          title: "No references available",
          description: "There are no academic references available to export.",
          variant: "destructive",
        })
  console.log('Toast would show:', {
          title: "No references available",
          description: "There are no academic references available to export.",
          variant: "destructive",
        });
        return;
      }
      
      const response = await axios.post('/api/export/ris', {
        academicReferences,
        title: title || `Protocol Recommendations for ${indication} Study (${phase})`,
        indication,
        phase
      }, {
        responseType: 'blob',
      });
      
      // Create a URL for the blob and trigger a download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'protocol_references.ris');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // toast call replaced
  // Original: toast({
        title: "RIS exported successfully",
        description: "Your academic references have been exported to RIS format for EndNote/Zotero.",
      })
  console.log('Toast would show:', {
        title: "RIS exported successfully",
        description: "Your academic references have been exported to RIS format for EndNote/Zotero.",
      });
    } catch (error) {
      console.error('Error exporting to RIS:', error);
      // toast call replaced
  // Original: toast({
        title: "Export failed",
        description: "Failed to export to RIS format. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export failed",
        description: "Failed to export to RIS format. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };
  
  const exportToMarkdown = async () => {
    try {
      setIsExporting(true);
      
      const exportData = {
        title: title || `Protocol Recommendations for ${indication} Study (${phase})`,
        content: recommendations,
        indication,
        phase,
        csrInsights,
        academicReferences
      };
      
      const response = await axios.post('/api/export/markdown', exportData, {
        responseType: 'blob',
      });
      
      // Create a URL for the blob and trigger a download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${exportData.title.replace(/[^a-zA-Z0-9 ]/g, '')}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // toast call replaced
  // Original: toast({
        title: "Markdown exported successfully",
        description: "Your protocol recommendations have been exported to Markdown format.",
      })
  console.log('Toast would show:', {
        title: "Markdown exported successfully",
        description: "Your protocol recommendations have been exported to Markdown format.",
      });
    } catch (error) {
      console.error('Error exporting to Markdown:', error);
      // toast call replaced
  // Original: toast({
        title: "Export failed",
        description: "Failed to export to Markdown format. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export failed",
        description: "Failed to export to Markdown format. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };
  
  const exportToXML = async () => {
    try {
      setIsExporting(true);
      
      const exportData = {
        title: title || `Protocol Recommendations for ${indication} Study (${phase})`,
        content: recommendations,
        author: 'LumenTrialGuide.AI',
        indication,
        phase,
        csrInsights,
        academicReferences
      };
      
      const response = await axios.post('/api/export/xml', exportData, {
        responseType: 'blob',
      });
      
      // Create a URL for the blob and trigger a download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${exportData.title.replace(/[^a-zA-Z0-9 ]/g, '')}.xml`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // toast call replaced
  // Original: toast({
        title: "XML exported successfully",
        description: "Your protocol data has been exported to XML format for data exchange.",
      })
  console.log('Toast would show:', {
        title: "XML exported successfully",
        description: "Your protocol data has been exported to XML format for data exchange.",
      });
    } catch (error) {
      console.error('Error exporting to XML:', error);
      // toast call replaced
  // Original: toast({
        title: "Export failed",
        description: "Failed to export to XML format. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export failed",
        description: "Failed to export to XML format. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className={className}>
        <Button variant="outline" size="sm" disabled={isExporting}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Export Format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-2 py-1.5">
            Document Formats
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={exportToPDF} disabled={isExporting}>
            <FileText className="mr-2 h-4 w-4" />
            PDF Document
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportToWord} disabled={isExporting}>
            <FileBadge className="mr-2 h-4 w-4" />
            Word Document
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportToMarkdown} disabled={isExporting}>
            <FileType className="mr-2 h-4 w-4" />
            Markdown
          </DropdownMenuItem>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-2 py-1.5">
            Data Formats
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={exportToCSV} disabled={isExporting || csrInsights.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            CSV (CSR Data)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportToXML} disabled={isExporting}>
            <FileSymlink className="mr-2 h-4 w-4" />
            XML (Clinical Trial Exchange)
          </DropdownMenuItem>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-2 py-1.5">
            Academic Citation Formats
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={exportToBibTeX} disabled={isExporting || !academicReferences || academicReferences.length === 0}>
            <FileCode className="mr-2 h-4 w-4" />
            BibTeX (LaTeX)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportToRIS} disabled={isExporting || !academicReferences || academicReferences.length === 0}>
            <FileStack className="mr-2 h-4 w-4" />
            RIS (EndNote/Zotero)
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportMenu;