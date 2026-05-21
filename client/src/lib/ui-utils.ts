/**
 * Utility function to apply compact styling across the application
 */
export function applyCompactStyling() {
  // Apply compact styling to all cards
  const cards = document.querySelectorAll('.bg-white.shadow, .bg-white.border, .card');
  cards.forEach(card => {
    if (!card.classList.contains('compact-card')) {
      card.classList.add('compact-card', 'modern-card');
    }
  });

  // Apply compact styling to all section headers
  const headers = document.querySelectorAll('.card-header, h2, h3');
  headers.forEach(header => {
    if (
      !header.classList.contains('compact-card-header') &&
      !header.classList.contains('text-2xl')
    ) {
      header.classList.add('compact-card-header');
    }
  });

  // Apply compact styling to all grids
  const grids = document.querySelectorAll('.grid, .grid-cols-1, .grid-cols-2, .grid-cols-3');
  grids.forEach(grid => {
    if (!grid.classList.contains('compact-grid')) {
      grid.classList.add('compact-grid');
    }
  });

  // Apply compact styling to all tables
  const tables = document.querySelectorAll('table');
  tables.forEach(table => {
    if (!table.classList.contains('compact-table')) {
      table.classList.add('compact-table');
    }
  });

  // Make forms more compact
  const formGroups = document.querySelectorAll('.form-group, .space-y-4, .space-y-6');
  formGroups.forEach(group => {
    if (!group.classList.contains('compact-form-group')) {
      group.classList.replace('space-y-4', 'space-y-2');
      group.classList.replace('space-y-6', 'space-y-3');
      group.classList.add('compact-form-group');
    }
  });

  // Enhance buttons
  const buttons = document.querySelectorAll('button:not(.no-style)');
  buttons.forEach(button => {
    if (!button.classList.contains('modern-button') && !button.classList.contains('inline-flex')) {
      button.classList.add('modern-button');
    }
  });

  // Add fade-in animations to major sections
  const mainSections = document.querySelectorAll('main > div, main > section');
  mainSections.forEach((section, index) => {
    if (!section.classList.contains('animate-fade-in')) {
      section.classList.add('animate-fade-in');
      (section as HTMLElement).style.animationDelay = `${index * 100}ms`;
    }
  });

  // Add glass effect to card headers
  const cardHeaders = document.querySelectorAll('.card-header');
  cardHeaders.forEach(header => {
    if (!header.classList.contains('glass-effect')) {
      header.classList.add('glass-effect', 'rounded-t-xl');
    }
  });

  // Enhance badges
  const badges = document.querySelectorAll('.badge');
  badges.forEach(badge => {
    if (!badge.classList.contains('pill-badge')) {
      badge.classList.add('pill-badge');
    }
  });

  // Add modern styling to inputs
  const inputs = document.querySelectorAll(
    'input:not([type="checkbox"]):not([type="radio"]), textarea, select'
  );
  inputs.forEach(input => {
    if (!input.classList.contains('ring-focus')) {
      input.classList.add('ring-focus');
    }
  });
}

/**
 * Apply gradient text effect to headings
 */
export function applyGradientHeadings() {
  const headings = document.querySelectorAll('h1, h2, h3');

  headings.forEach(heading => {
    const level = heading.tagName.charAt(1);

    if (!heading.classList.contains('gradient-text')) {
      heading.classList.add('gradient-text');

      // Apply different gradients based on heading level
      if (level === '1') {
        heading.classList.add('gradient-blue', 'font-bold');
      } else if (level === '2') {
        heading.classList.add('gradient-purple', 'font-semibold');
      } else if (level === '3') {
        heading.classList.add('gradient-green', 'font-medium');
      }
    }
  });
}
