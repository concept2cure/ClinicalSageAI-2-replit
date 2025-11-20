import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import AdvancedDashboard from '../components/AdvancedDashboard';
import NLPQuery from '../components/NLPQuery';
import CERAPIDemo from '../components/CERAPIDemo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Info, AlertTriangle, Lock, Unlock, FileText, 
  ChevronRight, Search, X 
} from 'lucide-react';

// Types
interface Product {
  code: string;
  name: string;
  description: string;
}

interface FilteredData {
  query: string;
  results: Array<any>;
  timestamp: string;
  interpretation?: string;
  [key: string]: any;
}

// Sample NDC codes for demonstration
const SAMPLE_NDC_CODES: Product[] = [
  { code: '0078-0357-15', name: 'ENTRESTO 24/26 MG', description: 'Sacubitril/Valsartan tablets for heart failure' },
  { code: '0006-0277-31', name: 'JANUVIA 100 MG', description: 'Sitagliptin for type 2 diabetes' },
  { code: '0006-5125-58', name: 'KEYTRUDA 100 MG', description: 'Pembrolizumab injection for cancer treatment' },
  { code: '50090-1895-0', name: 'FARXIGA 10 MG', description: 'Dapagliflozin for type 2 diabetes/heart failure' },
  { code: '0002-3232-30', name: 'TRULICITY 1.5 MG', description: 'Dulaglutide for type 2 diabetes' }
];

// Sample device codes
const DEVICE_CODES: Product[] = [
  { code: 'DEN123456', name: 'HeartFlow FFRCT', description: 'Non-invasive coronary artery disease testing' },
  { code: 'DEN765432', name: 'Dexcom G6', description: 'Continuous glucose monitoring system' },
  { code: 'DEN246801', name: 'Inspire Upper Airway Stimulation', description: 'Sleep apnea treatment device' }
];

/**
 * EnhancedCERDashboardPage - Advanced dashboard for Clinical Evaluation Reports
 * 
 * Features:
 * - Authentication flow
 * - Product selection (NDC codes and device codes)
 * - Integration with NLP query
 * - Advanced data visualization
 * - API testing interface
 */
const EnhancedCERDashboardPage: React.FC = () => {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  
  // Product selection state
  const [ndcCode, setNdcCode] = useState<string>('');
  const [selectedNdcCodes, setSelectedNdcCodes] = useState<string[]>([]);
  
  // NLP query results
  const [filteredData, setFilteredData] = useState<FilteredData | null>(null);
  
  // UI state
  const [showAuthDialog, setShowAuthDialog] = useState<boolean>(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Check for authentication on component mount
  useEffect(() => {
    const cerAuth = localStorage.getItem('cer_auth');
    if (cerAuth === 'authenticated') {
      setIsAuthenticated(true);
    } else {
      setShowAuthDialog(true);
    }
  }, []);

  // Handle login action
  const handleLogin = useCallback(() => {
    localStorage.setItem('cer_auth', 'authenticated');
    setIsAuthenticated(true);
    setShowAuthDialog(false);
    
    // toast call replaced
  // Original: toast({
      title: "Authentication successful",
      description: "You have been granted access to the CER Dashboard."
    })
  console.log('Toast would show:', {
      title: "Authentication successful",
      description: "You have been granted access to the CER Dashboard."
    });
  }, [toast]);

  // Handle logout action
  const handleLogout = useCallback(() => {
    localStorage.removeItem('cer_auth');
    setIsAuthenticated(false);
    
    // toast call replaced
  // Original: toast({
      title: "Logged out",
      description: "You have been logged out of the CER Dashboard."
    })
  console.log('Toast would show:', {
      title: "Logged out",
      description: "You have been logged out of the CER Dashboard."
    });
  }, [toast]);

  // Handle searching for NDC codes
  const handleSearchNdc = useCallback(() => {
    if (!ndcCode.trim()) {
      // toast call replaced
  // Original: toast({
        title: "Empty Code",
        description: "Please enter an NDC or device code to search.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Empty Code",
        description: "Please enter an NDC or device code to search.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if the code exists in sample data
    const foundNdc = SAMPLE_NDC_CODES.find(item => item.code === ndcCode);
    const foundDevice = DEVICE_CODES.find(item => item.code === ndcCode);
    const foundProduct = foundNdc || foundDevice;
    
    if (foundProduct) {
      if (selectedNdcCodes.includes(ndcCode)) {
        // toast call replaced
  // Original: toast({
          title: "Already Selected",
          description: `${foundProduct.name} (${ndcCode})
  console.log('Toast would show:', {
          title: "Already Selected",
          description: `${foundProduct.name} (${ndcCode}) is already in your selection.`,
          variant: "destructive"
        });
      } else {
        setSelectedNdcCodes(prev => [...prev, ndcCode]);
        setNdcCode('');
        
        // toast call replaced
  // Original: toast({
          title: "Product Added",
          description: `${foundProduct.name} (${ndcCode})
  console.log('Toast would show:', {
          title: "Product Added",
          description: `${foundProduct.name} (${ndcCode}) has been added to your selection.`,
        });
      }
    } else {
      // toast call replaced
  // Original: toast({
        title: "Product Not Found",
        description: "The NDC or device code you entered could not be found.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Product Not Found",
        description: "The NDC or device code you entered could not be found.",
        variant: "destructive"
      });
    }
  }, [ndcCode, selectedNdcCodes, toast]);

  // Handle removing a selected product
  const handleRemoveCode = useCallback((code: string) => {
    setSelectedNdcCodes(prev => prev.filter(c => c !== code));
    
    // toast call replaced
  // Original: toast({
      title: "Product Removed",
      description: `Code ${code} has been removed from your selection.`,
    })
  console.log('Toast would show:', {
      title: "Product Removed",
      description: `Code ${code} has been removed from your selection.`,
    });
  }, [toast]);

  // Get product details by code
  const getProductDetails = useCallback((code: string): Product => {
    const ndcProduct = SAMPLE_NDC_CODES.find(item => item.code === code);
    if (ndcProduct) return ndcProduct;
    
    const deviceProduct = DEVICE_CODES.find(item => item.code === code);
    if (deviceProduct) return deviceProduct;
    
    return { code, name: code, description: 'No details available' };
  }, []);

  // Handle NLP query results
  const handleFilterResults = useCallback((data: FilteredData) => {
    setFilteredData(data);
  }, []);

  // If not authenticated, show login dialog
  if (!isAuthenticated) {
    return (
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <DialogDescription>
              You need to authenticate to access the Enhanced CER Dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="username" className="text-right">
                Username
              </Label>
              <Input id="username" defaultValue="demo_user" className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Password
              </Label>
              <Input id="password" type="password" defaultValue="demo1234" className="col-span-3" />
            </div>
          </div>
          <Button onClick={handleLogin} className="w-full">
            <Lock className="mr-2 h-4 w-4" />
            Login
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Enhanced CER Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Interactive Clinical Evaluation Report Analysis and Monitoring
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleLogout}>
            <Unlock className="mr-2 h-4 w-4" />
            Logout
          </Button>
          <Button variant="outline" onClick={() => navigate('/cer-generator')}>
            <FileText className="mr-2 h-4 w-4" />
            Simple CER
          </Button>
        </div>
      </div>
      
      <Alert className="mb-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important Notice</AlertTitle>
        <AlertDescription>
          This enhanced dashboard provides real-time analysis of FDA FAERS and MAUDE data. For regulatory submissions, 
          please use the PDF export feature to generate official documentation.
        </AlertDescription>
      </Alert>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Product Selection</CardTitle>
          <CardDescription>
            Enter NDC codes or device identifiers to analyze and compare
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2 mb-4">
            <div className="flex-1">
              <Input
                placeholder="Enter NDC or device code (e.g., 0078-0357-15)"
                value={ndcCode}
                onChange={(e) => setNdcCode(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchNdc()}
              />
            </div>
            <Button onClick={handleSearchNdc}>
              <Search className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </div>
          
          {selectedNdcCodes.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium mb-2">Selected Products:</h3>
              <div className="space-y-2">
                {selectedNdcCodes.map((code) => {
                  const product = getProductDetails(code);
                  return (
                    <div key={code} className="flex justify-between items-center p-3 bg-muted rounded-md">
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-sm text-muted-foreground">Code: {code}</div>
                        <div className="text-sm text-muted-foreground">{product.description}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveCode(code)}
                        aria-label={`Remove ${product.name}`}
                      >
                        <span className="sr-only">Remove</span>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Info className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No products selected yet. Add NDC or device codes to begin analysis.</p>
              <div className="mt-4 text-sm">
                <p className="mb-2">Try these example codes:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SAMPLE_NDC_CODES.slice(0, 3).map(item => (
                    <Button
                      key={item.code}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setNdcCode(item.code)}
                    >
                      {item.code}
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Add the CERAPIDemo component before NLPQuery */}
      <CERAPIDemo />
      
      {selectedNdcCodes.length > 0 && (
        <>
          <NLPQuery onFilterResults={handleFilterResults} />
          <AdvancedDashboard filteredData={filteredData || undefined} />
        </>
      )}
    </div>
  );
};

export default EnhancedCERDashboardPage;