import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Circle, Edit3, Clock, Wifi, WifiOff } from 'lucide-react';

const CollaborationPresence = ({ 
 collaborators = [], 
 maxVisible = 5, 
 currentUser = null,
 isConnected = true,
 className = ""
}) => {
 // Filter out current user and sort by activity
 const otherCollaborators = collaborators
 .filter(c => c.id !== currentUser?.id)
 .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
 
 const visibleCollaborators = otherCollaborators.slice(0, maxVisible);
 const hiddenCount = Math.max(0, otherCollaborators.length - maxVisible);
 
 const getStatusIcon = (status) => {
 switch (status) {
 case 'online': return <Circle className="h-2 w-2 fill-current" />;
 case 'editing': return <Edit3 className="h-2 w-2" />;
 case 'idle': return <Clock className="h-2 w-2" />;
 default: return null;
 }
 };
 
 const getStatusColor = (status) => {
 switch (status) {
 case 'online': return 'text-green-500';
 case 'editing': return 'text-stone-500';
 case 'idle': return 'text-yellow-500';
 default: return 'text-gray-400';
 }
 };
 
 const getStatusText = (status) => {
 switch (status) {
 case 'online': return 'Online';
 case 'editing': return 'Editing';
 case 'idle': return 'Idle';
 default: return 'Offline';
 }
 };
 
 return (
 <div className={`flex items-center gap-2 ${className}`}>
 {/* Connection Status */}
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${
 isConnected ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
 }`}>
 {isConnected ? (
 <Wifi className="h-3 w-3" />
 ) : (
 <WifiOff className="h-3 w-3" />
 )}
 <span className="text-xs font-medium">
 {isConnected ? 'Live' : 'Offline'}
 </span>
 </div>
 </TooltipTrigger>
 <TooltipContent>
 <p className="text-xs">
 {isConnected ? 'Connected to collaboration server' : 'Disconnected - Changes saved locally'}
 </p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 
 {/* Collaborator Avatars */}
 {visibleCollaborators.length > 0 && (
 <>
 <div className="h-4 w-px bg-gray-300" />
 <div className="flex -space-x-2">
 {visibleCollaborators.map((collaborator) => (
 <TooltipProvider key={collaborator.id}>
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="relative">
 <Avatar className="h-8 w-8 border-2 border-white">
 <AvatarImage src={collaborator.avatar} />
 <AvatarFallback style={{ backgroundColor: collaborator.color }}>
 {collaborator.name.split(' ').map(n => n[0]).join('').toUpperCase()}
 </AvatarFallback>
 </Avatar>
 {/* Status Indicator */}
 <div className={`absolute -bottom-0.5 -right-0.5 ${getStatusColor(collaborator.status)}`}>
 {getStatusIcon(collaborator.status)}
 </div>
 </div>
 </TooltipTrigger>
 <TooltipContent>
 <div className="text-xs space-y-1">
 <div className="font-medium">{collaborator.name}</div>
 <div className="text-gray-500">
 {getStatusText(collaborator.status)}
 {collaborator.currentSection && (
 <span className="ml-1">• {collaborator.currentSection}</span>
 )}
 </div>
 </div>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 ))}
 
 {/* Hidden Count */}
 {hiddenCount > 0 && (
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-100 border-2 border-white text-xs font-medium text-gray-600">
 +{hiddenCount}
 </div>
 </TooltipTrigger>
 <TooltipContent>
 <div className="text-xs">
 <div className="font-medium mb-1">{hiddenCount} more collaborator{hiddenCount > 1 ? 's' : ''}</div>
 {otherCollaborators.slice(maxVisible, maxVisible + 5).map(c => (
 <div key={c.id} className="text-gray-500">{c.name}</div>
 ))}
 </div>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 )}
 </div>
 </>
 )}
 
 {/* Total Collaborators Count */}
 <Badge variant="secondary" className="text-xs">
 <span className="mr-1">{collaborators.length}</span>
 {collaborators.length === 1 ? 'editor' : 'editors'}
 </Badge>
 </div>
 );
};

export default CollaborationPresence;