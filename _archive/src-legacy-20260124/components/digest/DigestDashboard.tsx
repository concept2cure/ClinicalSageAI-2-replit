import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Clock, AlertCircle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import DigestPreferences from "./DigestPreferences";

export default function DigestDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  
  // Fetch digest data when component loads
  useEffect(() => {
    const fetchDigestData = async () => {
      if (!user) return;
      
      setLoading(true);
      
      try {
        const response = await apiRequest('POST', '/api/digest/get-data', {
          user_id: user.id
        });
        
        const data = await response.json();
        
        if (data && data.digest) {
          setDigest(data.digest);
        }
        
        // Determine when the digest was last sent (fictional for now)
        // In a real implementation, this would come from the export logs
        const todayMinus7 = new Date();
        todayMinus7.setDate(todayMinus7.getDate() - 7);
        setLastSent(todayMinus7);
      } catch (error) {
        console.error('Error fetching digest data:', error);
        // toast call replaced
  // Original: toast({
          title: "Failed to load digest",
          description: "Your weekly digest could not be loaded. Please try again later.",
          variant: "destructive",
        })
  console.log('Toast would show:', {
          title: "Failed to load digest",
          description: "Your weekly digest could not be loaded. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchDigestData();
  }, [user, toast]);
  
  const handleSendDigest = async () => {
    if (!user) return;
    
    setSending(true);
    
    try {
      const response = await apiRequest('POST', '/api/notify/send-weekly-digest', {
        user_id: user.id,
        user_email: user.email || 'test@example.com', // Fallback for testing
      });
      
      if (response.ok) {
        // toast call replaced
  // Original: toast({
          title: "Digest sent",
          description: "Your weekly digest has been generated and sent.",
        })
  console.log('Toast would show:', {
          title: "Digest sent",
          description: "Your weekly digest has been generated and sent.",
        });
        
        // Update last sent date
        setLastSent(new Date());
      } else {
        throw new Error('Failed to send digest');
      }
    } catch (error) {
      console.error('Error sending digest:', error);
      // toast call replaced
  // Original: toast({
        title: "Failed to send digest",
        description: "The digest could not be sent. Please try again later.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Failed to send digest",
        description: "The digest could not be sent. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };
  
  // Format digest text for display
  const formatDigestContent = (text: string) => {
    return text.split('\n').map((line, index) => {
      // Add badge for exported reports
      if (line.startsWith('Reports Exported:')) {
        return (
          <div key={index} className="flex items-center font-semibold text-primary mb-2 mt-4">
            <Badge variant="outline" className="mr-2">Reports</Badge>
            {line.replace('Reports Exported:', '')}
          </div>
        );
      }
      
      // Add badge for analyzed protocols
      if (line.startsWith('Protocols Analyzed:')) {
        return (
          <div key={index} className="flex items-center font-semibold text-primary mb-2 mt-4">
            <Badge variant="outline" className="mr-2">Protocols</Badge>
            {line.replace('Protocols Analyzed:', '')}
          </div>
        );
      }
      
      // Add badge for protocol comparisons
      if (line.startsWith('Protocol Comparisons:')) {
        return (
          <div key={index} className="flex items-center font-semibold text-primary mb-2 mt-4">
            <Badge variant="outline" className="mr-2">Comparisons</Badge>
            {line.replace('Protocol Comparisons:', '')}
          </div>
        );
      }
      
      // Format list items with a check mark
      if (line.startsWith('- ')) {
        return (
          <div key={index} className="flex items-start ml-4 mb-1">
            <Check className="h-4 w-4 mr-2 mt-1 text-green-500" />
            <span>{line.substring(2)}</span>
          </div>
        );
      }
      
      // Return regular lines
      return line ? <p key={index} className="mb-2">{line}</p> : <br key={index} />;
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Weekly Digest</CardTitle>
            <CardDescription>
              A summary of your recent activity and intelligence updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : digest ? (
              <div className="prose prose-sm max-w-none">
                {formatDigestContent(digest)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Recent Activity</h3>
                <p className="text-sm text-muted-foreground max-w-md mt-2">
                  There is no activity to report in your weekly digest. As you use TrialSage to analyze protocols and generate reports, your activity will appear here.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="flex items-center text-sm text-muted-foreground">
              {lastSent ? (
                <>
                  <Clock className="h-4 w-4 mr-2" />
                  <span>Last sent: {lastSent.toLocaleDateString()}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <span>Never sent</span>
                </>
              )}
            </div>
            <Button
              onClick={handleSendDigest}
              disabled={sending}
              className="flex items-center"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Now
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Digest Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Email Delivery</span>
                  <Badge variant="outline" className="bg-green-50">Active</Badge>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Next Digest</span>
                  <span className="text-sm">
                    {lastSent ? new Date(lastSent.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString() : "Not scheduled"}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Content Sources</span>
                  <span className="text-sm">3 active</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <DigestPreferences />
        </div>
      </div>
    </div>
  );
}