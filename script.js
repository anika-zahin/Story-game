const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
let currentTheme = "";
let storyHistory = [];

// ─── Start Game ───────────────────────────────────────────────
function startGame(theme) {
  currentTheme = theme;
  storyHistory = [];

  document.getElementById("theme-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  document.getElementById("theme-tag").textContent = `✦ ${theme}`;
  document.getElementById("history-list").innerHTML = "";

  generateScene("The story begins. Write the opening scene.");
}

// ─── Restart ──────────────────────────────────────────────────
function restartGame() {
  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("theme-screen").classList.remove("hidden");
  document.getElementById("story-text").textContent = "";
  document.getElementById("choices").innerHTML = "";
}

// ─── Generate Scene via Gemini API ────────────────────────────
async function generateScene(playerAction) {
  const storyText = document.getElementById("story-text");
  const choicesDiv = document.getElementById("choices");

  storyText.textContent = "The story unfolds";
  storyText.classList.add("loading");
  choicesDiv.innerHTML = "";

  const historyContext = storyHistory.length > 0
    ? `Story so far: ${storyHistory.map(h => h.action).join(" → ")}`
    : "";

  const prompt = `
    You are a dramatic, immersive storyteller running a ${currentTheme} choose-your-own-adventure game.
    ${historyContext}
    The player just did: "${playerAction}"

    Write the next scene in exactly 3-4 sentences. Be vivid, atmospheric, and specific to ${currentTheme}.
    Then provide exactly 3 short, distinct choices (max 10 words each) for what the player can do next.

    Respond ONLY with valid JSON, no markdown, no explanation:
    {
      "scene": "Scene description here.",
      "choices": ["Choice one", "Choice two", "Choice three"]
    }
  `;

  let raw = null;

  // ── Try Gemini first ──────────────────────────────────────
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 1000 }
        })
      }
    );
    const data = await res.json();

    // Gemini quota error → fall through to Groq
    if (data.error && (data.error.code === 429 || data.error.status === "RESOURCE_EXHAUSTED")) {
      throw new Error("Gemini quota exceeded");
    }

    raw = data.candidates[0].content.parts[0].text.trim();
    console.log("✅ Used Gemini");

  } catch (geminiErr) {
    console.warn("⚠️ Gemini failed, falling back to Groq:", geminiErr.message);

    // ── Fallback: Groq ──────────────────────────────────────
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1000,
          temperature: 0.9,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      raw = data.choices[0].message.content.trim();
      console.log("✅ Used Groq (fallback)");

    } catch (groqErr) {
      storyText.classList.remove("loading");
      storyText.textContent = "Both Gemini and Groq failed. Check your API keys or connection.";
      console.error("Groq also failed:", groqErr);
      return;
    }
  }

  // ── Parse and render ──────────────────────────────────────
  try {
    // Strip markdown code fences if model wraps JSON in ```json ... ```
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    storyText.classList.remove("loading");
    storyHistory.push({ action: playerAction, scene: parsed.scene });
    updateHistory();
    typeWriter(parsed.scene, storyText, () => renderChoices(parsed.choices));

  } catch (parseErr) {
    storyText.classList.remove("loading");
    storyText.textContent = "Got a response but couldn't parse it. Try again.";
    console.error("JSON parse failed:", parseErr, "\nRaw:", raw);
  }
}
// ─── Typewriter Effect ────────────────────────────────────────
function typeWriter(text, element, callback) {
  element.textContent = "";
  let i = 0;
  const speed = 16;

  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, speed);
    } else {
      if (callback) callback();
    }
  }
  type();
}

// ─── Render Choice Buttons ────────────────────────────────────
function renderChoices(choices) {
  const choicesDiv = document.getElementById("choices");
  choicesDiv.innerHTML = "";

  const labels = ["I", "II", "III"];

  choices.forEach((choice, index) => {
    const btn = document.createElement("button");
    btn.textContent = choice;
    btn.setAttribute("data-num", labels[index]);
    btn.onclick = () => generateScene(choice);

    // Stagger animation
    btn.style.opacity = "0";
    btn.style.transform = "translateY(8px)";
    btn.style.transition = `opacity 0.3s ease ${index * 0.1}s, transform 0.3s ease ${index * 0.1}s, background 0.2s, border-color 0.2s, padding 0.2s, box-shadow 0.2s`;

    choicesDiv.appendChild(btn);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        btn.style.opacity = "1";
        btn.style.transform = "translateY(0)";
      });
    });
  });
}

// ─── Update History Sidebar ───────────────────────────────────
function updateHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = "";

  storyHistory.forEach((entry, index) => {
    const li = document.createElement("li");
    // Show a short version of the action taken
    const label = index === 0
      ? "Adventure begins"
      : entry.action.length > 40
        ? entry.action.slice(0, 40) + "…"
        : entry.action;
    li.textContent = label;
    list.appendChild(li);
  });

  // Scroll sidebar to bottom
  list.scrollTop = list.scrollHeight;
}

// ─── Expose to HTML onclick handlers ─────────────────────────
window.startGame = startGame;
window.restartGame = restartGame;