/**
 * Code Connect — Concept2Cure Primitives (shadcn/Radix)
 *
 * Maps the top 15 Figma library component frames to their real code imports.
 * Agents and Figma Dev Mode read this to generate correct snippets.
 *
 * GOVERNED CONTRACT — do NOT add raw HTML or ad-hoc components.
 * Every component here is the single canonical implementation.
 *
 * @version 1.0.0
 * @see figma.config.json for parser/import-path configuration
 */

import figma from '@figma/code-connect';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BUTTON
// Figma: C2C / Button     Code: <Button>
// ═══════════════════════════════════════════════════════════════════════════════

import { Button } from '@/components/ui/button';

figma.connect(Button, 'FIGMA_URL_PLACEHOLDER/Button', {
  props: {
    label: figma.string('Label'),
    variant: figma.enum('Variant', {
      Primary: 'default',
      Secondary: 'secondary',
      Outline: 'outline',
      Ghost: 'ghost',
      Destructive: 'destructive',
      Link: 'link',
    }),
    size: figma.enum('Size', {
      Default: 'default',
      Small: 'sm',
      Large: 'lg',
      Icon: 'icon',
    }),
    disabled: figma.boolean('Disabled'),
  },
  example: ({ label, variant, size, disabled }: any) => (
    <Button variant={variant} size={size} disabled={disabled}>
      {label}
    </Button>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. BADGE
// Figma: C2C / Badge      Code: <Badge>
// ═══════════════════════════════════════════════════════════════════════════════

import { Badge } from '@/components/ui/badge';

figma.connect(Badge, 'FIGMA_URL_PLACEHOLDER/Badge', {
  props: {
    label: figma.string('Label'),
    variant: figma.enum('Variant', {
      Default: 'default',
      Secondary: 'secondary',
      Outline: 'outline',
      Destructive: 'destructive',
    }),
  },
  example: ({ label, variant }: any) => <Badge variant={variant}>{label}</Badge>,
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INPUT
// Figma: C2C / Input      Code: <Input>
// ═══════════════════════════════════════════════════════════════════════════════

import { Input } from '@/components/ui/input';

figma.connect(Input, 'FIGMA_URL_PLACEHOLDER/Input', {
  props: {
    placeholder: figma.string('Placeholder'),
    type: figma.enum('Type', {
      Text: 'text',
      Email: 'email',
      Password: 'password',
      Number: 'number',
    }),
    disabled: figma.boolean('Disabled'),
  },
  example: ({ placeholder, type, disabled }: any) => (
    <Input type={type} placeholder={placeholder} disabled={disabled} />
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CARD
// Figma: C2C / Card       Code: <Card>
// ═══════════════════════════════════════════════════════════════════════════════

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

figma.connect(Card, 'FIGMA_URL_PLACEHOLDER/Card', {
  props: {
    title: figma.string('Title'),
    description: figma.string('Description'),
  },
  example: ({ title, description }: any) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{/* content */}</CardContent>
    </Card>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DIALOG
// Figma: C2C / Dialog     Code: <Dialog>
// ═══════════════════════════════════════════════════════════════════════════════

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

figma.connect(Dialog, 'FIGMA_URL_PLACEHOLDER/Dialog', {
  props: {
    title: figma.string('Title'),
    description: figma.string('Description'),
    open: figma.boolean('Open'),
  },
  example: ({ title, description, open }: any) => (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. TABS
// Figma: C2C / Tabs       Code: <Tabs>
// ═══════════════════════════════════════════════════════════════════════════════

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

figma.connect(Tabs, 'FIGMA_URL_PLACEHOLDER/Tabs', {
  props: {
    defaultValue: figma.string('Default Tab'),
  },
  example: ({ defaultValue }: any) => (
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">{/* content */}</TabsContent>
      <TabsContent value="tab2">{/* content */}</TabsContent>
    </Tabs>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SELECT
// Figma: C2C / Select     Code: <Select>
// ═══════════════════════════════════════════════════════════════════════════════

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

figma.connect(Select, 'FIGMA_URL_PLACEHOLDER/Select', {
  props: {
    placeholder: figma.string('Placeholder'),
  },
  example: ({ placeholder }: any) => (
    <Select>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option 1</SelectItem>
        <SelectItem value="option2">Option 2</SelectItem>
      </SelectContent>
    </Select>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ALERT
// Figma: C2C / Alert      Code: <Alert>
// ═══════════════════════════════════════════════════════════════════════════════

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

figma.connect(Alert, 'FIGMA_URL_PLACEHOLDER/Alert', {
  props: {
    title: figma.string('Title'),
    description: figma.string('Description'),
    variant: figma.enum('Variant', {
      Default: 'default',
      Destructive: 'destructive',
    }),
  },
  example: ({ title, description, variant }: any) => (
    <Alert variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. TABLE
// Figma: C2C / Table      Code: <Table>
// ═══════════════════════════════════════════════════════════════════════════════

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

figma.connect(Table, 'FIGMA_URL_PLACEHOLDER/Table', {
  example: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Column</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Value</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. PROGRESS
// Figma: C2C / Progress   Code: <Progress>
// ═══════════════════════════════════════════════════════════════════════════════

import { Progress } from '@/components/ui/progress';

figma.connect(Progress, 'FIGMA_URL_PLACEHOLDER/Progress', {
  props: {
    value: figma.string('Value'),
  },
  example: ({ value }: any) => <Progress value={Number(value)} />,
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. TOOLTIP
// Figma: C2C / Tooltip    Code: <Tooltip>
// ═══════════════════════════════════════════════════════════════════════════════

import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

figma.connect(Tooltip, 'FIGMA_URL_PLACEHOLDER/Tooltip', {
  props: {
    label: figma.string('Label'),
  },
  example: ({ label }: any) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>Hover target</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. DROPDOWN MENU
// Figma: C2C / DropdownMenu   Code: <DropdownMenu>
// ═══════════════════════════════════════════════════════════════════════════════

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

figma.connect(DropdownMenu, 'FIGMA_URL_PLACEHOLDER/DropdownMenu', {
  example: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Action 1</DropdownMenuItem>
        <DropdownMenuItem>Action 2</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. SWITCH
// Figma: C2C / Switch     Code: <Switch>
// ═══════════════════════════════════════════════════════════════════════════════

import { Switch } from '@/components/ui/switch';

figma.connect(Switch, 'FIGMA_URL_PLACEHOLDER/Switch', {
  props: {
    checked: figma.boolean('Checked'),
    disabled: figma.boolean('Disabled'),
  },
  example: ({ checked, disabled }: any) => <Switch checked={checked} disabled={disabled} />,
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. CHECKBOX
// Figma: C2C / Checkbox   Code: <Checkbox>
// ═══════════════════════════════════════════════════════════════════════════════

import { Checkbox } from '@/components/ui/checkbox';

figma.connect(Checkbox, 'FIGMA_URL_PLACEHOLDER/Checkbox', {
  props: {
    checked: figma.boolean('Checked'),
    disabled: figma.boolean('Disabled'),
  },
  example: ({ checked, disabled }: any) => <Checkbox checked={checked} disabled={disabled} />,
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. SKELETON
// Figma: C2C / Skeleton   Code: <Skeleton>
// ═══════════════════════════════════════════════════════════════════════════════

import { Skeleton } from '@/components/ui/skeleton';

figma.connect(Skeleton, 'FIGMA_URL_PLACEHOLDER/Skeleton', {
  example: () => <Skeleton className="h-4 w-[200px]" />,
});
