import { addons } from '@storybook/manager-api';
import { create } from '@storybook/theming/create';

const concept2CureRITheme = create({
  base: 'light',

  // Brand
  brandTitle: 'TrialSage Component Library',
  brandUrl: 'https://trialsage.ai',
  brandTarget: '_self',

  // UI
  appBg: '#f8f9fa',
  appContentBg: '#ffffff',
  appBorderColor: '#e9ecef',
  appBorderRadius: 8,

  // Typography
  fontBase: '"Inter", "Poppins", Roboto, sans-serif',
  fontCode: '"Fira Code", "Monaco", monospace',

  // Text colors
  textColor: '#212529',
  textInverseColor: '#ffffff',
  textMutedColor: '#6c757d',

  // Toolbar default and active colors
  barTextColor: '#6c757d',
  barSelectedColor: '#0d6efd',
  barBg: '#ffffff',

  // Form colors
  inputBg: '#ffffff',
  inputBorder: '#ced4da',
  inputTextColor: '#212529',
  inputBorderRadius: 4,

  // Colors
  colorPrimary: '#0d6efd',
  colorSecondary: '#6c757d',
});

addons.setConfig({
  theme: concept2CureRITheme,
  sidebar: {
    showRoots: true,
    collapsedRoots: ['deprecated'],
  },
  toolbar: {
    title: { hidden: false },
    zoom: { hidden: false },
    eject: { hidden: false },
    copy: { hidden: false },
    fullscreen: { hidden: false },
  },
});
