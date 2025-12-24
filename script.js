// --- IMPORT FIREBASE LIBRARIES (Using stable version 10.7.1) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } 
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, limit, getDocs } 
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCLISwsJAUkHXRxwOsatFY1U29EfVS-Yn0",
    authDomain: "pomodororpg-1c035.firebaseapp.com",
    projectId: "pomodororpg-1c035",
    storageBucket: "pomodororpg-1c035.firebasestorage.app",
    messagingSenderId: "415950552230",
    appId: "1:415950552230:web:308f498de1e7a410a68867"
};

// --- INITIALIZE FIREBASE ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GAME VARIABLES ---
let currentUser = null; 

document.addEventListener('DOMContentLoaded', () => {
    // --- LOAD LOCAL DATA (Defaults) ---
    let username = localStorage.getItem('rpg_username') || "You";
    let isReturning = localStorage.getItem('rpg_is_returning') === 'true';
    let xp = parseInt(localStorage.getItem('rpg_xp')) || 0;
    let level = parseInt(localStorage.getItem('rpg_level')) || 1;
    let gold = parseInt(localStorage.getItem('rpg_gold')) || 0;
    let inventory = JSON.parse(localStorage.getItem('rpg_inventory')) || ['avatar_wizard', 'theme_default'];
    let equippedAvatar = localStorage.getItem('rpg_equipped_avatar') || '🧙‍♂️';
    let equippedTheme = localStorage.getItem('rpg_equipped_theme') || 'theme_default';
    
    let subjects = JSON.parse(localStorage.getItem('rpg_subjects')) || [];
    let activeSubjectId = null;
    let xpReq = Math.floor(100 * Math.pow(1.2, level - 1));
    let timer, timeLeft, isFighting = false;

    // --- AUDIO SYSTEM ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playSound(type) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        if (type === 'start') { osc.type='triangle'; osc.frequency.setValueAtTime(440,now); osc.frequency.exponentialRampToValueAtTime(880,now+0.1); gainNode.gain.setValueAtTime(0.1,now); gainNode.gain.exponentialRampToValueAtTime(0.01,now+0.5); osc.start(now); osc.stop(now+0.5); } 
        else if (type === 'win') { osc.type='square'; osc.frequency.setValueAtTime(523,now); osc.frequency.setValueAtTime(659,now+0.1); osc.frequency.setValueAtTime(783,now+0.2); gainNode.gain.setValueAtTime(0.1,now); gainNode.gain.linearRampToValueAtTime(0,now+0.8); osc.start(now); osc.stop(now+0.8); }
        else if (type === 'coin') { osc.type='sine'; osc.frequency.setValueAtTime(1200,now); osc.frequency.exponentialRampToValueAtTime(1800,now+0.1); gainNode.gain.setValueAtTime(0.1,now); gainNode.gain.linearRampToValueAtTime(0,now+0.2); osc.start(now); osc.stop(now+0.2); }
        else if (type === 'jump') { osc.type='square'; osc.frequency.setValueAtTime(150,now); osc.frequency.linearRampToValueAtTime(300,now+0.1); gainNode.gain.setValueAtTime(0.05,now); gainNode.gain.linearRampToValueAtTime(0,now+0.1); osc.start(now); osc.stop(now+0.1); }
        else if (type === 'click') { osc.type='triangle'; osc.frequency.setValueAtTime(800,now); gainNode.gain.setValueAtTime(0.05,now); gainNode.gain.exponentialRampToValueAtTime(0.001,now+0.05); osc.start(now); osc.stop(now+0.05); }
    }

    // --- DOM ELEMENTS ---
    const timerDisplay = document.getElementById('timer-display');
    const monsterHpBar = document.getElementById('monster-hp');
    const statusText = document.getElementById('status-text');
    const xpDisplay = document.getElementById('xp');
    const levelDisplay = document.getElementById('level');
    const goldDisplay = document.getElementById('gold');
    const monsterEmoji = document.getElementById('monster-emoji');
    const heroEmoji = document.querySelector('.hero .emoji'); 
    const heroNameDisplay = document.getElementById('hero-name-display');

    const startBtn = document.getElementById('start-btn');
    const giveUpBtn = document.getElementById('give-up-btn');
    const shopBtn = document.getElementById('shop-btn');
    const focusInput = document.getElementById('focus-input');
    const breakInput = document.getElementById('break-input');

    const subjectSelect = document.getElementById('subject-select');
    const manageSubjectsBtn = document.getElementById('manage-subjects-btn');
    const activeSubjectDisplay = document.getElementById('active-subject-display');
    const subjectNameDisplay = document.getElementById('subject-name-display');
    const subjectProgressBar = document.getElementById('subject-progress-bar');
    const subjectCurrent = document.getElementById('subject-current');
    const subjectTarget = document.getElementById('subject-target');

    const breakModal = document.getElementById('break-modal');
    const shopModal = document.getElementById('shop-modal');
    const subjectModal = document.getElementById('subject-modal');
    const profileModal = document.getElementById('profile-modal');
    const welcomeModal = document.getElementById('welcome-modal');
    const authModal = document.getElementById('auth-modal');
    const leaderboardModal = document.getElementById('leaderboard-modal');

    const contentArea = document.getElementById('content-area');
    const breakTimerDisplay = document.getElementById('break-timer');

    // --- SETUP UI ---
    updateStatsUI();
    applyCosmetics();
    renderSubjectList();
    renderSubjectDropdown();

    // --- EVENT LISTENERS ---
    startBtn.addEventListener('click', () => { playSound('start'); startFocus(); });
    giveUpBtn.addEventListener('click', () => { playSound('click'); giveUp(); });
    shopBtn.addEventListener('click', () => { playSound('click'); openShop(); });
    
    document.getElementById('close-shop-btn').addEventListener('click', () => shopModal.classList.add('hidden'));
    document.getElementById('close-subject-btn').addEventListener('click', () => subjectModal.classList.add('hidden'));
    document.getElementById('close-welcome-btn').addEventListener('click', () => welcomeModal.classList.add('hidden'));
    document.getElementById('close-auth-btn').addEventListener('click', () => authModal.classList.add('hidden'));
    document.getElementById('close-leaderboard-btn').addEventListener('click', () => leaderboardModal.classList.add('hidden'));
    
    document.getElementById('open-profile-btn').addEventListener('click', openProfile);
    document.getElementById('save-profile-btn').addEventListener('click', saveProfile);
    
    manageSubjectsBtn.addEventListener('click', () => subjectModal.classList.remove('hidden'));
    document.getElementById('add-subject-btn').addEventListener('click', addNewSubject);
    subjectSelect.addEventListener('change', (e) => activeSubjectId = e.target.value);

    document.getElementById('btn-quote').addEventListener('click', () => startActivity('quotes'));
    document.getElementById('btn-jumper').addEventListener('click', () => startActivity('jumper'));
    document.getElementById('btn-reflex').addEventListener('click', () => startActivity('reflex'));
    document.getElementById('stop-activity-btn').addEventListener('click', stopActivity);
    document.getElementById('skip-break-btn').addEventListener('click', endBreak);

    // --- CLOUD BUTTON LISTENERS ---
    document.getElementById('auth-btn').addEventListener('click', () => authModal.classList.remove('hidden'));
    document.getElementById('leaderboard-btn').addEventListener('click', () => { leaderboardModal.classList.remove('hidden'); loadLeaderboard('level'); });
    document.getElementById('confirm-login-btn').addEventListener('click', handleLogin);
    document.getElementById('confirm-register-btn').addEventListener('click', handleRegister);
    document.getElementById('lb-tab-level').addEventListener('click', () => loadLeaderboard('level'));
    document.getElementById('lb-tab-jumper').addEventListener('click', () => loadLeaderboard('jumper'));
    document.getElementById('lb-tab-reflex').addEventListener('click', () => loadLeaderboard('reflex'));

    // --- FIREBASE AUTH HANDLER ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-btn').innerText = "👤 Logout";
            document.getElementById('auth-btn').onclick = handleLogout; // Replace click action
            statusText.innerText = "Synced with Cloud ☁️";
            authModal.classList.add('hidden');
            loadCloudData();
        } else {
            currentUser = null;
            document.getElementById('auth-btn').innerText = "☁️ Login";
            document.getElementById('auth-btn').onclick = () => authModal.classList.remove('hidden'); // Reset click action
            checkWelcome(); 
        }
    });

    async function handleRegister() {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-pass').value;
        if(pass.length < 6) { document.getElementById('auth-msg').innerText = "Password must be 6+ chars"; return; }
        try {
            await createUserWithEmailAndPassword(auth, email, pass);
            saveGame(true); // Save initial data
        } catch (error) { document.getElementById('auth-msg').innerText = error.message; }
    }

    async function handleLogin() {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-pass').value;
        try { await signInWithEmailAndPassword(auth, email, pass); } 
        catch (error) { document.getElementById('auth-msg').innerText = "Login failed. Check email/password."; }
    }

    async function handleLogout() {
        await signOut(auth);
        location.reload(); 
    }

    // --- CLOUD SYNC FUNCTIONS ---
    async function loadCloudData() {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            username = data.username || "Hero";
            xp = data.xp || 0;
            level = data.level || 1;
            gold = data.gold || 0;
            equippedAvatar = data.equippedAvatar || '🧙‍♂️';
            equippedTheme = data.equippedTheme || 'theme_default';
            // Sync highscores to local storage too so games know them
            if(data.jumper_highscore) localStorage.setItem('jumper_highscore', data.jumper_highscore);
            if(data.reflex_highscore) localStorage.setItem('reflex_highscore', data.reflex_highscore);
            
            updateStatsUI();
            applyCosmetics();
        } else {
            saveGame(true); // Create doc if missing
        }
    }

    async function saveGame(forceCloud = false) {
        // Local Save
        localStorage.setItem('rpg_username', username);
        localStorage.setItem('rpg_xp', xp);
        localStorage.setItem('rpg_level', level);
        localStorage.setItem('rpg_gold', gold);
        localStorage.setItem('rpg_inventory', JSON.stringify(inventory));
        localStorage.setItem('rpg_equipped_avatar', equippedAvatar);
        localStorage.setItem('rpg_equipped_theme', equippedTheme);
        localStorage.setItem('rpg_subjects', JSON.stringify(subjects));

        // Cloud Save
        if (currentUser) {
            try {
                await setDoc(doc(db, "users", currentUser.uid), {
                    username: username,
                    xp: xp,
                    level: level,
                    gold: gold,
                    equippedAvatar: equippedAvatar,
                    equippedTheme: equippedTheme,
                    jumper_highscore: parseInt(localStorage.getItem('jumper_highscore') || 0),
                    reflex_highscore: parseInt(localStorage.getItem('reflex_highscore') || 0)
                }, { merge: true });
                if(forceCloud) console.log("Cloud Saved");
            } catch (e) { console.error("Save Error:", e); }
        }
    }

    async function loadLeaderboard(type) {
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = '<p style="text-align:center;">Fetching Data...</p>';
        
        // Update Tabs
        document.querySelectorAll('.activity-buttons button').forEach(b => b.style.opacity = '0.5');
        document.getElementById(`lb-tab-${type}`).style.opacity = '1';

        let field = type === 'level' ? 'level' : (type === 'jumper' ? 'jumper_highscore' : 'reflex_highscore');
        
        // Query Top 10
        const q = query(collection(db, "users"), orderBy(field, "desc"), limit(10));
        
        try {
            const querySnapshot = await getDocs(q);
            list.innerHTML = '';
            let rank = 1;
            querySnapshot.forEach((doc) => {
                const d = doc.data();
                const score = d[field] || 0;
                let entryClass = (currentUser && doc.id === currentUser.uid) ? 'highlight' : '';
                let icon = '👤';
                if(rank===1) icon='🥇'; if(rank===2) icon='🥈'; if(rank===3) icon='🥉';

                list.innerHTML += `
                    <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #444; color:#ddd; font-size:0.9rem;" class="${entryClass}">
                        <span>${icon} ${rank}. <strong>${d.username}</strong></span>
                        <span style="color:#00d2ff;">${score}</span>
                    </div>
                `;
                rank++;
            });
            if(rank === 1) list.innerHTML = '<p style="text-align:center">No records yet. Play to win!</p>';
        } catch (e) {
            console.error(e);
            list.innerHTML = '<p style="color:red; text-align:center;">Error loading. <br>Did you enable the Database?</p>';
        }
    }

    // --- ORIGINAL GAME LOGIC ---
    function checkWelcome() {
        if (!isReturning && !currentUser) {
            welcomeModal.classList.remove('hidden');
            document.getElementById('welcome-title').innerText = "Welcome, Hero!";
            document.getElementById('welcome-body').innerHTML = `
                <p>Welcome to <strong>Focus RPG</strong>!</p>
                <ul class="welcome-list">
                    <li>⏱️ <strong>Focus:</strong> Defeat monsters by studying.</li>
                    <li>☁️ <strong>Cloud:</strong> Login to join the Leaderboards!</li>
                </ul>`;
            localStorage.setItem('rpg_is_returning', 'true');
        } else if (!currentUser) {
            const quotes = ["“It always seems impossible until it’s done.”", "“Future You will thank you for this.”"];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            welcomeModal.classList.remove('hidden');
            document.getElementById('welcome-title').innerText = "Welcome back!";
            document.getElementById('welcome-body').innerHTML = `<div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; font-style: italic; color: #00d2ff;">${randomQuote}</div>`;
        }
    }

    function openProfile() {
        profileModal.classList.remove('hidden');
        document.getElementById('username-input').value = username;
    }

    function saveProfile() {
        const input = document.getElementById('username-input').value.trim();
        if(input) {
            username = input;
            saveGame(); 
            updateStatsUI();
            profileModal.classList.add('hidden');
            playSound('coin');
        }
    }

    function updateStatsUI() {
        xpDisplay.innerText = xp;
        document.getElementById('xp-req').innerText = xpReq;
        levelDisplay.innerText = level;
        goldDisplay.innerText = gold;
        heroNameDisplay.innerText = username;
    }

    function addNewSubject() {
        const nameInput = document.getElementById('new-subject-name');
        const targetInput = document.getElementById('new-subject-target');
        const name = nameInput.value.trim();
        const target = parseInt(targetInput.value);
        if(name && target > 0) {
            const newSub = { id: Date.now().toString(), name: name, current: 0, target: target * 60, completed: false };
            subjects.push(newSub); saveGame(); renderSubjectList(); renderSubjectDropdown();
            nameInput.value = ''; targetInput.value = ''; playSound('coin');
        } else { alert("Please enter valid Subject Name and Hours."); }
    }

    function renderSubjectList() {
        const list = document.getElementById('subject-list');
        list.innerHTML = '';
        subjects.forEach(sub => {
            const isDone = sub.current >= sub.target;
            const percent = Math.min(100, Math.floor((sub.current / sub.target) * 100));
            list.innerHTML += `<div class="subject-item ${isDone ? 'subject-completed' : ''}"><div><h4>${sub.name}</h4><p>${Math.floor(sub.current/60)} / ${sub.target/60} Hours (${percent}%)</p></div>${isDone ? '<span>✅</span>' : ''}</div>`;
        });
    }

    function renderSubjectDropdown() {
        subjectSelect.innerHTML = '<option value="">-- No Subject (Free Play) --</option>';
        subjects.forEach(sub => { if (!sub.completed) subjectSelect.innerHTML += `<option value="${sub.id}">${sub.name}</option>`; });
    }

    function startFocus() {
        if (isFighting) return;
        let mins = parseInt(focusInput.value);
        if (isNaN(mins) || mins < 1) return alert("Invalid Time");
        
        if(activeSubjectId) {
            const sub = subjects.find(s => s.id === activeSubjectId);
            if(sub) {
                activeSubjectDisplay.classList.remove('hidden');
                subjectNameDisplay.innerText = sub.name;
                const percent = Math.min(100, (sub.current / sub.target) * 100);
                subjectProgressBar.style.width = `${percent}%`;
                subjectCurrent.innerText = Math.floor(sub.current);
                subjectTarget.innerText = Math.floor(sub.target);
            }
        } else { activeSubjectDisplay.classList.add('hidden'); }

        timeLeft = mins * 60; let totalTime = timeLeft; isFighting = true;
        focusInput.disabled = true; breakInput.disabled = true; subjectSelect.disabled = true;
        startBtn.disabled = true; startBtn.style.opacity = "0.5";
        giveUpBtn.disabled = false; giveUpBtn.style.opacity = "1";
        shopBtn.disabled = true; shopBtn.style.opacity = "0.5";
        
        statusText.innerText = activeSubjectId ? "Studying " + subjects.find(s=>s.id===activeSubjectId).name + "..." : "Fighting Procrastination...";
        monsterHpBar.style.width = '100%'; monsterEmoji.innerText = "👹"; updateTimerDisplay();

        timer = setInterval(() => {
            timeLeft--; updateTimerDisplay();
            let hpPercent = (timeLeft / totalTime) * 100; monsterHpBar.style.width = `${hpPercent}%`;
            if (timeLeft <= 0) { clearInterval(timer); victory(mins); }
        }, 1000);
    }

    function victory(mins) {
        playSound('win');
        let xpGain = mins * 2; let goldGain = mins * 1; 
        
        if (activeSubjectId) {
            const subIndex = subjects.findIndex(s => s.id === activeSubjectId);
            if(subIndex > -1) {
                subjects[subIndex].current += mins;
                if(subjects[subIndex].current >= subjects[subIndex].target && !subjects[subIndex].completed) {
                    subjects[subIndex].completed = true;
                    alert(`🎓 CONGRATULATIONS! You completed ${subjects[subIndex].name}! +500 Bonus XP`);
                    xpGain += 500; playSound('win');
                }
            }
        }

        xp += xpGain; gold += goldGain;
        while (xp >= xpReq) { xp -= xpReq; level++; xpReq = Math.floor(xpReq * 1.2); alert(`LEVEL UP! You are now Level ${level}!`); }
        
        saveGame(); updateStatsUI(); renderSubjectList();
        statusText.innerText = `Victory! +${xpGain} XP | +${goldGain} Gold`;
        monsterEmoji.innerText = "💀";
        setTimeout(() => startBreakMode(), 1500);
    }

    function giveUp() { clearInterval(timer); statusText.innerText = "You fled! No XP or Gold."; resetGame(); }

    function resetGame() {
        isFighting = false;
        startBtn.disabled = false; startBtn.style.opacity = "1";
        shopBtn.disabled = false; shopBtn.style.opacity = "1";
        giveUpBtn.disabled = true; giveUpBtn.style.opacity = "0.5";
        focusInput.disabled = false; breakInput.disabled = false; subjectSelect.disabled = false;
        activeSubjectDisplay.classList.add('hidden');
        timeLeft = parseInt(focusInput.value) * 60; updateTimerDisplay();
        monsterHpBar.style.width = '100%'; monsterEmoji.innerText = "👹";
    }
    
    function updateTimerDisplay() {
        if (!timeLeft && timeLeft !== 0) return;
        let m = Math.floor(timeLeft / 60); let s = timeLeft % 60;
        timerDisplay.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function applyCosmetics() { heroEmoji.innerText = equippedAvatar; document.body.className = ''; if(equippedTheme !== 'theme_default') document.body.classList.add(equippedTheme); }
    const shopCatalog = [
        { id: 'avatar_wizard', name: 'Wizard', type: 'avatar', value: '🧙‍♂️', cost: 0, icon: '🧙‍♂️' },
        { id: 'avatar_ninja', name: 'Ninja', type: 'avatar', value: '🥷', cost: 50, icon: '🥷' },
        { id: 'avatar_robot', name: 'Robot', type: 'avatar', value: '🤖', cost: 100, icon: '🤖' },
        { id: 'avatar_engineer', name: 'Engineer', type: 'avatar', value: '👷‍♂️', cost: 200, icon: '👷‍♂️' },
        { id: 'theme_default', name: 'Default', type: 'theme', value: 'theme_default', cost: 0, icon: '🌌' },
        { id: 'theme_matrix', name: 'Matrix', type: 'theme', value: 'theme-matrix', cost: 100, icon: '💻' },
        { id: 'theme_cyberpunk', name: 'Cyberpunk', type: 'theme', value: 'theme-cyberpunk', cost: 150, icon: '🌆' }
    ];

    function openShop() {
        shopModal.classList.remove('hidden'); document.getElementById('shop-gold-display').innerText = gold;
        const grid = document.getElementById('shop-grid'); grid.innerHTML = '';
        shopCatalog.forEach(item => {
            const isOwned = inventory.includes(item.id);
            const isEquipped = (item.type === 'avatar' && equippedAvatar === item.value) || (item.type === 'theme' && equippedTheme === item.value);
            let btn = isEquipped ? `<button class="shop-btn btn-equipped">Equipped</button>` :
                      isOwned ? `<button class="shop-btn btn-equip" onclick="triggerEquip('${item.id}')">Equip</button>` :
                      gold >= item.cost ? `<button class="shop-btn btn-buy" onclick="triggerBuy('${item.id}')">Buy ${item.cost}g</button>` :
                      `<button class="shop-btn btn-locked">Need ${item.cost}g</button>`;
            grid.innerHTML += `<div class="shop-item"><div class="shop-icon">${item.icon}</div><div class="shop-name">${item.name}</div>${btn}</div>`;
        });
    }

    window.triggerBuy = function(id) { const item = shopCatalog.find(i=>i.id===id); if(gold >= item.cost) { playSound('coin'); gold -= item.cost; inventory.push(id); saveGame(); updateStatsUI(); openShop(); } }
    window.triggerEquip = function(id) { const item = shopCatalog.find(i=>i.id===id); if(item.type==='avatar') equippedAvatar = item.value; if(item.type==='theme') equippedTheme = item.value; playSound('click'); saveGame(); applyCosmetics(); openShop(); }

    let breakInterval;
    function startBreakMode() {
        breakModal.classList.remove('hidden'); stopActivity(); 
        let breakMins = parseInt(breakInput.value) || 5; if (breakMins > 10) breakMins = 10; 
        let breakTime = breakMins * 60; breakTimerDisplay.innerText = `${Math.floor(breakTime/60)}:${breakTime%60<10?'0':''}${breakTime%60}`;
        breakInterval = setInterval(() => { breakTime--; breakTimerDisplay.innerText = `${Math.floor(breakTime/60)}:${breakTime%60<10?'0':''}${breakTime%60}`; if (breakTime <= 0) endBreak(); }, 1000);
    }
    function endBreak() { clearInterval(breakInterval); breakModal.classList.add('hidden'); resetGame(); }

    let gameInterval, gameTimeout;
    function startActivity(type) { playSound('click'); document.getElementById('activity-menu').classList.add('hidden'); document.getElementById('activity-display').classList.remove('hidden'); contentArea.innerHTML = ''; if (type === 'quotes') loadQuotes(); if (type === 'jumper') loadJumper(); if (type === 'reflex') loadReflex(); }
    function stopActivity() { document.getElementById('activity-display').classList.add('hidden'); document.getElementById('activity-menu').classList.remove('hidden'); contentArea.innerHTML = ''; if(gameInterval) clearInterval(gameInterval); if(gameTimeout) clearTimeout(gameTimeout); }
    function showGameOver(score, gameType, restartCallback) { 
        playSound('click'); 
        let highScore = localStorage.getItem(gameType + '_highscore') || 0; 
        if (score > highScore) { 
            highScore = score; 
            localStorage.setItem(gameType + '_highscore', highScore); 
            // Save to cloud immediately if highscore beat
            saveGame();
        } 
        contentArea.innerHTML += `<div class="game-over-backdrop"><div class="game-over-card"><h3>Game Over</h3><div class="score-display">${score}</div><div class="score-label">Points</div><button id="retry-btn">Try Again</button><div class="high-score-footer">🏆 High Score: ${highScore}</div></div></div>`; 
        document.getElementById('retry-btn').addEventListener('click', restartCallback); 
    }

    const quotes = ["“It always seems impossible until it’s done.”", "“Don’t watch the clock; do what it does. Keep going.”", "“Future You will thank you for this.”"];
    function loadQuotes() { let q = quotes[Math.floor(Math.random() * quotes.length)]; contentArea.innerHTML = `<div id="quote-text">${q}</div><button class="btn-primary" id="next-quote">Next</button>`; document.getElementById('next-quote').addEventListener('click', () => { playSound('click'); loadQuotes(); }); }

    function loadJumper() {
        contentArea.innerHTML = `<div id="jumper-game"><div id="dino"></div><div id="cactus"></div><div style="position:absolute; top:5px; right:10px; color:#fff;">Score: <span id="jumper-score">0</span></div></div><p style="font-size:0.8rem">Tap Spacebar</p>`;
        const dino = document.getElementById("dino"); const cactus = document.getElementById("cactus"); let score = 0; let isGameOver = false; let speed = 1.5; cactus.style.animation = `slide ${speed}s infinite linear`;
        const jumpHandler = (e) => { if (e.code === "Space" && !dino.classList.contains("jump-animate") && !isGameOver) { playSound('jump'); dino.classList.add("jump-animate"); setTimeout(() => dino.classList.remove("jump-animate"), 500); } };
        window.addEventListener("keydown", jumpHandler);
        cactus.addEventListener('animationiteration', () => { if(isGameOver) return; score++; document.getElementById('jumper-score').innerText = score; if (score % 3 === 0 && speed > 0.6) { speed -= 0.1; cactus.style.animation = 'none'; cactus.offsetHeight; cactus.style.animation = `slide ${speed}s infinite linear`; } });
        gameInterval = setInterval(() => { if(!document.getElementById("dino")) return clearInterval(gameInterval); let dRect = dino.getBoundingClientRect(); let cRect = cactus.getBoundingClientRect(); if (dRect.right > cRect.left + 10 && dRect.left < cRect.right - 10 && dRect.bottom > cRect.top + 10) { isGameOver = true; clearInterval(gameInterval); cactus.style.animation = "none"; window.removeEventListener("keydown", jumpHandler); showGameOver(score, 'jumper', loadJumper); } }, 10);
    }

    function loadReflex() {
        contentArea.innerHTML = `<div id="reflex-area"><div id="target-dot"></div><div id="timer-bar" style="height:5px; background:#ffd700; width:100%; position:absolute; top:0; left:0;"></div></div><p>Score: <span id="reflex-score">0</span></p>`;
        let score = 0; let timeLimit = 2000; const dot = document.getElementById('target-dot'); const timerBar = document.getElementById('timer-bar');
        function moveDot() { if(!document.getElementById('reflex-area')) return; let x = Math.floor(Math.random() * (350)); let y = Math.floor(Math.random() * (150)); dot.style.left = x + 'px'; dot.style.top = y + 'px'; clearTimeout(gameTimeout); timerBar.style.transition = 'none'; timerBar.style.width = '100%'; setTimeout(() => { timerBar.style.transition = `width ${timeLimit}ms linear`; timerBar.style.width = '0%'; }, 10); gameTimeout = setTimeout(() => showGameOver(score, 'reflex', loadReflex), timeLimit); }
        dot.addEventListener('click', (e) => { e.stopPropagation(); playSound('coin'); score++; document.getElementById('reflex-score').innerText = score; if (timeLimit > 500) timeLimit -= 50; moveDot(); });
        document.getElementById('reflex-area').addEventListener('click', () => showGameOver(score, 'reflex', loadReflex));
        moveDot();
    }
});