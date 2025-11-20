// /client/components/ProtocolEmailer.jsx
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mail, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProtocolEmailer() {
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!email || !text) {
      // toast call replaced
  // Original: toast({
        title: "Missing information",
        description: "Please enter both email and protocol text.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing information",
        description: "Please enter both email and protocol text.",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch("/api/export/send-protocol-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_email: email, text })
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // toast call replaced
  // Original: toast({
        title: "Protocol sent",
        description: `Protocol successfully sent to ${email}`,
      })
  console.log('Toast would show:', {
        title: "Protocol sent",
        description: `Protocol successfully sent to ${email}`,
      });
      
      // Clear form after success
      setEmail("");
      setText("");
      
    } catch (error) {
      console.error("Failed to send protocol:", error);
      // toast call replaced
  // Original: toast({
        title: "Failed to send",
        description: "There was an error sending the protocol document.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Failed to send",
        description: "There was an error sending the protocol document.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center space-x-2">
          <Mail className="h-5 w-5 text-blue-500" />
          <h3 className="text-md font-semibold">Send Protocol to Stakeholder</h3>
        </div>
        
        <Input
          placeholder="Recipient email (e.g. sponsor@biotech.com)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2"
        />
        
        <Textarea
          placeholder="Paste final protocol content here..."
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        
        <Button 
          onClick={handleSend} 
          disabled={loading} 
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send via Email
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}