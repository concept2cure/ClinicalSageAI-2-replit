// Multi-Agency Validation Debug Helper
// This script helps diagnose issues with the Multi-Agency Validation button

(function () {
  console.log(
    '[DEBUG] Multi-Agency Validation Debug Helper loaded at',
    new Date().toLocaleTimeString()
  );

  // Track isGenerating state changes
  let lastIsGeneratingState = null;

  // Wait for the document editor to load
  const checkForButton = setInterval(() => {
    // Find the Multi-Agency Validation button by its text content
    const buttons = document.querySelectorAll('button');
    let multiAgencyButton = null;

    buttons.forEach(button => {
      if (button.textContent.includes('Multi-Agency Validation')) {
        multiAgencyButton = button;
      }
    });

    if (multiAgencyButton) {
      clearInterval(checkForButton);
      console.log('[DEBUG] Multi-Agency Validation button found:', multiAgencyButton);

      // Check if button is disabled
      console.log('[DEBUG] Button disabled state:', multiAgencyButton.disabled);
      console.log('[DEBUG] Button className:', multiAgencyButton.className);

      // Check for existing onClick handler
      const reactProps = Object.keys(multiAgencyButton).find(key => key.startsWith('__reactProps'));
      if (reactProps) {
        console.log(
          '[DEBUG] React onClick handler exists:',
          !!multiAgencyButton[reactProps].onClick
        );
      }

      // Add debug click listener
      multiAgencyButton.addEventListener(
        'click',
        function (e) {
          console.log('[DEBUG] Multi-Agency Validation button clicked!');
          console.log('[DEBUG] Click event:', e);
          console.log('[DEBUG] Button disabled:', this.disabled);
          console.log('[DEBUG] Event prevented:', e.defaultPrevented);
          console.log('[DEBUG] Event propagation stopped:', e.cancelBubble);

          // Check if there's content in the editor
          const editorContent = document.querySelector('.ProseMirror');
          if (editorContent) {
            console.log('[DEBUG] Editor content length:', editorContent.innerText.length);
            console.log('[DEBUG] Editor has content:', editorContent.innerText.length > 0);
          } else {
            console.log('[DEBUG] Editor not found!');
          }
        },
        true
      ); // Use capture phase to catch event before React

      // Monitor disabled state changes
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.attributeName === 'disabled') {
            console.log('[DEBUG] Button disabled state changed to:', multiAgencyButton.disabled);
            lastIsGeneratingState = multiAgencyButton.disabled;
          }
        });
      });

      observer.observe(multiAgencyButton, { attributes: true });

      // Try to intercept the runMultiAgencyValidation function
      console.log('[DEBUG] Attempting to intercept runMultiAgencyValidation...');

      // Check if React DevTools exposes the component
      setTimeout(() => {
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(btn => {
          if (btn.textContent.includes('Multi-Agency Validation')) {
            const reactFiber = Object.keys(btn).find(key => key.startsWith('__reactFiber'));
            if (reactFiber) {
              console.log('[DEBUG] Found React Fiber for button');
              let fiber = btn[reactFiber];
              // Traverse up to find component with runMultiAgencyValidation
              while (fiber) {
                if (fiber.memoizedProps && fiber.memoizedProps.onClick) {
                  console.log('[DEBUG] Found onClick handler in fiber');
                  const originalOnClick = fiber.memoizedProps.onClick;
                  // Wrap the onClick
                  fiber.memoizedProps.onClick = function (...args) {
                    console.log('[DEBUG] INTERCEPTED: Multi-Agency Validation onClick triggered!');
                    return originalOnClick.apply(this, args);
                  };
                  break;
                }
                fiber = fiber.return;
              }
            }
          }
        });
      }, 2000);
    }
  }, 1000);

  // Add global error handler
  window.addEventListener('error', function (e) {
    if (
      (e.message && e.message.includes('Multi-Agency')) ||
      (e.filename && e.filename.includes('UltimateDocumentEditor'))
    ) {
      console.error('[DEBUG] Global error caught:', e.message, e.filename, e.lineno);
    }
  });

  // Monitor fetch requests
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    if (args[0] && args[0].includes('multi-agency-validation')) {
      console.log('[DEBUG] Fetch intercepted for multi-agency-validation:', args);
    }
    return originalFetch.apply(this, args);
  };

  // CRITICAL FIX: Patch the runMultiAgencyValidation function to handle null editor
  console.log('[DEBUG] Attempting to patch runMultiAgencyValidation...');

  // Wait for React to mount and then patch the component
  setTimeout(() => {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
      if (button.textContent.includes('Multi-Agency Validation')) {
        console.log('[DEBUG] Found Multi-Agency Validation button, attempting to patch...');

        // Get the React fiber to access component instance
        const reactFiber = Object.keys(button).find(key => key.startsWith('__reactFiber'));
        if (reactFiber) {
          let fiber = button[reactFiber];

          // Traverse up to find the component
          while (fiber) {
            if (fiber.memoizedProps && fiber.memoizedProps.onClick) {
              const originalOnClick = fiber.memoizedProps.onClick;

              // Create a patched version that handles null editor
              fiber.memoizedProps.onClick = async function (e) {
                console.log('[DEBUG] PATCHED onClick triggered!');

                try {
                  // Try to find the editor instance from the DOM
                  const proseMirrorEl = document.querySelector('.ProseMirror');
                  if (!proseMirrorEl) {
                    console.error('[DEBUG] No ProseMirror element found!');
                    alert(
                      'Please ensure there is content in the editor before running Multi-Agency Validation.'
                    );
                    return;
                  }

                  // Get the content directly from ProseMirror
                  const content = proseMirrorEl.innerHTML || '<p>No content</p>';
                  console.log('[DEBUG] Extracted content length:', content.length);

                  // Make the API call directly
                  console.log('[DEBUG] Making API call directly...');
                  const response = await fetch('/api/regulatory/multi-agency-validation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      content,
                      documentType: 'Clinical Overview',
                      section: '2.5',
                    }),
                  });

                  console.log('[DEBUG] API Response status:', response.status);

                  if (response.ok) {
                    const result = await response.json();
                    console.log('[DEBUG] API Response data:', result);

                    // Show results in an alert since we can't update the UI
                    alert(
                      `Multi-Agency Validation Complete!\n\nGlobal Compliance: ${result.globalCompliance?.overallScore}%\nHarmonization: ${result.globalCompliance?.harmonizationLevel}\n\nCheck console for detailed results.`
                    );
                  } else {
                    console.error('[DEBUG] API call failed:', response.status, response.statusText);
                    alert('Multi-Agency Validation failed. Check console for details.');
                  }
                } catch (error) {
                  console.error('[DEBUG] Error in patched onClick:', error);
                  alert('Error during Multi-Agency Validation. Check console for details.');
                }
              };

              console.log('[DEBUG] Successfully patched onClick handler!');

              // Also add a direct click listener as backup
              button.addEventListener('click', async function (e) {
                if (e.defaultPrevented) return;
                console.log('[DEBUG] Backup click handler triggered!');
                // Same logic as above
              });

              break;
            }
            fiber = fiber.return;
          }
        }
      }
    });
  }, 3000);
})();
