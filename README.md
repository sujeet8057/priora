# PRIORA 🚀

**PRIORA** is a proactive, AI-powered productivity companion designed to help you organize tasks, overcome cognitive overload, and stay on top of deadlines with intelligent guidance. 

Built as a full-stack React and Express application, PRIORA pairs a polished and fluid user experience with robust server-side Gemini API features to turn raw, cluttered notes into clear, actionable, structured itineraries.

---

## 🌟 Key Features

### 1. AI Task Parser (`/api/ai/parse-task`)
* **Natural Language Task Creation:** Simply type tasks the way you think them (e.g., *"Finish marketing deck tomorrow by 4:00 PM"*).
* **Smart Structure Extraction:** The app automatically parses the task title, categorizes it, evaluates priority, determines the deadline date, and extracts the exact target time.
* **Brainstormed Steps:** Generates three actionable, sequential subtasks for every main task automatically, ensuring you never start with a blank slate.

### 2. Proactive "What to Do Next" Coach (`/api/ai/what-to-do-next`)
* **Overcome Paralysis:** If you get stuck or find yourself with limited time, select any task and trigger the proactive coach.
* **Punchy Action Plan:** Instantly receive an immediate 3-step micro-action plan tailored to the remaining time, paired with a motivating boost.

### 3. AI Daily Schedule Optimizer (`/api/ai/daily-plan`)
* **Smart Time Slots:** Groups and sequences all your pending tasks for the day into optimized morning, afternoon, and evening slots.
* **Urgency Prioritization:** Intelligently organizes tasks by urgency and categories to structure your day effectively.

### 4. AI Weekly Insights & Procrastination Analysis (`/api/ai/weekly-insight`)
* **Data-Driven Analysis:** Visualizes weekly completion rates and productivity peaks with animated charts.
* **Procrastination Detection:** Analyzes completed vs. expired metrics to pinpoint personal procrastination triggers and offers two custom strategies to improve.

---

## 🛡️ High-Availability Gemini API Architecture

PRIORA is engineered with a **Resilient Fallback and Retry Chain** to prevent downtime and keep features responsive during API rate limits (`429`) or temporary model spikes (`503`):

1. **Automated Retry with Exponential Backoff:** Retries transient failures up to 2 times with cascading delays (2000ms, 4000ms).
2. **Cascading Model Fallbacks:** If the primary model becomes unavailable or rate-limited, the system automatically hot-swaps to the next available lightweight model in the following order:
   * `gemini-2.5-flash` *(Default highly responsive choice)*
   * `gemini-2.0-flash`
   * `gemini-1.5-flash`
   * `gemini-flash-latest`
   * `gemini-3.5-flash`
3. **Local Fail-safe Parsing:** If the entire external model chain is unavailable, the application gracefully falls back to structured local JavaScript regex parsing to ensure the user can always create tasks uninterrupted.

---

## 🛠️ Technology Stack

* **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide Icons, and Canvas Confetti.
* **Animations:** Motion (`motion/react`) for buttery smooth micro-interactions, layout transitions, and dashboard animations.
* **Backend:** Node.js, Express, and `tsx` for high-performance TypeScript execution.
* **AI Engine:** `@google/genai` (Official Google GenAI SDK).
* **Compiler/Bundler:** Vite 6, `esbuild` for CJS bundling in production.

---

## 🚀 Getting Started

### Prerequisites
Make sure you have **Node.js** (v18+) installed.

### Environment Setup
Create a `.env` file in the root directory (using `.env.example` as a guide) and add your Gemini API key:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

### Installation
Install the project dependencies:
```bash
npm install
```

### Running the App

#### Development Mode
Run the Express server and Vite frontend in development mode:
```bash
npm run dev
```
The server will boot on `http://localhost:3000`.

#### Production Build & Start
Compile the client static bundle and compile the TypeScript server into a self-contained CommonJS backend using `esbuild`:
```bash
npm run build
npm start
```

---

## 📂 Project Structure

```text
├── server.ts               # Express full-stack entrypoint & Gemini API integration
├── src/
│   ├── main.tsx            # React application mounting point
│   ├── App.tsx             # Interactive, responsive PRIORA productivity dashboard
│   └── index.css           # Global typography definitions, custom themes, and Tailwind styles
├── package.json            # Scripts, commands, and dependency declarations
└── metadata.json           # Application identity configuration
```
