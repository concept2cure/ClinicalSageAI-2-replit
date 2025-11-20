import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * WorkflowProgress Component
 *
 * Provides an animated visualization of the IND submission workflow process,
 * showing the current status and progress of various stages.
 */
const WorkflowProgress = ({ project, currentStage = null }) => {
  // Define all possible workflow stages
  const stages = [
    { id: 'forms', name: 'Forms', icon: '📝', description: 'FDA Forms (1571, 1572, 3674)' },
    {
      id: 'module2',
      name: 'Module 2',
      icon: '📊',
      description: 'Clinical, Nonclinical & Quality Summaries',
    },
    { id: 'module3', name: 'Module 3', icon: '🧪', description: 'CMC Documentation' },
    { id: 'ectd', name: 'eCTD', icon: '📦', description: 'Package Assembly' },
    { id: 'esg', name: 'ESG', icon: '🚀', description: 'FDA Gateway Submission' },
    { id: 'acknowledgment', name: 'ACK', icon: '✅', description: 'FDA Acknowledgment' },
  ];

  // Determine active stage based on project history or current action
  const [activeStage, setActiveStage] = useState(currentStage || 'forms');
  const [completedStages, setCompletedStages] = useState([]);

  // Analyze project history to determine completed stages and active stage
  useEffect(() => {
    if (!project || !project.history) return;

    const completed = [];
    let lastActive = 'forms';

    // This is a simplification - in a real implementation, you'd analyze
    // the actual history objects to determine what's been completed
    if (project.history) {
      // Example logic to determine completed stages from history
      const hasForms = project.history.some(h => h.type?.includes('form'));
      const hasModule2 = project.history.some(h => h.type?.includes('narrative'));
      const hasModule3 = project.history.some(h => h.type?.includes('module3'));
      const hasEctd = project.history.some(h => h.type === 'ectd_ga');
      const hasEsg = project.history.some(h => h.type === 'esg_submission');
      const hasAck = project.history.some(
        h => h.type === 'esg_submission' && h.status?.includes('ACK')
      );

      if (hasForms) {
        completed.push('forms');
        lastActive = 'module2';
      }
      if (hasModule2) {
        completed.push('module2');
        lastActive = 'module3';
      }
      if (hasModule3) {
        completed.push('module3');
        lastActive = 'ectd';
      }
      if (hasEctd) {
        completed.push('ectd');
        lastActive = 'esg';
      }
      if (hasEsg) {
        completed.push('esg');
        lastActive = 'acknowledgment';
      }
      if (hasAck) {
        completed.push('acknowledgment');
      }
    }

    setCompletedStages(completed);
    if (!currentStage) {
      setActiveStage(lastActive);
    }
  }, [project, currentStage]);

  // Animation variants for the progress line
  const lineVariants = {
    initial: { width: '0%' },
    animate: {
      width: `${(completedStages.length / (stages.length - 1)) * 100}%`,
      transition: { duration: 1, ease: 'easeInOut' },
    },
  };

  return (
    <div className="mt-6 mb-8">
      <h3 className="text-lg font-semibold mb-4">IND Submission Workflow</h3>

      {/* Progress line */}
      <div className="relative mb-12">
        <div className="absolute h-1 bg-gray-200 w-full rounded">
          <motion.div
            className="absolute h-1 bg-blue-600 rounded"
            initial="initial"
            animate="animate"
            variants={lineVariants}
          />
        </div>

        {/* Stages */}
        <div className="relative flex justify-between">
          {stages.map((stage, index) => {
            const isCompleted = completedStages.includes(stage.id);
            const isActive = activeStage === stage.id;

            return (
              <div
                key={stage.id}
                className="flex flex-col items-center mt-4"
                style={{
                  width: `${100 / (stages.length - 1)}%`,
                  left: `${(index / (stages.length - 1)) * 100}%`,
                  position: index === 0 ? 'relative' : 'absolute',
                }}
              >
                {/* Stage marker */}
                <motion.div
                  className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full mb-1 
                    ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border-2 border-gray-300'
                    }`}
                  initial={{ scale: 0.8, opacity: 0.5 }}
                  animate={{
                    scale: isActive || isCompleted ? 1 : 0.8,
                    opacity: isActive || isCompleted ? 1 : 0.7,
                    backgroundColor: isCompleted ? '#10b981' : isActive ? '#2563eb' : '#ffffff',
                  }}
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.3 }}
                >
                  {isCompleted ? (
                    <span className="text-white">✓</span>
                  ) : (
                    <span className={isActive ? 'text-white' : 'text-gray-500'}>{stage.icon}</span>
                  )}

                  {/* Pulse animation for active stage */}
                  {isActive && (
                    <motion.div
                      className="absolute w-full h-full rounded-full bg-blue-400 -z-10"
                      animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.7, 0.2, 0.7],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )}
                </motion.div>

                {/* Stage name */}
                <div className="text-center">
                  <div
                    className={`font-medium ${isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'}`}
                  >
                    {stage.name}
                  </div>
                  <div className="text-xs max-w-[120px] text-center text-gray-500">
                    {stage.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current stage information */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeStage}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-blue-50 p-4 rounded-lg border border-blue-200"
        >
          <h4 className="font-semibold text-blue-700 flex items-center">
            {stages.find(s => s.id === activeStage)?.icon}{' '}
            {stages.find(s => s.id === activeStage)?.name} Stage
          </h4>
          <p className="text-sm text-blue-600 mt-1">
            {activeStage === 'forms' &&
              'Complete the required FDA forms (1571, 1572, 3674) to start your IND submission.'}
            {activeStage === 'module2' &&
              'Prepare and upload Module 2 summaries for quality, nonclinical, and clinical aspects.'}
            {activeStage === 'module3' &&
              'Upload Chemistry, Manufacturing, and Controls (CMC) documentation.'}
            {activeStage === 'ectd' &&
              'Generate the eCTD package with proper structure and checksums for FDA submission.'}
            {activeStage === 'esg' &&
              'Submit your eCTD package to the FDA Electronic Submissions Gateway.'}
            {activeStage === 'acknowledgment' &&
              'Your submission has been acknowledged by the FDA. Congratulations!'}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default WorkflowProgress;
