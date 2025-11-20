/**
 * Vault™ AI Assistant
 *
 * This module handles the personalized AI assistant experience for onboarding
 * new users to the Vault™ platform.
 */

class VaultAIAssistant {
  constructor(options = {}) {
    this.options = {
      autoStart: true,
      startDelay: 2000,
      typingSpeed: 30,
      ...options,
    };

    this.state = {
      active: false,
      minimized: false,
      role: null,
      experience: null,
      selectedModules: [],
      conversationHistory: [],
    };

    // Module definitions
    this.availableModules = {
      'document-management': {
        name: 'Document Management',
        icon: 'fa-folder-open',
        description: 'Enhanced document organization and versioning',
      },
      'regulatory-intelligence': {
        name: 'Regulatory Intelligence',
        icon: 'fa-lightbulb',
        description: 'Smart regulatory insights and compliance assistance',
      },
      'ind-wizard': {
        name: 'IND Wizard™',
        icon: 'fa-wand-magic-sparkles',
        description: 'Automated IND application preparation',
      },
      'csr-intelligence': {
        name: 'CSR Intelligence™',
        icon: 'fa-file-lines',
        description: 'Clinical study report generation and analysis',
      },
      'vault-navigator': {
        name: 'Vault™ File Navigator',
        icon: 'fa-compass',
        description: 'Intelligent content search and discovery',
      },
      'study-architect': {
        name: 'Study Architect™',
        icon: 'fa-drafting-compass',
        description: 'Clinical trial design and optimization',
      },
      'template-library': {
        name: 'Template Library',
        icon: 'fa-copy',
        description: 'Pre-approved document templates and frameworks',
      },
      'ai-summarization': {
        name: 'AI Summarization',
        icon: 'fa-robot',
        description: 'Automated content extraction and summarization',
      },
    };

    // Role definitions
    this.userRoles = {
      'regulatory-writer': 'Regulatory Writer',
      'clinical-scientist': 'Clinical Scientist',
      'medical-writer': 'Medical Writer',
      'regulatory-affairs': 'Regulatory Affairs',
      'quality-assurance': 'Quality Assurance',
      'clinical-operations': 'Clinical Operations',
      'medical-affairs': 'Medical Affairs',
      'study-manager': 'Study Manager',
    };

    // Experience levels
    this.experienceLevels = {
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      advanced: 'Advanced',
      expert: 'Expert',
    };

    // Initialize the assistant
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  /**
   * Initialize the assistant UI and begin the onboarding experience
   */
  initialize(containerSelector = '#ai-assistant-container') {
    // Create the UI elements
    this.createAssistantUI(containerSelector);

    // Bind event handlers
    this.bindEvents();

    // Auto-start the assistant if enabled
    if (this.options.autoStart) {
      setTimeout(() => {
        this.showWelcomeMessage();
      }, this.options.startDelay);
    }
  }

  /**
   * Create the assistant UI elements
   */
  createAssistantUI(containerSelector) {
    // Get or create the container
    this.container = document.querySelector(containerSelector);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'ai-assistant-container';
      document.body.appendChild(this.container);
    }

    // Create the trigger button
    this.trigger = document.createElement('div');
    this.trigger.className = 'assistant-trigger active';
    this.trigger.innerHTML = '<i class="fas fa-robot"></i>';
    document.body.appendChild(this.trigger);

    // Create the assistant UI
    this.container.innerHTML = `
            <div class="assistant-header">
                <div class="assistant-header-title">
                    <i class="fas fa-robot"></i>
                    <span>Vault™ AI Assistant</span>
                </div>
                <div class="assistant-header-actions">
                    <i class="fas fa-minus assistant-header-icon" id="minimize-assistant"></i>
                    <i class="fas fa-times assistant-header-icon" id="close-assistant"></i>
                </div>
            </div>
            <div class="assistant-messages">
                <!-- Messages will be added here dynamically -->
            </div>
            <div class="assistant-input">
                <input type="text" placeholder="Type your question or response..." id="assistant-message-input">
                <button id="send-message"><i class="fas fa-paper-plane"></i></button>
            </div>
        `;

    // Store references to UI elements
    this.messagesContainer = this.container.querySelector('.assistant-messages');
    this.messageInput = this.container.querySelector('#assistant-message-input');
    this.sendButton = this.container.querySelector('#send-message');
    this.minimizeButton = this.container.querySelector('#minimize-assistant');
    this.closeButton = this.container.querySelector('#close-assistant');
  }

  /**
   * Bind event handlers for user interactions
   */
  bindEvents() {
    // Send message
    this.sendButton.addEventListener('click', () => this.handleUserInput());
    this.messageInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        this.handleUserInput();
      }
    });

    // Minimize assistant
    this.minimizeButton.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleMinimize();
    });

    // Close assistant
    this.closeButton.addEventListener('click', e => {
      e.stopPropagation();
      this.closeAssistant();
    });

    // Open assistant from header
    this.container.querySelector('.assistant-header').addEventListener('click', () => {
      if (this.state.minimized) {
        this.toggleMinimize();
      }
    });

    // Open assistant from trigger
    this.trigger.addEventListener('click', () => {
      this.container.classList.add('active');
      this.trigger.classList.remove('active');
      this.state.active = true;
    });
  }

  /**
   * Show welcome message and start onboarding
   */
  showWelcomeMessage() {
    this.container.classList.add('active');
    this.trigger.classList.remove('active');
    this.state.active = true;

    // Add welcome message with small delay
    setTimeout(() => {
      this.addAssistantMessage(
        "👋 Welcome to Vault™! I'm your AI assistant designed to help you navigate our enterprise regulatory document management platform. I can help with document retention, FDA compliance, cloud security, and personalize your experience."
      );

      // Add a follow-up message explaining the platform
      setTimeout(() => {
        this.addAssistantMessage(
          'Vault™ simplifies regulated document creation, offering Microsoft 365-style UI with advanced retention policies and blockchain-secured audit trails for regulatory compliance. How would you like me to assist you today?'
        );

        // Then show role selection
        setTimeout(() => {
          this.showRoleOptions();
        }, 1500);
      }, 1500);
    }, 300);
  }

  /**
   * Display role selection options
   */
  showRoleOptions() {
    const roleOptions = Object.entries(this.userRoles)
      .map(
        ([roleId, roleLabel]) =>
          `<button class="option-button" data-role="${roleId}">${roleLabel}</button>`
      )
      .join('');

    this.addOptionsMessage(`
            <p>What best describes your role?</p>
            <div class="options-buttons">
                ${roleOptions}
            </div>
        `);

    // Add event listeners to the role buttons
    const roleButtons = this.messagesContainer.querySelectorAll('.option-button[data-role]');
    roleButtons.forEach(button => {
      button.addEventListener('click', () => {
        const roleId = button.getAttribute('data-role');
        const roleLabel = button.textContent;
        this.handleRoleSelection(roleId, roleLabel);

        // Mark this button as selected
        roleButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
      });
    });
  }

  /**
   * Handle role selection from the user
   */
  handleRoleSelection(roleId, roleLabel) {
    this.state.role = {
      id: roleId,
      label: roleLabel,
    };

    this.addUserMessage(`I'm a ${roleLabel}`);
    this.addAssistantMessage(
      `Thanks for letting me know you're a ${roleLabel}. This helps me personalize your Vault™ experience.`
    );

    // Ask about experience next
    setTimeout(() => {
      this.askExperienceLevel();
    }, 1000);
  }

  /**
   * Ask about user's experience level
   */
  askExperienceLevel() {
    const experienceOptions = Object.entries(this.experienceLevels)
      .map(
        ([expId, expLabel]) =>
          `<button class="option-button" data-experience="${expId}">${expLabel}</button>`
      )
      .join('');

    this.addOptionsMessage(`
            <p>What's your level of experience with clinical documentation and regulatory submissions?</p>
            <div class="options-buttons">
                ${experienceOptions}
            </div>
        `);

    // Add event listeners to the experience buttons
    const expButtons = this.messagesContainer.querySelectorAll('.option-button[data-experience]');
    expButtons.forEach(button => {
      button.addEventListener('click', () => {
        const expId = button.getAttribute('data-experience');
        const expLabel = button.textContent;
        this.handleExperienceSelection(expId, expLabel);

        // Mark this button as selected
        expButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
      });
    });
  }

  /**
   * Handle experience level selection
   */
  handleExperienceSelection(expId, expLabel) {
    this.state.experience = {
      id: expId,
      label: expLabel,
    };

    this.addUserMessage(`My experience level is ${expLabel}`);

    // Different responses based on experience
    let response;
    if (expId === 'beginner') {
      response =
        "I'll provide detailed guidance to help you learn the regulatory documentation process with Vault™. Let's start with the basics.";
    } else if (expId === 'intermediate') {
      response =
        "Great! I'll focus on helping you enhance your existing knowledge with Vault™'s advanced features.";
    } else {
      response =
        "Excellent! I'll highlight Vault™'s specialized tools that will help streamline your workflow and maximize efficiency.";
    }

    this.addAssistantMessage(response);

    // Suggest modules based on role and experience
    setTimeout(() => {
      this.suggestModules();
    }, 1000);
  }

  /**
   * Suggest modules based on user preferences
   */
  suggestModules() {
    // Determine which modules to recommend based on role and experience
    let recommendedModules = [];

    // Recommendations based on role
    switch (this.state.role.id) {
      case 'regulatory-writer':
      case 'medical-writer':
        recommendedModules = [
          'document-management',
          'regulatory-intelligence',
          'ind-wizard',
          'csr-intelligence',
        ];
        break;
      case 'clinical-scientist':
      case 'study-manager':
        recommendedModules = [
          'csr-intelligence',
          'study-architect',
          'ai-summarization',
          'template-library',
        ];
        break;
      case 'regulatory-affairs':
        recommendedModules = [
          'regulatory-intelligence',
          'ind-wizard',
          'document-management',
          'vault-navigator',
        ];
        break;
      case 'quality-assurance':
        recommendedModules = [
          'document-management',
          'template-library',
          'regulatory-intelligence',
          'ind-wizard',
        ];
        break;
      case 'clinical-operations':
        recommendedModules = [
          'study-architect',
          'csr-intelligence',
          'document-management',
          'ai-summarization',
        ];
        break;
      case 'medical-affairs':
        recommendedModules = [
          'ai-summarization',
          'csr-intelligence',
          'regulatory-intelligence',
          'vault-navigator',
        ];
        break;
      default:
        recommendedModules = [
          'document-management',
          'regulatory-intelligence',
          'vault-navigator',
          'template-library',
        ];
    }

    // Create module grid
    const moduleGrid = recommendedModules
      .map(moduleId => {
        const module = this.availableModules[moduleId];
        return `
                <div class="module-button" data-module="${moduleId}">
                    <i class="fas ${module.icon}"></i>
                    <span>${module.name}</span>
                </div>
            `;
      })
      .join('');

    this.addModulesMessage(`
            <p>Based on your role and experience, I recommend these modules for you:</p>
            <div class="modules-grid">
                ${moduleGrid}
            </div>
            <p class="mt-2">Click on the modules you'd like to explore first.</p>
        `);

    // Add event listeners to module buttons
    const moduleButtons = this.messagesContainer.querySelectorAll('.module-button');
    moduleButtons.forEach(button => {
      button.addEventListener('click', () => {
        const moduleId = button.getAttribute('data-module');
        this.handleModuleSelection(moduleId);

        // Toggle selection on this button
        button.classList.toggle('selected');
      });
    });

    // Add continue button after the grid
    const continueButton = document.createElement('button');
    continueButton.className = 'option-button';
    continueButton.style.marginTop = '10px';
    continueButton.style.backgroundColor = 'var(--assistant-primary)';
    continueButton.style.color = 'white';
    continueButton.textContent = 'Continue';

    const lastMessage = this.messagesContainer.lastElementChild;
    lastMessage.appendChild(continueButton);

    continueButton.addEventListener('click', () => {
      // Move to the next step - guided tour offer
      this.offerGuidedTour();
    });
  }

  /**
   * Handle module selection
   */
  handleModuleSelection(moduleId) {
    const moduleIndex = this.state.selectedModules.indexOf(moduleId);

    if (moduleIndex === -1) {
      // Add module to selection
      this.state.selectedModules.push(moduleId);
    } else {
      // Remove module from selection
      this.state.selectedModules.splice(moduleIndex, 1);
    }
  }

  /**
   * Offer a guided tour
   */
  offerGuidedTour() {
    let moduleNames = '';
    if (this.state.selectedModules.length > 0) {
      moduleNames = this.state.selectedModules.map(id => this.availableModules[id].name).join(', ');
      this.addUserMessage(`I'm interested in: ${moduleNames}`);
    } else {
      this.addUserMessage('I want to continue without selecting specific modules');
    }

    this.addAssistantMessage(
      `Perfect! Now that we've personalized your experience, would you like a guided tour of the platform?`
    );

    this.addOptionsMessage(`
            <p>Would you like a guided tour now?</p>
            <div class="options-buttons">
                <button class="option-button" data-tour="yes">Yes, show me around</button>
                <button class="option-button" data-tour="no">No, I'll explore on my own</button>
            </div>
        `);

    // Add event listeners
    const tourButtons = this.messagesContainer.querySelectorAll('.option-button[data-tour]');
    tourButtons.forEach(button => {
      button.addEventListener('click', () => {
        const choice = button.getAttribute('data-tour');
        const label = button.textContent;
        this.handleTourSelection(choice, label);

        // Mark this button as selected
        tourButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
      });
    });
  }

  /**
   * Handle tour selection
   */
  handleTourSelection(choice, label) {
    this.addUserMessage(label);

    if (choice === 'yes') {
      this.addAssistantMessage(
        `Great! Let me show you around Vault™. I'll guide you through the key features and how to get started.`
      );

      // Start the guided tour
      setTimeout(() => {
        this.startGuidedTour();
      }, 1000);
    } else {
      this.addAssistantMessage(
        `No problem! You can explore Vault™ at your own pace. Remember, I'm always here to help if you have questions. Just click on my icon in the bottom right corner.`
      );

      // Conclude the tour
      setTimeout(() => {
        this.concludeTour();
      }, 1000);
    }
  }

  /**
   * Start the guided tour
   */
  startGuidedTour() {
    // Simulated tour steps
    const tourSteps = [
      {
        message:
          "Let's start with the Document Management system. This is where you'll create, store, and organize all your regulatory documents with advanced version control.",
        delay: 3000,
      },
      {
        message:
          'Next, check out the Regulatory Intelligence dashboard. It provides real-time updates on global regulatory changes and compliance requirements.',
        delay: 3000,
      },
      {
        message:
          "The Vault™ File Navigator uses AI to help you quickly find documents across your workspace. It's perfect for locating precedent documents and templates.",
        delay: 3000,
      },
      {
        message:
          'For IND submissions, our IND Wizard™ module helps automate the entire process from content generation to final assembly and submission.',
        delay: 3000,
      },
    ];

    // Display tour steps sequentially
    let currentStep = 0;

    const showNextStep = () => {
      if (currentStep < tourSteps.length) {
        this.addAssistantMessage(tourSteps[currentStep].message);
        currentStep++;

        setTimeout(
          () => {
            showNextStep();
          },
          tourSteps[currentStep - 1].delay
        );
      } else {
        // Tour complete
        setTimeout(() => {
          this.concludeTour();
        }, 1000);
      }
    };

    showNextStep();
  }

  /**
   * Conclude the guided tour
   */
  concludeTour() {
    this.addAssistantMessage(
      `That completes your personalized orientation to Vault™! What would you like to do next?`
    );

    this.addOptionsMessage(`
            <p>Choose your next step:</p>
            <div class="options-buttons">
                <button class="option-button" data-action="explore">Start exploring Vault™</button>
                <button class="option-button" data-action="tutorial">Watch tutorial videos</button>
                <button class="option-button" data-action="setup">Set up my first project</button>
            </div>
        `);

    // Add event listeners
    const actionButtons = this.messagesContainer.querySelectorAll('.option-button[data-action]');
    actionButtons.forEach(button => {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-action');
        const label = button.textContent;
        this.handleFinalSelection(action, label);

        // Mark this button as selected
        actionButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
      });
    });
  }

  /**
   * Handle final selection after tour
   */
  handleFinalSelection(action, label) {
    this.addUserMessage(label);

    let response = '';

    switch (action) {
      case 'explore':
        response =
          "Perfect! The best way to learn is by exploring. The dashboard is now personalized based on your preferences. If you need help, I'm just a click away!";
        break;
      case 'tutorial':
        response =
          "Great choice! I've added tutorial videos to your dashboard that are relevant to your role and interests. You can find them in the Learning Center section.";
        break;
      case 'setup':
        response =
          "Excellent! Let's get you started with your first project. I've prepared a template based on your role that you can customize. You'll find it in your Projects section.";
        break;
    }

    this.addAssistantMessage(response);

    // Final message
    setTimeout(() => {
      this.addAssistantMessage(
        "Thank you for setting up your personalized Vault™ experience. Remember, I'm always here to help if you have questions or need assistance!"
      );
    }, 2000);
  }

  /**
   * Handle user text input
   */
  handleUserInput() {
    const message = this.messageInput.value.trim();

    if (message) {
      this.addUserMessage(message);
      this.messageInput.value = '';

      // Simulate thinking
      const typingIndicator = document.createElement('div');
      typingIndicator.className = 'assistant-typing';
      typingIndicator.innerHTML = `
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            `;
      this.messagesContainer.appendChild(typingIndicator);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

      // Simulate response after a delay
      setTimeout(() => {
        this.messagesContainer.removeChild(typingIndicator);

        // Generic response for now - in a real app, this would integrate with a backend
        this.addAssistantMessage(
          `Thank you for your message. As this is a demo, I can acknowledge your input but can't provide specific responses to free-form questions yet. If you have questions about Vault™, please reach out to our support team at vault@concept2cures.com.`
        );
      }, 1500);
    }
  }

  /**
   * Add a message from the assistant to the chat
   */
  addAssistantMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message message-assistant';
    messageEl.innerHTML = message;

    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    // Store in conversation history
    this.state.conversationHistory.push({
      role: 'assistant',
      content: message,
    });
  }

  /**
   * Add a message from the user to the chat
   */
  addUserMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message message-user';
    messageEl.textContent = message;

    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    // Store in conversation history
    this.state.conversationHistory.push({
      role: 'user',
      content: message,
    });
  }

  /**
   * Add option buttons to the chat
   */
  addOptionsMessage(optionsHtml) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message-options';
    messageEl.innerHTML = optionsHtml;

    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Add module recommendation buttons
   */
  addModulesMessage(modulesHtml) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message-modules';
    messageEl.innerHTML = modulesHtml;

    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Toggle minimize state of the assistant
   */
  toggleMinimize() {
    this.container.classList.toggle('minimized');
    this.state.minimized = !this.state.minimized;

    if (this.state.minimized) {
      this.minimizeButton.classList.replace('fa-minus', 'fa-expand');
    } else {
      this.minimizeButton.classList.replace('fa-expand', 'fa-minus');
    }
  }

  /**
   * Close the assistant
   */
  closeAssistant() {
    this.container.classList.remove('active');
    this.trigger.classList.add('active');
    this.state.active = false;

    // Reset minimized state if it was minimized
    if (this.state.minimized) {
      this.toggleMinimize();
    }
  }
}

// Initialize the assistant on page load
const vaultAssistant = new VaultAIAssistant({
  autoStart: true,
  startDelay: 2000,
});
