# Design Guidelines: revize-ai - Website Sitemap Analyzer & AI Restructuring App

## Design Approach

**Selected Framework:** Hybrid of Linear's minimalist productivity aesthetic + Carbon Design's data visualization principles

**Rationale:** This is a professional productivity tool requiring clarity, precision, and sophisticated data visualization. The design should communicate technical competence while maintaining accessibility.

## Core Design Elements

### Typography Hierarchy
- **Primary Font:** Inter or IBM Plex Sans (via Google Fonts CDN)
- **Monospace Font:** JetBrains Mono for URLs, code snippets, technical data
- **Scale:**
  - Hero/Display: text-4xl to text-5xl, font-semibold
  - Section Headers: text-2xl to text-3xl, font-semibold
  - Card Titles: text-lg, font-medium
  - Body Text: text-base, font-normal
  - Technical Data: text-sm, font-mono
  - Labels/Meta: text-xs to text-sm, font-medium

### Layout System
**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16 consistently
- Micro-spacing (form elements, icons): p-2, gap-2
- Component spacing: p-4, p-6, gap-4
- Section spacing: py-12, py-16
- Large containers: p-8, p-12

**Grid System:**
- Main dashboard: 12-column responsive grid
- Two-panel comparison view: 1:1 split on desktop (lg:grid-cols-2), stack on mobile
- Card grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3

### Component Library

**Dashboard Layout:**
- Top navigation bar: Fixed header with logo, user avatar, action buttons
- Sidebar navigation: Collapsible, icon + label pattern
- Main content area: max-w-7xl container with generous padding

**URL Input Section:**
- Prominent centered card on dashboard home
- Large input field with icon prefix (link icon from Heroicons)
- Primary CTA button: "Analyze Website"
- Real-time validation feedback inline
- Advanced options accordion: crawl depth, robots.txt toggle

**Data Visualization Cards:**
- White/elevated surface with subtle border
- Header: Title + metadata (crawl date, page count)
- Content area with appropriate padding (p-6)
- Action footer: Export buttons, share options

**Tree Diagram Visualization:**
- Full-width container with zoom/pan controls
- Minimap in bottom-right corner
- Node styling: rounded rectangles with hierarchy indicators
- Connection lines: subtle, directional
- Interactive tooltips on hover showing page metadata

**Comparison View:**
- Side-by-side layout with sync scrolling
- Visual diff highlighting (additions, removals, modifications)
- Center divider with collapse/expand controls
- Legend explaining diff markers

**AI Insights Panel:**
- Distinct panel with subtle accent treatment
- Icon indicators for improvement types (SEO, structure, duplicates)
- Collapsible sections for detailed explanations
- "Apply Changes" CTA prominently placed

**Export Modal:**
- Center overlay with backdrop blur
- Format selection: radio buttons for JSON/XML/PNG
- Preview snippet of export content
- Download button with format indicator

**Authentication Pages:**
- Centered card layout, max-w-md
- Logo at top
- Clean form inputs with clear labels
- Social login buttons: Full-width, icon + text
- Subtle divider: "or continue with email"

### Navigation Patterns
- **Primary Nav:** Dashboard, History, Settings, Documentation
- **Breadcrumbs:** Show context in deep analysis views
- **Back Navigation:** Persistent back button in header during analysis flow
- **Keyboard Shortcuts:** Implement for power users (Cmd+K for search, etc.)

### Data Display Patterns
- **Tables:** Stripe rows, sortable columns, fixed header on scroll
- **Stats Cards:** Large number, label below, optional trend indicator
- **Progress Indicators:** Linear progress for crawl status
- **Empty States:** Centered illustration + descriptive text + primary action

### Interactions
- **Micro-interactions:** Subtle scale on button hover (scale-105)
- **Loading States:** Skeleton screens for data tables, spinner for actions
- **Transitions:** Fast, snappy (150-200ms), prefer translate/opacity
- **Focus States:** Clear keyboard focus indicators with ring utility

### Responsive Behavior
- **Mobile (< 768px):** Single column, collapsible sidebar → hamburger menu, stack comparison view
- **Tablet (768-1024px):** Two-column layouts where appropriate, persistent sidebar
- **Desktop (> 1024px):** Full multi-column layouts, expanded sidebar, side-by-side comparisons

## Critical Implementation Notes

**No Hero Section:** This is a tool, not a marketing site - lead with the URL input card prominently on dashboard

**Icon Library:** Use Heroicons exclusively for consistency (link, chart-bar, document-text, cog, user-circle)

**Accessibility:** ARIA labels on all interactive elements, keyboard navigation for tree diagram, screen reader announcements for crawl progress

**Performance:** Virtualize large tree diagrams, lazy load visualization libraries, debounce URL input validation

This design creates a professional, data-focused experience that prioritizes clarity and usability while maintaining visual sophistication appropriate for a technical productivity tool.