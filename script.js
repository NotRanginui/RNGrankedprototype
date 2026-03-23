const ranks = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Emerald", "Nightmare"];

const BOT_LUCK_CONFIG = {
    "Bronze": [1.5, 3.0],
    "Silver": [3.5, 5.5],
    "Gold": [6.0, 9.0],
    "Platinum": [10.0, 15.0],
    "Diamond": [18.0, 25.0],
    "Emerald": [30.0, 50.0],
    "Nightmare": [75.0, 250.0] 
};

// --- DATA INITIALIZATION ---
let allAccounts = JSON.parse(localStorage.getItem('crimson_accounts')) || [{name: "Player 1", points: 0, streak: 0, history: []}];
let currentAccIdx = parseInt(localStorage.getItem('crimson_current_acc')) || 0;
let globalHighRolls = JSON.parse(localStorage.getItem('crimson_high_rolls')) || [];
let settings = JSON.parse(localStorage.getItem('crimson_settings')) || { roundNumbers: false };

if (!allAccounts[currentAccIdx]) currentAccIdx = 0;

let lastDiv = null;
let lastRankIdx = null;
let godMode = false;
let botRigged = false;
let playerLuck = 2.0;
let currentBotLuckValue = 1.0; 
let playerSets = 0, botSets = 0, playerRetries = 5, playerRoll = 0, botRoll = 0, isProcessing = false;
let currentBotRank = "Bronze";

// --- UTILITIES ---
function getTime() { return new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}); }
function generateRarity(luckFactor) {
    let base = 1 / Math.pow(Math.random(), 1.2);
    let final = base * luckFactor;
    return parseFloat(Math.max(1, final).toFixed(2));
}
function formatRoll(num) { return settings.roundNumbers ? Math.round(num) : num.toFixed(2); }

// --- UI CORE ---
function showPointPopup(amount, isWin, label = "") {
    const container = document.body;
    const popup = document.createElement('div');
    const displayValue = label || ((isWin ? "+" : "-") + Math.abs(Math.round(amount)) + " RP");
    popup.innerText = displayValue;
    popup.style.cssText = `position:fixed; left:50%; top:45%; transform:translateX(-50%); color:${isWin ? '#22c55e' : '#ef4444'}; font-weight:bold; font-size:1.8rem; pointer-events:none; animation:floatUp 2s ease-out forwards; z-index:9999; text-shadow:0 0 15px rgba(0,0,0,0.8);`;
    
    if (!document.getElementById('popup-anim')) {
        const style = document.createElement('style');
        style.id = 'popup-anim';
        style.innerHTML = `@keyframes floatUp { 0% { opacity: 0; transform: translate(-50%, 20px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -80px); } }`;
        document.head.appendChild(style);
    }
    container.appendChild(popup);
    setTimeout(() => popup.remove(), 2000);
}

function updateUI() {
    let acc = allAccounts[currentAccIdx];
    let rIdx = Math.min(6, Math.floor(acc.points / 400));
    let rankName = ranks[rIdx];
    let pointsInRank = acc.points % 400;
    let division = Math.floor(pointsInRank / 100) + 1;

    let winsInHistory = (acc.history || []).filter(h => h.res === "WIN").length;
    let winRate = acc.history && acc.history.length > 0 ? (winsInHistory / acc.history.length) : 0.5;
    
    const bonusEl = document.getElementById('bonus-display');
    let displayBonus = (winRate - 0.5) * 500; 

    if (winRate >= 0.5) {
        bonusEl.innerText = displayBonus > 0 ? `+${displayBonus.toFixed(0)}% RP BONUS` : `NEUTRAL RP RATE`;
        bonusEl.style.color = displayBonus > 0 ? "#22c55e" : "#9ca3af";
    } else {
        bonusEl.innerText = `${displayBonus.toFixed(0)}% RP PENALTY`;
        bonusEl.style.color = "#ef4444";
    }

    if (lastRankIdx !== null && rIdx > lastRankIdx) playRankUpCutscene(rankName, rIdx);
    lastDiv = division; lastRankIdx = rIdx;

    document.getElementById('rank-name').innerText = `${rankName.toUpperCase()} ${division}`;
    document.getElementById('user-display-name').innerText = acc.name;
    document.getElementById('rank-points').innerText = Math.floor(acc.points);
    document.getElementById('streak-count').innerText = acc.streak || 0;
    document.getElementById('exp-progress').style.width = (pointsInRank % 100) + "%";
    document.getElementById('current-rank-logo').className = `rank-icon rank-${rankName}`;
    
    localStorage.setItem('crimson_accounts', JSON.stringify(allAccounts));
    localStorage.setItem('crimson_current_acc', currentAccIdx);
}

// --- CORE GAMEPLAY ---
function checkLeaverPenalty() {
    if (localStorage.getItem('crimson_in_match') === 'true') {
        let acc = allAccounts[currentAccIdx];
        acc.points = Math.max(0, acc.points - 25);
        setTimeout(() => showPointPopup(25, false, "-25 LEAVER PENALTY"), 1000);
        updateUI();
    }
    localStorage.setItem('crimson_in_match', 'false');
}

function queueBot() {
    let acc = allAccounts[currentAccIdx];
    let pIdx = Math.min(6, Math.floor(acc.points / 400));
    let bIdx = Math.random() < 0.7 ? pIdx : (Math.random() < 0.5 ? Math.min(6, pIdx + 1) : Math.max(0, pIdx - 1));
    currentBotRank = ranks[bIdx];
    document.getElementById('bot-display-name').innerText = `BOT (${currentBotRank.toUpperCase()})`;
}

function resetRound() {
    playerRoll = 0; playerRetries = godMode ? 999 : 5; isProcessing = false;
    document.getElementById('player-roll').innerHTML = `<span class="roll-value">?</span>`;
    document.getElementById('bot-roll').innerHTML = `<span class="roll-value">?</span>`;
    document.getElementById('player-retries').innerText = godMode ? "GOD MODE" : `RETRIES: ${playerRetries}`;
    
    const range = BOT_LUCK_CONFIG[currentBotRank];
    currentBotLuckValue = botRigged ? 1.05 : range[0] + (Math.pow(Math.random(), 0.2) * (range[1] - range[0]));
    botRoll = generateRarity(currentBotLuckValue);
}

// GAMEPLAY BUTTONS
document.getElementById('roll-btn').onclick = () => {
    if ((playerRetries > 0 || godMode) && !isProcessing) {
        localStorage.setItem('crimson_in_match', 'true'); 
        playerRoll = generateRarity(playerLuck);
        if(!godMode) playerRetries--;
        document.getElementById('player-roll').innerHTML = `<span class="roll-value">1 in ${formatRoll(playerRoll)}</span><span class="roll-suffix">RARITY</span>`;
        document.getElementById('player-retries').innerText = godMode ? "GOD MODE" : `RETRIES: ${playerRetries}`;
    }
};

document.getElementById('stand-btn').onclick = () => {
    if (playerRoll === 0 || isProcessing) return;
    isProcessing = true;
    document.getElementById('bot-roll').innerHTML = `<span class="roll-value">1 in ${formatRoll(botRoll)}</span><span class="roll-suffix">RARITY</span>`;
    setTimeout(() => {
        if (playerRoll > botRoll) playerSets++; else botSets++;
        updateDots();
        if (playerSets === 3 || botSets === 3) handleMatchEnd();
        else setTimeout(resetRound, 1000);
    }, 800);
};

function handleMatchEnd() {
    localStorage.setItem('crimson_in_match', 'false'); 
    let acc = allAccounts[currentAccIdx];
    let win = playerSets === 3;
    let score = `${playerSets}-${botSets}`;
    
    if(!acc.history) acc.history = [];
    acc.history.unshift({res: win ? "WIN" : "LOSS", p: playerRoll, b: botRoll, score: score, time: getTime()});
    if(acc.history.length > 15) acc.history.pop(); 

    let pRankIdx = Math.min(6, Math.floor(acc.points / 400));
    let expectedLuckRange = BOT_LUCK_CONFIG[ranks[pRankIdx]];
    let pDiv = Math.floor((acc.points % 400) / 100); 
    let expectedLuck = expectedLuckRange[0] + (pDiv * ((expectedLuckRange[1] - expectedLuckRange[0]) / 3));

    let luckDiff = currentBotLuckValue - expectedLuck;
    let luckMultiplier = Math.max(0.4, Math.min(2.5, 1 - (luckDiff / (expectedLuck * 2))));
    let setMultiplier = (score === "3-0" || score === "0-3") ? 1.3 : (score === "3-2" || score === "2-3" ? 0.7 : 1.0);

    let winsInHistory = acc.history.filter(h => h.res === "WIN").length;
    let winRate = winsInHistory / acc.history.length;
    let winRateMod = (winRate - 0.5) * 5; 

    let pointChange = 0;
    if (win) {
        pointChange = (15 * (1 + winRateMod)) * luckMultiplier * setMultiplier;
        acc.points += pointChange; acc.streak++;
    } else {
        pointChange = ((15 + (pRankIdx * 2)) * (1 - winRateMod)) * luckMultiplier * setMultiplier;
        acc.points = Math.max(0, acc.points - pointChange); acc.streak = 0;
    }
    
    showPointPopup(pointChange, win);
    playerSets = 0; botSets = 0;
    updateUI(); updateDots(); queueBot(); setTimeout(resetRound, 1500);
}

function updateDots() {
    const p = document.getElementById('player-sets'), b = document.getElementById('bot-sets');
    p.innerHTML = ""; b.innerHTML = "";
    for(let i=0; i<3; i++){
        p.innerHTML += `<div class="dot ${i < playerSets ? 'p-win' : ''}"></div>`;
        b.innerHTML += `<div class="dot ${i < botSets ? 'b-win' : ''}"></div>`;
    }
}

// --- GLOBAL EXPORTS FOR GITHUB PAGES ---
// This ensures that the HTML 'onclick' can find these functions.
window.toggleModal = function(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.style.display = (m.style.display === 'none' || !m.style.display) ? 'flex' : 'none';
    if(id === 'acc-modal' && m.style.display === 'flex') renderAccounts();
};

window.switchAcc = function(i) { currentAccIdx = i; updateUI(); queueBot(); resetRound(); window.toggleModal('acc-modal'); };

window.createNewAccount = function() {
    let n = document.getElementById('new-acc-name').value;
    if(n) { allAccounts.push({name: n, points: 0, streak: 0, history: []}); renderAccounts(); }
};

window.deleteAcc = function(e, i) {
    e.stopPropagation();
    if(allAccounts.length > 1) { allAccounts.splice(i, 1); if(currentAccIdx >= allAccounts.length) currentAccIdx=0; renderAccounts(); updateUI(); }
};

window.openHighRolls = function() {
    window.toggleModal('high-rolls-modal');
    const list = document.getElementById('high-rolls-list');
    list.innerHTML = globalHighRolls.map((h, i) => `<div class="history-item"><div style="display:flex; justify-content:space-between; width:100%;"><span>#${i+1} ${h.name}</span> <b style="color:#ef4444">1 in ${formatRoll(h.roll)}</b></div><div class="history-meta"><span>TIME: ${h.time}</span></div></div>`).join('');
};

window.openHistory = function() {
    window.toggleModal('history-modal');
    const list = document.getElementById('history-list');
    list.innerHTML = (allAccounts[currentAccIdx].history || []).map(h => `<div class="history-item"><div style="display:flex; justify-content:space-between; width:100%;"><b style="color:${h.res==='WIN'?'#22c55e':'#ef4444'}">${h.res} (${h.score})</b><span>1 in ${formatRoll(h.p)} vs ${formatRoll(h.b)}</span></div><div class="history-meta"><span>LOGGED: ${h.time}</span></div></div>`).join('');
};

window.openLeaderboard = function() {
    window.toggleModal('leaderboard-modal');
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = [...allAccounts].sort((a,b)=>b.points-a.points).map((acc, i) => `<div class="leader-item"><span>#${i+1} ${acc.name}</span><b>${Math.floor(acc.points)} RP</b></div>`).join('');
};

window.adminAction = function(type) {
    if(type === 'instaWin') { playerSets = 3; handleMatchEnd(); }
    else if(type === 'godMode') { godMode = !godMode; document.getElementById('god-mode-btn').classList.toggle('active-god', godMode); resetRound(); }
    else if(type === 'rigBot') { botRigged = !botRigged; document.getElementById('rig-bot-btn').classList.toggle('active-god', botRigged); }
    else if(type === 'clearHistory') { allAccounts[currentAccIdx].history = []; updateUI(); }
};

window.applyAdminChanges = function() {
    playerLuck = parseFloat(document.getElementById('admin-luck-input').value) || 2.0;
    let rp = parseInt(document.getElementById('admin-rp-input').value);
    if(!isNaN(rp)) allAccounts[currentAccIdx].points = rp;
    updateUI(); window.toggleModal('admin-modal');
};

window.updateSettings = function() { settings.roundNumbers = document.getElementById('round-toggle').checked; updateUI(); };
window.wipeData = function() { if(confirm("Wipe all data?")) { localStorage.clear(); location.reload(); } };

function renderAccounts() {
    const list = document.getElementById('acc-list');
    list.innerHTML = allAccounts.map((acc, idx) => `<div class="acc-item" style="border-left: 3px solid ${idx === currentAccIdx ? '#ef4444' : 'transparent'}"><div onclick="switchAcc(${idx})" style="flex:1; cursor:pointer;"><b>${acc.name}</b><br><small>${Math.floor(acc.points)} RP</small></div><button onclick="deleteAcc(event, ${idx})" style="color:#f87171; font-size:0.6rem;">DEL</button></div>`).join('');
}

window.onkeydown = (e) => { if(e.key.toLowerCase() === 'p') { if(prompt("Passcode:") === "admin123") window.toggleModal('admin-modal'); } };
window.onload = () => { checkLeaverPenalty(); updateUI(); queueBot(); resetRound(); };
