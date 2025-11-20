// client/components/ConversationalAssistant.jsx
import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Send, Paperclip, File, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ConversationalAssistant({ initialPrompt }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const { toast } = useToast();
  
  // Initialize with system message if initialPrompt is provided
  useEffect(() => {
    if (initialPrompt && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: "👋 Hello! I'm the TrialSage assistant specializing in clinical trial design and analysis. How can I help you today?"
        }
      ]);
    }
  }, [initialPrompt, messages.length]);

  const handleSend = async () => {
    if (!input.trim() && !uploadedFile) return;
    setLoading(true);
    
    // Add user message to chat
    setMessages((prev) => [
      ...prev, 
      { 
        role: "user", 
        content: input + (uploadedFile ? `\n\n[Attached file: ${uploadedFile.name}]` : "")
      }
    ]);

    try {
      // First upload file if present
      let fileId = null;
      if (uploadedFile) {
        const formData = new FormData();
        formData.append("file", uploadedFile);
        
        try {
          const uploadRes = await fetch("/api/chat/upload", {
            method: "POST",
            body: formData,
          });
          
          if (!uploadRes.ok) {
            throw new Error(`Upload failed: ${uploadRes.status}`);
          }
          
          const uploadData = await uploadRes.json();
          fileId = uploadData.fileId;
          console.log("File uploaded successfully:", fileId);
        } catch (error) {
          console.error("Error uploading file:", error);
          // toast call replaced
  // Original: toast({
            title: "File upload failed",
            description: "Couldn't upload the file, but will continue with your message.",
            variant: "destructive",
          })
  console.log('Toast would show:', {
            title: "File upload failed",
            description: "Couldn't upload the file, but will continue with your message.",
            variant: "destructive",
          });
        }
      }
      
      // Then send the message
      console.log("Sending chat message to /api/chat/send-message");
      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          thread_id: threadId,
          file_id: fileId,
          system_prompt: initialPrompt, // Pass the initialPrompt as a system prompt
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log("Received response:", data);
      setThreadId(data.thread_id);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer
        },
      ]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, there was an error processing your request: ${error.message}. Please try again.`,
        },
      ]);
    } finally {
      setInput("");
      setLoading(false);
      setUploadedFile(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        // toast call replaced
  // Original: toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        })
  console.log('Toast would show:', {
          title: "File too large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      
      const allowedTypes = [
        'application/pdf', 
        'text/plain', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        // toast call replaced
  // Original: toast({
          title: "Unsupported file type",
          description: "Please upload a PDF, TXT, or DOC/DOCX file",
          variant: "destructive",
        })
  console.log('Toast would show:', {
          title: "Unsupported file type",
          description: "Please upload a PDF, TXT, or DOC/DOCX file",
          variant: "destructive",
        });
        return;
      }
      
      setUploadedFile(file);
    }
  };

  const handleFileUpload = async () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.click();
  };

  const removeUploadedFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        {uploadedFile && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 p-2 bg-primary/10 rounded border border-primary/20">
              <File className="h-4 w-4 text-primary" />
              <span className="text-sm flex-1 truncate">{uploadedFile.name}</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={removeUploadedFile}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground px-2">
              Your protocol will be analyzed against our CSR library of {779} clinical studies for best practices and recommendations.
            </p>
          </div>
        )}
        
        <div className="flex gap-2">
          <Input
            value={input}
            placeholder="Ask about CSR data, protocol design, or upload a draft protocol for analysis..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="min-w-[300px]"
          />
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleFileUpload}
            disabled={loading || uploading}
            className="flex-shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={loading || ((!input.trim()) && !uploadedFile)}
            className="flex-shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.txt,.doc,.docx"
        />
      </div>

      <div className="space-y-3">
        {messages.map((msg, idx) => (
          <Card key={idx} className="whitespace-pre-wrap text-sm">
            <CardContent className="py-3">
              <strong>{msg.role === "user" ? "You" : "TrialSage"}</strong>
              <div>{msg.content}</div>
            </CardContent>
          </Card>
        ))}
        
        {loading && (
          <Card className="whitespace-pre-wrap text-sm">
            <CardContent className="py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>TrialSage is thinking...</span>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}