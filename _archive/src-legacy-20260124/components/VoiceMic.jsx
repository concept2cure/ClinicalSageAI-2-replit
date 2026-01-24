/**
 * VoiceMic Component
 *
 * This component implements a push-to-talk interface for voice interaction
 * with the AI assistant. Features:
 *
 * 1. Audio recording with visual feedback
 * 2. WebSocket communication with backend
 * 3. Display of AI responses
 * 4. Error handling for browser compatibility
 */

import { useState, useEffect, useRef } from 'react';
import { Mic, Loader2, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

/**
 * Socket.io client import with fallback
 */
const createSocketFallback = options => {
  console.log(`[VoiceMic] Would create WebSocket connection with options:`, options);

  // Return a mock implementation that doesn't crash
  return {
    on: (event, callback) => {
      console.log(`[VoiceMic] Would listen for event: ${event}`);
    },
    emit: (event, data) => {
      console.log(`[VoiceMic] Would emit event: ${event} with data:`, data);

      // If this is an audio event, simulate a reply after a delay
      if (event === 'audio') {
        setTimeout(() => {
          console.log(`[VoiceMic] Simulating reply event`);

          // Find and call the latest reply handler
          const replyHandlers = window._voiceMicReplyHandlers;
          if (replyHandlers && replyHandlers.length > 0) {
            const latestHandler = replyHandlers[replyHandlers.length - 1];
            latestHandler({
              text: "I'm sorry, but the voice service is currently unavailable. Please try again later or use the text input instead.",
            });
          }
        }, 1500);
      }
    },
    connect: () => {
      console.log(`[VoiceMic] Would connect to WebSocket`);
    },
    disconnect: () => {
      console.log(`[VoiceMic] Would disconnect from WebSocket`);
    },
  };
};

/**
 * VoiceMic component for push-to-talk AI interaction
 */
export default function VoiceMic() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [text, setText] = useState('');
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const mediaRecorderRef = useRef(null);
  const { toast } = useToast();

  // Initialize socket connection
  useEffect(() => {
    setIsMounted(true);

    let socketIo;
    try {
      // Try to import socket.io-client
      socketIo = window.io;
    } catch (err) {
      console.warn('[VoiceMic] Socket.io not available, using fallback');
      socketIo = createSocketFallback;
    }

    // Store reply handlers globally for the fallback implementation
    if (!window._voiceMicReplyHandlers) {
      window._voiceMicReplyHandlers = [];
    }

    // Create socket connection
    try {
      const sock = socketIo({
        path: process.env.VOICE_WS_PATH || '/voice',
      });

      // Set up event handlers
      sock.on('connect', () => {
        console.log('[VoiceMic] Connected to voice server');
        setError(null);
      });

      sock.on('connect_error', err => {
        console.error('[VoiceMic] Connection error:', err);
        setError('Could not connect to voice server');
      });

      // Set up reply handler and store it for fallback
      const replyHandler = response => {
        if (isMounted) {
          console.log('[VoiceMic] Received reply:', response);
          setText(response.text);
          setIsProcessing(false);
        }
      };

      sock.on('reply', replyHandler);
      window._voiceMicReplyHandlers.push(replyHandler);

      // Set socket in state
      setSocket(sock);

      // Clean up on unmount
      return () => {
        setIsMounted(false);

        if (sock) {
          sock.off('reply');
          sock.disconnect();
        }

        // Remove this handler from global storage
        const index = window._voiceMicReplyHandlers.indexOf(replyHandler);
        if (index !== -1) {
          window._voiceMicReplyHandlers.splice(index, 1);
        }
      };
    } catch (err) {
      console.error('[VoiceMic] Error initializing socket:', err);
      setError('Could not initialize voice service');
      return () => setIsMounted(false);
    }
  }, []);

  // Start recording function
  const startRecording = async () => {
    try {
      setError(null);

      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser doesn't support voice recording");
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create media recorder
      const media = new MediaRecorder(stream);
      mediaRecorderRef.current = media;

      // Set up data handling
      const chunks = [];
      media.ondataavailable = e => chunks.push(e.data);

      // Set up stop handling
      media.onstop = async () => {
        // Combine chunks into a blob
        const blob = new Blob(chunks, { type: 'audio/webm' });

        // Convert to base64
        const buffer = await blob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

        // Send to server
        setIsProcessing(true);

        if (socket) {
          socket.emit('audio', { b64 });
        } else {
          console.error('[VoiceMic] Socket not available');
          setError('Voice service not connected');
          setIsProcessing(false);
        }

        // Clean up
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording
      media.start();
      setIsRecording(true);

      // Provide feedback
      toast({
        title: 'Recording started',
        description: 'Speak clearly into your microphone',
      });

      // Stop after 5 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, 5000);
    } catch (err) {
      console.error('[VoiceMic] Error starting recording:', err);
      setError(err.message || 'Could not access microphone');
      setIsRecording(false);
    }
  };

  // Stop recording function
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardTitle className="p-4 flex items-center">
        {isRecording ? (
          <Volume2 className="h-5 w-5 text-green-500 animate-pulse mr-2" />
        ) : (
          <VolumeX className="h-5 w-5 text-gray-400 mr-2" />
        )}
        Voice Assistant
      </CardTitle>

      <Separator />

      <CardContent className="pt-4">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="min-h-[100px] bg-gray-50 rounded-md p-3 mb-4">
          {isProcessing ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Processing...</span>
            </div>
          ) : text ? (
            <p className="text-gray-700">{text}</p>
          ) : (
            <p className="text-gray-400 italic">Press the button and ask a question...</p>
          )}
        </div>

        <div className="flex justify-center">
          <Button
            size="lg"
            variant={isRecording ? 'destructive' : 'default'}
            className={`rounded-full p-8 ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
          >
            {isRecording ? (
              <span className="flex items-center">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Recording...
              </span>
            ) : (
              <span className="flex items-center">
                <Mic className="h-6 w-6 mr-2" />
                Press to Speak
              </span>
            )}
          </Button>
        </div>
      </CardContent>

      <CardFooter className="text-xs text-gray-500 flex justify-center">
        {isRecording
          ? 'Recording will stop automatically after 5 seconds'
          : 'Click the button and ask a question'}
      </CardFooter>
    </Card>
  );
}
