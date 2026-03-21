import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * AnimatedWorkflow Component
 *
 * Provides a visually dynamic representation of the document flow in the
 * FDA IND submission process, with animated transitions between stages.
 */
const AnimatedWorkflow = ({ currentStage = 'forms', completedStages = [] }) => {
  // Animation states for document icons
  const [documentPositions, setDocumentPositions] = useState({
    form1571: { x: 0, y: 0, opacity: 0 },
    form1572: { x: 0, y: 0, opacity: 0 },
    form3674: { x: 0, y: 0, opacity: 0 },
    module2: { x: 0, y: 0, opacity: 0 },
    module3: { x: 0, y: 0, opacity: 0 },
    ectd: { x: 0, y: 0, opacity: 0 },
    submission: { x: 0, y: 0, opacity: 0 },
  });

  // Define workflow stages and their positions in the visualization
  const stages = {
    forms: { x: 50, y: 100 },
    module2: { x: 200, y: 100 },
    module3: { x: 350, y: 100 },
    ectd: { x: 500, y: 100 },
    esg: { x: 650, y: 100 },
    acknowledgment: { x: 800, y: 100 },
  };

  // Update animation based on current stage
  useEffect(() => {
    const updateDocumentPositions = () => {
      // Starting positions for documents
      const newPositions = {
        form1571: { x: stages.forms.x, y: stages.forms.y - 30, opacity: 1 },
        form1572: { x: stages.forms.x, y: stages.forms.y, opacity: 1 },
        form3674: { x: stages.forms.x, y: stages.forms.y + 30, opacity: 1 },
        module2: { x: stages.module2.x, y: stages.module2.y, opacity: 0 },
        module3: { x: stages.module3.x, y: stages.module3.y, opacity: 0 },
        ectd: { x: stages.ectd.x, y: stages.ectd.y, opacity: 0 },
        submission: { x: stages.esg.x, y: stages.esg.y, opacity: 0 },
      };

      // Update positions based on completed stages
      if (completedStages.includes('forms') || currentStage !== 'forms') {
        newPositions.form1571.x = stages.module2.x - 50;
        newPositions.form1572.x = stages.module2.x - 25;
        newPositions.form3674.x = stages.module2.x;
        newPositions.module2.opacity = 1;
      }

      if (
        completedStages.includes('module2') ||
        (currentStage !== 'forms' && currentStage !== 'module2')
      ) {
        newPositions.module2.x = stages.module3.x - 25;
        newPositions.module3.opacity = 1;
      }

      if (
        completedStages.includes('module3') ||
        (currentStage !== 'forms' && currentStage !== 'module2' && currentStage !== 'module3')
      ) {
        newPositions.form1571.x = stages.ectd.x - 75;
        newPositions.form1572.x = stages.ectd.x - 50;
        newPositions.form3674.x = stages.ectd.x - 25;
        newPositions.module2.x = stages.ectd.x;
        newPositions.module3.x = stages.ectd.x + 25;
        newPositions.ectd.opacity = 1;
      }

      if (
        completedStages.includes('ectd') ||
        currentStage === 'esg' ||
        currentStage === 'acknowledgment'
      ) {
        newPositions.ectd.x = stages.esg.x - 25;
        newPositions.submission.opacity = 1;
      }

      if (completedStages.includes('esg') || currentStage === 'acknowledgment') {
        newPositions.submission.x = stages.acknowledgment.x;
      }

      setDocumentPositions(newPositions);
    };

    updateDocumentPositions();
  }, [currentStage, completedStages]);

  // SVG document icons for visualization
  const documentIcons = {
    form: (
      <svg
        width="20"
        height="24"
        viewBox="0 0 20 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z"
          fill="#e3f2fd"
          stroke="#6a9bcc"
          strokeWidth="1.5"
        />
        <path d="M8 7H16" stroke="#6a9bcc" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 11H16" stroke="#6a9bcc" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 15H12" stroke="#6a9bcc" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    module: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z"
          fill="#fff3e0"
          stroke="#ff9800"
          strokeWidth="1.5"
        />
        <path
          d="M7 8.5L10 6V18L7 15.5"
          stroke="#ff9800"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 15.5L17 18V6L14 8.5"
          stroke="#ff9800"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    package: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20.5 7.27685L12 12L3.5 7.27685L12 2.5L20.5 7.27685Z"
          fill="#e8f5e9"
          stroke="#788c5d"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M3.5 7.27686V16.7231L12 21.5L20.5 16.7231V7.27686"
          stroke="#788c5d"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12V21.5"
          stroke="#788c5d"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7.5 4.88844L16.5 9.66528"
          stroke="#788c5d"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    submission: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 21.5C17.2467 21.5 21.5 17.2467 21.5 12C21.5 6.75329 17.2467 2.5 12 2.5C6.75329 2.5 2.5 6.75329 2.5 12C2.5 17.2467 6.75329 21.5 12 21.5Z"
          fill="#e1f5fe"
          stroke="#6a9bcc"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 16V8"
          stroke="#6a9bcc"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 11L12 8L15 11"
          stroke="#6a9bcc"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  };

  return (
    <div className="relative w-full h-[200px] mt-6 mb-6 bg-gray-50 rounded-lg border overflow-hidden">
      {/* Stage Labels */}
      <div className="absolute top-0 left-0 w-full px-4 py-2 flex justify-between text-xs font-medium text-gray-600">
        <div
          className={`${completedStages.includes('forms') ? 'text-green-600' : currentStage === 'forms' ? 'text-blue-600' : ''}`}
        >
          Forms
        </div>
        <div
          className={`${completedStages.includes('module2') ? 'text-green-600' : currentStage === 'module2' ? 'text-blue-600' : ''}`}
        >
          Module 2
        </div>
        <div
          className={`${completedStages.includes('module3') ? 'text-green-600' : currentStage === 'module3' ? 'text-blue-600' : ''}`}
        >
          Module 3
        </div>
        <div
          className={`${completedStages.includes('ectd') ? 'text-green-600' : currentStage === 'ectd' ? 'text-blue-600' : ''}`}
        >
          eCTD
        </div>
        <div
          className={`${completedStages.includes('esg') ? 'text-green-600' : currentStage === 'esg' ? 'text-blue-600' : ''}`}
        >
          ESG
        </div>
        <div
          className={`${completedStages.includes('acknowledgment') ? 'text-green-600' : currentStage === 'acknowledgment' ? 'text-blue-600' : ''}`}
        >
          ACK
        </div>
      </div>

      {/* Progress Line */}
      <div className="absolute top-[100px] left-[50px] w-[750px] h-[2px] bg-gray-200">
        <motion.div
          className="h-full bg-blue-500 origin-left"
          initial={{ scaleX: 0 }}
          animate={{
            scaleX:
              currentStage === 'forms'
                ? 0.1
                : currentStage === 'module2'
                  ? 0.2
                  : currentStage === 'module3'
                    ? 0.4
                    : currentStage === 'ectd'
                      ? 0.6
                      : currentStage === 'esg'
                        ? 0.8
                        : 1,
          }}
          transition={{ duration: 1 }}
        />
      </div>

      {/* Stage Markers */}
      {Object.entries(stages).map(([stage, position]) => (
        <motion.div
          key={stage}
          className={`absolute w-8 h-8 rounded-full flex items-center justify-center -ml-4 -mt-4 ${
            completedStages.includes(stage)
              ? 'bg-green-500 text-white'
              : currentStage === stage
                ? 'bg-blue-500 text-white'
                : 'bg-white border-2 border-gray-300 text-gray-400'
          }`}
          initial={{ scale: 0.8, opacity: 0.7 }}
          animate={{
            scale: currentStage === stage ? 1.1 : 1,
            opacity: currentStage === stage || completedStages.includes(stage) ? 1 : 0.7,
            backgroundColor: completedStages.includes(stage)
              ? '#788c5d'
              : currentStage === stage
                ? '#6a9bcc'
                : '#ffffff',
          }}
          style={{
            left: position.x,
            top: position.y,
          }}
        >
          {completedStages.includes(stage) ? (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
          ) : (
            <span>{stage.charAt(0).toUpperCase()}</span>
          )}

          {/* Pulsing animation for current stage */}
          {currentStage === stage && (
            <motion.div
              className="absolute w-full h-full rounded-full bg-blue-400 -z-10"
              animate={{
                scale: [1, 1.6, 1],
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
      ))}

      {/* Animated Document Icons */}
      <AnimatePresence>
        {/* Form 1571 */}
        <motion.div
          className="absolute"
          initial={{ x: stages.forms.x, y: stages.forms.y - 30, opacity: 0 }}
          animate={{
            x: documentPositions.form1571.x,
            y: documentPositions.form1571.y,
            opacity: documentPositions.form1571.opacity,
          }}
          transition={{ type: 'spring', stiffness: 100, damping: 15 }}
        >
          {documentIcons.form}
          <div className="absolute top-[24px] left-0 w-full text-center text-[11px] text-blue-700">
            Form 1571
          </div>
        </motion.div>

        {/* Form 1572 */}
        <motion.div
          className="absolute"
          initial={{ x: stages.forms.x, y: stages.forms.y, opacity: 0 }}
          animate={{
            x: documentPositions.form1572.x,
            y: documentPositions.form1572.y,
            opacity: documentPositions.form1572.opacity,
          }}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.1 }}
        >
          {documentIcons.form}
          <div className="absolute top-[24px] left-0 w-full text-center text-[11px] text-blue-700">
            Form 1572
          </div>
        </motion.div>

        {/* Form 3674 */}
        <motion.div
          className="absolute"
          initial={{ x: stages.forms.x, y: stages.forms.y + 30, opacity: 0 }}
          animate={{
            x: documentPositions.form3674.x,
            y: documentPositions.form3674.y,
            opacity: documentPositions.form3674.opacity,
          }}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.2 }}
        >
          {documentIcons.form}
          <div className="absolute top-[24px] left-0 w-full text-center text-[11px] text-blue-700">
            Form 3674
          </div>
        </motion.div>

        {/* Module 2 */}
        <motion.div
          className="absolute"
          initial={{ x: stages.module2.x, y: stages.module2.y, opacity: 0 }}
          animate={{
            x: documentPositions.module2.x,
            y: documentPositions.module2.y,
            opacity: documentPositions.module2.opacity,
          }}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.3 }}
        >
          {documentIcons.module}
          <div className="absolute top-[24px] left-0 w-full text-center text-[11px] text-orange-700">
            Module 2
          </div>
        </motion.div>

        {/* Module 3 */}
        <motion.div
          className="absolute"
          initial={{ x: stages.module3.x, y: stages.module3.y, opacity: 0 }}
          animate={{
            x: documentPositions.module3.x,
            y: documentPositions.module3.y,
            opacity: documentPositions.module3.opacity,
          }}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.4 }}
        >
          {documentIcons.module}
          <div className="absolute top-[24px] left-0 w-full text-center text-[11px] text-orange-700">
            Module 3
          </div>
        </motion.div>

        {/* eCTD Package */}
        <motion.div
          className="absolute"
          initial={{ x: stages.ectd.x, y: stages.ectd.y, opacity: 0 }}
          animate={{
            x: documentPositions.ectd.x,
            y: documentPositions.ectd.y,
            opacity: documentPositions.ectd.opacity,
          }}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.5 }}
        >
          {documentIcons.package}
          <div className="absolute top-[24px] left-0 w-full text-center text-[11px] text-green-700">
            eCTD
          </div>
        </motion.div>

        {/* Submission */}
        <motion.div
          className="absolute"
          initial={{ x: stages.esg.x, y: stages.esg.y, opacity: 0 }}
          animate={{
            x: documentPositions.submission.x,
            y: documentPositions.submission.y,
            opacity: documentPositions.submission.opacity,
          }}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.6 }}
        >
          {documentIcons.submission}
          <div className="absolute top-[24px] left-0 w-full text-center text-[11px] text-blue-700">
            Submission
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Current Stage Indicator */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStage}
          className="absolute bottom-2 right-2 bg-white px-3 py-1 rounded-full text-xs font-medium shadow-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-blue-600">
            {currentStage.charAt(0).toUpperCase() + currentStage.slice(1)} Stage
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default AnimatedWorkflow;
