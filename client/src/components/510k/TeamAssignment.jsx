import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Users, UserPlus, Shield, FileText, Heart, Briefcase, Mail, Phone, X, Check, AlertCircle, Crown, UserCheck, Clock } from 'lucide-react'

// Predefined roles for 510(k) projects
const PROJECT_ROLES = [
  { 
    id: 'project_lead', 
    label: 'Project Lead', 
    icon: <Crown className="h-4 w-4" />,
    description: 'Overall project responsibility and coordination',
    required: true,
    permissions: ['full_access', 'approve_submissions', 'manage_team']
  },
  { 
    id: 'regulatory_lead', 
    label: 'Regulatory Lead', 
    icon: <Shield className="h-4 w-4" />,
    description: 'Regulatory strategy and FDA compliance',
    required: true,
    permissions: ['edit_regulatory', 'approve_regulatory', 'submit_fda']
  },
  { 
    id: 'quality_lead', 
    label: 'Quality Lead', 
    icon: <UserCheck className="h-4 w-4" />,
    description: 'Quality system and compliance oversight',
    required: true,
    permissions: ['edit_quality', 'approve_quality', 'audit_trail']
  },
  { 
    id: 'technical_lead', 
    label: 'Technical Lead', 
    icon: <Briefcase className="h-4 w-4" />,
    description: 'Technical documentation and testing',
    required: false,
    permissions: ['edit_technical', 'upload_test_data', 'review_technical']
  },
  { 
    id: 'clinical_lead', 
    label: 'Clinical Lead', 
    icon: <Heart className="h-4 w-4" />,
    description: 'Clinical data and studies management',
    required: false,
    permissions: ['edit_clinical', 'manage_clinical_data', 'review_clinical']
  },
  { 
    id: 'reviewer', 
    label: 'Reviewer', 
    icon: <FileText className="h-4 w-4" />,
    description: 'Document review and feedback',
    required: false,
    permissions: ['view_all', 'add_comments', 'track_changes']
  },
  { 
    id: 'contributor', 
    label: 'Contributor', 
    icon: <Users className="h-4 w-4" />,
    description: 'Content creation and data entry',
    required: false,
    permissions: ['edit_assigned', 'upload_documents', 'add_data']
  }
];

export default function TeamAssignment({ projectId, onComplete, initialTeam = [] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [teamMembers, setTeamMembers] = useState(initialTeam);
  const [newMember, setNewMember] = useState({
    name: '',
    email: '',
    role: '',
    phone: '',
    department: ''
  });
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Fetch organization users
  const { data: organizationUsers } = useQuery({
    queryKey: ['/api/organization/users'],
    queryFn: async () => {
      const response = await fetch('/api/organization/users', {
        headers: {
          'x-organization-id': localStorage.getItem('organizationId') || '1'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    }
  });

  // Validate team composition
  const validateTeam = () => {
    const errors = {};
    const assignedRoles = teamMembers.map(m => m.role);
    
    // Check required roles
    const requiredRoles = PROJECT_ROLES.filter(r => r.required);
    for (const role of requiredRoles) {
      if (!assignedRoles.includes(role.id)) {
        errors[role.id] = `${role.label} is required`;
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Add team member
  const handleAddMember = () => {
    if (!newMember.name || !newMember.email || !newMember.role) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    // Check for duplicate email
    if (teamMembers.some(m => m.email === newMember.email)) {
      toast({
        title: 'Duplicate Member',
        description: 'This user is already on the team',
        variant: 'destructive'
      });
      return;
    }

    // Check for duplicate role (for unique roles)
    const uniqueRoles = ['project_lead', 'regulatory_lead', 'quality_lead'];
    if (uniqueRoles.includes(newMember.role) && 
        teamMembers.some(m => m.role === newMember.role)) {
      toast({
        title: 'Role Already Assigned',
        description: 'This role has already been assigned to another team member',
        variant: 'destructive'
      });
      return;
    }

    const member = {
      id: Date.now(), // Temporary ID
      ...newMember,
      addedAt: new Date().toISOString(),
      status: 'pending'
    };

    setTeamMembers([...teamMembers, member]);
    setNewMember({ name: '', email: '', role: '', phone: '', department: '' });
    setIsAddingMember(false);
    
    toast({
      title: 'Team Member Added',
      description: `${member.name} has been added to the team`,
    });
  };

  // Remove team member
  const handleRemoveMember = (memberId) => {
    setTeamMembers(teamMembers.filter(m => m.id !== memberId));
  };

  // Update member role
  const handleUpdateRole = (memberId, newRole) => {
    setTeamMembers(teamMembers.map(m => 
      m.id === memberId ? { ...m, role: newRole } : m
    ));
  };

  // Save team mutation
  const saveTeamMutation = useMutation({
    mutationFn: async (team) => {
      const response = await apiRequest(`/api/510k/projects/${projectId}/team`, {
        method: 'PUT',
        body: JSON.stringify({ teamMembers: team })
      });
      
      if (!response.ok) throw new Error('Failed to save team');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/510k/projects/${projectId}/team`] });
      toast({
        title: 'Team Saved',
        description: 'Project team has been successfully configured',
      });
      onComplete(teamMembers);
    },
    onError: (error) => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save team',
        variant: 'destructive',
      });
    }
  });

  const handleSubmit = () => {
    if (!validateTeam()) {
      toast({
        title: 'Incomplete Team',
        description: 'Please assign all required roles',
        variant: 'destructive',
      });
      return;
    }

    saveTeamMutation.mutate(teamMembers);
  };

  const getRoleInfo = (roleId) => {
    return PROJECT_ROLES.find(r => r.id === roleId);
  };

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Assignment
          </CardTitle>
          <CardDescription>
            Assign team members and define roles for your 510(k) submission project
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Required Roles Alert */}
      {Object.keys(validationErrors).length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Missing Required Roles:</strong>
            <ul className="mt-2 list-disc list-inside">
              {Object.values(validationErrors).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Current Team Members */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Current Team Members</CardTitle>
            <Button
              size="sm"
              onClick={() => setIsAddingMember(true)}
              data-testid="button-add-member"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {teamMembers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No team members assigned yet</p>
              <p className="text-sm mt-2">Click "Add Member" to start building your team</p>
            </div>
          ) : (
            <div className="space-y-4">
              {teamMembers.map((member) => {
                const roleInfo = getRoleInfo(member.role);
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                    data-testid={`team-member-${member.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                      </Avatar>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{member.name}</p>
                          {member.status === 'pending' && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        {member.department && (
                          <p className="text-xs text-gray-500">{member.department}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {roleInfo && (
                          <div className="flex items-center gap-1">
                            {roleInfo.icon}
                            <span className="font-medium text-sm">{roleInfo.label}</span>
                            {roleInfo.required && (
                              <span className="text-red-500">*</span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {roleInfo?.description}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveMember(member.id)}
                        data-testid={`button-remove-${member.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Member Form */}
      {isAddingMember && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Team Member</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="memberName">Name *</Label>
                  <Input
                    id="memberName"
                    data-testid="input-member-name"
                    value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <Label htmlFor="memberEmail">Email *</Label>
                  <Input
                    id="memberEmail"
                    data-testid="input-member-email"
                    type="email"
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    placeholder="email@company.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="memberRole">Role *</Label>
                  <Select
                    value={newMember.role}
                    onValueChange={(value) => setNewMember({ ...newMember, role: value })}
                    data-testid="select-member-role"
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_ROLES.map(role => {
                        const isAssigned = teamMembers.some(m => m.role === role.id) && 
                                         ['project_lead', 'regulatory_lead', 'quality_lead'].includes(role.id);
                        return (
                          <SelectItem 
                            key={role.id} 
                            value={role.id}
                            disabled={isAssigned}
                          >
                            <div className="flex items-center gap-2">
                              {role.icon}
                              {role.label}
                              {role.required && <span className="text-red-500">*</span>}
                              {isAssigned && <Badge variant="secondary" className="ml-2 text-xs">Assigned</Badge>}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="memberDepartment">Department</Label>
                  <Input
                    id="memberDepartment"
                    data-testid="input-member-department"
                    value={newMember.department}
                    onChange={(e) => setNewMember({ ...newMember, department: e.target.value })}
                    placeholder="e.g., Regulatory Affairs"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="memberPhone">Phone</Label>
                <Input
                  id="memberPhone"
                  data-testid="input-member-phone"
                  value={newMember.phone}
                  onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddingMember(false);
                    setNewMember({ name: '', email: '', role: '', phone: '', department: '' });
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddMember} data-testid="button-confirm-add">
                  <Check className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Role Overview</CardTitle>
          <CardDescription>
            Understanding team roles and responsibilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PROJECT_ROLES.map(role => {
              const isAssigned = teamMembers.some(m => m.role === role.id);
              return (
                <div
                  key={role.id}
                  className={`p-3 border rounded-lg ${isAssigned ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}
                  data-testid={`role-overview-${role.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      {role.icon}
                      <div>
                        <p className="font-medium text-sm">
                          {role.label}
                          {role.required && <span className="text-red-500 ml-1">*</span>}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">{role.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {role.permissions.slice(0, 3).map(perm => (
                            <Badge key={perm} variant="secondary" className="text-xs">
                              {perm.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    {isAssigned && (
                      <Check className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => saveTeamMutation.mutate(teamMembers)}
          disabled={teamMembers.length === 0}
          data-testid="button-save-team"
        >
          Save Team
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!validateTeam() || teamMembers.length === 0}
          data-testid="button-complete-assignment"
        >
          <UserCheck className="h-4 w-4 mr-2" />
          Complete Team Assignment
        </Button>
      </div>
    </div>
  );
}