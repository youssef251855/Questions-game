// استيراد الحزم الضرورية لإدارة الغرف اللحظية عبر Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove, get, off } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";

// إعدادات وبيانات الاتصال بـ Firebase الخاصة بك
const firebaseConfig = {
    apiKey: "AIzaSyCojizC_NgBVIDKxPsawKIBQwcLOgF8vRw",
    authDomain: "quran-febbe.firebaseapp.com",
    databaseURL: "https://quran-febbe-default-rtdb.firebaseio.com",
    projectId: "quran-febbe",
    storageBucket: "quran-febbe.firebasestorage.app",
    messagingSenderId: "495226832744",
    appId: "1:495226832744:web:4beca9e93a3848b0b838dd",
    measurementId: "G-TDCVSR2QLT"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const API_URL = 'https://youssef251855.github.io/Questions/questions.json';

/**
 * AUDIO MANAGER
 */
class AudioManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }
    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    toggleMute() { this.muted = !this.muted; return this.muted; }
    playTone(freq, type, duration) {
        if (this.muted || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + duration);
        } catch(e) { console.error(e); }
    }
    playCorrect() { this.playTone(600, 'sine', 0.1); setTimeout(() => this.playTone(800, 'sine', 0.2), 100); }
    playWrong() { this.playTone(150, 'sawtooth', 0.3); setTimeout(() => this.playTone(100, 'sawtooth', 0.3), 150); }
    playTick() { this.playTone(800, 'square', 0.05); }
    playWarning() { this.playTone(400, 'triangle', 0.1); setTimeout(() => this.playTone(400, 'triangle', 0.1), 150); }
    playStageComplete() { [400, 500, 600, 800].forEach((f, i) => setTimeout(() => this.playTone(f, 'sine', 0.2), i * 150)); }
}

/**
 * GAME CLASS
 */
class Game {
    constructor() {
        this.audio = new AudioManager();
        this.questions = [];
        
        // إعدادات اللاعب المؤقت والغرف
        this.playerId = "user_" + Math.random().toString(36).substr(2, 9);
        this.currentRoomCode = null;
        this.playerRole = null; 
        this.roomRef = null;

        this.state = {
            score: 0, level: 1, stage: 1, currentQuestionIndex: 0,
            questionsInStage: 5, timeLeft: 0, timerInterval: null,
            maxTime: 25, usedQuestions: [], lifelines: { '5050': true },
            isPlaying: false, currentQuestion: null,
            isOnlineMode: false, opponentScore: 0
        };
        
        this.ui = {
            screens: {
                loading: document.getElementById('loading-screen'),
                start: document.getElementById('start-screen'),
                mode: document.getElementById('mode-screen'),
                lobby: document.getElementById('online-lobby-screen'),
                matchmaking: document.getElementById('matchmaking-screen'),
                game: document.getElementById('game-screen'),
                stage: document.getElementById('stage-screen'),
                over: document.getElementById('game-over-screen')
            },
            elements: {
                score: document.getElementById('score-display'),
                level: document.getElementById('level-display'),
                stage: document.getElementById('stage-display'),
                qProgress: document.getElementById('q-progress-display'),
                stageProgress: document.getElementById('stage-progress-bar'),
                question: document.getElementById('question-text'),
                options: document.getElementById('options-container'),
                timerText: document.getElementById('timer-text'),
                timerCircle: document.getElementById('timer-circle'),
                highScore: document.getElementById('high-score-display'),
                finalScore: document.getElementById('final-score'),
                finalHighScore: document.getElementById('final-high-score'),
                stageScore: document.getElementById('stage-score'),
                btn5050: document.getElementById('btn-5050'),
                modeSelectBtn: document.getElementById('mode-select-btn'),
                soloBtn: document.getElementById('solo-btn'),
                onlineBtn: document.getElementById('online-btn'),
                backToStartBtn: document.getElementById('back-to-start-btn'),
                createRoomBtn: document.getElementById('create-room-btn'),
                joinRoomBtn: document.getElementById('join-room-btn'),
                roomCodeInput: document.getElementById('room-code-input'),
                backToModeBtn: document.getElementById('back-to-mode-btn'),
                displayRoomCode: document.getElementById('display-room-code'),
                cancelMatchBtn: document.getElementById('cancel-match-btn'),
                waitingTitle: document.getElementById('waiting-screen-title'),
                waitingDesc: document.getElementById('waiting-screen-desc'),
                matchStatus: document.getElementById('match-status'),
                opponentBar: document.getElementById('opponent-bar'),
                opponentScore: document.getElementById('opponent-score'),
                opponentStatus: document.getElementById('opponent-status'),
                gameOverTitle: document.getElementById('game-over-title'),
                gameOverMsg: document.getElementById('game-over-msg'),
                muteBtnStart: document.getElementById('mute-btn-start'),
                muteBtnGame: document.getElementById('mute-btn-game'),
                nextStageBtn: document.getElementById('next-stage-btn'),
                restartBtn: document.getElementById('restart-btn'),
                retryBtn: document.getElementById('retry-btn'),
                errorMsg: document.getElementById('error-msg')
            }
        };

        this.bindEvents();
        this.loadHighScore();
        this.fetchQuestions();
    }

    bindEvents() {
        this.ui.elements.modeSelectBtn?.addEventListener('click', () => this.showScreen('mode'));
        this.ui.elements.backToStartBtn?.addEventListener('click', () => this.showScreen('start'));
        this.ui.elements.soloBtn?.addEventListener('click', () => this.startSolo());
        this.ui.elements.onlineBtn?.addEventListener('click', () => this.showScreen('lobby'));
        this.ui.elements.backToModeBtn?.addEventListener('click', () => this.showScreen('mode'));
        this.ui.elements.createRoomBtn?.addEventListener('click', () => this.handleCreateRoom());
        this.ui.elements.joinRoomBtn?.addEventListener('click', () => this.handleJoinRoom());
        this.ui.elements.cancelMatchBtn?.addEventListener('click', () => this.handleLeaveRoom());
        this.ui.elements.muteBtnStart?.addEventListener('click', () => this.toggleMute());
        this.ui.elements.muteBtnGame?.addEventListener('click', () => this.toggleMute());
        this.ui.elements.btn5050?.addEventListener('click', () => this.useLifeline('5050'));
        this.ui.elements.nextStageBtn?.addEventListener('click', () => this.nextStage());
        this.ui.elements.restartBtn?.addEventListener('click', () => this.reset());
        this.ui.elements.retryBtn?.addEventListener('click', () => this.fetchQuestions());
    }

    loadHighScore() {
        const hs = localStorage.getItem('quizHighScore') || 0;
        if (this.ui.elements.highScore) this.ui.elements.highScore.textContent = hs;
    }

    toggleMute() {
        this.audio.init();
        const isMuted = this.audio.toggleMute();
        const txt = isMuted ? '🔇 كتم الصوت' : '🔊 الصوت مفعل';
        if (this.ui.elements.muteBtnStart) this.ui.elements.muteBtnStart.textContent = txt;
        if (this.ui.elements.muteBtnGame) this.ui.elements.muteBtnGame.textContent = isMuted ? '🔇' : '🔊';
        this.audio.playTick();
    }

    async fetchQuestions() {
        this.showScreen('loading');
        try {
            const response = await fetch(API_URL, { cache: 'no-cache' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            this.questions = data.map((q, idx) => ({
                id: q.id || idx,
                question: q.question || q.text || q.q || '',
                correctAnswer: q.correctAnswer || q.answer || q.correct || '',
                answers: q.answers || q.options || q.choices || []
            })).filter(q => q.question && q.correctAnswer && q.answers.length >= 2);
            this.showScreen('start');            
        } catch (error) {
            this.ui.elements.errorMsg.textContent = '⚠️ تعذر تحميل الأسئلة: ' + error.message;
            this.ui.elements.errorMsg.style.display = 'block';
            this.ui.elements.retryBtn.style.display = 'inline-block';
        }
    }

    showScreen(name) {
        Object.values(this.ui.screens).forEach(s => s?.classList.remove('active'));
        this.ui.screens[name]?.classList.add('active');
    }

    startSolo() {
        this.state.isOnlineMode = false;
        if (this.ui.elements.opponentBar) this.ui.elements.opponentBar.style.display = 'none';
        this.initGameSession();
    }

    async handleCreateRoom() {
        this.audio.init();
        const roomCode = Math.floor(10000 + Math.random() * 90000).toString();
        this.currentRoomCode = roomCode;
        this.playerRole = 'creator';
        this.state.isOnlineMode = true;

        this.ui.elements.waitingTitle.textContent = "تم إنشاء الغرفة!";
        this.ui.elements.waitingDesc.textContent = "شارك هذا الكود المكون من 5 أرقام مع منافسك:";
        this.ui.elements.displayRoomCode.textContent = roomCode;
        this.ui.elements.matchStatus.textContent = "في انتظار دخول اللاعب الآخر...";
        this.showScreen('matchmaking');

        this.roomRef = ref(db, 'rooms/' + roomCode);

        await set(this.roomRef, {
            creatorId: this.playerId,
            joinerId: '',
            status: 'waiting',
            creatorScore: 0,
            joinerScore: 0,
            lastUpdatedBy: ''
        });

        onValue(this.roomRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            if (data.status === 'waiting' && data.joinerId !== '') {
                update(this.roomRef, { status: 'playing' });
            }

            if (data.status === 'playing') {
                if (!this.state.isPlaying && this.ui.screens.matchmaking.classList.contains('active')) {
                    this.setupOnlineGameBoard();
                }
                const oppScore = this.playerRole === 'creator' ? data.joinerScore : data.creatorScore;
                this.state.opponentScore = oppScore;
                if (this.ui.elements.opponentScore) this.ui.elements.opponentScore.textContent = oppScore;
                if (data.lastUpdatedBy && data.lastUpdatedBy !== this.playerId) {
                    if (this.ui.elements.opponentStatus) this.ui.elements.opponentStatus.textContent = "أجاب بشكل صحيح! 🔥";
                }
            }

            if (data.status === 'opponent_left') {
                this.handleOpponentDisconnected();
            }
        });
    }

    async handleJoinRoom() {
        this.audio.init();
        const roomCode = this.ui.elements.roomCodeInput.value.trim();
        if (!roomCode) { alert("من فضلك أدخل كود الغرفة أولاً!"); return; }

        const checkRef = ref(db, 'rooms/' + roomCode);
        const snapshot = await get(checkRef);
        
        if (!snapshot.exists()) {
            alert("عذراً، كود الغرفة هذا غير موجود!");
            return;
        }

        const data = snapshot.val();
        if (data.status !== 'waiting' || data.joinerId !== '') {
            alert("هذه الغرفة ممتلئة باللاعبين أو بدأت بالفعل!");
            return;
        }

        this.currentRoomCode = roomCode;
        this.playerRole = 'joiner';
        this.state.isOnlineMode = true;
        this.roomRef = checkRef;

        this.ui.elements.waitingTitle.textContent = "جاري الاتصال بالغرفة...";
        this.ui.elements.waitingDesc.textContent = "كود الغرفة المتصل بها:";
        this.ui.elements.displayRoomCode.textContent = roomCode;
        this.ui.elements.matchStatus.textContent = "جاري مزامنة اللعبة...";
        this.showScreen('matchmaking');

        await update(this.roomRef, { joinerId: this.playerId });

        onValue(this.roomRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            if (data.status === 'playing') {
                if (!this.state.isPlaying && this.ui.screens.matchmaking.classList.contains('active')) {
                    this.setupOnlineGameBoard();
                }
                const oppScore = this.playerRole === 'creator' ? data.joinerScore : data.creatorScore;
                this.state.opponentScore = oppScore;
                if (this.ui.elements.opponentScore) this.ui.elements.opponentScore.textContent = oppScore;
                if (data.lastUpdatedBy && data.lastUpdatedBy !== this.playerId) {
                    if (this.ui.elements.opponentStatus) this.ui.elements.opponentStatus.textContent = "أجاب بشكل صحيح! 🔥";
                }
            }

            if (data.status === 'opponent_left') {
                this.handleOpponentDisconnected();
            }
        });
    }

    setupOnlineGameBoard() {
        if (this.ui.elements.opponentBar) this.ui.elements.opponentBar.style.display = 'flex';
        if (this.ui.elements.opponentScore) this.ui.elements.opponentScore.textContent = '0';
        if (this.ui.elements.opponentStatus) this.ui.elements.opponentStatus.textContent = 'متصل وجاهز';
        this.initGameSession();
    }

    async syncScoreToFirebase() {
        if (!this.state.isOnlineMode || !this.roomRef) return;
        const updates = { lastUpdatedBy: this.playerId };
        if (this.playerRole === 'creator') {
            updates.creatorScore = this.state.score;
        } else {
            updates.joinerScore = this.state.score;
        }
        await update(this.roomRef, updates);
    }

    async handleLeaveRoom() {
        clearInterval(this.state.timerInterval);
        this.state.isPlaying = false;
        if (this.roomRef) {
            await update(this.roomRef, { status: 'opponent_left' });
            off(this.roomRef);
            if (this.playerRole === 'creator') {
                setTimeout(() => { remove(this.roomRef); }, 1000);
            }
        }
        this.currentRoomCode = null;
        this.roomRef = null;
        this.showScreen('mode');
    }

    handleOpponentDisconnected() {
        clearInterval(this.state.timerInterval);
        this.state.isPlaying = false;
        if (this.roomRef) off(this.roomRef);

        if (this.ui.elements.gameOverTitle) this.ui.elements.gameOverTitle.textContent = '🏆 فوز تلقائي!';
        if (this.ui.elements.gameOverMsg) this.ui.elements.gameOverMsg.textContent = 'لقد غادر منافسك الغرفة، تم إعلان فوزك بالتحدي!';
        if (this.ui.elements.finalScore) this.ui.elements.finalScore.textContent = this.state.score;
        this.showScreen('over');
    }

    initGameSession() {
        this.state = {
            ...this.state,
            score: 0, level: 1, stage: 1, currentQuestionIndex: 0,
            questionsInStage: 5, timeLeft: 0, timerInterval: null,
            maxTime: 15, usedQuestions: [], lifelines: { '5050': true },
            isPlaying: true, currentQuestion: null
        };
        this.updateUI();
        if (this.ui.elements.btn5050) this.ui.elements.btn5050.classList.remove('used');
        this.showScreen('game');
        this.nextQuestion();
    }

    getAdaptiveTime() { return Math.max(5, 15 - (this.state.level * 0.5)); }

    getRandomQuestion() {
        const availableIndices = this.questions
            .map((_, idx) => idx)
            .filter(idx => !this.state.usedQuestions.includes(idx));
        
        if (availableIndices.length === 0) { 
            this.state.usedQuestions = []; 
            return this.getRandomQuestion(); 
        }
        const randomIdx = Math.floor(Math.random() * availableIndices.length);
        const questionIndex = availableIndices[randomIdx];
        const question = this.questions[questionIndex];
        
        this.state.usedQuestions.push(questionIndex);
        return { ...question, _originalIndex: questionIndex };
    }

    nextQuestion() {
        if (!this.state.isPlaying) return;
        if (this.state.currentQuestionIndex >= this.state.questionsInStage) { 
            this.completeStage(); 
            return; 
        }

        const q = this.getRandomQuestion();
        if (!q) return;
        
        this.state.currentQuestion = q;
        this.state.maxTime = this.getAdaptiveTime();
        this.state.timeLeft = this.state.maxTime;
        
        if (this.ui.elements.opponentStatus && this.state.isOnlineMode) {
            this.ui.elements.opponentStatus.textContent = "يفكر بالسؤال... 🤔";
        }

        this.renderQuestion(q);
        this.startTimer();
        this.updateUI();
    }

    renderQuestion(q) {
        if (!q || !this.ui.elements.question || !this.ui.elements.options) return;
        this.ui.elements.question.textContent = q.question;
        this.ui.elements.options.innerHTML = '';
        
        const correctIdx = q.answers.indexOf(q.correctAnswer);
        let optionsWithIndex = q.answers.map((opt, idx) => ({ text: opt, originalIndex: idx }));
        
        for (let i = optionsWithIndex.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [optionsWithIndex[i], optionsWithIndex[j]] = [optionsWithIndex[j], optionsWithIndex[i]];
        }
        
        optionsWithIndex.forEach((opt) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = opt.text;
            btn.dataset.originalIndex = opt.originalIndex;
            btn.onclick = () => this.handleAnswer(btn, opt.originalIndex === correctIdx);
            this.ui.elements.options.appendChild(btn);
        });
    }

    startTimer() {
        if (this.state.timerInterval) clearInterval(this.state.timerInterval);
        const totalTime = this.state.maxTime;
        const circleCircumference = 2 * Math.PI * 36;
        
        if (this.ui.elements.timerCircle) {
            this.ui.elements.timerCircle.style.strokeDashoffset = 0;
            this.ui.elements.timerCircle.style.stroke = 'var(--success)';
        }
        
        this.state.timerInterval = setInterval(() => {
            this.state.timeLeft -= 0.1;
            if (this.ui.elements.timerText) this.ui.elements.timerText.textContent = Math.ceil(this.state.timeLeft);
            
            if (this.ui.elements.timerCircle) {
                const offset = circleCircumference - (this.state.timeLeft / totalTime) * circleCircumference;
                this.ui.elements.timerCircle.style.strokeDashoffset = offset;
            }
            if (this.state.timeLeft <= 5) {
                if (this.ui.elements.timerCircle) this.ui.elements.timerCircle.style.stroke = 'var(--danger)';
                if ([5,4,3].includes(Math.floor(this.state.timeLeft))) this.audio.playWarning();
            } else if (this.state.timeLeft <= 10) {
              
