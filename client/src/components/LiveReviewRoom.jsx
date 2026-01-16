/**
 * LiveReviewRoom Component
 *
 * This component implements a collaborative review interface using WebRTC
 * for real-time document collaboration. Features:
 *
 * 1. Document viewing via iframe
 * 2. WebRTC signaling for peer-to-peer connections
 * 3. Stream sharing of document view
 * 4. Supports multiple concurrent reviewers
 */

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UserIcon, Users, AlertCircle, Video, VideoOff } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

/**
 * LiveReviewRoom component for real-time document collaboration
 *
 * @param {Object} props - Component properties
 * @param {string} props.room - Room identifier for the collaboration session
 * @param {string} props.documentPath - Path to the document being reviewed
 */
export default function LiveReviewRoom({ room = 'default', documentPath = '/docs' }) {
  const iframeRef = useRef(null);
  const peerRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [participants, setParticipants] = useState(1); // Start with self
  const [error, setError] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    let socket = null;
    let peer = null;

    const cleanup = () => {
      if (peer) {
        try {
          peer.destroy();
        } catch (err) {
          console.warn('[LiveReview] Error destroying peer:', err);
        }
      }

      if (socket) {
        try {
          socket.disconnect();
        } catch (err) {
          console.warn('[LiveReview] Error disconnecting socket:', err);
        }
      }
    };

    // Initialize WebRTC and signaling
    const initializeConnection = async () => {
      try {
        // Check if required libraries are available
        const socketIoAvailable = typeof io !== 'undefined';
        const simplePeerAvailable = typeof window.SimplePeer !== 'undefined';

        if (!socketIoAvailable || !simplePeerAvailable) {
          console.warn(
            `[LiveReview] Required libraries not available: ` +
              `Socket.IO: ${socketIoAvailable}, SimplePeer: ${simplePeerAvailable}`
          );

          setError('Required libraries not available for live review');
          return;
        }

        // Connect to signaling server
        socket = io(process.env.REVIEW_RTC_SIGNAL || '/rtc-signal');

        socket.on('connect', () => {
          console.log(`[LiveReview] Connected to signaling server, joining room: ${room}`);
          socket.emit('join', room);
        });

        socket.on('connect_error', err => {
          console.error(`[LiveReview] Signaling server connection error:`, err);
          setError('Could not connect to review server');
        });

        socket.on('participants', count => {
          console.log(`[LiveReview] Participant count updated: ${count}`);
          setParticipants(count);
        });

        // Set up SimplePeer for WebRTC
        const initiatePeer = () => {
          if (peer) {
            try {
              peer.destroy();
            } catch (err) {
              console.warn('[LiveReview] Error destroying peer:', err);
            }
          }

          peer = new window.SimplePeer({
            initiator: true,
            trickle: false,
          });

          peer.on('signal', data => {
            console.log(`[LiveReview] Sending signal data`);
            socket.emit('signal', { room, d: data });
          });

          peer.on('connect', () => {
            console.log(`[LiveReview] Peer connected`);
            setIsConnected(true);

            toast({
              title: 'Connected',
              description: 'You are now connected to the review session',
            });
          });

          peer.on('error', err => {
            console.error(`[LiveReview] Peer error:`, err);
            setError('Connection error in review session');
            setIsConnected(false);
          });

          peer.on('close', () => {
            console.log(`[LiveReview] Peer connection closed`);
            setIsConnected(false);
          });

          peerRef.current = peer;
        };

        // Start as initiator
        initiatePeer();

        // Handle signals from other peers
        socket.on('signal', ({ d }) => {
          console.log(`[LiveReview] Received signal data`);
          if (peer && d) {
            peer.signal(d);
          }
        });

        // Handle new peers joining
        socket.on('new-peer', () => {
          console.log(`[LiveReview] New peer joined, re-initiating connection`);
          initiatePeer();
        });
      } catch (err) {
        console.error(`[LiveReview] Error initializing WebRTC:`, err);
        setError(err.message || 'Could not initialize review session');
      }
    };

    initializeConnection();

    // Clean up on unmount
    return cleanup;
  }, [room]);

  // Start/stop sharing the iframe stream
  const toggleSharing = async () => {
    try {
      if (isSharing) {
        // Stop sharing
        if (peerRef.current && peerRef.current.streams[0]) {
          peerRef.current.streams[0].getTracks().forEach(track => track.stop());
        }
        setIsSharing(false);
      } else {
        // Start sharing
        if (!iframeRef.current) {
          throw new Error('Document view not available');
        }

        if (!peerRef.current) {
          throw new Error('Peer connection not established');
        }

        // Check if captureStream is available on iframe
        if (typeof iframeRef.current.contentWindow.document.body.captureStream !== 'function') {
          throw new Error("Your browser doesn't support screen sharing of documents");
        }

        // Capture stream from iframe
        const stream = iframeRef.current.contentWindow.document.body.captureStream();

        // Add stream to peer connection
        stream.getTracks().forEach(track => {
          peerRef.current.addTrack(track, stream);
        });

        setIsSharing(true);

        toast({
          title: 'Sharing started',
          description: 'Others can now see your document view',
        });
      }
    } catch (err) {
      console.error(`[LiveReview] Error toggling sharing:`, err);
      setError(err.message || 'Could not share document view');
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">Live Review Session</CardTitle>

        <div className="flex items-center space-x-2">
          <Badge variant={isConnected ? 'success' : 'secondary'}>
            <Users className="h-3 w-3 mr-1" />
            {participants} {participants === 1 ? 'participant' : 'participants'}
          </Badge>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isSharing ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={toggleSharing}
                  disabled={!isConnected}
                >
                  {isSharing ? (
                    <VideoOff className="h-4 w-4 mr-1" />
                  ) : (
                    <Video className="h-4 w-4 mr-1" />
                  )}
                  {isSharing ? 'Stop Sharing' : 'Share View'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isSharing
                    ? 'Stop sharing your document view'
                    : 'Share your document view with others'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      {error && (
        <Alert variant="destructive" className="mx-4 mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <CardContent className="p-0">
        <iframe
          ref={iframeRef}
          src={documentPath}
          className="w-full h-[calc(100vh-10rem)] border-0 rounded-b-lg"
          title="Document Review"
        />
      </CardContent>
    </Card>
  );
}
