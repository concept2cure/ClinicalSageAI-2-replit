import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  Upload, 
  FileText, 
  BarChart2,
  Filter,
  SlidersHorizontal,
  Loader2
} from 'lucide-react';
import { trialsageApi } from '@/lib/api-connector';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

interface CsrItem {
  id: string;
  title: string;
  sponsor: string;
  phase: string;
  date: string;
  indication: string;
  status: string;
}

export default function CsrIntelligence() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndication, setSelectedIndication] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);

  // Fetch CSR list
  const { data: csrData, isLoading, error } = useQuery({
    queryKey: ['/api/csr/list', searchTerm, selectedIndication, selectedPhase],
    queryFn: async () => {
      try {
        // This is just for demonstration - normally we'd call the actual API
        // In a real implementation, we'd use:
        // const result = await trialsageApi.getCsrList({ 
        //   search: searchTerm,
        //   page: 1,
        //   limit: 10
        // });
        
        // For demo, return mock data
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        return {
          data: {
            items: mockCsrData,
            total: mockCsrData.length,
            indications: ["Oncology", "Cardiology", "Neurology", "Immunology", "Dermatology"],
            phases: ["Phase 1", "Phase 2", "Phase 3", "Phase 4"]
          }
        };
      } catch (err) {
        console.error('Error fetching CSR data:', err);
        throw err;
      }
    }
  });

  const filteredData = csrData?.data?.items.filter(item => {
    let matches = true;
    
    // Apply search filter
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.sponsor.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.indication.toLowerCase().includes(searchTerm.toLowerCase())) {
      matches = false;
    }
    
    // Apply indication filter
    if (selectedIndication && item.indication !== selectedIndication) {
      matches = false;
    }
    
    // Apply phase filter
    if (selectedPhase && item.phase !== selectedPhase) {
      matches = false;
    }
    
    return matches;
  }) || [];

  const handleUploadClick = () => {
    // toast call replaced
  // Original: toast({
      title: "Upload functionality",
      description: "This feature would allow uploading new CSR documents for analysis.",
    })
  console.log('Toast would show:', {
      title: "Upload functionality",
      description: "This feature would allow uploading new CSR documents for analysis.",
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterIndication = (indication: string) => {
    setSelectedIndication(selectedIndication === indication ? null : indication);
  };

  const handleFilterPhase = (phase: string) => {
    setSelectedPhase(selectedPhase === phase ? null : phase);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedIndication(null);
    setSelectedPhase(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">CSR Intelligence</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Search, analyze, and compare clinical study reports
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button 
            variant="outline"
            onClick={handleUploadClick}
            className="flex items-center gap-2"
          >
            <Upload size={16} />
            Upload CSR
          </Button>
          <Button 
            variant="default"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <BarChart2 size={16} />
            View Analytics
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Research Library</CardTitle>
          <CardDescription>
            {csrData?.data?.total 
              ? `${csrData.data.total} clinical study reports across multiple therapeutic areas` 
              : 'Loading clinical study reports...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-3 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  placeholder="Search by title, sponsor, or indication..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10"
                />
              </div>
              <div className="md:col-span-2 flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => {
                    // toast call replaced
  // Original: toast({
                      title: "Advanced Filters",
                      description: "This would open a modal with advanced filtering options",
                    })
  console.log('Toast would show:', {
                      title: "Advanced Filters",
                      description: "This would open a modal with advanced filtering options",
                    });
                  }}
                >
                  <Filter size={16} />
                  Filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => {
                    // toast call replaced
  // Original: toast({
                      title: "Sort Options",
                      description: "This would open sort options",
                    })
  console.log('Toast would show:', {
                      title: "Sort Options",
                      description: "This would open sort options",
                    });
                  }}
                >
                  <SlidersHorizontal size={16} />
                  Sort
                </Button>
                {(selectedIndication || selectedPhase || searchTerm) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                  >
                    Clear All
                  </Button>
                )}
              </div>
            </div>

            {(csrData?.data?.indications && csrData?.data?.indications.length > 0) && (
              <div>
                <div className="text-sm font-medium mb-2">Therapeutic Areas</div>
                <div className="flex flex-wrap gap-2">
                  {csrData.data.indications.map(indication => (
                    <Badge 
                      key={indication} 
                      variant={selectedIndication === indication ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => handleFilterIndication(indication)}
                    >
                      {indication}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(csrData?.data?.phases && csrData?.data?.phases.length > 0) && (
              <div>
                <div className="text-sm font-medium mb-2">Trial Phase</div>
                <div className="flex flex-wrap gap-2">
                  {csrData.data.phases.map(phase => (
                    <Badge 
                      key={phase} 
                      variant={selectedPhase === phase ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => handleFilterPhase(phase)}
                    >
                      {phase}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : error ? (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-6">
            <p className="text-red-700 dark:text-red-400">Error loading CSR data. Please try again later.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredData.length > 0 ? (
            filteredData.map((csr) => (
              <Card key={csr.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col">
                    <div className="p-4 pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold line-clamp-2">{csr.title}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{csr.sponsor}</p>
                        </div>
                        <Badge className={
                          csr.status === 'Completed' ? 'bg-emerald-600' :
                          csr.status === 'In Progress' ? 'bg-amber-500' :
                          'bg-blue-600'
                        }>
                          {csr.status}
                        </Badge>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="grid grid-cols-3 gap-2 p-4 pt-2">
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Indication</div>
                        <div className="text-sm font-medium">{csr.indication}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Phase</div>
                        <div className="text-sm font-medium">{csr.phase}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Date</div>
                        <div className="text-sm font-medium">{csr.date}</div>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-3 flex justify-between items-center">
                      <Button className="flex items-center gap-1" variant="ghost" size="sm">
                        <FileText size={16} />
                        View Details
                      </Button>
                      <Button className="flex items-center gap-1" variant="ghost" size="sm">
                        <BarChart2 size={16} />
                        Analytics
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-2">
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                <CardContent className="p-6">
                  <p className="text-amber-700 dark:text-amber-400">No CSR reports match your current filters. Try adjusting your search criteria.</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Mock data for demonstration
const mockCsrData: CsrItem[] = [
  {
    id: "1",
    title: "A Phase III Study of Drug X for Advanced Metastatic Breast Cancer",
    sponsor: "Pfizer",
    phase: "Phase 3",
    date: "Jan 15, 2023",
    indication: "Oncology",
    status: "Completed"
  },
  {
    id: "2",
    title: "Safety and Efficacy of Drug Y in Patients with Rheumatoid Arthritis",
    sponsor: "Novartis",
    phase: "Phase 2",
    date: "Mar 22, 2023",
    indication: "Immunology",
    status: "Completed"
  },
  {
    id: "3",
    title: "Long-term Follow-up Study of Drug Z for Multiple Sclerosis",
    sponsor: "Biogen",
    phase: "Phase 4",
    date: "Feb 8, 2023",
    indication: "Neurology",
    status: "In Progress"
  },
  {
    id: "4",
    title: "First-in-Human Study of Novel Antibody Treatment for Psoriasis",
    sponsor: "AbbVie",
    phase: "Phase 1",
    date: "Apr 11, 2023",
    indication: "Dermatology",
    status: "In Progress"
  },
  {
    id: "5",
    title: "A Randomized Trial of Drug A for Hypertension",
    sponsor: "Merck",
    phase: "Phase 3",
    date: "May 5, 2023",
    indication: "Cardiology",
    status: "Completed"
  },
  {
    id: "6",
    title: "Efficacy of Drug B in HER2-Positive Breast Cancer",
    sponsor: "Genentech",
    phase: "Phase 2",
    date: "Jun 17, 2023",
    indication: "Oncology",
    status: "Completed"
  }
];