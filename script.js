const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GROQ_API_KEY   = import.meta.env.VITE_GROQ_API_KEY;

const MAX_CHOICES = 7; // Game ends after this many choices

let currentTheme  = "";
let storyHistory  = [];
let choiceCount   = 0;
let particles     = [];
let animFrame     = null;

// ─── Particle config per theme ────────────────────────────────
const THEME_PARTICLES = {
  Fantasy: { color: '#c4a0ff', glow: '#8b5cf6', count: 55, speed: 0.4, size: 2.2, type: 'firefly' },
  Horror:  { color: '#ff4444', glow: '#8b0000', count: 35, speed: 0.25, size: 1.6, type: 'ash'     },
  'Sci-Fi':{ color: '#44aaff', glow: '#0066cc', count: 65, speed: 0.15, size: 1.4, type: 'star'    },
  Mystery: { color: '#44ddaa', glow: '#006644', count: 45, speed: 0.3,  size: 1.8, type: 'ember'   },
};

// ─── Canvas particle system ───────────────────────────────────
const canvas = document.getElementById('bg-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function createParticles(theme) {
  const cfg = THEME_PARTICLES[theme] || THEME_PARTICLES.Fantasy;
  particles = [];

  for (let i = 0; i < cfg.count; i++) {
    particles.push({
      x:       Math.random() * canvas.width,
      y:       Math.random() * canvas.height,
      size:    cfg.size * (0.5 + Math.random()),
      speedX:  (Math.random() - 0.5) * cfg.speed,
      speedY:  -cfg.speed * (0.3 + Math.random()),
      opacity: Math.random(),
      opacityDir: Math.random() > 0.5 ? 1 : -1,
      opacitySpeed: 0.003 + Math.random() * 0.008,
      color:   cfg.color,
      glow:    cfg.glow,
      type:    cfg.type,
      wobble:  Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.02,
    });
  }
}

function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles.forEach(p => {
    // Update
    p.wobble  += p.wobbleSpeed;
    p.x       += p.speedX + Math.sin(p.wobble) * 0.3;
    p.y       += p.speedY;
    p.opacity += p.opacityDir * p.opacitySpeed;

    if (p.opacity >= 1)    { p.opacity = 1; p.opacityDir = -1; }
    if (p.opacity <= 0.05) { p.opacity = 0.05; p.opacityDir = 1; }

    // Wrap around
    if (p.y < -10)                 p.y = canvas.height + 10;
    if (p.x < -10)                 p.x = canvas.width + 10;
    if (p.x > canvas.width + 10)  p.x = -10;

    // Draw
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = p.glow;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();
  });

  animFrame = requestAnimationFrame(drawParticles);
}

function startParticles(theme) {
  if (animFrame) cancelAnimationFrame(animFrame);
  createParticles(theme);
  drawParticles();
}

// Start default ambient particles on load
startParticles('Fantasy');

// ─── Screen transitions ───────────────────────────────────────
function showScreen(id) {
  const all = document.querySelectorAll('.screen');

  all.forEach(s => {
    if (!s.classList.contains('hidden')) {
      s.classList.add('exit');
      setTimeout(() => {
        s.classList.remove('active', 'exit');
        s.classList.add('hidden');
      }, 600);
    }
  });

  const next = document.getElementById(id);
  next.classList.remove('hidden');
  // small delay so CSS transition fires
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      next.classList.add('active');
    });
  });
}

// ─── Start game ───────────────────────────────────────────────
function startGame(theme) {
  currentTheme = theme;
  storyHistory = [];
  choiceCount  = 0;

  // Set theme class on game screen
  const gameScreen = document.getElementById('game-screen');
  gameScreen.className = 'screen';
  gameScreen.classList.add(`theme-${theme}`);

  document.getElementById('theme-tag').textContent = `✦ ${theme}`;
  document.getElementById('history-list').innerHTML = '';
  document.getElementById('progress-fill').style.width = '0%';

  startParticles(theme);
  showScreen('game-screen');

  // Small delay so transition looks clean before first API call
  setTimeout(() => generateScene("The story begins. Write the opening scene."), 700);
}

// ─── Restart ──────────────────────────────────────────────────
function restartGame() {
  if (animFrame) cancelAnimationFrame(animFrame);
  startParticles('Fantasy');
  showScreen('theme-screen');
  document.getElementById('story-text').textContent = '';
  document.getElementById('choices').innerHTML = '';
}

// ─── Progress bar ─────────────────────────────────────────────
function updateProgress() {
  const pct = Math.min((choiceCount / MAX_CHOICES) * 100, 100);
  document.getElementById('progress-fill').style.width = `${pct}%`;
}

// ─── Generate scene ───────────────────────────────────────────
async function generateScene(playerAction) {
  const storyText = document.getElementById('story-text');
  const choicesDiv = document.getElementById('choices');

  storyText.textContent = 'The story unfolds';
  storyText.classList.add('loading');
  choicesDiv.innerHTML = '';

  const isEnding = choiceCount >= MAX_CHOICES;

  const historyContext = storyHistory.length > 0
    ? `Story so far: ${storyHistory.map(h => h.action).join(' → ')}`
    : '';

  const prompt = isEnding
    ? `
        You are a dramatic storyteller closing a ${currentTheme} adventure.
        ${historyContext}
        The player's final action: "${playerAction}"

        Write a powerful, conclusive final scene in 4-5 sentences. Make it feel earned and final.
        Then write a vivid 3-sentence summary of the player's entire journey.

        Respond ONLY with valid JSON:
        {
          "scene": "Final scene here.",
          "summary": "Epic summary of the full journey here."
        }
      `
    : `
        You are a dramatic, immersive storyteller running a ${currentTheme} choose-your-own-adventure game.
        ${historyContext}
        The player just did: "${playerAction}"

        Write the next scene in exactly 3-4 sentences. Be vivid, atmospheric, specific to ${currentTheme}.
        Then provide exactly 3 short distinct choices (max 10 words each).

        Respond ONLY with valid JSON, no markdown:
        {
          "scene": "Scene here.",
          "choices": ["Choice one", "Choice two", "Choice three"]
        }
      `;

  let raw = null;

  // Try Gemini
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 1000 },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok || data.error || !data.candidates || !data.candidates[0]) {
      throw new Error(`Gemini error: ${data.error?.message || res.status}`);
    }
    raw = data.candidates[0].content.parts[0].text.trim();
    console.log('✅ Used Gemini');

  } catch (geminiErr) {
    console.warn('⚠️ Gemini failed, falling back to Groq:', geminiErr.message);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1000,
          temperature: 0.9,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      raw = data.choices[0].message.content.trim();
      console.log('✅ Used Groq (fallback)');

    } catch (groqErr) {
      storyText.classList.remove('loading');
      storyText.textContent = 'Both APIs failed. Check your keys or connection.';
      console.error('Groq also failed:', groqErr);
      return;
    }
  }

  // Parse response
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    storyText.classList.remove('loading');
    storyHistory.push({ action: playerAction, scene: parsed.scene });
    updateHistory();

    // Typewriter the scene
    typeWriter(parsed.scene, storyText, () => {
      if (isEnding) {
        // Show ending screen after a beat
        setTimeout(() => showEnding(parsed.summary), 1000);
      } else {
        renderChoices(parsed.choices);
      }
    });

  } catch (parseErr) {
    storyText.classList.remove('loading');
    storyText.textContent = 'Got a response but couldn\'t parse it. Try again.';
    console.error('Parse error:', parseErr, '\nRaw:', raw);
  }
}

// ─── Show ending screen ───────────────────────────────────────
function showEnding(summary) {
  showScreen('ending-screen');
  const summaryText = document.getElementById('summary-text');
  summaryText.textContent = '';
  setTimeout(() => typeWriter(summary, summaryText, () => {}), 800);
}

// ─── Typewriter ───────────────────────────────────────────────
function typeWriter(text, element, callback) {
  element.textContent = '';
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

// ─── Render choices ───────────────────────────────────────────
function renderChoices(choices) {
  const choicesDiv = document.getElementById('choices');
  choicesDiv.innerHTML = '';
  const labels = ['I', 'II', 'III'];

  choices.forEach((choice, index) => {
    const btn = document.createElement('button');
    btn.textContent = choice;
    btn.setAttribute('data-num', labels[index]);

    btn.style.opacity   = '0';
    btn.style.transform = 'translateY(10px)';
    btn.style.transition = `opacity 0.35s ease ${index * 0.12}s, transform 0.35s ease ${index * 0.12}s, background 0.3s, border-color 0.3s, box-shadow 0.3s, transform 0.3s, padding 0.3s`;

    btn.onclick = () => {
      choiceCount++;
      updateProgress();
      generateScene(choice);
    };

    choicesDiv.appendChild(btn);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      btn.style.opacity   = '1';
      btn.style.transform = 'translateY(0)';
    }));
  });
}

// ─── Update history sidebar ───────────────────────────────────
function updateHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  storyHistory.forEach((entry, index) => {
    const li    = document.createElement('li');
    const label = index === 0
      ? 'Adventure begins'
      : entry.action.length > 38
        ? entry.action.slice(0, 38) + '…'
        : entry.action;
    li.textContent = label;
    list.appendChild(li);
  });

  list.scrollTop = list.scrollHeight;
}

// ─── Expose globals ───────────────────────────────────────────
window.startGame    = startGame;
window.restartGame  = restartGame;