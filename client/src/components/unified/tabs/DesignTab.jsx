import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Package, Plus, X, CheckCircle2, Shield, Calendar, Loader2, AlertCircle } from 'lucide-react';

export default function DesignTab({
  protocol,
  handleProtocolChange,
  handleArmChange,
  addArm,
  removeArm,
  handleVisitChange,
  addVisit,
  removeVisit,
  handleSaveProtocol,
  handleValidateProtocol,
  handleGenerateSchedule,
  protocolLoading,
  validationResults,
}) {
  return (
    <div className="space-y-6 mt-0">
      <Card className="rounded-2xl border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Protocol Designer
          </CardTitle>
          <CardDescription>
            Design your clinical trial protocol with AI-assisted validation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid grid-cols-3 gap-2 mb-6">
              <TabsTrigger value="general" data-testid="tab-design-general">
                General Information
              </TabsTrigger>
              <TabsTrigger value="arms" data-testid="tab-design-arms">
                Study Arms
              </TabsTrigger>
              <TabsTrigger value="visits" data-testid="tab-design-visits">
                Visits & Timepoints
              </TabsTrigger>
            </TabsList>

            {/* General Information */}
            <TabsContent value="general" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="study-title">Study Title</Label>
                  <Input
                    id="study-title"
                    value={protocol.title}
                    onChange={e => handleProtocolChange('title', e.target.value)}
                    placeholder="Enter study title"
                    className="rounded-lg"
                    data-testid="input-study-title"
                  />
                </div>
                <div>
                  <Label htmlFor="study-phase">Phase</Label>
                  <Select
                    value={protocol.phase}
                    onValueChange={value => handleProtocolChange('phase', value)}
                  >
                    <SelectTrigger className="rounded-lg" data-testid="select-phase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Phase 1">Phase 1</SelectItem>
                      <SelectItem value="Phase 2">Phase 2</SelectItem>
                      <SelectItem value="Phase 3">Phase 3</SelectItem>
                      <SelectItem value="Phase 4">Phase 4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="indication">Indication</Label>
                <Input
                  id="indication"
                  value={protocol.indication}
                  onChange={e => handleProtocolChange('indication', e.target.value)}
                  placeholder="e.g., Type 2 Diabetes, NSCLC, etc."
                  className="rounded-lg"
                  data-testid="input-indication"
                />
              </div>
              <div>
                <Label htmlFor="population">Study Population</Label>
                <Textarea
                  id="population"
                  value={protocol.studyPopulation}
                  onChange={e => handleProtocolChange('studyPopulation', e.target.value)}
                  placeholder="Describe the target patient population"
                  className="rounded-lg min-h-[100px]"
                  data-testid="textarea-population"
                />
              </div>
              <div>
                <Label htmlFor="primary-endpoint">Primary Endpoint</Label>
                <Textarea
                  id="primary-endpoint"
                  value={protocol.primaryEndpoint}
                  onChange={e => handleProtocolChange('primaryEndpoint', e.target.value)}
                  placeholder="Define the primary efficacy endpoint"
                  className="rounded-lg"
                  data-testid="textarea-primary-endpoint"
                />
              </div>
            </TabsContent>

            {/* Study Arms */}
            <TabsContent value="arms" className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Study Arms</h3>
                <Button
                  onClick={addArm}
                  size="sm"
                  className="rounded-lg"
                  data-testid="button-add-arm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Arm
                </Button>
              </div>
              <div className="space-y-4">
                {protocol.arms.map((arm, idx) => (
                  <Card key={arm.id} className="rounded-xl" data-testid={`card-arm-${arm.id}`}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-semibold">Arm {idx + 1}</h4>
                        {protocol.arms.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeArm(arm.id)}
                            data-testid={`button-remove-arm-${arm.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <Label>Arm Name</Label>
                          <Input
                            value={arm.name}
                            onChange={e => handleArmChange(arm.id, 'name', e.target.value)}
                            placeholder="e.g., Treatment, Placebo"
                            className="rounded-lg"
                            data-testid={`input-arm-name-${arm.id}`}
                          />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Textarea
                            value={arm.description}
                            onChange={e => handleArmChange(arm.id, 'description', e.target.value)}
                            placeholder="Describe this study arm"
                            className="rounded-lg"
                            data-testid={`textarea-arm-desc-${arm.id}`}
                          />
                        </div>
                        <div>
                          <Label>Dosage</Label>
                          <Input
                            value={arm.dosage}
                            onChange={e => handleArmChange(arm.id, 'dosage', e.target.value)}
                            placeholder="e.g., 10mg once daily"
                            className="rounded-lg"
                            data-testid={`input-arm-dosage-${arm.id}`}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Visits & Timepoints */}
            <TabsContent value="visits" className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Visits & Timepoints</h3>
                <Button
                  onClick={addVisit}
                  size="sm"
                  className="rounded-lg"
                  data-testid="button-add-visit"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Visit
                </Button>
              </div>
              <div className="space-y-4">
                {protocol.visits.map((visit, idx) => (
                  <Card key={visit.id} className="rounded-xl" data-testid={`card-visit-${visit.id}`}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-semibold">Visit {idx + 1}</h4>
                        {protocol.visits.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVisit(visit.id)}
                            data-testid={`button-remove-visit-${visit.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Visit Name</Label>
                          <Input
                            value={visit.name}
                            onChange={e => handleVisitChange(visit.id, 'name', e.target.value)}
                            placeholder="e.g., Screening, Baseline"
                            className="rounded-lg"
                            data-testid={`input-visit-name-${visit.id}`}
                          />
                        </div>
                        <div>
                          <Label>Timepoint</Label>
                          <Input
                            value={visit.timepoint}
                            onChange={e => handleVisitChange(visit.id, 'timepoint', e.target.value)}
                            placeholder="e.g., Day 0, Week 4"
                            className="rounded-lg"
                            data-testid={`input-visit-timepoint-${visit.id}`}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex gap-3 mt-6">
            <Button
              onClick={handleSaveProtocol}
              disabled={protocolLoading}
              className="rounded-lg"
              data-testid="button-save-protocol"
            >
              {protocolLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Save Protocol
            </Button>
            <Button
              onClick={handleValidateProtocol}
              variant="outline"
              disabled={protocolLoading}
              className="rounded-lg"
              data-testid="button-validate-protocol"
            >
              <Shield className="h-4 w-4 mr-2" />
              Validate
            </Button>
            <Button
              onClick={handleGenerateSchedule}
              variant="outline"
              disabled={protocolLoading}
              className="rounded-lg"
              data-testid="button-generate-schedule"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Generate Schedule
            </Button>
          </div>

          {/* Validation Results */}
          {validationResults.length > 0 && (
            <Alert className="mt-6 rounded-xl">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Results</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1">
                  {validationResults.map((result, idx) => (
                    <li key={idx} className="text-sm">
                      • {result.message || result}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
