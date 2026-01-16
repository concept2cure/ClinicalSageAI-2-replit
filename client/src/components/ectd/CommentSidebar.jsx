import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Check, X, Reply, Plus } from 'lucide-react'

export default function CommentSidebar({ comments = [], onAddComment, onResolveComment }) {
  const [newComment, setNewComment] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (!newComment.trim()) return;
    onAddComment({
      id: Date.now().toString(),
      author: "Current User",
      text: newComment,
      date: new Date().toLocaleString(),
      resolved: false
    });
    setNewComment('');
    setIsAdding(false);
  };

  return (
    <div className="flex flex-col h-full border-l bg-gray-50 w-80">
      <div className="p-4 border-b bg-white flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Comments
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setIsAdding(!isAdding)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {isAdding && (
        <div className="p-4 border-b bg-white">
          <Textarea 
            placeholder="Write a comment..." 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="mb-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd}>Post</Button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {comments.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              No comments yet.
            </div>
          ) : (
            comments.map((comment) => (
              <Card key={comment.id} className={`text-sm ${comment.resolved ? 'opacity-60 bg-gray-100' : 'bg-white'}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                          {comment.author.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-xs">{comment.author}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{comment.date}</span>
                  </div>
                  <p className="text-gray-700">{comment.text}</p>
                  {!comment.resolved && (
                    <div className="flex justify-end gap-1 pt-2">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => onResolveComment(comment.id)}
                        title="Resolve"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
