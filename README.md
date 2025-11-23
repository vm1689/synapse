# Synapse

A modern IDE interface built with React and TypeScript, featuring a multi-panel layout with chat, plan, code, and model views.

## Features

- **Multi-panel Layout**: Resizable panels with collapse/expand functionality
- **Chat Panel**: Interactive chat interface with message threads
- **Plan Panel**: Structured plan view with citations and action buttons
- **Code Panel**: Syntax-highlighted code display
- **Model Panel**: Revenue forecast charts and key metrics

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   - Copy `.env.example` to `.env` (or create a `.env` file manually)
   - Add your Gemini API key:
   ```env
   VITE_GEMINI_API_KEY=your_api_key_here
   ```
   - Get your API key from: https://makersuite.google.com/app/apikey

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

### Build

To build for production:
```bash
npm run build
```

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **CSS** - Styling (matching VS Code dark theme)

## Project Structure

```
src/
  components/
    panels/        # Panel components (Chat, Plan, Code, Model)
    Header.tsx     # Top header component
    Panel.tsx      # Reusable panel wrapper
    PanelsContainer.tsx  # Main container with resize logic
    ResizeHandle.tsx     # Resize handle component
  App.tsx          # Main app component
  main.tsx         # Entry point
```

