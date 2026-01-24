import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Archive, Clock, Download, Eye, FileText, Share2, 
  FileSearch, RotateCcw, Calendar, Tag, ExternalLink, Filter 
} from "lucide-react";

export default function SummaryPacketArchive({ sessionId }) {
  const [archiveItems, setArchiveItems] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const { toast } = useToast();

  // Load summary packet archive for the current session
  useEffect(() => {
    if (sessionId) {
      setIsLoading(true);
      fetch(`/api/summary-packet/archive?study_id=${sessionId}`)
        .then(response => {
          if (response.ok) return response.json();
          return { packets: [] };
        })
        .then(data => {
          setArchiveItems(data.packets || []);
          setIsLoading(false);
        })
        .catch(error => {
          console.error("Error loading summary packet archive:", error);
          setIsLoading(false);
        });
    } else {
      setArchiveItems([]);
      setActiveItem(null);
    }
  }, [sessionId]);

  // Load a specific packet version details
  const loadPacketDetails = async (packetId, versionId) => {
    if (!sessionId) {
      // toast call replaced
  // Original: toast({
        title: "No Session Selected",
        description: "Please select a study session first",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "No Session Selected",
        description: "Please select a study session first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/summary-packet/version?study_id=${sessionId}&packet_id=${packetId}&version_id=${versionId}`);
      
      if (!response.ok) {
        throw new Error("Failed to load packet details");
      }
      
      const data = await response.json();
      setActiveItem(data);

      // Log this to memory
      try {
        await fetch('/api/insight/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            title: "Viewed Archived Summary Packet",
            summary: `Accessed version ${data.version || '1'} of "${data.title}" packet from archive.`,
            status: "reference"
          })
        });
      } catch (memoryError) {
        console.error("Failed to log memory:", memoryError);
      }
      
      setViewMode("details");
    } catch (error) {
      console.error("Error loading packet details:", error);
      // toast call replaced
  // Original: toast({
        title: "Loading Failed",
        description: error.message || "An error occurred while loading the packet details.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Loading Failed",
        description: error.message || "An error occurred while loading the packet details.",
        variant: "destructive",
      });
    }
  };

  // Handle download
  const handleDownloadPacket = async (packetId, versionId) => {
    if (!sessionId) return;

    try {
      // Log this to memory
      try {
        await fetch('/api/insight/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            title: "Downloaded Archived Packet",
            summary: `Downloaded version ${versionId || '1'} of packet ID ${packetId} from archive.`,
            status: "completed"
          })
        });
      } catch (memoryError) {
        console.error("Failed to log memory:", memoryError);
      }

      // Open the PDF in a new tab
      window.open(`/static/archive/${packetId}_v${versionId}.pdf`, "_blank");

      // toast call replaced
  // Original: toast({
        title: "Download Started",
        description: "Your archived summary packet is downloading.",
      })
  console.log('Toast would show:', {
        title: "Download Started",
        description: "Your archived summary packet is downloading.",
      });
    } catch (error) {
      console.error("Download error:", error);
      // toast call replaced
  // Original: toast({
        title: "Download Failed",
        description: error.message || "An error occurred during download.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Download Failed",
        description: error.message || "An error occurred during download.",
        variant: "destructive",
      });
    }
  };

  // Handle restore packet (create a new version based on this archived version)
  const handleRestorePacket = async (packetId, versionId) => {
    if (!sessionId) return;

    try {
      const response = await fetch("/api/summary-packet/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          study_id: sessionId,
          packet_id: packetId,
          version_id: versionId
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to restore packet");
      }

      const data = await response.json();
      
      // Log this to memory
      try {
        await fetch('/api/insight/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            title: "Restored Summary Packet",
            summary: `Restored version ${versionId} of "${data.title}" packet for further editing.`,
            status: "active"
          })
        });
      } catch (memoryError) {
        console.error("Failed to log memory:", memoryError);
      }

      // toast call replaced
  // Original: toast({
        title: "Packet Restored",
        description: "The archived packet has been restored for editing.",
      })
  console.log('Toast would show:', {
        title: "Packet Restored",
        description: "The archived packet has been restored for editing.",
      });
      
      // Refresh the list to show the new active version
      fetch(`/api/summary-packet/archive?study_id=${sessionId}`)
        .then(response => response.json())
        .then(data => {
          setArchiveItems(data.packets || []);
        });
        
    } catch (error) {
      console.error("Restore error:", error);
      // toast call replaced
  // Original: toast({
        title: "Restore Failed",
        description: error.message || "An error occurred while restoring the packet.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Restore Failed",
        description: error.message || "An error occurred while restoring the packet.",
        variant: "destructive",
      });
    }
  };

  // Handle share
  const handleSharePacket = async (packetId, versionId) => {
    if (!sessionId) return;

    try {
      const response = await fetch("/api/summary-packet/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          study_id: sessionId,
          packet_id: packetId,
          version_id: versionId
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create share link");
      }

      const data = await response.json();
      
      // Copy the share link to clipboard
      navigator.clipboard.writeText(data.shareUrl);

      // Log this to memory
      try {
        await fetch('/api/insight/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            title: "Shared Archived Packet",
            summary: `Created shareable link for archived packet version ${versionId}.`,
            status: "completed"
          })
        });
      } catch (memoryError) {
        console.error("Failed to log memory:", memoryError);
      }

      // toast call replaced
  // Original: toast({
        title: "Share Link Created",
        description: "Link copied to clipboard. You can now share this with colleagues.",
      })
  console.log('Toast would show:', {
        title: "Share Link Created",
        description: "Link copied to clipboard. You can now share this with colleagues.",
      });

    } catch (error) {
      console.error("Share error:", error);
      // toast call replaced
  // Original: toast({
        title: "Share Failed",
        description: error.message || "An error occurred while creating the share link.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Share Failed",
        description: error.message || "An error occurred while creating the share link.",
        variant: "destructive",
      });
    }
  };

  // Filter and search the archive items
  const getFilteredItems = () => {
    return archiveItems.filter(item => {
      // Apply status filter
      if (filterStatus !== "all" && item.status !== filterStatus) {
        return false;
      }
      
      // Apply search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          (item.title && item.title.toLowerCase().includes(query)) ||
          (item.description && item.description.toLowerCase().includes(query)) ||
          (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)))
        );
      }
      
      return true;
    });
  };

  const filteredItems = getFilteredItems();

  // Render status badge
  const renderStatusBadge = (status) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "final":
        return <Badge variant="default">Final</Badge>;
      case "archived":
        return <Badge variant="secondary">Archived</Badge>;
      case "superseded":
        return <Badge variant="warning">Superseded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Archive className="mr-2 h-5 w-5" />
          Summary Packet Archive
        </CardTitle>
        <CardDescription>
          Access previous versions of summary packets in this study session
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {!sessionId ? (
          <div className="text-center p-6 text-muted-foreground">
            <Archive className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Select a study session to view its archive</p>
          </div>
        ) : isLoading ? (
          <div className="text-center p-6">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading archive...</p>
          </div>
        ) : viewMode === "list" ? (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Label htmlFor="search" className="sr-only">Search</Label>
                <div className="relative">
                  <FileSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search packets..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="filter" className="sr-only">Filter</Label>
                <div className="relative">
                  <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <select
                    id="filter"
                    className="pl-9 h-10 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pr-8 w-full sm:w-32"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="final">Final</option>
                    <option value="archived">Archived</option>
                    <option value="superseded">Superseded</option>
                  </select>
                </div>
              </div>
            </div>
            
            {filteredItems.length === 0 ? (
              <div className="text-center p-6 border rounded-md">
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <h3 className="text-base font-medium mb-1">No packets found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery || filterStatus !== "all"
                    ? "Try adjusting your search or filters"
                    : "Generate a summary packet to start building your archive"}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[350px] rounded-md border">
                <div className="space-y-3 p-3">
                  {filteredItems.map((item, index) => (
                    <Card key={index} className="overflow-hidden">
                      <div className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <h3 className="font-medium text-base line-clamp-1">{item.title}</h3>
                            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                              <span className="flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                {formatDate(item.created_at)}
                              </span>
                              <span className="flex items-center">
                                <Clock className="h-3 w-3 mr-1" />
                                {item.version === 1 ? 'Initial' : `Version ${item.version}`}
                              </span>
                            </div>
                            
                            {item.tags && item.tags.length > 0 && (
                              <div className="flex items-center flex-wrap gap-1 mt-1">
                                <Tag className="h-3 w-3 text-muted-foreground" />
                                {item.tags.map((tag, tagIndex) => (
                                  <Badge variant="outline" key={tagIndex} className="text-xs py-0 h-5">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-1">
                            {renderStatusBadge(item.status)}
                          </div>
                        </div>
                        
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-2 mb-2 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        
                        <div className="flex justify-end gap-1 pt-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8"
                            onClick={() => loadPacketDetails(item.packet_id, item.version)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8"
                            onClick={() => handleSharePacket(item.packet_id, item.version)}
                          >
                            <Share2 className="h-3.5 w-3.5 mr-1" />
                            Share
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8"
                            onClick={() => handleDownloadPacket(item.packet_id, item.version)}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            PDF
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        ) : (
          // Detail view
          activeItem && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  Back to List
                </Button>
                
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadPacket(activeItem.packet_id, activeItem.version)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestorePacket(activeItem.packet_id, activeItem.version)}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Restore
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2 border-b pb-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">{activeItem.title}</h2>
                  {renderStatusBadge(activeItem.status)}
                </div>
                
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    Created: {formatDate(activeItem.created_at)}
                  </span>
                  <span className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    Version: {activeItem.version}
                  </span>
                </div>
                
                {activeItem.description && (
                  <p className="text-muted-foreground">{activeItem.description}</p>
                )}
                
                {activeItem.tags && activeItem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {activeItem.tags.map((tag, i) => (
                      <Badge key={i} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <h3 className="text-base font-medium">Packet Contents</h3>
                
                {activeItem.sections && activeItem.sections.length > 0 ? (
                  <div className="space-y-3">
                    {activeItem.sections.map((section, i) => (
                      <div key={i} className="border rounded-md p-3">
                        <h4 className="font-medium mb-1">{section.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {section.content}
                        </p>
                        {section.references && section.references.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                            <strong>References:</strong> {section.references.join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Preview not available. Download the PDF to view the complete packet.
                  </p>
                )}
                
                {activeItem.related_documents && activeItem.related_documents.length > 0 && (
                  <div>
                    <h3 className="text-base font-medium mb-2">Related Documents</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeItem.related_documents.map((doc, i) => (
                        <a 
                          key={i}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm flex items-center p-2 rounded-md hover:bg-muted transition-colors border"
                        >
                          <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span>{doc.title}</span>
                          <ExternalLink className="h-3 w-3 ml-1 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between border-t pt-4">
        <div className="text-xs text-muted-foreground">
          {filteredItems.length > 0 && `${filteredItems.length} packet(s) in archive`}
        </div>
        <div className="flex gap-2">
          {viewMode === "list" && (
            <Button variant="outline" size="sm" onClick={() => setSearchQuery("")} disabled={!searchQuery}>
              Clear Search
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}