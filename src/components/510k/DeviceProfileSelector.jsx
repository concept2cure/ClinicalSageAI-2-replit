import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronRight, Filter, Check } from 'lucide-react';
import {
  getAllProfileTemplates,
  createProfileFromTemplate,
} from '../../utils/deviceProfileDefaults';

const DeviceProfileSelector = ({ onProfileSelect, k510DocumentId, isOpen, onClose }) => {
  const [selectedTab, setSelectedTab] = useState('all');
  const [filterArea, setFilterArea] = useState('all');
  const allTemplates = getAllProfileTemplates();

  // Get unique therapeutic areas for filtering
  const therapeuticAreas = [...new Set(allTemplates.map(t => t.therapeuticArea))];

  // Filter templates based on selected tab and area filter
  const filteredTemplates = allTemplates.filter(template => {
    const matchesClass =
      selectedTab === 'all' || template.deviceClass === selectedTab.replace('class', '');
    const matchesArea = filterArea === 'all' || template.therapeuticArea === filterArea;
    return matchesClass && matchesArea;
  });

  const handleProfileSelect = templateId => {
    // Find the template
    const template = allTemplates.find(t => t.id === templateId);
    if (!template) return;

    // Extract class and area from template ID
    const [classKey, area] = template.template.split('-');

    // Create profile from the template
    const profile = createProfileFromTemplate(classKey, area, k510DocumentId);

    // Pass the profile to parent component
    onProfileSelect(profile);

    // Close the selector if needed
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="bg-gray-50 border-b">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Select Device Profile Template</CardTitle>
              <CardDescription>
                Choose a pre-filled profile to begin your 510(k) submission process
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onClose}>
              ✕
            </Button>
          </div>
        </CardHeader>

        <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All Classes</TabsTrigger>
              <TabsTrigger value="I">Class I</TabsTrigger>
              <TabsTrigger value="II">Class II</TabsTrigger>
              <TabsTrigger value="III">Class III</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <Select value={filterArea} onValueChange={setFilterArea}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Therapeutic Areas" />
              </SelectTrigger>
              <SelectContent
                className="z-[1050] relative"
                position="popper"
                sideOffset={5}
                align="end"
              >
                <SelectItem value="all">All Therapeutic Areas</SelectItem>
                {therapeuticAreas.map(area => (
                  <SelectItem key={area} value={area}>
                    {area.charAt(0).toUpperCase() + area.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <CardContent className="flex-grow overflow-auto p-0">
          <div className="grid grid-cols-1 gap-0 divide-y">
            {filteredTemplates.length > 0 ? (
              filteredTemplates.map(template => (
                <div
                  key={template.id}
                  className="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center"
                >
                  <div className="flex-grow">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium text-gray-900">{template.deviceName}</h3>
                      <Badge
                        variant={
                          template.deviceClass === 'I'
                            ? 'outline'
                            : template.deviceClass === 'II'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        Class {template.deviceClass}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500">
                      <span>{template.manufacturer}</span>
                      {template.productCode && (
                        <span className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                          {template.productCode}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {template.therapeuticArea.charAt(0).toUpperCase() +
                        template.therapeuticArea.slice(1)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2"
                    onClick={() => handleProfileSelect(template.id)}
                  >
                    <span className="mr-1">Select</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                No device profile templates match your filters. Try different filtering options.
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="border-t bg-gray-50 flex justify-between">
          <div className="text-sm text-gray-500">
            <span className="font-medium">{filteredTemplates.length}</span> templates available
          </div>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default DeviceProfileSelector;
