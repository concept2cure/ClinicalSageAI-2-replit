# TrialSage Vault Client Portal: UI Component Library

This document outlines the key UI components that will be implemented for the TrialSage Vault Client Portal, providing a consistent design language across the application.

## Layout Components

### AppShell

The main application container that provides consistent layout structure.

- Header with logo, navigation, and user menu
- Sidebar for main navigation
- Content area for page rendering
- Footer with company information and links

### DashboardLayout

Specialized layout for dashboard pages with multiple widgets.

- Widget grid system
- Drag-and-drop widget rearrangement
- Widget size controls
- Dashboard saving/loading

### ContentLayout

Standard layout for content-focused pages.

- Breadcrumb navigation
- Page title and actions
- Content area with optional sidebar
- Responsive behavior for different screen sizes

## Navigation Components

### MainNavigation

Primary navigation component for the application.

- Module-based navigation items
- Visual indicators for active section
- Role-based visibility control
- Collapsible sections for sub-navigation

### Breadcrumbs

Hierarchical page location indicator.

- Dynamic generation based on route
- Clickable links to parent pages
- Truncation for deep hierarchies
- Consistent styling with main theme

### TabNavigation

Secondary navigation for page-level content organization.

- Horizontal tab list
- Active tab indication
- Optional tab badges for notifications
- Keyboard navigation support

### ActionBar

Container for page-level actions.

- Primary and secondary action buttons
- Contextual action display based on permissions
- Responsive design for mobile view
- Tooltips for action descriptions

## Document Management Components

### DocumentBrowser

Main component for browsing and organizing documents.

- List/grid/table view options
- Sort and filter controls
- Folder navigation
- Bulk selection and actions

### DocumentCard

Card component for displaying document information.

- Thumbnail preview
- Metadata display (title, type, date)
- Status indicator
- Quick action buttons

### VersionHistory

Component for viewing and managing document versions.

- Version list with timestamps and authors
- Version comparison view
- Restore version functionality
- Version annotations and comments

### DocumentViewer

Integrated viewer for different document types.

- PDF rendering
- Office document preview
- Image viewer
- Code file syntax highlighting

### FileUploader

Component for uploading new documents.

- Drag-and-drop support
- Multi-file upload
- Progress indication
- Validation and error handling

## Dashboard Components

### MetricCard

Card component for displaying key metrics.

- Numeric value with formatting
- Trend indicator
- Descriptive title
- Optional chart or icon

### ChartWidget

Configurable chart component for data visualization.

- Multiple chart types (bar, line, pie, etc.)
- Interactive tooltip data
- Legend display
- Export functionality

### ActivityFeed

Component for displaying recent activities.

- Chronological activity list
- Filtering by activity type
- User attribution
- Clickable links to related items

### QuickActions

Component for frequently used actions.

- Customizable action buttons
- Role-based visibility
- Usage tracking
- Tooltip help

### StatusOverview

Component for displaying status information for projects or tasks.

- Visual status indicators
- Progress bars
- Due date highlighting
- Risk flagging

## AI Assistant Components

### AssistantChat

Main interface for interacting with the AI assistant.

- Chat message thread
- User input area
- Message typing indicators
- Persistent chat history

### ContextPanel

Sidebar component showing context for AI interactions.

- Related documents list
- Reference information
- Query suggestions
- Knowledge base links

### AIContentGenerator

Component for AI-assisted content creation.

- Template selection
- Content generation options
- Generated content preview
- Accept/modify/regenerate controls

### SmartSuggestions

Component for displaying AI-generated suggestions.

- Contextual suggestion cards
- Accept/dismiss functionality
- Explanation of suggestions
- Feedback mechanism

## Form Components

### SmartForm

Dynamic form component with validation and submission handling.

- Field rendering based on schema
- Real-time validation
- Conditional field display
- Form section organization

### RichTextEditor

Advanced text editor for document creation.

- Formatting toolbar
- Table support
- Image embedding
- Citation management

### TagSelector

Component for managing document tags and categories.

- Autocomplete tag selection
- Tag creation
- Tag grouping
- Color-coded tags

### EntityPicker

Component for selecting entities (users, projects, etc.).

- Search functionality
- Multi-select support
- Entity preview
- Recent/frequent selections

## Workflow Components

### TaskList

Component for displaying and managing user tasks.

- Task grouping by type/priority
- Due date indication
- Assignment information
- Status tracking

### ApprovalFlow

Component for visualizing and managing approval workflows.

- Workflow stage visualization
- Current status indicator
- Approver information
- Action buttons for workflow progression

### CommentThread

Component for document review and collaboration.

- Threaded comments
- Reply functionality
- Mention users
- Resolution tracking

### SignatureCapture

Component for capturing electronic signatures.

- Signature input (typed or drawn)
- Meaning of signature selection
- Date and time stamping
- Confirmation workflow

## Utility Components

### NotificationCenter

Component for managing system notifications.

- Notification list
- Read/unread status
- Notification categories
- Action links

### SearchBar

Global search component with advanced features.

- Autocomplete suggestions
- Search scoping
- Recent searches
- Advanced search options

### FilterPanel

Component for applying complex filters to data views.

- Multiple filter criteria
- Save/load filter presets
- Clear filters
- Visual filter indication

### HelpTooltip

Contextual help component.

- Hover-triggered information
- Rich content support
- Links to documentation
- Video tutorial embedding

## Implementation Guidelines

1. **Component Organization**

   - Use a consistent folder structure for components
   - Maintain separation of concerns (presentation vs. logic)
   - Document props and usage patterns
   - Include accessibility considerations

2. **Styling Approach**

   - Use Tailwind CSS for styling
   - Maintain consistent color scheme based on theme
   - Ensure responsive behavior for all components
   - Follow WCAG AA accessibility guidelines

3. **State Management**

   - Use React state for simple component state
   - Leverage React Query for server state
   - Consider context for shared state
   - Document state dependencies

4. **Performance Considerations**

   - Implement virtualization for long lists
   - Use React.memo for expensive components
   - Optimize re-renders with proper dependency arrays
   - Lazy load components when appropriate

5. **Testing Strategy**
   - Create unit tests for component rendering
   - Test interactive behavior with user event simulation
   - Include accessibility testing
   - Verify responsive behavior
