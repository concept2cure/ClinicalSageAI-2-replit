import React, { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Globe,
  Mail,
  Phone,
  Plus,
  Sparkles,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const TeamSignup = () => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    companyName: '',
    companySize: '',
    industry: '',
    address: '',
    country: '',
    website: '',
    plan: 'enterprise',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    adminPhone: '',
    adminTitle: '',
    adminPassword: '',
    adminConfirmPassword: '',
    teamMembers: [
      {
        id: 1,
        firstName: '',
        lastName: '',
        email: '',
        role: 'user',
        modules: ['IND Wizard', 'CSR Intelligence'],
      },
      { id: 2, firstName: '', lastName: '', email: '', role: 'user', modules: ['Document Vault'] },
    ],
    paymentMethod: 'credit',
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    billingEmail: '',
    billingAddress: '',
    acceptTerms: false,
  });

  const plans = [
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: '$5,000',
      period: 'per month',
      seats: '25 seats included',
      description: 'Full access to all modules with custom integrations',
      features: [
        'All modules included',
        'Unlimited document processing',
        'Priority support',
        'DocuShare integration',
        'Custom AI model training',
        'Enterprise SLAs',
      ],
    },
    {
      id: 'professional',
      name: 'Professional',
      price: '$3,000',
      period: 'per month',
      seats: '15 seats included',
      description: 'Advanced features for growing teams',
      features: [
        'Access to core modules',
        '1,000 documents per month',
        'Email and chat support',
        'Team management',
        'Analytics dashboards',
        'API access',
      ],
    },
    {
      id: 'standard',
      name: 'Standard',
      price: '$1,500',
      period: 'per month',
      seats: '5 seats included',
      description: 'Essential tools for small teams',
      features: [
        'Basic modules only',
        '250 documents per month',
        'Email support',
        'Limited analytics',
        'No API access',
        'Standard SLAs',
      ],
    },
  ];

  const modules = [
    { id: 'ind', name: 'IND Wizard', description: 'Automated IND submissions' },
    { id: 'csr', name: 'CSR Intelligence', description: 'Interactive CSR dashboards' },
    { id: 'vault', name: 'Document Vault', description: '21 CFR Part 11 compliant storage' },
    {
      id: 'cmc',
      name: 'CMC Blueprint',
      description: 'Chemistry, Manufacturing, Controls automation',
    },
    { id: 'lumen', name: 'Ask Lumen', description: 'AI regulatory assistant' },
    { id: 'analytics', name: 'Analytics', description: '25 regulatory metrics dashboards' },
  ];

  const handleInputChange = e => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleTeamMemberChange = (index, field, value) => {
    const updatedTeamMembers = [...formData.teamMembers];
    updatedTeamMembers[index] = {
      ...updatedTeamMembers[index],
      [field]: value,
    };

    setFormData(prevData => ({
      ...prevData,
      teamMembers: updatedTeamMembers,
    }));
  };

  const handleTeamMemberModuleToggle = (index, moduleName) => {
    const updatedTeamMembers = [...formData.teamMembers];
    const teamMember = updatedTeamMembers[index];

    if (teamMember.modules.includes(moduleName)) {
      teamMember.modules = teamMember.modules.filter(m => m !== moduleName);
    } else {
      teamMember.modules = [...teamMember.modules, moduleName];
    }

    setFormData(prevData => ({
      ...prevData,
      teamMembers: updatedTeamMembers,
    }));
  };

  const addTeamMember = () => {
    const newId =
      formData.teamMembers.length > 0 ? Math.max(...formData.teamMembers.map(m => m.id)) + 1 : 1;

    setFormData(prevData => ({
      ...prevData,
      teamMembers: [
        ...prevData.teamMembers,
        { id: newId, firstName: '', lastName: '', email: '', role: 'user', modules: [] },
      ],
    }));
  };

  const removeTeamMember = id => {
    setFormData(prevData => ({
      ...prevData,
      teamMembers: prevData.teamMembers.filter(member => member.id !== id),
    }));
  };

  const validateStep = step => {
    switch (step) {
      case 1:
        if (!formData.companyName || !formData.industry || !formData.country) {
          toast({
            title: 'Missing information',
            description: 'Please fill out all required company information fields.',
            variant: 'destructive',
          });
          return false;
        }
        return true;

      case 2:
        if (!formData.adminFirstName || !formData.adminLastName || !formData.adminEmail) {
          toast({
            title: 'Missing information',
            description: 'Please fill out all required administrator information fields.',
            variant: 'destructive',
          });
          return false;
        }

        if (formData.adminPassword !== formData.adminConfirmPassword) {
          toast({
            title: 'Password mismatch',
            description: 'The passwords you entered do not match.',
            variant: 'destructive',
          });
          return false;
        }
        return true;

      case 3:
        if (
          formData.teamMembers.some(
            member => !member.firstName || !member.lastName || !member.email
          )
        ) {
          toast({
            title: 'Incomplete team information',
            description: 'Please fill out all required fields for each team member.',
            variant: 'destructive',
          });
          return false;
        }
        return true;

      case 4:
        if (!formData.acceptTerms) {
          toast({
            title: 'Terms and conditions',
            description: 'Please accept the terms and conditions to proceed.',
            variant: 'destructive',
          });
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  const goToNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
      window.scrollTo(0, 0);
    }
  };

  const goToPreviousStep = () => {
    setCurrentStep(currentStep - 1);
    window.scrollTo(0, 0);
  };

  const handleSubmit = e => {
    e.preventDefault();

    if (validateStep(currentStep)) {
      // In a real implementation, you would send the form data to your backend here
      toast({
        title: 'Enterprise account created!',
        description:
          "Your team account has been set up successfully. You'll receive a confirmation email shortly.",
      });

      // Redirect to the dashboard or a success page
      setTimeout(() => {
        setLocation('/');
      }, 2000);
    }
  };

  const getPlanPrice = planId => {
    const plan = plans.find(p => p.id === planId);
    return plan ? plan.price : '';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header with logo */}
      <header className="bg-white border-b border-gray-200 py-4">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start">
              <div className="flex items-center">
                <div className="bg-gradient-to-r from-[#0071e3] to-[#2b8fff] rounded p-1.5 mr-2">
                  <div className="text-white font-bold text-xs tracking-wide">C2C.AI</div>
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f] tracking-tight">
                  CONCEPT2CURE.AI
                </span>
              </div>
              <span className="ml-7 text-sm text-[#86868b] mt-0.5">TrialSage™ Platform</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="text-[#1d1d1f]"
              onClick={() => setLocation('/')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1d1d1f] mb-6">Enterprise Team Account Setup</h1>

          <div className="flex items-center justify-between max-w-3xl">
            <div
              className={`flex flex-col items-center ${currentStep >= 1 ? 'text-[#06c]' : 'text-gray-400'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${currentStep >= 1 ? 'bg-[#06c] text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {currentStep > 1 ? <Check className="w-5 h-5" /> : 1}
              </div>
              <span className="text-xs font-medium">Company</span>
            </div>

            <div
              className={`flex-1 h-0.5 mx-2 ${currentStep >= 2 ? 'bg-[#06c]' : 'bg-gray-200'}`}
            ></div>

            <div
              className={`flex flex-col items-center ${currentStep >= 2 ? 'text-[#06c]' : 'text-gray-400'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${currentStep >= 2 ? 'bg-[#06c] text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {currentStep > 2 ? <Check className="w-5 h-5" /> : 2}
              </div>
              <span className="text-xs font-medium">Admin</span>
            </div>

            <div
              className={`flex-1 h-0.5 mx-2 ${currentStep >= 3 ? 'bg-[#06c]' : 'bg-gray-200'}`}
            ></div>

            <div
              className={`flex flex-col items-center ${currentStep >= 3 ? 'text-[#06c]' : 'text-gray-400'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${currentStep >= 3 ? 'bg-[#06c] text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {currentStep > 3 ? <Check className="w-5 h-5" /> : 3}
              </div>
              <span className="text-xs font-medium">Team</span>
            </div>

            <div
              className={`flex-1 h-0.5 mx-2 ${currentStep >= 4 ? 'bg-[#06c]' : 'bg-gray-200'}`}
            ></div>

            <div
              className={`flex flex-col items-center ${currentStep >= 4 ? 'text-[#06c]' : 'text-gray-400'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${currentStep >= 4 ? 'bg-[#06c] text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {currentStep > 4 ? <Check className="w-5 h-5" /> : 4}
              </div>
              <span className="text-xs font-medium">Payment</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {currentStep === 1 && 'Company Information'}
                  {currentStep === 2 && 'Administrator Account'}
                  {currentStep === 3 && 'Team Members'}
                  {currentStep === 4 && 'Review & Payment'}
                </CardTitle>
                <CardDescription>
                  {currentStep === 1 && 'Tell us about your organization'}
                  {currentStep === 2 && 'Create your administrator account'}
                  {currentStep === 3 && 'Add your team members and their permissions'}
                  {currentStep === 4 && 'Review your selections and complete payment'}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit}>
                  {/* Step 1: Company Information */}
                  {currentStep === 1 && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="companyName" className="text-base">
                            Company Name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="companyName"
                            name="companyName"
                            value={formData.companyName}
                            onChange={handleInputChange}
                            className="mt-1"
                            placeholder="Enter your company name"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="companySize" className="text-base">
                              Company Size <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={formData.companySize}
                              onValueChange={value =>
                                setFormData({ ...formData, companySize: value })
                              }
                            >
                              <SelectTrigger id="companySize" className="mt-1">
                                <SelectValue placeholder="Select company size" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1-10">1-10 employees</SelectItem>
                                <SelectItem value="11-50">11-50 employees</SelectItem>
                                <SelectItem value="51-200">51-200 employees</SelectItem>
                                <SelectItem value="201-500">201-500 employees</SelectItem>
                                <SelectItem value="501-1000">501-1000 employees</SelectItem>
                                <SelectItem value="1000+">1000+ employees</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="industry" className="text-base">
                              Industry <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={formData.industry}
                              onValueChange={value => setFormData({ ...formData, industry: value })}
                            >
                              <SelectTrigger id="industry" className="mt-1">
                                <SelectValue placeholder="Select industry" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="biotech">Biotechnology</SelectItem>
                                <SelectItem value="pharma">Pharmaceutical</SelectItem>
                                <SelectItem value="meddevice">Medical Devices</SelectItem>
                                <SelectItem value="cro">Contract Research Organization</SelectItem>
                                <SelectItem value="hospital">Hospital/Healthcare</SelectItem>
                                <SelectItem value="academic">Academic Research</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="address" className="text-base">
                            Address
                          </Label>
                          <Input
                            id="address"
                            name="address"
                            value={formData.address}
                            onChange={handleInputChange}
                            className="mt-1"
                            placeholder="Enter your company address"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="country" className="text-base">
                              Country <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={formData.country}
                              onValueChange={value => setFormData({ ...formData, country: value })}
                            >
                              <SelectTrigger id="country" className="mt-1">
                                <SelectValue placeholder="Select country" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="us">United States</SelectItem>
                                <SelectItem value="ca">Canada</SelectItem>
                                <SelectItem value="uk">United Kingdom</SelectItem>
                                <SelectItem value="de">Germany</SelectItem>
                                <SelectItem value="fr">France</SelectItem>
                                <SelectItem value="jp">Japan</SelectItem>
                                <SelectItem value="ch">Switzerland</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="website" className="text-base">
                              Website
                            </Label>
                            <div className="flex mt-1">
                              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                                https://
                              </span>
                              <Input
                                id="website"
                                name="website"
                                value={formData.website}
                                onChange={handleInputChange}
                                className="rounded-l-none"
                                placeholder="www.example.com"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4">
                        <h3 className="text-xl font-semibold mb-4">Select Plan</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {plans.map(plan => (
                            <div
                              key={plan.id}
                              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                                formData.plan === plan.id
                                  ? 'border-[#06c] bg-[#f0f7ff] shadow-sm'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => setFormData({ ...formData, plan: plan.id })}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-semibold">{plan.name}</h4>
                                  <p className="text-sm text-gray-500">{plan.seats}</p>
                                </div>
                                <RadioGroup value={formData.plan}>
                                  <RadioGroupItem
                                    value={plan.id}
                                    id={plan.id}
                                    checked={formData.plan === plan.id}
                                  />
                                </RadioGroup>
                              </div>

                              <div className="mb-3">
                                <span className="text-2xl font-bold">{plan.price}</span>
                                <span className="text-sm text-gray-500"> {plan.period}</span>
                              </div>

                              <p className="text-sm text-gray-600 mb-3">{plan.description}</p>

                              <ul className="space-y-1 text-sm">
                                {plan.features.map((feature, i) => (
                                  <li key={i} className="flex items-start">
                                    <CheckCircle className="h-4 w-4 text-[#06c] mr-2 mt-0.5 flex-shrink-0" />
                                    <span>{feature}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Administrator Account */}
                  {currentStep === 2 && (
                    <div className="space-y-6">
                      <div className="bg-[#f0f7ff] border border-[#d1e9ff] rounded-lg p-4 mb-6">
                        <div className="flex items-start">
                          <User className="h-5 w-5 text-[#06c] mt-0.5 mr-3 flex-shrink-0" />
                          <div>
                            <h3 className="font-medium">Administrator Account</h3>
                            <p className="text-sm text-gray-600">
                              This account will have full access to manage your organization's
                              TrialSage™ implementation, including adding/removing users and
                              managing licenses.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="adminFirstName" className="text-base">
                            First Name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="adminFirstName"
                            name="adminFirstName"
                            value={formData.adminFirstName}
                            onChange={handleInputChange}
                            className="mt-1"
                            placeholder="Enter your first name"
                          />
                        </div>

                        <div>
                          <Label htmlFor="adminLastName" className="text-base">
                            Last Name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="adminLastName"
                            name="adminLastName"
                            value={formData.adminLastName}
                            onChange={handleInputChange}
                            className="mt-1"
                            placeholder="Enter your last name"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="adminEmail" className="text-base">
                            Email Address <span className="text-red-500">*</span>
                          </Label>
                          <div className="flex mt-1">
                            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                              <Mail className="h-4 w-4" />
                            </span>
                            <Input
                              id="adminEmail"
                              name="adminEmail"
                              type="email"
                              value={formData.adminEmail}
                              onChange={handleInputChange}
                              className="rounded-l-none"
                              placeholder="you@company.com"
                            />
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            This email will be used for account verification and important
                            notifications.
                          </p>
                        </div>

                        <div>
                          <Label htmlFor="adminPhone" className="text-base">
                            Phone Number
                          </Label>
                          <div className="flex mt-1">
                            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                              <Phone className="h-4 w-4" />
                            </span>
                            <Input
                              id="adminPhone"
                              name="adminPhone"
                              value={formData.adminPhone}
                              onChange={handleInputChange}
                              className="rounded-l-none"
                              placeholder="+1 (555) 123-4567"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="adminTitle" className="text-base">
                          Job Title
                        </Label>
                        <Input
                          id="adminTitle"
                          name="adminTitle"
                          value={formData.adminTitle}
                          onChange={handleInputChange}
                          className="mt-1"
                          placeholder="e.g. Director of Regulatory Affairs"
                        />
                      </div>

                      <Separator className="my-6" />

                      <h3 className="text-lg font-semibold mb-4">Create Password</h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="adminPassword" className="text-base">
                            Password <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="adminPassword"
                            name="adminPassword"
                            type="password"
                            value={formData.adminPassword}
                            onChange={handleInputChange}
                            className="mt-1"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Password must be at least 8 characters and include uppercase, lowercase,
                            number, and special character.
                          </p>
                        </div>

                        <div>
                          <Label htmlFor="adminConfirmPassword" className="text-base">
                            Confirm Password <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="adminConfirmPassword"
                            name="adminConfirmPassword"
                            type="password"
                            value={formData.adminConfirmPassword}
                            onChange={handleInputChange}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Team Members */}
                  {currentStep === 3 && (
                    <div className="space-y-6">
                      <div className="bg-[#f0f7ff] border border-[#d1e9ff] rounded-lg p-4 mb-6">
                        <div className="flex items-start">
                          <Users className="h-5 w-5 text-[#06c] mt-0.5 mr-3 flex-shrink-0" />
                          <div>
                            <h3 className="font-medium">Manage Team Access</h3>
                            <p className="text-sm text-gray-600">
                              Add team members and specify which TrialSage™ modules they should
                              have access to. You can add or modify team members later from your
                              admin dashboard.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">
                            Team Members ({formData.teamMembers.length})
                          </h3>
                          <p className="text-sm text-gray-500">
                            {formData.plan === 'enterprise'
                              ? '25'
                              : formData.plan === 'professional'
                                ? '15'
                                : '5'}{' '}
                            seats included in your plan
                          </p>
                        </div>

                        {formData.teamMembers.map((member, index) => (
                          <div key={member.id} className="border rounded-lg p-5 space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">Team Member {index + 1}</h4>
                              {formData.teamMembers.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                  onClick={() => removeTeamMember(member.id)}
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Remove
                                </Button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <Label htmlFor={`firstName-${index}`} className="text-base">
                                  First Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id={`firstName-${index}`}
                                  value={member.firstName}
                                  onChange={e =>
                                    handleTeamMemberChange(index, 'firstName', e.target.value)
                                  }
                                  className="mt-1"
                                  placeholder="Enter first name"
                                />
                              </div>

                              <div>
                                <Label htmlFor={`lastName-${index}`} className="text-base">
                                  Last Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id={`lastName-${index}`}
                                  value={member.lastName}
                                  onChange={e =>
                                    handleTeamMemberChange(index, 'lastName', e.target.value)
                                  }
                                  className="mt-1"
                                  placeholder="Enter last name"
                                />
                              </div>

                              <div>
                                <Label htmlFor={`email-${index}`} className="text-base">
                                  Email <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id={`email-${index}`}
                                  type="email"
                                  value={member.email}
                                  onChange={e =>
                                    handleTeamMemberChange(index, 'email', e.target.value)
                                  }
                                  className="mt-1"
                                  placeholder="Enter email address"
                                />
                              </div>
                            </div>

                            <div>
                              <Label htmlFor={`role-${index}`} className="text-base">
                                Role
                              </Label>
                              <Select
                                value={member.role}
                                onValueChange={value =>
                                  handleTeamMemberChange(index, 'role', value)
                                }
                              >
                                <SelectTrigger id={`role-${index}`} className="mt-1">
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Administrator</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="user">Standard User</SelectItem>
                                  <SelectItem value="viewer">Viewer (Read-only)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="pt-2">
                              <Label className="text-base mb-2 block">Module Access</Label>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {modules.map(module => (
                                  <div
                                    key={module.id}
                                    className={`border rounded-md p-3 cursor-pointer transition-all ${
                                      member.modules.includes(module.name)
                                        ? 'border-[#06c] bg-[#f0f7ff]'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                    onClick={() => handleTeamMemberModuleToggle(index, module.name)}
                                  >
                                    <div className="flex items-start">
                                      <div className="flex-shrink-0 mt-0.5">
                                        <Switch
                                          checked={member.modules.includes(module.name)}
                                          onCheckedChange={() =>
                                            handleTeamMemberModuleToggle(index, module.name)
                                          }
                                        />
                                      </div>
                                      <div className="ml-3">
                                        <p className="font-medium text-sm">{module.name}</p>
                                        <p className="text-xs text-gray-500">
                                          {module.description}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={addTeamMember}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Team Member
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Review & Payment */}
                  {currentStep === 4 && (
                    <div className="space-y-6">
                      <div className="bg-[#f8f9ff] rounded-lg p-5 border border-[#e5e5e7]">
                        <h3 className="text-lg font-semibold mb-3">Order Summary</h3>

                        <div className="space-y-3">
                          <div className="flex justify-between pb-2 border-b border-[#e5e5e7]">
                            <span className="font-medium">
                              {plans.find(p => p.id === formData.plan)?.name} Plan
                            </span>
                            <span className="font-medium">{getPlanPrice(formData.plan)}/month</span>
                          </div>

                          <div className="flex justify-between pb-2 border-b border-[#e5e5e7]">
                            <span>Included seats</span>
                            <span>
                              {formData.plan === 'enterprise'
                                ? '25'
                                : formData.plan === 'professional'
                                  ? '15'
                                  : '5'}{' '}
                              seats
                            </span>
                          </div>

                          <div className="flex justify-between pb-2 border-b border-[#e5e5e7]">
                            <span>Team members added</span>
                            <span>{formData.teamMembers.length} members</span>
                          </div>

                          <div className="flex justify-between pt-2 text-lg font-semibold">
                            <span>Total</span>
                            <span>{getPlanPrice(formData.plan)}/month</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold mb-4">Payment Information</h3>

                        <div className="space-y-4">
                          <div className="flex space-x-4">
                            <div
                              className={`flex-1 border rounded-lg p-4 cursor-pointer transition-all ${
                                formData.paymentMethod === 'credit'
                                  ? 'border-[#06c] bg-[#f0f7ff]'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => setFormData({ ...formData, paymentMethod: 'credit' })}
                            >
                              <div className="flex items-center space-x-3">
                                <CreditCard className="h-5 w-5 text-[#06c]" />
                                <div>
                                  <RadioGroup value={formData.paymentMethod}>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="credit" id="credit" />
                                      <Label htmlFor="credit" className="font-medium">
                                        Credit Card
                                      </Label>
                                    </div>
                                  </RadioGroup>
                                </div>
                              </div>
                            </div>

                            <div
                              className={`flex-1 border rounded-lg p-4 cursor-pointer transition-all ${
                                formData.paymentMethod === 'invoice'
                                  ? 'border-[#06c] bg-[#f0f7ff]'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => setFormData({ ...formData, paymentMethod: 'invoice' })}
                            >
                              <div className="flex items-center space-x-3">
                                <FileText className="h-5 w-5 text-[#06c]" />
                                <div>
                                  <RadioGroup value={formData.paymentMethod}>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="invoice" id="invoice" />
                                      <Label htmlFor="invoice" className="font-medium">
                                        Invoice (Net 30)
                                      </Label>
                                    </div>
                                  </RadioGroup>
                                </div>
                              </div>
                            </div>
                          </div>

                          {formData.paymentMethod === 'credit' && (
                            <div className="space-y-4 pt-2">
                              <div>
                                <Label htmlFor="cardNumber" className="text-base">
                                  Card Number
                                </Label>
                                <Input
                                  id="cardNumber"
                                  name="cardNumber"
                                  value={formData.cardNumber}
                                  onChange={handleInputChange}
                                  className="mt-1"
                                  placeholder="1234 5678 9012 3456"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label htmlFor="cardExpiry" className="text-base">
                                    Expiration Date
                                  </Label>
                                  <Input
                                    id="cardExpiry"
                                    name="cardExpiry"
                                    value={formData.cardExpiry}
                                    onChange={handleInputChange}
                                    className="mt-1"
                                    placeholder="MM/YY"
                                  />
                                </div>

                                <div>
                                  <Label htmlFor="cardCvc" className="text-base">
                                    CVC
                                  </Label>
                                  <Input
                                    id="cardCvc"
                                    name="cardCvc"
                                    value={formData.cardCvc}
                                    onChange={handleInputChange}
                                    className="mt-1"
                                    placeholder="123"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {formData.paymentMethod === 'invoice' && (
                            <div className="space-y-4 pt-2">
                              <div>
                                <Label htmlFor="billingEmail" className="text-base">
                                  Billing Email
                                </Label>
                                <Input
                                  id="billingEmail"
                                  name="billingEmail"
                                  type="email"
                                  value={formData.billingEmail}
                                  onChange={handleInputChange}
                                  className="mt-1"
                                  placeholder="billing@company.com"
                                />
                              </div>

                              <div>
                                <Label htmlFor="billingAddress" className="text-base">
                                  Billing Address
                                </Label>
                                <Input
                                  id="billingAddress"
                                  name="billingAddress"
                                  value={formData.billingAddress}
                                  onChange={handleInputChange}
                                  className="mt-1"
                                  placeholder="123 Main St, City, State, ZIP"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <Separator className="my-4" />

                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 mt-1">
                          <Switch
                            id="acceptTerms"
                            checked={formData.acceptTerms}
                            onCheckedChange={checked =>
                              setFormData({ ...formData, acceptTerms: checked })
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="acceptTerms" className="font-medium">
                            I agree to the Terms and Conditions{' '}
                            <span className="text-red-500">*</span>
                          </Label>
                          <p className="text-sm text-gray-500 mt-1">
                            By checking this box, you agree to the{' '}
                            <a href="#" className="text-[#06c] hover:underline">
                              TrialSage™ Terms of Service
                            </a>
                            ,
                            <a href="#" className="text-[#06c] hover:underline">
                              {' '}
                              Privacy Policy
                            </a>
                            , and
                            <a href="#" className="text-[#06c] hover:underline">
                              {' '}
                              Software License Agreement
                            </a>
                            .
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex items-center justify-between">
                    {currentStep > 1 ? (
                      <Button type="button" variant="outline" onClick={goToPreviousStep}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                    ) : (
                      <div></div>
                    )}

                    {currentStep < 4 ? (
                      <Button type="button" onClick={goToNextStep}>
                        Continue
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button type="submit" className="bg-[#0071e3] hover:bg-[#0077ed]">
                        Complete Setup
                        <Sparkles className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Enterprise Benefits</CardTitle>
                <CardDescription>Why companies choose TrialSage™ Enterprise</CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <div className="bg-[#f0f7ff] p-2 rounded mr-3 flex-shrink-0">
                      <Building2 className="h-5 w-5 text-[#06c]" />
                    </div>
                    <div>
                      <h4 className="font-medium">21 CFR Part 11 Compliance</h4>
                      <p className="text-sm text-gray-600">
                        Full compliance with FDA electronic record requirements
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start">
                    <div className="bg-[#f0f7ff] p-2 rounded mr-3 flex-shrink-0">
                      <Globe className="h-5 w-5 text-[#06c]" />
                    </div>
                    <div>
                      <h4 className="font-medium">Global Regulatory Support</h4>
                      <p className="text-sm text-gray-600">
                        Supports FDA, EMA, PMDA, and other global authorities
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start">
                    <div className="bg-[#f0f7ff] p-2 rounded mr-3 flex-shrink-0">
                      <Users className="h-5 w-5 text-[#06c]" />
                    </div>
                    <div>
                      <h4 className="font-medium">Team Collaboration</h4>
                      <p className="text-sm text-gray-600">
                        Role-based access control for seamless teamwork
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start">
                    <div className="bg-[#f0f7ff] p-2 rounded mr-3 flex-shrink-0">
                      <Sparkles className="h-5 w-5 text-[#06c]" />
                    </div>
                    <div>
                      <h4 className="font-medium">Advanced AI Features</h4>
                      <p className="text-sm text-gray-600">
                        Exclusive access to our most powerful AI capabilities
                      </p>
                    </div>
                  </li>
                </ul>

                <div className="mt-6 pt-6 border-t border-[#e5e5e7]">
                  <h4 className="font-medium mb-3">Enterprise Customers Include:</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Pfizer</span>
                      <Badge variant="outline" className="bg-[#f8f9ff]">
                        Pharma
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Moderna</span>
                      <Badge variant="outline" className="bg-[#f8f9ff]">
                        Biotech
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">AstraZeneca</span>
                      <Badge variant="outline" className="bg-[#f8f9ff]">
                        Pharma
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">IQVIA</span>
                      <Badge variant="outline" className="bg-[#f8f9ff]">
                        CRO
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-[#e5e5e7]">
                  <div className="flex items-start">
                    <div className="bg-[#f0f7ff] p-2 rounded mr-3 flex-shrink-0">
                      <Phone className="h-5 w-5 text-[#06c]" />
                    </div>
                    <div>
                      <h4 className="font-medium">Need help?</h4>
                      <p className="text-sm text-gray-600 mb-2">
                        Our enterprise team is ready to assist you
                      </p>
                      <Button variant="outline" size="sm" className="w-full">
                        Schedule a Call
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamSignup;
