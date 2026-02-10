const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --------------------
// constants
const GRAVITY = 0.6;
const JUMP_FORCE = 12;
const SPEED = 2.8;

// --------------------
let animationId = null;
let gamePaused = false;
let dotsCollected = 0;

const player = {
  x: 140,
  y: 0,
  w: 30,
  h: 40,
  vy: 0,
  grounded: true
};

let platforms = [];
let dots = [];

// --------------------
// reset game
function resetGame() {
  cancelAnimationFrame(animationId);
  gamePaused = false;

  dotsCollected = 0;
  platforms = [];
  dots = [];

  const startPlatform = {
    x: 80,
    y: canvas.height - 160,
    w: 260,
    h: 20
  };
  platforms.push(startPlatform);

  player.y = startPlatform.y - player.h;
  player.vy = 0;
  player.grounded = true;

  document.getElementById("dots").textContent = 0;
  document.getElementById("death").style.display = "none";
  document.getElementById("videoContainer").style.display = "none";
  document.getElementById("win").style.display = "none";

  for (let i = 0; i < 12; i++) spawnPlatform();

  update();
}

document.getElementById("reset").onclick = resetGame;
document.getElementById("hardReset").onclick = resetGame;


function respawn() {
  cancelAnimationFrame(animationId);
  gamePaused = false;

  // Choose the first platform as safe
  const safePlatform = platforms[0];

  // Shift all platforms so the safe platform appears near the left of the screen
  const shiftX = safePlatform.x - 80; // player will be at x=80
  platforms.forEach(p => p.x -= shiftX);
  dots.forEach(d => d.x -= shiftX);

  // Place the player on top of the safe platform
  player.x = 80;
  player.y = safePlatform.y - player.h;
  player.vy = 0;
  player.grounded = true;

  document.getElementById("death").style.display = "none";
  document.getElementById("videoContainer").style.display = "none";

  update();
}



// --------------------
// spawn safe platforms
function spawnPlatform() {
  const last = platforms[platforms.length - 1];

  const airTime = (JUMP_FORCE * 2) / GRAVITY;
  const maxJump = airTime * SPEED * 0.7;

  const gap = Math.random() * maxJump * 0.8 + 60;

  const yShift = (Math.random() * 120) - 60;
  const y = Math.max(120, Math.min(canvas.height - 100, last.y + yShift));

  const platform = { x: last.x + last.w + gap, y, w: 140, h: 20 };
  platforms.push(platform);

  dots.push({ x: platform.x + platform.w / 2, y: platform.y - 14, r: 6 });
}

// --------------------
// input
window.addEventListener("keydown", e => {
  if (e.code === "Space" && player.grounded && !gamePaused) {
    player.vy = -JUMP_FORCE;
    player.grounded = false;
  }
});

// --------------------
// death handling
function die() {
  gamePaused = true;
  cancelAnimationFrame(animationId);
  document.getElementById("death").style.display = "flex";
}

// --------------------
// fetch a random meme from Meme API
async function getRandomMeme() {
  try {
    const res = await fetch("https://meme-api.com/gimme");
    const data = await res.json();
    return data.url;
  } catch (err) {
    console.error("Failed to fetch meme:", err);
    return null;
  }
}

// --------------------
// watch random meme to respawn
document.getElementById("watchAd").onclick = async () => {
  const memeEl = document.getElementById("memeImg");
  const container = document.getElementById("videoContainer");

  const memeURL = await getRandomMeme();
  if (!memeURL) return alert("Failed to load meme, try again!");

  memeEl.src = memeURL;

  container.style.display = "flex";

  let timeLeft = 15;
  const timer = document.getElementById("timer");
  timer.textContent = `Respawn available in ${timeLeft}`;

  const interval = setInterval(() => {
    timeLeft--;
    timer.textContent = `Respawn available in ${timeLeft}`;

    if (timeLeft <= 0) {
      clearInterval(interval);
      memeEl.src = "";
      respawn();
    }
  }, 1000);
};

// --------------------
// update loop
function update() {
  if (gamePaused) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  player.vy += GRAVITY;
  player.y += player.vy;
  player.grounded = false;

  platforms.forEach(p => {
    p.x -= SPEED;

    if (
      player.x < p.x + p.w &&
      player.x + player.w > p.x &&
      player.y + player.h <= p.y + 2 &&
      player.y + player.h + player.vy >= p.y
    ) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.grounded = true;
    }

    ctx.fillStyle = "#777";
    ctx.fillRect(p.x, p.y, p.w, p.h);
  });

  dots.forEach(d => {
    d.x -= SPEED;

    const dx = player.x + player.w / 2 - d.x;
    const dy = player.y + player.h / 2 - d.y;

    if (Math.hypot(dx, dy) < d.r + 10) {
      d.collected = true;
      dotsCollected++;
      document.getElementById("dots").textContent = dotsCollected;
    }

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  });

  dots = dots.filter(d => !d.collected && d.x > -30);
  platforms = platforms.filter(p => p.x + p.w > -50);

  while (platforms.length < 12) spawnPlatform();

  ctx.fillStyle = "#fff";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  if (player.y > canvas.height) {
    die();
    return;
  }

  if (dotsCollected >= 200) {
    document.getElementById("win").style.display = "flex";
    return;
  }

  animationId = requestAnimationFrame(update);
}

// --------------------
// start game
resetGame();
