
# Synapse

**The Workspace for Drug Valuation**

> **The Problem:** Drug valuation is paralyzed by disconnected teams using fragile, static spreadsheets that cannot keep pace with the complexity of drug development. This fragmentation traps Clinical, Commercial, and Strategy insights in opaque formulas and version control errors, leading to high-stakes decisions based on stale data.

**Synapse** solves this by unifying stakeholders in a single workspace where AI agents instantly translate natural language conversations into live, executable code and market models. We are replacing "black box" spreadsheets with a transparent, real-time single source of truth for key assets.

-----

## 🚀 Core Features

Synapse provides a modern IDE interface built with React and TypeScript, specifically designed to bridge the gap between conversation and computation.

  * **🤖 AI-Driven Modeling (Chat Panel)**
      * Interactive chat interface powered by Gemini.
      * Translate natural language questions (*"What is the NPV if we delay Phase 3 by 6 months?"*) into actionable models.
  * **📋 Strategic Transparency (Plan Panel)**
      * Structured plan views that expose the logic behind the numbers.
      * Includes citations and specific action buttons to modify assumptions.
  * **💻 Transparent Execution (Code Panel)**
      * No more hidden Excel macros. View the syntax-highlighted code that drives your valuation.
      * Verify formulas and logic in real-time.
  * **📈 Live Visualization (Model Panel)**
      * Instant feedback loop.
      * Visual revenue forecast charts and key metrics that update as you chat.
  * **🎛️ Modern Workspace**
      * VS Code-inspired dark theme.
      * Fully resizable multi-panel layout with collapse/expand functionality to focus on what matters.

-----

## 🛠️ Getting Started

### Prerequisites

  * **Node.js:** Version 18+
  * **npm:** Installed with Node
  * **Google Gemini API Key:** Required for the AI agent functionality.

### Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/synapse.git
    cd synapse
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Configure Environment**

      * Create a `.env` file in the root directory (or copy `.env.example`).
      * Add your Google Gemini API key (Get one [here](https://makersuite.google.com/app/apikey)).

    <!-- end list -->

    ```env
    VITE_GEMINI_API_KEY=your_api_key_here
    ```

4.  **Run the Application**

    ```bash
    npm run dev
    ```

    Open your browser to `http://localhost:5173`.

### Build for Production

To create a production-ready build:

```bash
npm run build
```

-----

## 🏗️ Tech Stack

  * **Frontend Framework:** React 18
  * **Language:** TypeScript (Strict typing for financial accuracy)
  * **Build Tool:** Vite
  * **AI Integration:** Google Gemini API
  * **Styling:** CSS Modules (Custom dark theme)

## 📂 Project Structure

The project follows a modular architecture, separating the UI panels from the core application logic.

```text
src/
├── components/
│   ├── panels/           # Core workspace components
│   │   ├── Chat.tsx      # AI interaction layer
│   │   ├── Plan.tsx      # Strategic view
│   │   ├── Code.tsx      # Executable logic display
│   │   └── Model.tsx     # Charts and visualizations
│   ├── Header.tsx        # App navigation and state
│   ├── Panel.tsx         # Reusable HOC for window management
│   ├── PanelsContainer.tsx # Main grid/resize logic
│   └── ResizeHandle.tsx  # UI controls for panel resizing
├── App.tsx               # Main layout composition
└── main.tsx              # Entry point
```

-----

**Built for the future of Pharma Intelligence.**

-----

### 💡 A Next Step

Since this is an IDE-like interface, adding a **screenshot** or a GIF of the interface in action right below the "The Problem/Solution" section would massively increase the quality of this README. Would you like me to generate a placeholder image tag for that?