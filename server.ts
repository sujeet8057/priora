import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded Gemini AI client
let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY is not configured or uses placeholder. Falling back to structured mock parser.");
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

async function generateContentWithRetry(ai: GoogleGenAI, params: any, maxRetries = 2): Promise<any> {
  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash"
  ];

  // Remove duplicates while preserving order
  const uniqueModels = Array.from(new Set(modelsToTry));

  for (let m = 0; m < uniqueModels.length; m++) {
    const model = uniqueModels[m];
    params.model = model;
    let attempt = 0;
    while (true) {
      try {
        return await ai.models.generateContent(params);
      } catch (error: any) {
        const errMsg = error.message || String(error);
        const isRetriable = !error.status || error.status === 503 || error.status === 429 ||
                            errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || 
                            errMsg.includes("429") || errMsg.includes("Resource has been exhausted");
        
        if (isRetriable) {
          attempt++;
          if (attempt <= maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // 2000ms, 4000ms
            console.warn(`[GEMINI RETRY] Retriable error encountered on ${model} (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms... Error:`, errMsg);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            console.warn(`[GEMINI MODEL FAILURE] ${model} exhausted retries. Attempting next fallback model in list... Error:`, errMsg);
            break; // Break the inner while loop to move to the next fallback model in uniqueModels
          }
        } else {
          // Non-retriable error (e.g. invalid arguments or authentication issue), throw immediately
          throw error;
        }
      }
    }
  }
  // If we exhausted all models
  throw new Error("All Gemini models in the fallback chain failed with retriable errors.");
}

// ----------------------------------------------------
// API ENDPOINTS FOR GEMINI INTEGRATION
// ----------------------------------------------------

// 1. NLP Parse Task
function getFallbackSubtasks(text: string): string[] {
  const lower = text.toLowerCase();
  if (lower.includes("site") || lower.includes("web") || lower.includes("app") || lower.includes("develop") || lower.includes("code")) {
    return ["Design layouts and wireframes", "Develop core frontend and backend logic", "Perform user testing and deploy to production"];
  } else if (lower.includes("study") || lower.includes("exam") || lower.includes("read") || lower.includes("assignment") || lower.includes("learn")) {
    return ["Read textbook and review class notes", "Summarize key concepts or build flashcards", "Complete practice exercises and test self"];
  } else if (lower.includes("gym") || lower.includes("health") || lower.includes("workout") || lower.includes("doctor") || lower.includes("run")) {
    return ["Prepare workout or appointment plan", "Complete the primary session with focus", "Record progress and hydrate properly"];
  } else if (lower.includes("finance") || lower.includes("pay") || lower.includes("bill") || lower.includes("tax") || lower.includes("buy")) {
    return ["Gather all financial documents and receipts", "Perform calculation and process payment/transaction", "Log transaction in record book"];
  } else if (lower.includes("clean") || lower.includes("wash") || lower.includes("room") || lower.includes("house")) {
    return ["Organize clutter and dust surfaces", "Vacuum or mop the floors", "Dispose of trash and sanitize tools"];
  } else {
    return ["Define requirements and gather inputs", "Draft first version of the output", "Review and make final quality adjustments"];
  }
}

function parseFallbackTime(text: string): string {
  const lower = text.toLowerCase();
  
  // 12-hour AM/PM matching: e.g. "at 5pm", "by 5 pm", "5:30 pm"
  const timeRegex = /(?:at|by|before)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/;
  const match = lower.match(timeRegex);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? match[2] : "00";
    const ampm = match[3];
    
    if (ampm === "pm" && hours < 12) {
      hours += 12;
    } else if (ampm === "am" && hours === 12) {
      hours = 0;
    }
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }
  
  // 24-hour style matching: e.g. "at 14:30" or "at 17:00"
  const time24Regex = /(?:at|by|before)?\s*([01]?\d|2[0-3]):([0-5]\d)\b/;
  const match24 = lower.match(time24Regex);
  if (match24) {
    return `${match24[1].padStart(2, "0")}:${match24[2]}`;
  }

  if (lower.includes("morning")) return "09:00";
  if (lower.includes("noon")) return "12:00";
  if (lower.includes("afternoon")) return "15:00";
  if (lower.includes("evening")) return "18:00";
  if (lower.includes("night")) return "21:00";
  if (lower.includes("midnight")) return "23:59";

  return "18:00"; // default fallback
}

function parseFallbackDate(text: string, localDateStr: string): string {
  const baseDate = localDateStr ? new Date(localDateStr) : new Date();
  const lower = text.toLowerCase();
  
  if (lower.includes("tomorrow")) {
    baseDate.setDate(baseDate.getDate() + 1);
  } else if (lower.includes("day after tomorrow")) {
    baseDate.setDate(baseDate.getDate() + 2);
  } else if (lower.includes("next week")) {
    baseDate.setDate(baseDate.getDate() + 7);
  } else if (lower.includes("next monday")) {
    const day = baseDate.getDay();
    const daysToAdd = (8 - day) % 7 || 7;
    baseDate.setDate(baseDate.getDate() + daysToAdd);
  } else if (lower.includes("next friday")) {
    const day = baseDate.getDay();
    const daysToAdd = (12 - day) % 7 || 7;
    baseDate.setDate(baseDate.getDate() + daysToAdd);
  }
  
  return baseDate.toISOString().split("T")[0];
}

app.post("/api/ai/parse-task", async (req, res) => {
  const { text, localDate } = req.body;
  if (!text) {
    return res.status(400).json({ error: "No input text provided" });
  }

  const ai = getAI();
  if (!ai) {
    // Elegant fallback parsing for offline/no-key mode
    const lower = text.toLowerCase();
    let title = text;
    let description = "Automatically parsed offline.";
    let deadlineDate = parseFallbackDate(text, localDate);
    let deadlineTime = parseFallbackTime(text);
    let priority = "medium";
    let category = "Personal";
    let estimatedHours = 1;
    const subtasks = getFallbackSubtasks(text);

    // Very simple regex parsing for test/offline convenience
    if (lower.includes("by ")) {
      const parts = text.split(/by /i);
      title = parts[0].trim();
    }
    if (lower.includes("critical") || lower.includes("urgent")) priority = "critical";
    else if (lower.includes("high")) priority = "high";
    else if (lower.includes("low")) priority = "low";

    if (lower.includes("work") || lower.includes("job")) category = "Work";
    else if (lower.includes("study") || lower.includes("assignment") || lower.includes("exam") || lower.includes("learn") || lower.includes("read")) category = "Study";
    else if (lower.includes("finance") || lower.includes("pay") || lower.includes("bill") || lower.includes("buy")) category = "Finance";
    else if (lower.includes("health") || lower.includes("gym") || lower.includes("doctor") || lower.includes("workout")) category = "Health";

    return res.json({
      title,
      description,
      deadlineDate,
      deadlineTime,
      priority,
      category,
      estimatedHours,
      subtasks
    });
  }

  try {
    const prompt = `You are a helper parsing a natural language task description. Today's date (current local time) is: ${localDate || new Date().toISOString()}.
Parse this description: "${text}".
Generate a structured JSON representation of this task, making sure to parse the category into Work, Study, Personal, Finance, or Health. Map it to the closest match.
Also, parse the deadline date if mentioned or implied in the text (e.g., 'tomorrow', 'next Monday', 'by Friday', 'on July 4th', 'in 3 days'). Relative to today's date, calculate the absolute date and represent it as 'YYYY-MM-DD' in the 'deadlineDate' field. If no deadline date is mentioned, default to today's date.
Also, parse the deadline time (e.g. 5pm, noon, 9:30 am, at 3 o'clock) and represent it as HH:MM format in 24-hour style in the 'deadlineTime' field.
Crucially, generate/provide at least 3 logical, actionable subtasks (steps) needed to complete this main task, and return them as an array of strings in the 'subtasks' field. If the user specified some subtasks, include those. If not, brainstorm suitable ones based on the task description.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            deadlineDate: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
            deadlineTime: { type: Type.STRING, description: "Format: HH:MM 24-hour style, e.g. 18:00" },
            priority: { type: Type.STRING, description: "One of: low, medium, high, critical" },
            category: { type: Type.STRING, description: "One of: Work, Study, Personal, Finance, Health" },
            estimatedHours: { type: Type.NUMBER, description: "Estimated time in decimal hours, e.g. 1.5, default 1" },
            subtasks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "A list of at least 3 logical, actionable steps (subtasks) to complete this task. Brainstorm suitable steps if the user did not specify them."
            }
          },
          required: ["title", "description", "deadlineDate", "deadlineTime", "priority", "category", "estimatedHours", "subtasks"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Gemini API Error in parse-task, falling back to local parsing:", error);
    
    // Elegant fallback parsing for offline/no-key mode or rate limits
    const lower = text.toLowerCase();
    let title = text;
    let description = "Automatically parsed (Offline/AI Quota Limit fallback).";
    let deadlineDate = parseFallbackDate(text, localDate);
    let deadlineTime = parseFallbackTime(text);
    let priority = "medium";
    let category = "Personal";
    let estimatedHours = 1;
    const subtasks = getFallbackSubtasks(text);

    // Very simple regex parsing for test/offline convenience
    if (lower.includes("by ")) {
      const parts = text.split(/by /i);
      title = parts[0].trim();
    }
    if (lower.includes("critical") || lower.includes("urgent")) priority = "critical";
    else if (lower.includes("high")) priority = "high";
    else if (lower.includes("low")) priority = "low";

    if (lower.includes("work") || lower.includes("job")) category = "Work";
    else if (lower.includes("study") || lower.includes("assignment") || lower.includes("exam") || lower.includes("learn") || lower.includes("read")) category = "Study";
    else if (lower.includes("finance") || lower.includes("pay") || lower.includes("bill") || lower.includes("buy")) category = "Finance";
    else if (lower.includes("health") || lower.includes("gym") || lower.includes("doctor") || lower.includes("workout")) category = "Health";

    res.json({
      title,
      description,
      deadlineDate,
      deadlineTime,
      priority,
      category,
      estimatedHours,
      subtasks,
      isOfflineFallback: true
    });
  }
});

// 2. What To Do Next Guidance
app.post("/api/ai/what-to-do-next", async (req, res) => {
  const { taskTitle, description, timeLeft } = req.body;
  if (!taskTitle) {
    return res.status(400).json({ error: "No task title provided" });
  }

  const ai = getAI();
  if (!ai) {
    // Offline/No-key Mock Response
    return res.json({
      steps: [
        "Eliminate all distractions and silence your phone immediately.",
        `Set a 25-minute Pomodoro timer dedicated only to: ${taskTitle}.`,
        "Open your main workstation files and complete the absolute first sentence or block."
      ],
      motivation: "The best way to get started is simply to start. You've got this!",
      urgency: "high"
    });
  }

  try {
    const prompt = `Task: "${taskTitle}". Description: "${description || "None"}". Time remaining: "${timeLeft}".
Provide an immediate proactive 3-step action plan of what the user should do right now to make progress, alongside an encouraging statement. Make it short and punchy.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 3 ultra-actionable steps to do in the next 15 minutes."
            },
            motivation: { type: Type.STRING, description: "A high-impact encouraging tagline." },
            urgency: { type: Type.STRING, description: "One of: low, medium, high, critical." }
          },
          required: ["steps", "motivation", "urgency"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Gemini API Error in what-to-do-next, falling back:", error);
    res.json({
      steps: [
        "Eliminate all distractions and silence your phone immediately.",
        `Set a 25-minute Pomodoro timer dedicated only to: ${taskTitle}.`,
        "Open your main workstation files and complete the absolute first sentence or block."
      ],
      motivation: "The best way to get started is simply to start. You've got this! (Offline Mode)",
      urgency: "high"
    });
  }
});

// 3. Daily Plan
app.post("/api/ai/daily-plan", async (req, res) => {
  const { tasks } = req.body; // Array of task names and details
  
  const ai = getAI();
  if (!ai) {
    // Offline/No-key fallback
    return res.json({
      schedule: [
        { timeSlot: "09:00 AM - 11:00 AM", taskTitle: "Deep Work Session", activity: "Tackle your highest priority critical tasks when energy is high." },
        { timeSlot: "11:00 AM - 12:00 PM", taskTitle: "Review & Adjust", activity: "Check countdowns, update subtasks, and do low-effort items." },
        { timeSlot: "02:00 PM - 04:00 PM", taskTitle: "Secondary Sprint", activity: "Focus on remaining high/medium priority deliverables." }
      ],
      advice: "Try scheduling deep work intervals of 50 minutes followed by 10-minute rests."
    });
  }

  try {
    const prompt = `Create an optimized daily schedule for today based on these pending tasks: ${JSON.stringify(tasks)}. Group them, organize by urgency/priority, and give time slots.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            schedule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timeSlot: { type: Type.STRING, description: "e.g. 09:00 AM - 10:30 AM" },
                  taskTitle: { type: Type.STRING, description: "Task name or category of work" },
                  activity: { type: Type.STRING, description: "Action details" }
                },
                required: ["timeSlot", "taskTitle", "activity"]
              }
            },
            advice: { type: Type.STRING }
          },
          required: ["schedule", "advice"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Gemini API Error in daily-plan, falling back:", error);
    res.json({
      schedule: [
        { timeSlot: "09:00 AM - 11:00 AM", taskTitle: "Deep Work Session", activity: "Tackle your highest priority critical tasks when energy is high." },
        { timeSlot: "11:00 AM - 12:00 PM", taskTitle: "Review & Adjust", activity: "Check countdowns, update subtasks, and do low-effort items." },
        { timeSlot: "02:00 PM - 04:00 PM", taskTitle: "Secondary Sprint", activity: "Focus on remaining high/medium priority deliverables." }
      ],
      advice: "Try scheduling deep work intervals of 50 minutes followed by 10-minute rests. (Offline Mode)"
    });
  }
});

// 4. Weekly Insight Report
app.post("/api/ai/weekly-insight", async (req, res) => {
  const { stats } = req.body;

  const ai = getAI();
  if (!ai) {
    // Fallback response
    return res.json({
      procrastinationPattern: "Delaying tasks requiring larger estimates of work (over 3 hours).",
      improvementTips: [
        "Break big tasks into small, bite-sized subtasks under 1 hour.",
        "Set strict alarm notifications 1 hour before the absolute deadline."
      ],
      encouragementMessage: "You completed several tasks successfully! Focus on breaking down bigger friction points.",
      focusScoreRecommendation: "Try finishing at least one low-effort task early in the day to spark completion momentum."
    });
  }

  try {
    const prompt = `Analyze these task completion statistics for the week: ${JSON.stringify(stats)}. Detail the procrastination patterns, 2 specific tips, encouragement, and a focus score recommendation.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            procrastinationPattern: { type: Type.STRING },
            improvementTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 2 actionable improvement strategies."
            },
            encouragementMessage: { type: Type.STRING },
            focusScoreRecommendation: { type: Type.STRING }
          },
          required: ["procrastinationPattern", "improvementTips", "encouragementMessage", "focusScoreRecommendation"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Gemini API Error in weekly-insight, falling back:", error);
    res.json({
      procrastinationPattern: "Delaying tasks requiring larger estimates of work (over 3 hours).",
      improvementTips: [
        "Break big tasks into small, bite-sized subtasks under 1 hour.",
        "Set strict alarm notifications 1 hour before the absolute deadline."
      ],
      encouragementMessage: "You completed several tasks successfully! Focus on breaking down bigger friction points. (Offline Mode)",
      focusScoreRecommendation: "Try finishing at least one low-effort task early in the day to spark completion momentum."
    });
  }
});

// ----------------------------------------------------
// VITE AND STATIC ASSETS SERVING MIDDLEWARE
// ----------------------------------------------------

async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PRIORA SERVER] running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
