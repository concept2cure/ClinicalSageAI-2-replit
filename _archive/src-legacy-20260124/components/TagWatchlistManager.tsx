import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, X, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TagWatchlistManagerProps {
  visibleTags?: string[];
  onWatchTag?: (tag: string) => void;
  onUnwatchTag?: (tag: string) => void;
}

export default function TagWatchlistManager({
  visibleTags = [],
  onWatchTag = () => {},
  onUnwatchTag = () => {}
}: TagWatchlistManagerProps) {
  const [watchedTags, setWatchedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch the current watchlist from the backend
  const fetchWatchlist = async () => {
    setIsLoading(true);
    try {
      // In a production environment, this would call a real API endpoint
      // For demo purposes, we'll just simulate a successful response
      // const response = await fetch('/api/alerts/watchlist');
      // const data = await response.json();
      // setWatchedTags(data.tags);
      
      // Simulate API response with a small delay
      setTimeout(() => {
        setWatchedTags(['PFS', 'ORR', 'PHASE 3']);
        setIsLoading(false);
      }, 500);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      // toast call replaced
  // Original: toast({
        title: 'Error',
        description: 'Failed to load your tag watchlist',
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Error',
        description: 'Failed to load your tag watchlist',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  // Add a tag to the watchlist
  const addTagToWatchlist = async (tag: string) => {
    if (watchedTags.includes(tag)) return;
    
    setIsLoading(true);
    try {
      // In a production environment, this would call a real API endpoint
      // const response = await fetch('/api/alerts/watchlist', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ action: 'add', tag })
      // });
      // const data = await response.json();
      // setWatchedTags(data.tags);
      
      // Simulate API response
      setTimeout(() => {
        setWatchedTags([...watchedTags, tag]);
        onWatchTag(tag);
        setIsLoading(false);
        // toast call replaced
  // Original: toast({
          title: 'Tag added to watchlist',
          description: `You'll be notified of significant changes to "${tag}"`,
        })
  console.log('Toast would show:', {
          title: 'Tag added to watchlist',
          description: `You'll be notified of significant changes to "${tag}"`,
        });
      }, 300);
    } catch (error) {
      console.error('Error adding tag to watchlist:', error);
      // toast call replaced
  // Original: toast({
        title: 'Error',
        description: 'Failed to add tag to your watchlist',
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Error',
        description: 'Failed to add tag to your watchlist',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  // Remove a tag from the watchlist
  const removeTagFromWatchlist = async (tag: string) => {
    setIsLoading(true);
    try {
      // In a production environment, this would call a real API endpoint
      // const response = await fetch('/api/alerts/watchlist', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ action: 'remove', tag })
      // });
      // const data = await response.json();
      // setWatchedTags(data.tags);
      
      // Simulate API response
      setTimeout(() => {
        setWatchedTags(watchedTags.filter(t => t !== tag));
        onUnwatchTag(tag);
        setIsLoading(false);
        // toast call replaced
  // Original: toast({
          title: 'Tag removed from watchlist',
          description: `"${tag}" has been removed from your alerts`,
        })
  console.log('Toast would show:', {
          title: 'Tag removed from watchlist',
          description: `"${tag}" has been removed from your alerts`,
        });
      }, 300);
    } catch (error) {
      console.error('Error removing tag from watchlist:', error);
      // toast call replaced
  // Original: toast({
        title: 'Error',
        description: 'Failed to remove tag from your watchlist',
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Error',
        description: 'Failed to remove tag from your watchlist',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  // Load watchlist on initial render
  useEffect(() => {
    fetchWatchlist();
  }, []);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <Star className="w-5 h-5 mr-2 text-yellow-500" />
          Tag Watchlist
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Current watchlist */}
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Your watched tags:</h4>
              {watchedTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {watchedTags.map((tag) => (
                    <Badge 
                      key={tag} 
                      variant="secondary"
                      className="pl-2 pr-1 py-1 flex items-center"
                    >
                      <AlertTriangle className="w-3 h-3 mr-1 text-yellow-500" />
                      {tag}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 ml-1 text-gray-500 hover:text-red-500 rounded-full p-0"
                        onClick={() => removeTagFromWatchlist(tag)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  You're not watching any tags yet. Add tags to get notified about significant changes.
                </p>
              )}
            </div>

            {/* Available tags to watch */}
            {visibleTags.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Available tags to watch:</h4>
                <div className="flex flex-wrap gap-2">
                  {visibleTags
                    .filter(tag => !watchedTags.includes(tag))
                    .map((tag) => (
                      <Button
                        key={tag}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => addTagToWatchlist(tag)}
                      >
                        <Star className="w-3 h-3 mr-1" /> Watch {tag}
                      </Button>
                    ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-4">
              Watched tags will appear in your weekly digest when they show significant changes in mention frequency.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}