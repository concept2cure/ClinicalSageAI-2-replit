import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

/**
 * # Button Component
 *
 * The Button component is the primary interactive element in Concept2Cure.
 * It follows 21 CFR Part 11 accessibility guidelines and supports multiple variants.
 *
 * ## Usage Guidelines
 *
 * - Use **primary** variant for main actions (Submit, Save, Confirm)
 * - Use **secondary** variant for alternative actions
 * - Use **destructive** variant for delete/remove operations
 * - Use **ghost** variant for less prominent actions
 * - Use **outline** variant in dense UI areas
 *
 * ## Accessibility
 *
 * - All buttons support keyboard navigation
 * - Focus states are clearly visible
 * - Loading states announce to screen readers
 * - Disabled states maintain proper contrast ratios
 */
const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      description: 'The visual style variant of the button',
      table: {
        defaultValue: { summary: 'default' },
      },
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'The size of the button',
      table: {
        defaultValue: { summary: 'default' },
      },
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the button is disabled',
    },
    children: {
      control: 'text',
      description: 'Button content',
    },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A versatile button component following the Concept2Cure design system.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The default button style, used for primary actions.
 */
export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
};

/**
 * Use for destructive actions like delete or remove.
 * Always confirm before executing destructive operations.
 */
export const Destructive: Story = {
  args: {
    children: 'Delete Document',
    variant: 'destructive',
  },
};

/**
 * Outline variant for secondary actions or when space is limited.
 */
export const Outline: Story = {
  args: {
    children: 'View Details',
    variant: 'outline',
  },
};

/**
 * Secondary button for alternative actions.
 */
export const Secondary: Story = {
  args: {
    children: 'Cancel',
    variant: 'secondary',
  },
};

/**
 * Ghost buttons blend into the background until hovered.
 */
export const Ghost: Story = {
  args: {
    children: 'Learn More',
    variant: 'ghost',
  },
};

/**
 * Link-styled button for navigation-like actions.
 */
export const Link: Story = {
  args: {
    children: 'View Documentation',
    variant: 'link',
  },
};

/**
 * Small button size for compact UI areas.
 */
export const Small: Story = {
  args: {
    children: 'Small',
    size: 'sm',
  },
};

/**
 * Large button size for prominent calls to action.
 */
export const Large: Story = {
  args: {
    children: 'Get Started',
    size: 'lg',
  },
};

/**
 * Icon-only button, ensure aria-label is provided for accessibility.
 */
export const IconButton: Story = {
  args: {
    children: '→',
    size: 'icon',
    'aria-label': 'Next',
  },
};

/**
 * Disabled state - user cannot interact with the button.
 */
export const Disabled: Story = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
};

/**
 * All button variants displayed together for comparison.
 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

/**
 * All button sizes displayed together for comparison.
 */
export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon">⚙</Button>
    </div>
  ),
};
