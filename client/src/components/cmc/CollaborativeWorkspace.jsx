import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, MessageSquare, Save, Share2 } from 'lucide-react'

export default function CollaborativeWorkspace() {
  const [activeUsers, setActiveUsers] = useState([
    {
      id: 1,
      name: 'Jane Cooper',
      role: 'Regulatory Affairs',
      avatar: '/avatars/01.png',
      status: 'active',
    },
    {
      id: 2,
      name: 'Robert Fox',
      role: 'CMC Specialist',
      avatar: '/avatars/02.png',
      status: 'idle',
    },
  ]);
  const [comments, setComments] = useState([
    {
      id: 1,
      user: 'Jane Cooper',
      content:
        'We need to update the manufacturing process section to include the new validation data.',
      timestamp: '10 minutes ago',
    },
    {
      id: 2,
      user: 'Robert Fox',
      content: "I've uploaded the latest stability data for the API. Please review.",
      timestamp: '25 minutes ago',
    },
  ]);
  const [newComment, setNewComment] = useState('');
  const [documentContent, setDocumentContent] = useState(
    `# 3.2.P Drug Product

## 3.2.P.1 Description and Composition of the Drug Product

Parapain 500 mg is a white, capsule-shaped, film-coated tablet for oral administration. Each tablet contains 500 mg of parapainol hydrochloride as the active ingredient.

The complete list of ingredients:
- Parapainol Hydrochloride (active)
- Microcrystalline cellulose
- Pregelatinized starch
- Sodium starch glycolate
- Magnesium stearate
- Hypromellose
- Titanium dioxide
- Polyethylene glycol
- Talc`
  );

  const handleCommentSubmit = e => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const newCommentObj = {
      id: comments.length + 1,
      user: 'You',
      content: newComment,
      timestamp: 'Just now',
    };

    setComments([newCommentObj, ...comments]);
    setNewComment('');
  };

  // Simulate collaborative editing with changes notification
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeUsers.some(user => user.id === 2 && user.status === 'idle')) {
        setActiveUsers(prev =>
          prev.map(user => (user.id === 2 ? { ...user, status: 'editing' } : user))
        );

        setTimeout(() => {
          setDocumentContent(
            prev =>
              prev +
              '\n\n## 3.2.P.2 Pharmaceutical Development\n\nThe formulation development focused on creating a stable tablet that provides consistent dissolution and bioavailability.'
          );

          setComments(prev => [
            {
              id: prev.length + 1,
              user: 'Robert Fox',
              content:
                'Added initial pharmaceutical development section. Please review and expand.',
              timestamp: 'Just now',
            },
            ...prev,
          ]);

          setActiveUsers(prev =>
            prev.map(user => (user.id === 2 ? { ...user, status: 'idle' } : user))
          );
        }, 8000);
      }
    }, 15000);

    return () => clearTimeout(timer);
  }, [activeUsers]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>CMC Module 3.2.P Collaborative Editor</CardTitle>
            <CardDescription>
              Real-time editing and collaboration for Drug Product documentation
            </CardDescription>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="flex items-center space-x-1">
              <Users className="h-3 w-3" />
              <span>{activeUsers.length} active</span>
            </Badge>
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button size="sm">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Textarea
              className="font-mono h-[500px] resize-none"
              value={documentContent}
              onChange={e => setDocumentContent(e.target.value)}
            />
            <div className="mt-4 flex items-center space-x-2">
              <Button variant="outline" size="sm">
                Preview
              </Button>
              <Button variant="outline" size="sm">
                Export
              </Button>
              <Button variant="outline" size="sm">
                Version History
              </Button>
            </div>
          </div>
          <div className="col-span-1">
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-2">Active Collaborators</h3>
              <div className="space-y-3">
                {activeUsers.map(user => (
                  <div key={user.id} className="flex items-center space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback>
                        {user.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.role}</p>
                    </div>
                    <div>
                      <Badge
                        variant={
                          user.status === 'active'
                            ? 'default'
                            : user.status === 'editing'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {user.status === 'active'
                          ? 'Active'
                          : user.status === 'editing'
                            ? 'Editing'
                            : 'Idle'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Comments</h3>
                <Badge variant="outline">{comments.length}</Badge>
              </div>

              <form onSubmit={handleCommentSubmit} className="mb-4">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </form>

              <div className="space-y-4 max-h-[300px] overflow-y-auto">
                {comments.map(comment => (
                  <div key={comment.id} className="bg-muted/50 p-3 rounded-md">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{comment.user}</span>
                      <span className="text-xs text-muted-foreground">{comment.timestamp}</span>
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
