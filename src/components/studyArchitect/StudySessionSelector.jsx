import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Calendar, Users, BookOpen } from 'lucide-react';

export default function StudySessionSelector({ onSelect }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);

      // In a real implementation, this would make an API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Sample session data
      const sampleSessions = [
        {
          id: 'session-001',
          name: 'Diabetes Phase 2 Protocol Design',
          lastUpdated: '2023-11-28',
          users: ['Dr. Sarah Johnson', 'Dr. Michael Chen', 'Dr. Lisa Rodriguez'],
          indication: 'Type 2 Diabetes',
        },
        {
          id: 'session-002',
          name: 'Oncology Precision Medicine Trial',
          lastUpdated: '2023-12-01',
          users: ['Dr. Robert Smith', 'Dr. Emily Davis'],
          indication: 'Non-Small Cell Lung Cancer',
        },
      ];

      setSessions(sampleSessions);
      setLoading(false);
    };

    fetchSessions();
  }, []);

  const createNewSession = () => {
    const newSession = {
      id: `session-${Date.now()}`,
      name: 'New Study Design Session',
      lastUpdated: new Date().toISOString().split('T')[0],
      users: ['Dr. Current User'],
      indication: 'Not specified',
    };

    setSessions([newSession, ...sessions]);
    onSelect(newSession);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Study Design Sessions</CardTitle>
        <Button onClick={createNewSession}>
          <PlusCircle className="h-4 w-4 mr-2" />
          New Session
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading sessions...</p>
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-4">
            {sessions.map(session => (
              <div
                key={session.id}
                className="border rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={() => onSelect(session)}
              >
                <h3 className="font-semibold">{session.name}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>Updated: {session.lastUpdated}</span>
                  </div>
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-2" />
                    <span>{session.users.length} collaborators</span>
                  </div>
                  <div className="flex items-center">
                    <BookOpen className="h-4 w-4 mr-2" />
                    <span>{session.indication}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-gray-500">No sessions found. Create a new one to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
