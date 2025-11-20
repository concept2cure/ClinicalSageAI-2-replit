import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getProtocol, saveProtocol, generateSchedule, validateProtocol } from '../api/protocol';

/**
 * Protocol Designer Page - Main interface for designing clinical trial protocols
 */
const ProtocolDesignerPage = () => {
  const [protocol, setProtocol] = useState({
    id: '1',
    title: '',
    phase: 'Phase 1',
    indication: '',
    studyPopulation: '',
    primaryEndpoint: '',
    secondaryEndpoints: [],
    arms: [
      { id: 1, name: 'Treatment', description: '', dosage: '' },
      { id: 2, name: 'Placebo', description: '', dosage: '' },
    ],
    visits: [
      { id: 1, name: 'Screening', timepoint: 'Day -14', procedures: [] },
      { id: 2, name: 'Baseline', timepoint: 'Day 0', procedures: [] },
      { id: 3, name: 'Follow-up', timepoint: 'Day 30', procedures: [] },
    ],
  });

  const [schedule, setSchedule] = useState(null);
  const [validationResults, setValidationResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Load protocol data when component mounts
  useEffect(() => {
    const loadProtocolData = async () => {
      try {
        const data = await getProtocol('1');
        if (data) {
          setProtocol(data);
        }
      } catch (error) {
        console.error('Error loading protocol:', error);
      }
    };

    loadProtocolData();
  }, []);

  // Handle protocol field changes
  const handleProtocolChange = (field, value) => {
    setProtocol(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handle arm changes
  const handleArmChange = (armId, field, value) => {
    setProtocol(prev => ({
      ...prev,
      arms: prev.arms.map(arm => (arm.id === armId ? { ...arm, [field]: value } : arm)),
    }));
  };

  // Add a new arm
  const addArm = () => {
    const newId = Math.max(...protocol.arms.map(a => a.id)) + 1;
    setProtocol(prev => ({
      ...prev,
      arms: [...prev.arms, { id: newId, name: `Arm ${newId}`, description: '', dosage: '' }],
    }));
  };

  // Remove an arm
  const removeArm = armId => {
    setProtocol(prev => ({
      ...prev,
      arms: prev.arms.filter(arm => arm.id !== armId),
    }));
  };

  // Handle visit changes
  const handleVisitChange = (visitId, field, value) => {
    setProtocol(prev => ({
      ...prev,
      visits: prev.visits.map(visit =>
        visit.id === visitId ? { ...visit, [field]: value } : visit
      ),
    }));
  };

  // Add a new visit
  const addVisit = () => {
    const newId = Math.max(...protocol.visits.map(v => v.id)) + 1;
    setProtocol(prev => ({
      ...prev,
      visits: [
        ...prev.visits,
        { id: newId, name: `Visit ${newId}`, timepoint: '', procedures: [] },
      ],
    }));
  };

  // Remove a visit
  const removeVisit = visitId => {
    setProtocol(prev => ({
      ...prev,
      visits: prev.visits.filter(visit => visit.id !== visitId),
    }));
  };

  // Save protocol data
  const handleSave = async () => {
    setLoading(true);
    setSaveMessage('');
    try {
      await saveProtocol(protocol);
      setSaveMessage('Protocol saved successfully');
    } catch (error) {
      console.error('Error saving protocol:', error);
      setSaveMessage('Error saving protocol');
    } finally {
      setLoading(false);
    }
  };

  // Generate study schedule
  const handleGenerateSchedule = async () => {
    setLoading(true);
    try {
      const scheduleData = await generateSchedule(protocol);
      setSchedule(scheduleData);
    } catch (error) {
      console.error('Error generating schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  // Validate protocol
  const handleValidate = async () => {
    setLoading(true);
    try {
      const validationData = await validateProtocol(protocol);
      setValidationResults(validationData);
    } catch (error) {
      console.error('Error validating protocol:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="protocol-designer-container p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Study & Protocol Designer</h1>
        <div>
          <Button onClick={handleSave} disabled={loading} className="mr-2">
            {loading ? 'Saving...' : 'Save Protocol'}
          </Button>
          <Button onClick={handleValidate} disabled={loading} variant="outline">
            Validate
          </Button>
        </div>
      </div>

      {saveMessage && (
        <div
          className={`p-2 mb-4 rounded ${saveMessage.includes('Error') ? 'bg-red-100' : 'bg-green-100'}`}
        >
          {saveMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Protocol Builder */}
        <div className="col-span-1 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Protocol Builder</CardTitle>
              <CardDescription>Define your study design, arms, and visits</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="general">
                <TabsList className="mb-4">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="arms">Study Arms</TabsTrigger>
                  <TabsTrigger value="visits">Visits & Timepoints</TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                  <div className="space-y-4">
                    <div>
                      <label className="block mb-1 font-medium">Study Title</label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded"
                        value={protocol.title}
                        onChange={e => handleProtocolChange('title', e.target.value)}
                        placeholder="Enter study title"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block mb-1 font-medium">Phase</label>
                        <select
                          className="w-full p-2 border rounded"
                          value={protocol.phase}
                          onChange={e => handleProtocolChange('phase', e.target.value)}
                        >
                          <option value="Phase 1">Phase 1</option>
                          <option value="Phase 2">Phase 2</option>
                          <option value="Phase 3">Phase 3</option>
                          <option value="Phase 4">Phase 4</option>
                        </select>
                      </div>

                      <div>
                        <label className="block mb-1 font-medium">Indication</label>
                        <input
                          type="text"
                          className="w-full p-2 border rounded"
                          value={protocol.indication}
                          onChange={e => handleProtocolChange('indication', e.target.value)}
                          placeholder="E.g., Type 2 Diabetes"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block mb-1 font-medium">Study Population</label>
                      <textarea
                        className="w-full p-2 border rounded"
                        rows="3"
                        value={protocol.studyPopulation}
                        onChange={e => handleProtocolChange('studyPopulation', e.target.value)}
                        placeholder="Describe inclusion/exclusion criteria"
                      />
                    </div>

                    <div>
                      <label className="block mb-1 font-medium">Primary Endpoint</label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded"
                        value={protocol.primaryEndpoint}
                        onChange={e => handleProtocolChange('primaryEndpoint', e.target.value)}
                        placeholder="E.g., Change in HbA1c from baseline to week 12"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="arms">
                  <div className="space-y-4">
                    {protocol.arms.map(arm => (
                      <div key={arm.id} className="p-3 border rounded">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-medium">{arm.name}</h3>
                          <Button variant="ghost" size="sm" onClick={() => removeArm(arm.id)}>
                            Remove
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block mb-1 text-sm">Arm Name</label>
                            <input
                              type="text"
                              className="w-full p-2 border rounded"
                              value={arm.name}
                              onChange={e => handleArmChange(arm.id, 'name', e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block mb-1 text-sm">Dosage</label>
                            <input
                              type="text"
                              className="w-full p-2 border rounded"
                              value={arm.dosage}
                              onChange={e => handleArmChange(arm.id, 'dosage', e.target.value)}
                              placeholder="E.g., 100mg BID"
                            />
                          </div>
                        </div>

                        <div className="mt-2">
                          <label className="block mb-1 text-sm">Description</label>
                          <textarea
                            className="w-full p-2 border rounded"
                            rows="2"
                            value={arm.description}
                            onChange={e => handleArmChange(arm.id, 'description', e.target.value)}
                            placeholder="Describe treatment arm"
                          />
                        </div>
                      </div>
                    ))}

                    <Button variant="outline" onClick={addArm}>
                      Add Arm
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="visits">
                  <div className="space-y-4">
                    {protocol.visits.map(visit => (
                      <div key={visit.id} className="p-3 border rounded">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-medium">{visit.name}</h3>
                          <Button variant="ghost" size="sm" onClick={() => removeVisit(visit.id)}>
                            Remove
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block mb-1 text-sm">Visit Name</label>
                            <input
                              type="text"
                              className="w-full p-2 border rounded"
                              value={visit.name}
                              onChange={e => handleVisitChange(visit.id, 'name', e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block mb-1 text-sm">Timepoint</label>
                            <input
                              type="text"
                              className="w-full p-2 border rounded"
                              value={visit.timepoint}
                              onChange={e =>
                                handleVisitChange(visit.id, 'timepoint', e.target.value)
                              }
                              placeholder="E.g., Day 1, Week 4"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <Button variant="outline" onClick={addVisit}>
                      Add Visit
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Schedule & Validation */}
        <div className="col-span-1">
          <div className="space-y-6">
            {/* Schedule Table */}
            <Card>
              <CardHeader>
                <CardTitle>Schedule of Assessments</CardTitle>
                <CardDescription>Study visit schedule</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-3">
                  <Button onClick={handleGenerateSchedule} disabled={loading} className="w-full">
                    Generate Schedule Table
                  </Button>
                </div>

                {schedule ? (
                  <div className="border rounded overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="p-2 border-b text-left">Assessment</th>
                          {protocol.visits.map(visit => (
                            <th key={visit.id} className="p-2 border-b text-center">
                              {visit.name} <br />
                              <span className="text-xs text-gray-500">{visit.timepoint}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.map((row, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="p-2 border-b">{row.assessment}</td>
                            {row.timepoints.map((marked, i) => (
                              <td key={i} className="p-2 border-b text-center">
                                {marked ? '✓' : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center p-4 border rounded bg-gray-50">
                    <p className="text-gray-500">
                      Click "Generate Schedule Table" to create a schedule based on your protocol
                      design
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Validation Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Protocol Validation</CardTitle>
                <CardDescription>Check protocol compliance</CardDescription>
              </CardHeader>
              <CardContent>
                {validationResults.length > 0 ? (
                  <div className="space-y-2">
                    {validationResults.map((result, index) => (
                      <div
                        key={index}
                        className={`p-2 rounded ${
                          result.severity === 'error'
                            ? 'bg-red-100'
                            : result.severity === 'warning'
                              ? 'bg-yellow-100'
                              : 'bg-blue-100'
                        }`}
                      >
                        <div className="flex items-start">
                          <span
                            className={`inline-block mr-2 ${
                              result.severity === 'error'
                                ? 'text-red-600'
                                : result.severity === 'warning'
                                  ? 'text-yellow-600'
                                  : 'text-blue-600'
                            }`}
                          >
                            {result.severity === 'error'
                              ? '⚠️'
                              : result.severity === 'warning'
                                ? '⚠️'
                                : 'ℹ️'}
                          </span>
                          <div>
                            <p className="font-medium">{result.message}</p>
                            {result.suggestion && (
                              <p className="text-sm mt-1">{result.suggestion}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-4 border rounded bg-gray-50">
                    <p className="text-gray-500">
                      Click "Validate" to check your protocol design against regulatory guidelines
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProtocolDesignerPage;
