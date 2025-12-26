// --- IMPORT LOCAL FILES ---
import { quotesList } from './quotes.js'; 

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

// --- BOSS DATA ---
const bossList = [
    { id: 'procrastination', name: "Procrastination", icon: "👹", desc: "The thief of time." },
    { id: 'distraction', name: "Distraction", icon: "🤪", desc: "Look! A squirrel!" },
    { id: 'social_media', name: "Social Media", icon: "📱", desc: "Just one more scroll..." },
    { id: 'brain_fog', name: "Brain Fog", icon: "🌫️", desc: "Everything is blurry." },
    { id: 'sofa', name: "The Sofa", icon: "🛋️", desc: "It's too comfortable." },
    { id: 'netflix', name: "Netflix Binge", icon: "📺", desc: "Are you still watching?" },
    { id: 'laziness', name: "Laziness", icon: "🦥", desc: "Maybe tomorrow." },
    { id: 'self_doubt', name: "Self Doubt", icon: "😨", desc: "Can I really do this?" }
];

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

    let currentBoss = null;
    let selectedBossOverride = null; // Tracks boss selection
    let bossStats = JSON.parse(localStorage.getItem('rpg_boss_stats')) || {};
    
    // XP Formula: (Level + 9)^2 -> 100, 121, 144...
    let xpReq = (level + 9) ** 2;

    let timer, timeLeft, isFighting = false;

    // --- AUDIO SYSTEM ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playSound(type) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const masterVolume = 0.5;
        gainNode.gain.value = 0.1 * masterVolume;
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        
        if (type === 'start') { 
            osc.type='triangle'; osc.frequency.setValueAtTime(440,now); osc.frequency.exponentialRampToValueAtTime(880,now+0.1); 
            gainNode.gain.setValueAtTime(0.1,now); gainNode.gain.exponentialRampToValueAtTime(0.01,now+0.5); 
            osc.start(now); osc.stop(now+0.5); 
        } 
        else if (type === 'win') { 
            osc.type='square'; osc.frequency.setValueAtTime(523,now); osc.frequency.setValueAtTime(659,now+0.1); osc.frequency.setValueAtTime(783,now+0.2); 
            gainNode.gain.setValueAtTime(0.1,now); gainNode.gain.linearRampToValueAtTime(0,now+0.8); 
            osc.start(now); osc.stop(now+0.8); 
        }
        else if (type === 'coin') { 
            osc.type='sine'; osc.frequency.setValueAtTime(1200,now); osc.frequency.exponentialRampToValueAtTime(1800,now+0.1); 
            gainNode.gain.setValueAtTime(0.1,now); gainNode.gain.linearRampToValueAtTime(0,now+0.2); 
            osc.start(now); osc.stop(now+0.2); 
        }
        else if (type === 'jump') { 
            osc.type='square'; osc.frequency.setValueAtTime(150,now); osc.frequency.linearRampToValueAtTime(300,now+0.1); 
            gainNode.gain.setValueAtTime(0.05,now); gainNode.gain.linearRampToValueAtTime(0,now+0.1); 
            osc.start(now); osc.stop(now+0.1); 
        }
        else if (type === 'click') { 
            osc.type='triangle'; osc.frequency.setValueAtTime(800,now); 
            gainNode.gain.setValueAtTime(0.05,now); gainNode.gain.exponentialRampToValueAtTime(0.001,now+0.05); 
            osc.start(now); osc.stop(now+0.05); 
        }
    }

    // --- DOM ELEMENTS ---
    const timerDisplay = document.getElementById('timer-display');
    const monsterHpBar = document.getElementById('monster-hp');
    const statusText = document.getElementById('status-text');
    const xpDisplay = document.getElementById('xp');
    const levelDisplay = document.getElementById('level');
    const goldDisplay = document.getElementById('gold');
    const monsterEmoji = document.getElementById('monster-emoji');
    
    // FIX: Safe selector for Hero Emoji
    const heroEmoji = document.querySelector('.hero .emoji') || document.querySelector('.hero .avatar');
    
    const heroNameDisplay = document.getElementById('hero-name-display');
    const vsBadge = document.querySelector('.vs-badge');

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

    // Modals
    const breakModal = document.getElementById('break-modal');
    const shopModal = document.getElementById('shop-modal');
    const subjectModal = document.getElementById('subject-modal');
    const profileModal = document.getElementById('profile-modal');
    const welcomeModal = document.getElementById('welcome-modal');
    const authModal = document.getElementById('auth-modal');
    const leaderboardModal = document.getElementById('leaderboard-modal');
    const levelupModal = document.getElementById('levelup-modal');
    const bestiaryModal = document.getElementById('bestiary-modal');
    const subjectCompleteModal = document.getElementById('subject-complete-modal');

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
    shopBtn.addEventListener('click', () => { playSound('click'); openShop(); });
    
    // ... existing listeners ...
    if(document.getElementById('bestiary-btn')) document.getElementById('bestiary-btn').addEventListener('click', () => { playSound('click'); openBestiary(); });
    
    // --- ADD THIS MISSING PART ---
    document.getElementById('monster-emoji').addEventListener('click', () => { 
        playSound('click'); 
        openBestiary(); 
    });

    document.getElementById('monster-emoji').addEventListener('click', () => { 
        playSound('click'); 
        openBestiary();
    });
    
    document.getElementById('close-shop-btn').addEventListener('click', () => shopModal.classList.add('hidden'));
    document.getElementById('close-subject-btn').addEventListener('click', () => subjectModal.classList.add('hidden'));
    document.getElementById('close-welcome-btn').addEventListener('click', () => welcomeModal.classList.add('hidden'));
    document.getElementById('close-auth-btn').addEventListener('click', () => authModal.classList.add('hidden'));
    document.getElementById('close-leaderboard-btn').addEventListener('click', () => leaderboardModal.classList.add('hidden'));
    if(document.getElementById('close-bestiary-btn')) document.getElementById('close-bestiary-btn').addEventListener('click', () => bestiaryModal.classList.add('hidden'));
    if(document.getElementById('bestiary-btn')) document.getElementById('bestiary-btn').addEventListener('click', () => { playSound('click'); openBestiary(); });
    
    document.getElementById('open-profile-btn').addEventListener('click', openProfile);
    document.getElementById('save-profile-btn').addEventListener('click', saveProfile);
    
    manageSubjectsBtn.addEventListener('click', () => subjectModal.classList.remove('hidden'));
    document.getElementById('add-subject-btn').addEventListener('click', addNewSubject);
    subjectSelect.addEventListener('change', (e) => activeSubjectId = e.target.value);

    document.getElementById('btn-quote').addEventListener('click', () => startActivity('quotes'));
    document.getElementById('btn-jumper').addEventListener('click', () => startActivity('jumper'));
    document.getElementById('btn-reflex').addEventListener('click', () => startActivity('reflex'));
    document.getElementById('stop-activity-btn').addEventListener('click', stopActivity);
    
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
            document.getElementById('auth-btn').onclick = handleLogout; 
            statusText.innerText = "Synced with Cloud ☁️";
            authModal.classList.add('hidden');
            loadCloudData();
        } else {
            currentUser = null;
            document.getElementById('auth-btn').innerText = "☁️ Login";
            document.getElementById('auth-btn').onclick = () => authModal.classList.remove('hidden'); 
            checkWelcome(); 
        }
    });

    async function handleRegister() {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-pass').value;
        if(pass.length < 6) { document.getElementById('auth-msg').innerText = "Password must be 6+ chars"; return; }
        try {
            await createUserWithEmailAndPassword(auth, email, pass);
            saveGame(true); 
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
        localStorage.clear(); // WIPE DATA FOR PRIVACY
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
            
            // LOAD USER SPECIFIC DATA
            subjects = data.subjects || []; 
            bossStats = data.bossStats || {};

            // Sync highscores
            if(data.jumper_highscore) localStorage.setItem('jumper_highscore', data.jumper_highscore);
            if(data.reflex_highscore) localStorage.setItem('reflex_highscore', data.reflex_highscore);
            
            updateStatsUI();
            applyCosmetics();
            renderSubjectList();
            renderSubjectDropdown();
        } else {
            saveGame(true); 
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
        localStorage.setItem('rpg_boss_stats', JSON.stringify(bossStats));

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
                    subjects: subjects, // Save Subjects
                    bossStats: bossStats, // Save Boss Kills
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
        
        document.querySelectorAll('.activity-buttons button').forEach(b => b.style.opacity = '0.5');
        document.getElementById(`lb-tab-${type}`).style.opacity = '1';

        let field = type === 'level' ? 'level' : (type === 'jumper' ? 'jumper_highscore' : 'reflex_highscore');
        
        const q = query(collection(db, "users"), orderBy(field, "desc"), limit(10));
        
        try {
            const querySnapshot = await getDocs(q);
            list.innerHTML = '';
            let rank = 1;
            querySnapshot.forEach((doc) => {
                const d = doc.data();
                const score = d[field] || 0;
                let entryClass = (currentUser && doc.id === currentUser.uid) ? 'rank-item highlight' : 'rank-item';
                let icon = '👤';
                let rankColor = '#94a3b8'; // Default grey
                
                if(rank===1) { icon='🥇'; rankColor='#ffd700'; }
                if(rank===2) { icon='🥈'; rankColor='#c0c0c0'; }
                if(rank===3) { icon='🥉'; rankColor='#cd7f32'; }

                list.innerHTML += `
                    <div class="${entryClass}">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:1.2rem; width:30px; text-align:center;">${icon}</span>
                            <span style="color: ${rankColor}; font-weight:bold; font-size:1.1rem; width:20px;">${rank}</span>
                            <span style="font-weight:600; color:#e2e8f0;">${d.username}</span>
                        </div>
                        <div style="font-family:monospace; font-size:1.1rem; color:#38bdf8; background:rgba(56, 189, 248, 0.1); padding:4px 8px; border-radius:6px;">
                            ${score}
                        </div>
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

    // --- GAME LOGIC ---
    function checkWelcome() {
        if (!isReturning && !currentUser) {
            welcomeModal.classList.remove('hidden');
            document.getElementById('welcome-title').innerText = "Welcome, Hero!";
            document.getElementById('welcome-body').innerHTML = `
                <p>Welcome to <strong>Pomodoro RPG</strong>!</p>
                <ul class="welcome-list">
                    <li>⏱️ <strong>Focus:</strong> Defeat monsters by studying.</li>
                    <li>💰 <strong>Reward:</strong> Earn Gold & XP to upgrade.</li>
                    <li>☁️ <strong>Cloud:</strong> Login to save your progress!</li>
                </ul>`;
            localStorage.setItem('rpg_is_returning', 'true');
        } else if (!currentUser) {
            const q = (typeof quotesList !== 'undefined' && quotesList.length > 0) 
                ? quotesList[Math.floor(Math.random() * quotesList.length)] 
                : "Ready to focus?";
            welcomeModal.classList.remove('hidden');
            document.getElementById('welcome-title').innerText = `Welcome back, ${username}!`; 
            document.getElementById('welcome-body').innerHTML = `<div style="background: rgba(0, 210, 255, 0.1); padding: 15px; border-radius: 8px; font-style: italic; color: #00d2ff; border: 1px solid rgba(0, 210, 255, 0.2);">${q}</div>`;
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

        // XP Bar
        const xpPercent = Math.min(100, (xp / xpReq) * 100);
        const xpBarFill = document.getElementById('xp-bar-fill');
        if(xpBarFill) xpBarFill.style.width = `${xpPercent}%`;
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
        // --- UPDATED BOSS LOGIC ---
        // If you selected a boss in the menu, fight them. Otherwise, random.
        if (selectedBossOverride) {
            currentBoss = selectedBossOverride;
        } else {
            currentBoss = bossList[Math.floor(Math.random() * bossList.length)];
        }
        
        // Display the boss
        monsterEmoji.innerText = currentBoss.icon;
        const monsterNameDisplay = document.getElementById('monster-name');
        if(monsterNameDisplay) monsterNameDisplay.innerText = currentBoss.name;
        // ---------------------------

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
        
        // Active VS Glow
        if(vsBadge) vsBadge.classList.add('vs-active');

        timeLeft = mins * 60; let totalTime = timeLeft; isFighting = true;
        focusInput.disabled = true; breakInput.disabled = true; subjectSelect.disabled = true;
        startBtn.disabled = true; startBtn.style.opacity = "0.5";
        giveUpBtn.disabled = false; giveUpBtn.style.opacity = "1";
        shopBtn.disabled = true; shopBtn.style.opacity = "0.5";
        
        statusText.innerText = activeSubjectId ? "Studying " + subjects.find(s=>s.id===activeSubjectId).name + "..." : "Fighting " + currentBoss.name + "...";
        monsterHpBar.style.width = '100%'; updateTimerDisplay();

        timer = setInterval(() => {
            timeLeft--; updateTimerDisplay();
            let hpPercent = (timeLeft / totalTime) * 100; monsterHpBar.style.width = `${hpPercent}%`;
            if (timeLeft <= 0) { clearInterval(timer); victory(mins); }
        }, 1000);
    }

    function victory(mins) {
        playSound('win');
        let xpGain = mins * 2; let goldGain = mins * 1; 
        
        // 1. Update Subject
        if (activeSubjectId) {
            const subIndex = subjects.findIndex(s => s.id === activeSubjectId);
            if(subIndex > -1) {
                subjects[subIndex].current += mins;
                if(subjects[subIndex].current >= subjects[subIndex].target && !subjects[subIndex].completed) {
                    subjects[subIndex].completed = true;
                    showSubjectCompleteModal(subjects[subIndex].name);
                    xpGain += 500; 
                }
            }
        }

        // 2. Record Boss Kill
        if (currentBoss) {
            bossStats[currentBoss.id] = (bossStats[currentBoss.id] || 0) + 1;
        }

        xp += xpGain; gold += goldGain;
        
        // 3. Check Level Up
        while (xp >= xpReq) { 
            xp -= xpReq; 
            level++; 
            xpReq = (level + 9) ** 2; 
            showLevelUpModal(level);
        }
        
        saveGame(); updateStatsUI(); renderSubjectList();
        statusText.innerText = `Victory! +${xpGain} XP | +${goldGain} Gold`;
        monsterEmoji.innerText = "💀";
        setTimeout(() => startBreakMode(), 1500);

        confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }});
    }

    function giveUp() { clearInterval(timer); statusText.innerText = "You fled! No XP or Gold."; resetGame(); }

    function resetGame() {
        isFighting = false;
        if(vsBadge) vsBadge.classList.remove('vs-active');
        document.title = "Pomodoro RPG";

        startBtn.disabled = false; startBtn.style.opacity = "1";
        shopBtn.disabled = false; shopBtn.style.opacity = "1";
        giveUpBtn.disabled = true; giveUpBtn.style.opacity = "0.5";
        focusInput.disabled = false; breakInput.disabled = false; subjectSelect.disabled = false;
        activeSubjectDisplay.classList.add('hidden');
        timeLeft = parseInt(focusInput.value) * 60; updateTimerDisplay();
        
        // --- FIX: RESPECT SELECTED BOSS ON RESET ---
        monsterHpBar.style.width = '100%'; 

        if (selectedBossOverride) {
            // If user selected a boss, keep showing it!
            monsterEmoji.innerText = selectedBossOverride.icon;
            document.getElementById('monster-name').innerText = selectedBossOverride.name;
        } else {
            // Otherwise, reset to default Procrastination
            monsterEmoji.innerText = "👹";
            document.getElementById('monster-name').innerText = "Procrastination";
        }
    }
    
        function updateTimerDisplay() {
        if (!timeLeft && timeLeft !== 0) return;
        
        let m = Math.floor(timeLeft / 60); 
        let s = timeLeft % 60;
        
        // 1. Create the time string (e.g., "24:59")
        const timeString = `${m}:${s < 10 ? '0' : ''}${s}`;
        
        // 2. Update the Main Screen
        timerDisplay.innerText = timeString;
        
        // 3. Update the Browser Tab Title (NEW FEATURE)
        if (isFighting) {
            document.title = `${timeString} - Fighting ⚔️`; 
        } else {
            document.title = "Pomodoro RPG";
        }
    }

    function applyCosmetics() { 
        if(heroEmoji) heroEmoji.innerText = equippedAvatar; 
        document.body.className = ''; 
        if(equippedTheme !== 'theme_default') document.body.classList.add(equippedTheme); 
    }
    
    const shopCatalog = [
        // --- AVATARS ---
        { id: 'avatar_wizard', name: 'Wizard', type: 'avatar', value: '🧙‍♂️', cost: 0, icon: '🧙‍♂️' },
        { id: 'avatar_ninja', name: 'Ninja', type: 'avatar', value: '🥷', cost: 50, icon: '🥷' },
        { id: 'avatar_robot', name: 'Robot', type: 'avatar', value: '🤖', cost: 100, icon: '🤖' },
        { id: 'avatar_engineer', name: 'Engineer', type: 'avatar', value: '👷‍♂️', cost: 200, icon: '👷‍♂️' },
        { id: 'avatar_king', name: 'Coming Soon', type: 'avatar', value: 'locked', cost: 99999, icon: '🔒' },

        // --- THEMES ---
        { id: 'theme_default', name: 'Default', type: 'theme', value: 'theme_default', cost: 0, icon: '🌌' },
        { id: 'theme_matrix', name: 'Matrix', type: 'theme', value: 'theme-matrix', cost: 100, icon: '💻' },
        { id: 'theme_vicecity', name: 'Vice City', type: 'theme', value: 'theme-vicecity', cost: 150, icon: '🌆' },
        { id: 'theme_future', name: 'Coming Soon', type: 'theme', value: 'locked', cost: 99999, icon: '🔒' }
    ];

    function openShop() {
        shopModal.classList.remove('hidden'); document.getElementById('shop-gold-display').innerText = gold;
        const grid = document.getElementById('shop-grid'); grid.innerHTML = '';
        
        const renderItem = (item) => {
            const isOwned = inventory.includes(item.id);
            const isEquipped = (item.type === 'avatar' && equippedAvatar === item.value) || (item.type === 'theme' && equippedTheme === item.value);
            const isLocked = item.name === 'Coming Soon';

            let btn;
            if (isLocked) { btn = `<button class="btn-soon">Locked</button>`; } 
            else if (isEquipped) { btn = `<button class="shop-btn btn-equipped">Equipped</button>`; } 
            else if (isOwned) { btn = `<button class="shop-btn btn-equip" onclick="triggerEquip('${item.id}')">Equip</button>`; } 
            else if (gold >= item.cost) { btn = `<button class="shop-btn btn-buy" onclick="triggerBuy('${item.id}')">Buy ${item.cost}g</button>`; } 
            else { btn = `<button class="shop-btn btn-locked">Need ${item.cost}g</button>`; }
            
            const itemClass = isLocked ? 'shop-item item-locked' : 'shop-item';
            return `<div class="${itemClass}"><div class="avatar" style="font-size:2rem">${item.icon}</div><div class="shop-name" style="margin:5px 0; font-size:0.8rem">${item.name}</div>${btn}</div>`;
        };

        grid.innerHTML += `<div class="shop-header">✨ Avatars</div>`;
        shopCatalog.filter(i => i.type === 'avatar').forEach(item => grid.innerHTML += renderItem(item));
        grid.innerHTML += `<div class="shop-header">🎨 Themes</div>`;
        shopCatalog.filter(i => i.type === 'theme').forEach(item => grid.innerHTML += renderItem(item));
    }

    function openBestiary() {
        const modal = document.getElementById('bestiary-modal');
        const grid = document.getElementById('bestiary-grid');
        const totalDisplay = document.getElementById('total-kills-display');
        modal.classList.remove('hidden');
        grid.innerHTML = '';

        let totalKills = Object.values(bossStats).reduce((a, b) => a + b, 0);
        totalDisplay.innerText = totalKills + " 💀";

        bossList.forEach(boss => {
            const kills = bossStats[boss.id] || 0;
            const isDiscovered = kills > 0;
            
            // Check if this is the currently selected boss
            const isSelected = selectedBossOverride && selectedBossOverride.id === boss.id;
            const selectedClass = isSelected ? 'boss-selected' : '';

            if (isDiscovered) {
                // ADDED: onclick="selectBoss(...)" and the selected class
                grid.innerHTML += `
                    <div class="boss-card boss-known ${selectedClass}" onclick="selectBoss('${boss.id}')">
                        <div class="avatar">${boss.icon}</div>
                        <div class="shop-name">${boss.name}</div>
                        <div class="boss-count" style="color:#ef4444">Defeated: ${kills}</div>
                        <div style="font-size:0.7rem; color:#64748b; margin-top:5px;">"${boss.desc}"</div>
                    </div>`;
            } else {
                grid.innerHTML += `
                    <div class="boss-card boss-unknown">
                        <div class="avatar">❓</div>
                        <div class="shop-name">???</div>
                        <div class="boss-count">Undiscovered</div>
                    </div>`;
            }
        });
    }

    // --- NEW FUNCTION: HANDLES CLICKING A BOSS ---
    window.selectBoss = function(id) {
        const boss = bossList.find(b => b.id === id);
        
        // Toggle Logic: If clicking the same boss, unselect it (go back to random)
        if (selectedBossOverride && selectedBossOverride.id === id) {
            selectedBossOverride = null;
            playSound('click');
        } else {
            selectedBossOverride = boss;
            playSound('coin');
            
            // Update the main screen immediately so user sees the change
            document.getElementById('monster-emoji').innerText = boss.icon;
            document.getElementById('monster-name').innerText = boss.name;
        }
        
        // Re-render the menu to show the green border
        openBestiary();
    } // <--- ERROR WAS HERE (Extra bracket removed)

    window.triggerBuy = function(id) { 
        const item = shopCatalog.find(i=>i.id===id); 
        if(gold >= item.cost) { 
            playSound('coin'); 
            gold -= item.cost; 
            inventory.push(id); 
            saveGame(); 
            updateStatsUI(); 
            openShop(); 
        } 
    };
    
    window.triggerEquip = function(id) { 
        const item = shopCatalog.find(i=>i.id===id); 
        if(item.type==='avatar') equippedAvatar = item.value; 
        if(item.type==='theme') equippedTheme = item.value; 
        playSound('click'); 
        saveGame(); 
        applyCosmetics(); 
        openShop(); 
    };

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
            saveGame();
        } 
        contentArea.innerHTML += `<div class="game-over-backdrop" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 50; backdrop-filter: blur(3px);"><div class="game-over-card" style="background: #1e293b; padding: 25px; border-radius: 15px; border: 1px solid rgba(255, 255, 255, 0.1); text-align: center;"><h3>Game Over</h3><div class="score-display" style="font-size: 2rem; color:white;">${score}</div><button id="retry-btn" class="btn-primary" style="margin-top:10px; width:100%;">Try Again</button><div class="high-score-footer" style="margin-top:10px; color:#ffd700;">🏆 High Score: ${highScore}</div></div></div>`; 
        document.getElementById('retry-btn').addEventListener('click', restartCallback); 
    }

    function loadQuotes() { 
        const q = (typeof quotesList !== 'undefined' && quotesList.length > 0) ? quotesList[Math.floor(Math.random() * quotesList.length)] : "Stay Focused!";
        contentArea.innerHTML = `<div id="quote-text" style="font-size: 1.5rem; margin: 20px; font-style: italic; color: #00d2ff;">${q}</div><button class="btn-primary" id="next-quote">Next</button>`; 
        document.getElementById('next-quote').addEventListener('click', () => { playSound('click'); loadQuotes(); }); 
    }

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

    // --- MODAL FUNCTIONS ---
    function showLevelUpModal(newLevel) {
        const modal = document.getElementById('levelup-modal');
        const levelSpan = document.getElementById('new-level-display');
        const closeBtn = document.getElementById('close-levelup-btn');
        levelSpan.innerText = newLevel;
        modal.classList.remove('hidden');
        playSound('win'); 
        closeBtn.onclick = () => { modal.classList.add('hidden'); };
    }

    function showSubjectCompleteModal(subjectName) {
        const modal = document.getElementById('subject-complete-modal');
        document.getElementById('completed-subject-name').innerText = subjectName;
        modal.classList.remove('hidden');
        playSound('win'); 
        document.getElementById('close-complete-btn').onclick = () => { modal.classList.add('hidden'); };
    }

    // ==========================================
    // 🛠️ DEVELOPER MODE (SECURE + BOSS + LEVEL DOWN)
    // ==========================================
    const MY_DEV_CODE = "admin123";

    const devContainer = document.createElement('div');
    devContainer.innerHTML = `
        <button id="dev-toggle-btn" style="position:fixed; bottom:10px; left:10px; background:#333; color:#0f0; border:1px solid #0f0; padding:5px 10px; border-radius:5px; font-family:monospace; z-index:9999; cursor:pointer; opacity:0.7;">👨‍💻 Dev</button>
        <div id="dev-panel" class="hidden" style="position:fixed; bottom:50px; left:10px; background:rgba(0,0,0,0.95); border:1px solid #0f0; padding:15px; border-radius:10px; z-index:9999; width:200px; font-family:monospace; color:#0f0; box-shadow: 0 0 20px rgba(0,255,0,0.2);">
            <h4 style="margin:0 0 10px 0; border-bottom:1px solid #0f0; padding-bottom:5px;">HACKER TOOLS</h4>
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <button id="dev-levelup" style="flex:1; background:#003333; color:#0ff; border:1px solid #0ff; padding:5px; cursor:pointer;">⬆️ Lvl Up</button>
                <button id="dev-leveldown" style="flex:1; background:#330000; color:#f00; border:1px solid #f00; padding:5px; cursor:pointer;">⬇️ Lvl Dn</button>
            </div>
            <button id="dev-gold" style="width:100%; margin-bottom:5px; background:#003300; color:#fff; border:1px solid #0f0; padding:5px; cursor:pointer;">💰 Add 5000 Gold</button>
            <button id="dev-unlock" style="width:100%; margin-bottom:5px; background:#003300; color:#fff; border:1px solid #0f0; padding:5px; cursor:pointer;">🔓 Unlock Everything</button>
            <button id="dev-win" style="width:100%; margin-bottom:5px; background:#003300; color:#fff; border:1px solid #0f0; padding:5px; cursor:pointer;">⚡ Instant Win</button>
            <button id="dev-reset" style="width:100%; margin-top:5px; background:#330000; color:#fff; border:1px solid #f00; padding:5px; cursor:pointer;">💀 Reset Save</button>
        </div>
    `;
    document.body.appendChild(devContainer);

    const devPanel = document.getElementById('dev-panel');
    document.getElementById('dev-toggle-btn').addEventListener('click', () => {
        if (!devPanel.classList.contains('hidden')) { devPanel.classList.add('hidden'); return; }
        const input = prompt("🔐 Enter Developer Access Code:");
        if (input === MY_DEV_CODE) { devPanel.classList.remove('hidden'); playSound('coin'); } 
        else { alert("❌ ACCESS DENIED"); }
    });

    document.getElementById('dev-levelup').addEventListener('click', () => { level++; xp = 0; updateStatsUI(); saveGame(); showLevelUpModal(level); });
    document.getElementById('dev-leveldown').addEventListener('click', () => { 
        if(level > 1) { level--; xp = 0; xpReq = (level + 9) ** 2; updateStatsUI(); saveGame(); alert(`⬇️ Downgraded to Level ${level}`); } 
        else { alert("⚠️ Already Level 1!"); } 
    });
    document.getElementById('dev-gold').addEventListener('click', () => { gold += 5000; updateStatsUI(); saveGame(); playSound('coin'); });
    document.getElementById('dev-unlock').addEventListener('click', () => {
        const allItems = shopCatalog.map(item => item.id);
        allItems.forEach(id => { if(!inventory.includes(id)) inventory.push(id); });
        saveGame(); alert("🔓 SYSTEM HACKED: All items unlocked!"); openShop();
    });
    document.getElementById('dev-win').addEventListener('click', () => {
        if (!isFighting) { alert("⚠️ Start a battle first!"); return; }
        clearInterval(timer); timeLeft = 0; updateTimerDisplay();
        let intendedTime = parseInt(focusInput.value) || 25;
        victory(intendedTime);
        devPanel.classList.add('hidden');
    });
    document.getElementById('dev-reset').addEventListener('click', () => {
        if(confirm("Are you sure?")) { localStorage.clear(); location.reload(); }
    });

});
// 1. Add variable at the top
let isMuted = localStorage.getItem('rpg_muted') === 'true';

// 2. Update playSound to check mute
function playSound(type) {
    if (isMuted) return; // Stop if muted
    // ... existing audio code ...
}

// 3. Update updateTimerDisplay for Tab Title
function updateTimerDisplay() {
    if (!timeLeft && timeLeft !== 0) return;
    let m = Math.floor(timeLeft / 60); let s = timeLeft % 60;
    const timeString = `${m}:${s < 10 ? '0' : ''}${s}`;
    
    timerDisplay.innerText = timeString;
    
    // Update Tab Title
    if (isFighting) {
        document.title = `${timeString} - Fighting ⚔️`; 
    } else {
        document.title = "Pomodoro RPG";
    }
}

// 4. Add Listener (inside DOMContentLoaded)
const muteBtn = document.getElementById('mute-btn');
if(muteBtn) {
    muteBtn.innerText = isMuted ? "🔇 Off" : "🔊 On";
    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        localStorage.setItem('rpg_muted', isMuted);
        muteBtn.innerText = isMuted ? "🔇 Off" : "🔊 On";
    });
}
function showToast(msg, type='info') {
    const container = document.getElementById('toast-container');
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerHTML = `<span>${type==='error'?'❌':'ℹ️'}</span> ${msg}`;
    container.appendChild(div);
    setTimeout(() => {
        div.style.animation = "fadeOut 0.3s forwards";
        setTimeout(() => div.remove(), 300);
    }, 3000);
}
giveUpBtn.addEventListener('click', () => { 
    if(confirm("Are you sure? You will lose progress for this session.")) {
        playSound('click'); 
        giveUp();
    }
});