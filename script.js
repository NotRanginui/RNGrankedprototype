const ranks = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Emerald", "Nightmare"];

const BOT_LUCK_CONFIG = {
    "Bronze": [1.0, 1.8],   
    "Silver": [1.9, 2.4],   
    "Gold": [2.5, 3.8],     
    "Platinum": [4.5, 8.0],  
    "Diamond": [10.0, 20.0], 
    "Emerald": [25.0, 55.0], 
    "Nightmare": [80.0, 300.0] 
};

// --- DATA INITIALIZATION ---
let allAccounts = JSON.parse(localStorage.getItem('crimson_accounts')) || [{name: "Player 1", points: 0, streak: 0, history: [], pb: 0}];
let currentAccIdx = parseInt(localStorage.getItem('crimson_current_acc')) || 0;
let globalHighRolls = JSON.parse(localStorage.getItem('crimson_high_rolls')) || [];

let settings = JSON.parse(localStorage.getItem('crimson_settings')) || { roundNumbers: false };
let adminPersist = JSON.parse(localStorage.getItem('crimson_admin_persist')) || { playerLuck: 2.0, adminRPBonus: 1.0 };

if (!allAccounts[currentAccIdx]) currentAccIdx = 0;

let lastRankIdx = Math.floor(allAccounts[currentAccIdx].points / 400);
let lastDiv = Math.floor((allAccounts[currentAccIdx].points % 400) / 100) + 1;

let godMode = false;
let botRigged = false;
let playerLuck = adminPersist.playerLuck;
let adminRPBonus = adminPersist.adminRPBonus;

let botLuckOverride = null; 
let currentBotLuckValue = 1.0; 
let playerSets = 0, botSets = 0, playerRetries = 5, playerRoll = 0, botRoll = 0, isProcessing = false;
let currentBotRank = "Bronze";

// --- RNG ENGINE ---
let _seed = Date.now(); 
function customRandom() {
    _seed = (_seed * 1664525 + 1013904223) % 4294967296;
    return _seed / 4294967296;
}

function generateRarity(luckFactor) {
    const rawChance = customRandom();
    const safeChance = rawChance === 0 ? 0.0000000001 : rawChance;
    let roll = (1 / safeChance) * luckFactor;
    return parseFloat(Math.max(1, roll).toFixed(2));
}

// --- UTILS & COSMETICS ---
function getTime() { return new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}); }
function formatRoll(num) { return settings.roundNumbers ? Math.round(num) : num.toFixed(2); }

function getStreakColor(streak) {
    if (streak >= 100) return "#ffffff"; 
    if (streak >= 50) return "#ef4444";  
    if (streak >= 25) return "#a855f7";  
    if (streak >= 10) return "#3b82f6";  
    if (streak >= 5) return "#22c55e";   
    return "#fbbf24"; 
}

// --- PROMOTION ENGINE ---
function triggerPromotion(rankName, isMajor) {
    const overlay = document.getElementById('rank-up-overlay');
    const nameDisplay = document.getElementById('rank-up-name');
    const icon = document.getElementById('rank-up-icon');
    const title = document.getElementById('rank-up-title');

    const baseRankRaw = rankName.split(' ')[0];
    const baseRank = baseRankRaw.charAt(0).toUpperCase() + baseRankRaw.slice(1).toLowerCase();

    overlay.style.display = "flex";
    overlay.className = ""; 
    nameDisplay.className = "";
    icon.className = "rank-icon"; 

    nameDisplay.classList.add(`cutscene-${baseRank}`);
    icon.classList.add(`rank-${baseRank}`);
    
    nameDisplay.innerText = rankName;
    title.innerText = isMajor ? "RANK ASCENDED" : "DIVISION UP";

    if (["Diamond", "Emerald", "Nightmare"].includes(baseRank)) {
        document.body.style.animation = "nightmareGlitch 0.2s infinite";
        setTimeout(() => document.body.style.animation = "", 2500);
    }

    setTimeout(() => overlay.classList.add('active'), 10);

    setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => { overlay.style.display = "none"; }, 500);
    }, 4500);
}

function showPointPopup(amount, isWin, label = "", offset = "45%") {
    const popup = document.createElement('div');
    popup.innerText = label || ((isWin ? "+" : "-") + Math.abs(Math.round(amount)) + " RP");
    popup.style.cssText = `position:fixed; left:50%; top:${offset}; transform:translateX(-50%); color:${isWin ? '#22c55e' : '#ef4444'}; font-weight:900; font-size:2.5rem; pointer-events:none; animation:floatUp 2s ease-out forwards; z-index:9999; text-shadow:0 0 30px #000; font-family: 'Orbitron';`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 2000);
}

// --- MAIN UI UPDATE ---
function updateUI() {
    let acc = allAccounts[currentAccIdx];
    let rIdx = Math.min(6, Math.floor(acc.points / 400));
    let rankName = ranks[rIdx];
    let pointsInRank = acc.points % 400;
    let division = Math.floor(pointsInRank / 100) + 1;

    if (lastRankIdx !== null && rIdx > lastRankIdx) triggerPromotion(rankName.toUpperCase(), true);
    else if (lastDiv !== null && division > lastDiv && rIdx === lastRankIdx) triggerPromotion(`${rankName.toUpperCase()} ${division}`, false);
    
    lastRankIdx = rIdx; lastDiv = division;

    // Bonus Logic
    const bonusEl = document.getElementById('bonus-display');
    let streakBonusPercent = Math.floor(acc.streak / 5) * 5; 
    let displayMult = (1 + (streakBonusPercent / 100)) * adminRPBonus;

    if (acc.streak >= 5 || adminRPBonus > 1.0) {
        bonusEl.innerText = `BONUS: x${displayMult.toFixed(2)} (${streakBonusPercent}% STREAK)`;
        bonusEl.style.color = "#fbbf24";
    } else {
        bonusEl.innerText = "STANDARD DATA GAIN";
        bonusEl.style.color = "#94a3b8";
    }

    document.getElementById('rank-name').innerText = `${rankName.toUpperCase()} ${division}`;
    document.getElementById('user-display-name').innerText = acc.name;
    document.getElementById('rank-points').innerText = Math.floor(acc.points);
    
    // Streak and Logo Updates
    const sBadge = document.querySelector('.streak-badge');
    const sCount = document.getElementById('streak-count');
    const streakCol = getStreakColor(acc.streak);
    sCount.innerText = acc.streak;
    sBadge.style.color = streakCol;
    sBadge.style.textShadow = `0 0 15px ${streakCol}`;
    
    // High-Streak Fire FX
    if(acc.streak >= 10) sBadge.classList.add('div-up-flash');
    else sBadge.classList.remove('div-up-flash');

    const logoBase = rankName.charAt(0).toUpperCase() + rankName.slice(1).toLowerCase();
    document.getElementById('current-rank-logo').className = `rank-icon rank-${logoBase}`;
    document.getElementById('exp-progress').style.width = (pointsInRank % 100) + "%";
    
    localStorage.setItem('crimson_accounts', JSON.stringify(allAccounts));
    localStorage.setItem('crimson_current_acc', currentAccIdx);
    localStorage.setItem('crimson_settings', JSON.stringify(settings));
    localStorage.setItem('crimson_admin_persist', JSON.stringify({ playerLuck, adminRPBonus }));
}

// --- MATCH ENGINE ---
function queueBot() {
    let acc = allAccounts[currentAccIdx];
    let pIdx = Math.min(6, Math.floor(acc.points / 400));
    let bIdx = customRandom() < 0.7 ? pIdx : (customRandom() < 0.5 ? Math.min(6, pIdx + 1) : Math.max(0, pIdx - 1));
    currentBotRank = ranks[bIdx];
    document.getElementById('bot-display-name').innerText = `BOT (${currentBotRank.toUpperCase()})`;
}

function resetRound() {
    playerRoll = 0; playerRetries = godMode ? 999 : 5; isProcessing = false;
    document.getElementById('player-roll').innerHTML = `<span class="roll-value">?</span>`;
    document.getElementById('bot-roll').innerHTML = `<span class="roll-value">?</span>`;
    document.getElementById('player-retries').innerText = godMode ? "GOD MODE" : `RETRIES: ${playerRetries}`;
    let range = BOT_LUCK_CONFIG[currentBotRank];
    currentBotLuckValue = botLuckOverride !== null ? botLuckOverride : (botRigged ? 1.05 : range[0] + (customRandom() * (range[1] - range[0])));
    botRoll = generateRarity(currentBotLuckValue);
    botLuckOverride = null;
    saveMatchState();
}

document.getElementById('roll-btn').onclick = () => {
    if ((playerRetries > 0 || godMode) && !isProcessing) {
        let acc = allAccounts[currentAccIdx];
        let streakLuckBonus = Math.floor(acc.streak / 5) * 0.25;
        playerRoll = generateRarity(playerLuck + streakLuckBonus);
        if(!godMode) playerRetries--;
        document.getElementById('player-roll').innerHTML = `<span class="roll-value">1 in ${formatRoll(playerRoll)}</span><span class="roll-suffix">RARITY</span>`;
        document.getElementById('player-retries').innerText = godMode ? "GOD MODE" : `RETRIES: ${playerRetries}`;
        if (playerRoll > (acc.pb || 0)) { acc.pb = playerRoll; showPointPopup(0, true, "NEW PB!", "35%"); }
        saveMatchState();
    }
};

document.getElementById('stand-btn').onclick = () => {
    if (playerRoll === 0 || isProcessing) return;
    isProcessing = true;
    document.getElementById('bot-roll').innerHTML = `<span class="roll-value">1 in ${formatRoll(botRoll)}</span><span class="roll-suffix">RARITY</span>`;
    if (playerRoll > 50) {
        globalHighRolls.push({name: allAccounts[currentAccIdx].name, roll: playerRoll, time: getTime()});
        globalHighRolls.sort((a,b) => b.roll - a.roll).splice(15);
        localStorage.setItem('crimson_high_rolls', JSON.stringify(globalHighRolls));
    }
    setTimeout(() => {
        if (playerRoll > botRoll) playerSets++; else botSets++;
        updateDots(); saveMatchState();
        if (playerSets === 3 || botSets === 3) handleMatchEnd();
        else resetRound();
    }, 800);
};

function handleMatchEnd() {
    let acc = allAccounts[currentAccIdx];
    let win = playerSets === 3;
    let score = `${playerSets}-${botSets}`;
    let streakMult = 1 + (Math.floor(acc.streak / 5) * 0.05);
    let setMultiplier = (score === "3-0" || score === "0-3") ? 1.5 : (score === "3-2" || score === "2-3" ? 0.7 : 1.0);
    let pointChange = Math.round((win ? 18 : 14) * setMultiplier * adminRPBonus * streakMult);
    
    if (win) { acc.points += pointChange; acc.streak++; } 
    else { acc.points = Math.max(0, acc.points - pointChange); acc.streak = 0; }
    
    acc.history.unshift({ res: win ? "WIN" : "LOSS", p: playerRoll, b: botRoll, score: score, diff: pointChange, time: getTime(), pRank: ranks[Math.min(6, Math.floor(acc.points/400))], bRank: currentBotRank });
    showPointPopup(pointChange, win, "", "50%");
    playerSets = 0; botSets = 0; clearMatchState();
    updateUI(); updateDots(); queueBot(); resetRound();
}

function updateDots() {
    const p = document.getElementById('player-sets'), b = document.getElementById('bot-sets');
    p.innerHTML = ""; b.innerHTML = "";
    for(let i=0; i<3; i++){
        p.innerHTML += `<div class="dot ${i < playerSets ? 'p-win' : ''}"></div>`;
        b.innerHTML += `<div class="dot ${i < botSets ? 'b-win' : ''}"></div>`;
    }
}

// --- MODAL & BUTTON FIXES ---
window.openHistory = () => {
    window.toggleModal('history-modal');
    document.getElementById('history-list').innerHTML = (allAccounts[currentAccIdx].history || []).map(h => `
        <div class="history-item">
            <div style="display:flex; justify-content:space-between; width:100%;">
                <b style="color:${h.res==='WIN'?'#22c55e':'#ef4444'}">${h.res}</b>
                <span style="font-weight:900;">${h.res==='WIN'?'+':'-'}${h.diff} RP</span>
            </div>
            <div class="history-meta" style="font-size:0.65rem; opacity:0.8;">${h.pRank} vs ${h.bRank} | Score: ${h.score}</div>
        </div>`).join('');
};

// THESE ARE THE ONES THAT WERE BROKEN
window.openHighRolls = () => {
    window.toggleModal('high-rolls-modal');
    const container = document.getElementById('high-rolls-list');
    container.innerHTML = globalHighRolls.length > 0 ? 
        globalHighRolls.map((h, i) => `<div class="history-item" style="flex-direction:row; justify-content:space-between;"><span>#${i+1} ${h.name}</span> <b style="color:#ef4444">1 in ${formatRoll(h.roll)}</b></div>`).join('') : `<p style="text-align:center; opacity:0.5;">No records yet.</p>`;
};

window.openLeaderboard = () => {
    window.toggleModal('leaderboard-modal');
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = [...allAccounts].sort((a,b)=>b.points-a.points).map((acc, i) => `<div class="history-item" style="flex-direction:row; justify-content:space-between;"><span>#${i+1} ${acc.name}</span><b>${Math.floor(acc.points)} RP</b></div>`).join('');
};

function saveMatchState() { localStorage.setItem('crimson_match_state', JSON.stringify({ playerSets, botSets, currentBotRank, currentBotLuckValue, inProgress: true })); }
function clearMatchState() { localStorage.removeItem('crimson_match_state'); }
window.toggleModal = (id) => {
    const m = document.getElementById(id);
    m.style.display = (m.style.display === 'none' || !m.style.display) ? 'flex' : 'none';
    if(id === 'acc-modal' && m.style.display === 'flex') renderAccounts();
};

window.adminAction = (type) => {
    if(type === 'instaWin') { playerSets = 3; handleMatchEnd(); }
    else if(type === 'godMode') { godMode = !godMode; document.getElementById('god-mode-btn').innerText = `GOD MODE: ${godMode?'ON':'OFF'}`; resetRound(); }
};

window.applyAdminChanges = () => {
    let acc = allAccounts[currentAccIdx];
    adminRPBonus = parseFloat(document.getElementById('admin-rp-bonus-input').value) || 1.0;
    playerLuck = parseFloat(document.getElementById('admin-luck-input').value) || 2.0;
    if(document.getElementById('admin-rp-input').value !== "") acc.points = parseInt(document.getElementById('admin-rp-input').value);
    if(document.getElementById('admin-streak-input').value !== "") acc.streak = parseInt(document.getElementById('admin-streak-input').value);
    updateUI(); window.toggleModal('admin-modal');
};

window.switchAcc = (i) => { currentAccIdx = i; lastRankIdx = null; lastDiv = null; clearMatchState(); updateUI(); queueBot(); resetRound(); window.toggleModal('acc-modal'); };
window.createNewAccount = () => {
    let n = document.getElementById('new-acc-name').value;
    if(n) { allAccounts.push({name: n, points: 0, streak: 0, history: [], pb: 0}); renderAccounts(); }
};

function renderAccounts() {
    document.getElementById('acc-list').innerHTML = allAccounts.map((acc, idx) => `
        <div class="acc-item" style="border-left: 4px solid ${idx === currentAccIdx ? '#ef4444' : 'transparent'}">
            <div onclick="switchAcc(${idx})" style="flex:1; cursor:pointer;"><b>${acc.name}</b><br><small>${Math.floor(acc.points)} RP</small></div>
        </div>`).join('');
}

window.onkeydown = (e) => { if(e.key.toLowerCase() === 'p') { if(prompt("Passcode:") === "admin123") window.toggleModal('admin-modal'); } };

window.onload = () => {
    updateUI();
    const savedState = JSON.parse(localStorage.getItem('crimson_match_state'));
    if (savedState && savedState.inProgress) {
        playerSets = savedState.playerSets; botSets = savedState.botSets;
        currentBotRank = savedState.currentBotRank;
        currentBotLuckValue = savedState.currentBotLuckValue;
        botRoll = generateRarity(currentBotLuckValue);
        updateDots();
    } else { queueBot(); resetRound(); }
};
