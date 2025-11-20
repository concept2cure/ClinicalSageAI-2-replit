// /client/components/EmailArchiveButton.jsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function EmailArchiveButton({ sessionId }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const loadEmail = async () => {
      if (!sessionId) return;
      
      setIsLoading(true);
      try {
        const res = await fetch(`/api/session/email/get/${sessionId}`);
        const data = await res.json();
        if (data?.email) {
          setEmail(data.email);
        } else {
          // Fallback to localStorage if API doesn't return an email
          const savedEmail = localStorage.getItem('userEmail');
          if (savedEmail) setEmail(savedEmail);
        }
      } catch (error) {
        console.error("Error loading email:", error);
        // Fallback to localStorage
        const savedEmail = localStorage.getItem('userEmail');
        if (savedEmail) setEmail(savedEmail);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadEmail();
  }, [sessionId]);

  const handleSend = async () => {
    if (!email || !email.includes('@')) {
      // toast call replaced
  // Original: toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive"
      });
      return;
    }

    setStatus("Sending...");
    setIsLoading(true);
    
    try {
      // Send the email archive
      const res = await fetch("/api/export/email-session-archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          session_id: sessionId, 
          recipient_email: email 
        })
      });
      
      const data = await res.json();
      
      if (data.status === "sent") {
        setStatus(`✅ Sent to ${email}`);
        
        // Save email to session persistence API
        await fetch("/api/session/email/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            session_id: sessionId, 
            recipient_email: email 
          })
        });
        
        // Also save to localStorage as fallback
        localStorage.setItem('userEmail', email);
        
        // toast call replaced
  // Original: toast({
          title: "Archive Emailed",
          description: `Complete study archive sent to ${email}`,
        })
  console.log('Toast would show:', {
          title: "Archive Emailed",
          description: `Complete study archive sent to ${email}`,
        });
      } else {
        setStatus("❌ Failed to send");
        throw new Error("Email failed to send");
      }
    } catch (error) {
      console.error("Error sending email:", error);
      setStatus("❌ Failed to send");
      // toast call replaced
  // Original: toast({
        title: "Email Failed",
        description: "There was an error sending your archive.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Email Failed",
        description: "There was an error sending your archive.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Email My Archive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="email"
          placeholder="Enter email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="text-sm"
          disabled={isLoading}
        />
        <div className="flex items-center justify-between">
          <Button
            variant="default"
            className="bg-gradient-to-r from-blue-500 to-indigo-500"
            onClick={handleSend}
            disabled={isLoading}
          >
            <Mail className="mr-2 h-4 w-4" />
            📤 Email My Archive
          </Button>
          {status && <p className="text-xs text-muted-foreground">{status}</p>}
        </div>
      </CardContent>
    </Card>
  );
}