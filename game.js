(() => {
  const ROWS = 9;
  const COLS = 7;

  const ICON_TYPES = 12;
  const SPRITE_COLS = 4;
  const SPRITE_ROWS = 4;

  const SCORE_PER_TILE = 10;
  const POWER_SCORE_BONUS = 100;

  
  // --- Audio ---
  // Browser rules require a user gesture before audio can reliably play.
  // We enable audio after the player presses Play.
  let audioEnabled = false;

  const SFX = {
    // special match SFX (played on combos or 4+ matches)
    match_pool: [
      { src: "shalom.mp3", vol: 0.55 },
      { src: "yiddish%20bass.mp3", vol: 0.55 },
      { src: "happy%20hannukah.mp3", vol: 0.55 },
      { src: "pretty-pretty-good.mp3", vol: 0.60 },
      { src: "mazel-tov.mp3", vol: 0.60 },
      { src: "yasher.mp3", vol: 0.60 },
      { src: "have-a-little-nosh.mp3", vol: 0.60 },
      { src: "baruch-hashem.mp3", vol: 0.60 },
    ],
    // specific events
    oyvey: { src: "yiddish-oyvey.mp3", vol: 0.60 },
    ayyayyay: { src: "yiddish-ayyayyay.mp3", vol: 0.65 },
    gezint: { src: "Idee.mp3", vol: 0.45 },
  };

  let matchPool = [];
  let oyveyAudio = null;
  let ayyayyayAudio = null;
  let gezintAudio = null;

  // WebAudio for tiny "pip" tone when no special SFX plays
  let audioCtx = null;

  function initAudio(){
    matchPool = SFX.match_pool.map(o => {
      const a = new Audio(o.src);
      a.preload = "auto";
      a.volume = o.vol;
      return a;
    });

    oyveyAudio = new Audio(SFX.oyvey.src);
    oyveyAudio.preload = "auto";
    oyveyAudio.volume = SFX.oyvey.vol;

    ayyayyayAudio = new Audio(SFX.ayyayyay.src);
    ayyayyayAudio.preload = "auto";
    ayyayyayAudio.volume = SFX.ayyayyay.vol;

    gezintAudio = new Audio(SFX.gezint.src);
    gezintAudio.preload = "auto";
    gezintAudio.volume = SFX.gezint.vol;
  }


(function disableDoubleTapZoomSafari()
{
  let lastTouchEnd = 0;

  document.addEventListener('touchend', function(e){
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault(); // prevents iOS double-tap zoom
      }
    lastTouchEnd = now;
  }, { passive: false });
})();

  function ensureAudioContext(){
    if(!audioCtx){
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(Ctx) audioCtx = new Ctx();
    }
    if(audioCtx && audioCtx.state === "suspended"){
      audioCtx.resume().catch(()=>{});
    }
  }

  function playTone(){
    if(!audioEnabled) return;
    ensureAudioContext();
    if(!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }


  function playAudio(a, force=false){
    if((!audioEnabled && !force) || !a) return;
    try{
      a.currentTime = 0;
      const p = a.play();
      if(p && typeof p.catch === "function") p.catch(()=>{});
    }catch(e){}
  }

  function playOyvey(){ playAudio(oyveyAudio); }
  function playAyyayyay(){ playAudio(ayyayyayAudio); }

  function playGezint(force=true){ 
    setTimeout(() => {
       playAudio(gezintAudio, force); 
     }, 2000);

  }

  // Called whenever a clear happens.
  // Rules:
  // - If this clear is part of a combo (cascade) OR contains a 4+ match => play a random "special" SFX.
  // - Otherwise (normal single 3-match) => tone only.
  function onClearSound({isCombo, hasBigMatch}){
    if(!audioEnabled) return;
    if(isCombo || hasBigMatch){
      const a = matchPool[Math.floor(Math.random() * matchPool.length)];
      playAudio(a);
    }else{
      playTone();
    }
  }
// Each game uses 8 icon types (picked randomly at restart).
  const ACTIVE_ICON_COUNT = 8;
  let activeTypes = []; // array of type ids (0..ICON_TYPES-1)

  // Shuffles: user-triggered only, max 3 per game.
  const MAX_SHUFFLES = 3;
  let shufflesLeft = MAX_SHUFFLES;
  let noMoves = false;
  let noMovesMessageShown = false;
  let milestoneShown = false;
  // Tile: { type:number, power:null|'row'|'col'|'bomb' }
  let grid = [];
  let score = 0;
  let moves = 0;
  let isBusy = false;

  let selected = null;
  let pointerDown = null;
  const SWIPE_PX = 18;

  const boardEl = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const movesEl = document.getElementById("moves");
  const restartBtn = document.getElementById("restartBtn");
  const shufflesEl = document.getElementById("shuffles");
  const shuffleBtn = document.getElementById("shuffleBtn");

  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const howBtn = document.getElementById("howBtn");
  const titleHotspot = document.getElementById("titlePlayHotspot");
  const titleImage = document.querySelector(".title-image");

  


  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  const milestoneEl = document.getElementById("milestone");
  const milestoneOkBtn = document.getElementById("milestoneOkBtn");

  function toast(msg, ms=1200){
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());

document.documentElement.style.setProperty("--cols", COLS);
  document.documentElement.style.setProperty("--rows", ROWS);
  document.documentElement.style.setProperty("--sprite-cols", SPRITE_COLS);
  document.documentElement.style.setProperty("--sprite-rows", SPRITE_ROWS);


  function pickActiveTypes(){
    // Choose 8 distinct types from 0..ICON_TYPES-1
    const all = Array.from({length: ICON_TYPES}, (_,i) => i);
    for(let i=all.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    activeTypes = all.slice(0, ACTIVE_ICON_COUNT);
  }
  const randType = () => activeTypes[Math.floor(Math.random() * activeTypes.length)];

  function makeTile(type = randType(), power = null){
    return { type, power };
  }

  function inBounds(r,c){ return r>=0 && r<ROWS && c>=0 && c<COLS; }
  function isAdj(a,b){
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    return (dr + dc) === 1;
  }

  function typeToPos(type){
    const col = type % SPRITE_COLS;
    const row = Math.floor(type / SPRITE_COLS);
    const bx = (SPRITE_COLS === 1) ? 0 : (col / (SPRITE_COLS - 1)) * 100;
    const by = (SPRITE_ROWS === 1) ? 0 : (row / (SPRITE_ROWS - 1)) * 100;
    return { bx: bx + "%", by: by + "%" };
  }

 function checkMilestone(prevScore){
  if (milestoneShown) return;

  if (prevScore < 1800 && score >= 1800){
    milestoneShown = true;

    if (milestoneEl){
      milestoneEl.style.display = "grid";
    }

    playGezint(); // 🔊 plays exactly once
  }
}

  function updateHud(){
    scoreEl.textContent = String(score);
    movesEl.textContent = String(moves);
    if(shufflesEl) shufflesEl.textContent = String(shufflesLeft);

    if(shuffleBtn){
      // Shuffle is usable anytime as long as you have shuffles left.
      shuffleBtn.disabled = !(shufflesLeft > 0);
      shuffleBtn.classList.toggle("danger", !!noMoves && shufflesLeft > 0);
    }
  }

  function clearSelectionUI(){
    const selectedEl = boardEl.querySelector(".cell.selected");
    if(selectedEl) selectedEl.classList.remove("selected");
    selected = null;
  }

  function cellId(r,c){ return `cell-${r}-${c}`; }

  function applyTileVisual(tileEl, tile){
    // IMPORTANT: tiles can get "stuck" invisible from the clearing animation (forwards)
    // so always reset relevant styles/classes when reusing a cell.
    tileEl.classList.remove("clearing", "pop", "power","row","col","bomb");
    tileEl.style.opacity = "1";
    tileEl.style.transform = "translateY(0px)";
    tileEl.style.transition = ""; // let CSS take over

    const {bx, by} = typeToPos(tile.type);
    tileEl.style.setProperty("--bx", bx);
    tileEl.style.setProperty("--by", by);

    if(tile.power){
      tileEl.classList.add("power", tile.power);
    }
  }

  function getTileEl(r,c){
    const cell = document.getElementById(cellId(r,c));
    return cell?.querySelector(".tile") || null;
  }

  function renderBoard(){
    boardEl.innerHTML = "";
    requestAnimationFrame(() => fitTileSize());

    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.id = cellId(r,c);
        cell.setAttribute("role", "gridcell");
        cell.dataset.r = r;
        cell.dataset.c = c;

        const tile = document.createElement("div");
        tile.className = "tile";
        applyTileVisual(tile, grid[r][c]);

        cell.appendChild(tile);
        boardEl.appendChild(cell);
      }
    }
  }

  function updateCell(r,c, extraClass){
    const tileEl = getTileEl(r,c);
    if(!tileEl) return;

    applyTileVisual(tileEl, grid[r][c]);

    if(extraClass){
      tileEl.classList.remove(extraClass);
       requestAnimationFrame(() => {
    tileEl.classList.add(extraClass);
    tileEl.addEventListener("animationend", () => tileEl.classList.remove(extraClass), { once:true });
  });

    }
  }

  function fitTileSize(){
    const maxBoardWidth = Math.min(560, window.innerWidth - 28);
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 6;
    const inner = maxBoardWidth - 20 - (gap * (COLS - 1));
    const tile = Math.floor(inner / COLS);
    const clamped = Math.max(40, Math.min(72, tile));
    document.documentElement.style.setProperty("--tile", clamped + "px");
  }

  // Groups: {cells:[{r,c}], type, dir:'row'|'col'}
  function findMatchGroups(){
    const groups = [];

    for(let r=0;r<ROWS;r++){
      let runType = grid[r][0].type;
      let runStart = 0;
      for(let c=1;c<=COLS;c++){
        const t = (c<COLS) ? grid[r][c].type : null;
        if(t === runType) continue;

        const len = c - runStart;
        if(len >= 3){
          const cells = [];
          for(let cc=runStart; cc<c; cc++) cells.push({r, c:cc});
          groups.push({ cells, type: runType, dir: "row" });
        }
        runType = t;
        runStart = c;
      }
    }

    for(let c=0;c<COLS;c++){
      let runType = grid[0][c].type;
      let runStart = 0;
      for(let r=1;r<=ROWS;r++){
        const t = (r<ROWS) ? grid[r][c].type : null;
        if(t === runType) continue;

        const len = r - runStart;
        if(len >= 3){
          const cells = [];
          for(let rr=runStart; rr<r; rr++) cells.push({r:rr, c});
          groups.push({ cells, type: runType, dir: "col" });
        }
        runType = t;
        runStart = r;
      }
    }

    return groups;
  }

  function groupsToSet(groups){
    const s = new Set();
    for(const g of groups){
      for(const p of g.cells) s.add(`${p.r},${p.c}`);
    }
    return s;
  }

  function expandByPowerups(clearSet){
    const extra = new Set();
    for(const key of clearSet){
      const [r,c] = key.split(",").map(Number);
      const t = grid[r][c];
      if(!t || !t.power) continue;

      if(t.power === "row"){
        for(let cc=0; cc<COLS; cc++) extra.add(`${r},${cc}`);
      } else if(t.power === "col"){
        for(let rr=0; rr<ROWS; rr++) extra.add(`${rr},${c}`);
      } else if(t.power === "bomb"){
        for(let rr=r-1; rr<=r+1; rr++){
          for(let cc=c-1; cc<=c+1; cc++){
            if(inBounds(rr,cc)) extra.add(`${rr},${cc}`);
          }
        }
      }
    }
    for(const k of extra) clearSet.add(k);
    return clearSet;
  }

  function triggerPowerupAt(r,c){
    const t = grid[r][c];
    if(!t.power) return new Set();

    const s = new Set();
    if(t.power === "row"){
      for(let cc=0; cc<COLS; cc++) s.add(`${r},${cc}`);
    } else if(t.power === "col"){
      for(let rr=0; rr<ROWS; rr++) s.add(`${rr},${c}`);
    } else if(t.power === "bomb"){
      for(let rr=r-1; rr<=r+1; rr++){
        for(let cc=c-1; cc<=c+1; cc++){
          if(inBounds(rr,cc)) s.add(`${rr},${cc}`);
        }
      }
    }
    return s;
  }

  async function clearSetAnimated(clearSet){
    if(clearSet.size === 0) return 0;

    /* sound handled in resolveBoardAfterSwap */

    clearSet = expandByPowerups(clearSet);

    for(const key of clearSet){
      const [r,c] = key.split(",").map(Number);
      const tileEl = getTileEl(r,c);
      if(tileEl){
        tileEl.classList.remove("clearing");
        void tileEl.offsetWidth;
        tileEl.classList.add("clearing");
      }
    }

    await sleep(260);

    let cleared = 0;
    for(const key of clearSet){
      const [r,c] = key.split(",").map(Number);
      if(grid[r][c]){
        grid[r][c] = null;
        cleared++;
      }
    }

    const prevScore = score;
    score += cleared * SCORE_PER_TILE;
    updateHud();
    checkMilestone(prevScore);

    // Clean up "clearing" classes so cells don't stay invisible.
    for(const key of clearSet){
      const [r,c] = key.split(",").map(Number);
      const tileEl = getTileEl(r,c);
      if(tileEl){
        tileEl.classList.remove("clearing");
        tileEl.style.opacity = "1";
        tileEl.style.transform = "translateY(0px)";
      }
    }

    return cleared;
  }

  function computeStepPx(){
    const tile = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tile")) || 64;
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 6;
    return tile + gap;
  }

  function applyGravityAndRefill(){
    const moves = [];
    const spawns = [];

    for(let c=0;c<COLS;c++){
      let write = ROWS - 1;

      for(let r=ROWS-1; r>=0; r--){
        if(grid[r][c] !== null){
          const tile = grid[r][c];
          if(write !== r){
            grid[write][c] = tile;
            grid[r][c] = null;
            moves.push({ toR: write, toC: c, fromR: r });
          }
          write--;
        }
      }

      for(let r=write; r>=0; r--){
        grid[r][c] = makeTile();
        spawns.push({ r, c, fromR: -1 - (write - r) });
      }
    }

    return { moves, spawns };
  }

  function syncAllCells(){
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const tileEl = getTileEl(r,c);
        if(tileEl) applyTileVisual(tileEl, grid[r][c]);
      }
    }
  }

  function animateFalls(moves, spawns){
    const step = computeStepPx();

    for(const m of moves){
      const tileEl = getTileEl(m.toR, m.toC);
      if(!tileEl) continue;

      // ensure visible
      tileEl.style.opacity = "1";

      const delta = m.fromR - m.toR; // negative when falling
      const px = delta * step;

      tileEl.style.transition = "none";
      tileEl.style.transform = `translateY(${px}px)`;

      requestAnimationFrame(() => {
        tileEl.style.transition = "transform 190ms ease";
        tileEl.style.transform = "translateY(0px)";
      });
    }

    for(const s of spawns){
      const tileEl = getTileEl(s.r, s.c);
      if(!tileEl) continue;

      const delta = s.fromR - s.r;
      const px = delta * step;

      tileEl.style.transition = "none";
      tileEl.style.transform = `translateY(${px}px)`;
      tileEl.style.opacity = "0.25";

      requestAnimationFrame(() => {
        tileEl.style.transition = "transform 210ms ease, opacity 210ms ease";
        tileEl.style.transform = "translateY(0px)";
        tileEl.style.opacity = "1";
      });
    }
  }

  function applyPowerupCreation(groups, swapInfo){
    const keepCells = new Set();
    const preferred = [swapInfo?.a, swapInfo?.b].filter(Boolean);

    for(const g of groups){
      const len = g.cells.length;
      if(len < 4) continue;

      let createAt = null;
      for(const p of preferred){
        if(g.cells.some(x => x.r === p.r && x.c === p.c)){
          createAt = { r:p.r, c:p.c };
          break;
        }
      }
      if(!createAt) createAt = g.cells[Math.floor(len/2)];

      let power = null;
      if(len === 4){
        power = (g.dir === "row") ? "row" : "col";
      } else {
        power = "bomb";
      }

      const tile = grid[createAt.r][createAt.c];
      tile.power = power;
      keepCells.add(`${createAt.r},${createAt.c}`);

      score += POWER_SCORE_BONUS;
    }

    updateHud();
    return keepCells;
  }

  function groupsToClearSet(groups, keepCells){
    const clear = new Set();
    for(const g of groups){
      for(const p of g.cells){
        const k = `${p.r},${p.c}`;
        if(keepCells && keepCells.has(k)) continue;
        clear.add(k);
      }
    }
    return clear;
  }

  // --- No-legal-moves detection (no auto shuffle) ---
  function hasLegalMove(){
    // Robust check: try every adjacent swap and see if it makes a match at either swapped cell.
    // Powerups are NOT treated as automatic legal moves here; only swaps that create a match count.
    function matchAt(r,c){
      const t = grid[r][c];
      if(!t) return false;
      const type = t.type;

      let count = 1;
      for(let cc=c-1; cc>=0 && grid[r][cc] && grid[r][cc].type === type; cc--) count++;
      for(let cc=c+1; cc<COLS && grid[r][cc] && grid[r][cc].type === type; cc++) count++;
      if(count >= 3) return true;

      count = 1;
      for(let rr=r-1; rr>=0 && grid[rr][c] && grid[rr][c].type === type; rr--) count++;
      for(let rr=r+1; rr<ROWS && grid[rr][c] && grid[rr][c].type === type; rr++) count++;
      return count >= 3;
    }

    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const nbrs = [{r, c:c+1}, {r:r+1, c}];
        for(const n of nbrs){
          if(!inBounds(n.r,n.c)) continue;

          const a = grid[r][c];
          const b = grid[n.r][n.c];
          grid[r][c] = b;
          grid[n.r][n.c] = a;

          const ok = matchAt(r,c) || matchAt(n.r,n.c);

          grid[r][c] = a;
          grid[n.r][n.c] = b;

          if(ok) return true;
        }
      }
    }
    return false;
  }

  function hasAnyImmediateMatches(){
    return findMatchGroups().length > 0;
  }

  function shuffleInPlace(){
    // Shuffle tiles (including their power state).
    const flat = [];
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        flat.push(grid[r][c]);
      }
    }
    for(let i=flat.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }
    let k=0;
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        grid[r][c] = flat[k++];
      }
    }
  }

  function ensurePlayableBoard(){
    // Find a board with no immediate matches and at least one legal move.
    for(let attempt=0; attempt<80; attempt++){
      shuffleInPlace();
      if(!hasAnyImmediateMatches() && hasLegalMove()){
        syncAllCells();
        return true;
      }
    }
    return false;
  }

  function setNoMovesState(value){
    noMoves = value;
    updateHud();
    if(noMoves){
      if(!noMovesMessageShown){
        noMovesMessageShown = true;
        // only play oyvey when we first enter the no-moves state
        playOyvey();
      }
      if(shufflesLeft <= 0){
        // Game over message (no moves, no shuffles)
        toast("Mazel Tov, you've got bubkes.", 2400);
        playAyyayyay();
      }else{
        toast("No moves — tap Shuffle.", 1400);
      }
    }else{
      noMovesMessageShown = false;

    }
  }

  function checkNoMoves(){
    setNoMovesState(!hasLegalMove());
  }

  function doShuffle(){
    if(isBusy) return;
    if(shufflesLeft <= 0) return;

    shufflesLeft--;
    // Try to find a playable shuffle
    const ok = ensurePlayableBoard();
    if(!ok){
      // fallback: rebuild but keep the same activeTypes for this game
      makeFreshGrid(false);
      syncAllCells();
    }
    setNoMovesState(false);
    toast("Shuffled!", 900);
    updateHud();
  }
async function resolveBoardAfterSwap(swapInfo){
    let cascadeIndex = 0; // 0 = first clear, 1+ = combo clears
    while(true){
      const groups = findMatchGroups();
      if(groups.length === 0) break;

      const maxLen = Math.max(...groups.map(g => g.cells.length));
      const hasBigMatch = (maxLen >= 4);
      const isCombo = (cascadeIndex >= 1);
      onClearSound({isCombo, hasBigMatch});

      const keepCells = applyPowerupCreation(groups, swapInfo);
      const clearSet = groupsToClearSet(groups, keepCells);

      await clearSetAnimated(clearSet);

      const { moves, spawns } = applyGravityAndRefill();
      syncAllCells();
      animateFalls(moves, spawns);

      await sleep(220);
      swapInfo = null;
      cascadeIndex++;
    }

    // After cascades settle, detect whether there are legal moves.
    checkNoMoves();
  }

  async function trySwap(a,b, countMove=true){
    if(isBusy) return;
    if(!inBounds(a.r,a.c) || !inBounds(b.r,b.c)) return;
    if(!isAdj(a,b)) return;

    isBusy = true;

    const t = grid[a.r][a.c];
    grid[a.r][a.c] = grid[b.r][b.c];
    grid[b.r][b.c] = t;

    updateCell(a.r,a.c,"pop");
    updateCell(b.r,b.c,"pop");

    const triggerA = triggerPowerupAt(a.r,a.c);
    const triggerB = triggerPowerupAt(b.r,b.c);
    const triggered = new Set([...triggerA, ...triggerB]);

    if(triggered.size > 0){
      if(countMove){ moves++; updateHud(); }
      await clearSetAnimated(triggered);

      const { moves:gm, spawns } = applyGravityAndRefill();
      syncAllCells();
      animateFalls(gm, spawns);
      await sleep(220);

      await resolveBoardAfterSwap(null);
      isBusy = false;
      return;
    }

    const groups = findMatchGroups();
    if(groups.length === 0){
      await sleep(140);
      const t2 = grid[a.r][a.c];
      grid[a.r][a.c] = grid[b.r][b.c];
      grid[b.r][b.c] = t2;
      updateCell(a.r,a.c,"pop");
      updateCell(b.r,b.c,"pop");
      checkNoMoves();
      isBusy = false;
      return;
    }

    if(countMove){ moves++; updateHud(); }
    await resolveBoardAfterSwap({ a, b });
    isBusy = false;
  }

  function onCellTap(r,c){
    if(isBusy) return;

    const cell = document.getElementById(cellId(r,c));
    if(!cell) return;

    if(!selected){
      selected = {r,c};
      cell.classList.add("selected");
      return;
    }

    if(selected.r === r && selected.c === c){
      clearSelectionUI();
      return;
    }

    const prev = selected;
    clearSelectionUI();

    if(isAdj(prev, {r,c})){
      trySwap(prev, {r,c}, true);
    } else {
      selected = {r,c};
      cell.classList.add("selected");
    }
  }

  function cellFromEventTarget(target){
    const cell = target.closest?.(".cell");
    if(!cell) return null;
    return { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
  }

  function onPointerDown(e){
    const hit = cellFromEventTarget(e.target);
    if(!hit || isBusy) return;

    boardEl.setPointerCapture?.(e.pointerId);

    pointerDown = { r: hit.r, c: hit.c, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  }

  function onPointerMove(e){
    if(!pointerDown || isBusy) return;
    if(e.pointerId !== pointerDown.id) return;

    const dx = e.clientX - pointerDown.x;
    const dy = e.clientY - pointerDown.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if(Math.max(adx, ady) < SWIPE_PX) return;

    pointerDown.moved = true;

    let nr = pointerDown.r;
    let nc = pointerDown.c;
    if(adx > ady){
      nc += (dx > 0) ? 1 : -1;
    } else {
      nr += (dy > 0) ? 1 : -1;
    }

    const a = { r: pointerDown.r, c: pointerDown.c };
    const b = { r: nr, c: nc };
    pointerDown = null;
    clearSelectionUI();
    trySwap(a,b,true);
  }

  function onPointerUp(e){
    if(!pointerDown || isBusy) return;
    if(e.pointerId !== pointerDown.id) return;

    const {r,c,moved} = pointerDown;
    pointerDown = null;
    if(!moved) onCellTap(r,c);
  }

  function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

  function makeFreshGrid(repicks=true){
    if(repicks){
      pickActiveTypes();
    }
    grid = Array.from({length: ROWS}, () => Array.from({length: COLS}, () => makeTile()));

    for(let pass=0; pass<12; pass++){
      const groups = findMatchGroups();
      if(groups.length === 0) break;
      const set = groupsToSet(groups);
      for(const key of set){
        const [r,c] = key.split(",").map(Number);
        grid[r][c] = makeTile();
     }
  }    

    // ensure initial board is playable
    if(!hasLegalMove()){
      ensurePlayableBoard();
 
    }
  

    // Ensure the newly generated board is playable (internal shuffle, does not consume a shuffle).
    if(!hasLegalMove()){
      ensurePlayableBoard();
    }
}

  function restart(){
    score = 0;
    moves = 0;
    shufflesLeft = MAX_SHUFFLES;
    noMoves = false;
    noMovesMessageShown = false;
    updateHud();
    clearSelectionUI();
    isBusy = false;
    pointerDown = null;
    makeFreshGrid(true);
    renderBoard();
    checkNoMoves();
  }

  function startGame(){
    // first user gesture => allow audio
    audioEnabled = true;
    overlay.style.display = "none";
    overlay.style.pointerEvents = "none";
    restart();
  }

  startBtn.addEventListener("click", startGame);
  titleHotspot.addEventListener("click", startGame);
  if(titleImage) titleImage.addEventListener("click", startGame);

  if(milestoneOkBtn) milestoneOkBtn.addEventListener("click", () => { if(milestoneEl) milestoneEl.style.display = "none"; });

  howBtn.addEventListener("click", () => {
    alert(
      "How to play:\\n\\n" +
      "• Tap a tile, then tap an adjacent tile to swap.\\n" +
      "• Or press and swipe a tile up/down/left/right.\\n" +
      "• Match 3+ to clear.\\n\\n" +
      "Powerups:\\n" +
      "• Match 4 to create a row/column clear.\\n" +
      "• Powerups trigger when matched OR swapped."
    );
  });

  restartBtn.addEventListener("click", restart);
  if(shuffleBtn) shuffleBtn.addEventListener("click", doShuffle);
  boardEl.addEventListener("pointerdown", onPointerDown);
  boardEl.addEventListener("pointermove", onPointerMove);
  boardEl.addEventListener("pointerup", onPointerUp);
  boardEl.addEventListener("pointercancel", () => { pointerDown = null; });

  window.addEventListener("resize", () => fitTileSize());

  fitTileSize();

  initAudio();
  makeFreshGrid(true);
  renderBoard();
  updateHud();
})();