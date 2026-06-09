/**
 * API CONFIGURATION
 */
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
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    playTone(freq, type, duration) {
        if (this.muted || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) { console.error('Audio error:', e); }
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
        this.state = {
            score: 0, level: 1, stage: 1, currentQuestionIndex: 0,
            questionsInStage: 5, timeLeft: 0, timerInterval: null,
            maxTime: 15, usedQuestions: [], lifelines: { '5050': true },
            isPlaying: false, currentQuestion: null,
            isOnlineMode: false, opponentScore: 0, opponentInterval: null
        };
        
        this.ui = {
            screens: {
                loading: document.getElementById('loading-screen'),
                start: document.getElementById('start-screen'),
                mode: document.getElementById('mode-screen'),
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
                cancelMatchBtn: document.getElementById('cancel-match-btn'),
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
        if (this.ui.elements.modeSelectBtn) this.ui.elements.modeSelectBtn.addEventListener('click', () => this.showScreen('mode'));
        if (this.ui.elements.backToStartBtn) this.ui.elements.backToStartBtn.addEventListener('click', () => this.showScreen('start'));
        if (this.ui.elements.soloBtn) this.ui.elements.soloBtn.addEventListener('click', () => this.startSolo());
        if (this.ui.elements.onlineBtn) this.ui.elements.onlineBtn.addEventListener('click', () => this.startMatchmaking());
        if (this.ui.elements.cancelMatchBtn) this.ui.elements.cancelMatchBtn.addEventListener('click', () => this.cancelMatchmaking());
        
        if (this.ui.elements.muteBtnStart) this.ui.elements.muteBtnStart.addEventListener('click', () => this.toggleMute());
        if (this.ui.elements.muteBtnGame) this.ui.elements.muteBtnGame.addEventListener('click', () => this.toggleMute());
        if (this.ui.elements.btn5050) this.ui.elements.btn5050.addEventListener('click', () => this.useLifeline('5050'));
        if (this.ui.elements.nextStageBtn) this.ui.elements.nextStageBtn.addEventListener('click', () => this.nextStage());
        if (this.ui.elements.restartBtn) this.ui.elements.restartBtn.addEventListener('click', () => this.reset());
        if (this.ui.elements.retryBtn) this.ui.elements.retryBtn.addEventListener('click', () => this.fetchQuestions());
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
        if (this.ui.elements.errorMsg) this.ui.elements.errorMsg.style.display = 'none';
        if (this.ui.elements.retryBtn) this.ui.elements.retryBtn.style.display = 'none';
        
        try {
            const response = await fetch(API_URL, { cache: 'no-cache', headers: { 'Accept': 'application/json' } });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            
            this.questions = (Array.isArray(data) ? data : [])
                .map((q, idx) => ({
                    id: q.id || idx,
                    question: q.question || q.text || q.q || '',
                    correctAnswer: q.correctAnswer || q.answer || q.correct || '',
                    answers: q.answers || q.options || q.choices || []
                }))
                .filter(q => q.question && q.correctAnswer && Array.isArray(q.answers) && q.answers.length >= 2);

            if (this.questions.length === 0) throw new Error('لا توجد أسئلة صالحة');
            
            if (this.ui.elements.modeSelectBtn) this.ui.elements.modeSelectBtn.disabled = false;
            this.showScreen('start');            
        } catch (error) {
            console.error('❌ Fetch error:', error);
            if (this.ui.elements.errorMsg) {
                this.ui.elements.errorMsg.textContent = '⚠️ تعذر تحميل الأسئلة: ' + error.message;
                this.ui.elements.errorMsg.style.display = 'block';
            }
            if (this.ui.elements.retryBtn) this.ui.elements.retryBtn.style.display = 'inline-block';
            if (this.ui.elements.modeSelectBtn) this.ui.elements.modeSelectBtn.disabled = true;
        }
    }

    showScreen(name) {
        Object.values(this.ui.screens).forEach(s => { if (s) s.classList.remove('active'); });
        if (this.ui.screens[name]) this.ui.screens[name].classList.add('active');
    }

    startSolo() {
        this.state.isOnlineMode = false;
        if (this.ui.elements.opponentBar) this.ui.elements.opponentBar.style.display = 'none';
        this.initGameSession();
    }

    startMatchmaking() {
        this.showScreen('matchmaking');
        document.getElementById('match-status').textContent = 'جاري الاتصال بقاعدة البيانات والبحث...';
        
        this.matchmakingTimeout = setTimeout(() => {
            document.getElementById('match-status').textContent = 'تم العثور على لاعب منافس! بدأت المباراة...';
            setTimeout(() => {
                this.state.isOnlineMode = true;
                this.state.opponentScore = 0;
                if (this.ui.elements.opponentBar) this.ui.elements.opponentBar.style.display = 'flex';
                if (this.ui.elements.opponentScore) this.ui.elements.opponentScore.textContent = '0';
                this.initGameSession();
            }, 1000);
        }, 2500);
    }

    cancelMatchmaking() {
        if (this.matchmakingTimeout) clearTimeout(this.matchmakingTimeout);
        this.showScreen('mode');
    }

    initGameSession() {
        this.audio.init();
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
        
        this.renderQuestion(q);
        this.startTimer();
        this.updateUI();

        if (this.state.isOnlineMode) {
            this.simulateOpponentAction();
        }
    }

    simulateOpponentAction() {
        if (this.state.opponentInterval) clearInterval(this.state.opponentInterval);
        if (this.ui.elements.opponentStatus) this.ui.elements.opponentStatus.textContent = 'يفكر...';

        const processingTime = (Math.random() * 6 + 3) * 1000; // الخصم يجيب بين 3 لـ 9 ثوانٍ
        
        this.state.opponentInterval = setTimeout(() => {
            if (!this.state.isPlaying) return;
            
            const isCorrect = Math.random() > 0.25; // نسبة إجابة الخصم صحيحة هي 75%
            if (isCorrect) {
                const opponentPoints = Math.floor((100 + Math.random() * 100) * this.state.level);
                this.state.opponentScore += opponentPoints;
                if (this.ui.elements.opponentScore) this.ui.elements.opponentScore.textContent = this.state.opponentScore;
                if (this.ui.elements.opponentStatus) this.ui.elements.opponentStatus.textContent = 'أجاب بشكل صحيح! ✅';
            } else {
                if (this.ui.elements.opponentStatus) this.ui.elements.opponentStatus.textContent = 'أخطأ في الإجابة! ❌';
            }
        }, processingTime);
    }

    renderQuestion(q) {
        if (!q || !this.ui.elements.question || !this.ui.elements.options) return;
        
        this.ui.elements.question.textContent = q.question || 'سؤال غير متوفر';
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
            btn.textContent = opt.text || 'خيار';
            btn.dataset.originalIndex = opt.originalIndex;
            btn.onclick = () => this.handleAnswer(btn, opt.originalIndex === correctIdx);
            this.ui.elements.options.appendChild(btn);
        });
        if (this.state.lifelines['5050'] && this.ui.elements.btn5050) {
            this.ui.elements.btn5050.classList.remove('used');
        }
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
            if (this.ui.elements.timerText) {
                this.ui.elements.timerText.textContent = Math.ceil(this.state.timeLeft);
            }
            if (this.ui.elements.timerCircle) {
                const offset = circleCircumference - (this.state.timeLeft / totalTime) * circleCircumference;
                this.ui.elements.timerCircle.style.strokeDashoffset = offset;
            }
            if (this.state.timeLeft <= 5) {
                if (this.ui.elements.timerCircle) this.ui.elements.timerCircle.style.stroke = 'var(--danger)';
                if ([5,4,3].includes(Math.floor(this.state.timeLeft))) this.audio.playWarning();
            } else if (this.state.timeLeft <= 10) {
                if (this.ui.elements.timerCircle) this.ui.elements.timerCircle.style.stroke = 'var(--warning)';
            }
            if (this.state.timeLeft <= 0) {
                clearInterval(this.state.timerInterval);
                this.handleTimeout();
            }
        }, 100);
    }

    handleTimeout() {
        this.audio.playWrong();
        this.highlightCorrectAnswer();
        setTimeout(() => { 
            this.state.currentQuestionIndex++; 
            this.state.isPlaying = true; 
            this.nextQuestion(); 
        }, 2000);
    }

    handleAnswer(btn, isCorrect) {
        if (!this.state.isPlaying) return;        
        this.state.isPlaying = false;
        clearInterval(this.state.timerInterval);
        if (this.state.opponentInterval) clearTimeout(this.state.opponentInterval);

        if (isCorrect) {
            btn.classList.add('correct');
            this.audio.playCorrect();
            this.calculateScore();
            setTimeout(() => { 
                this.state.currentQuestionIndex++; 
                this.state.isPlaying = true; 
                this.nextQuestion(); 
            }, 1000);
        } else {
            btn.classList.add('wrong');
            this.audio.playWrong();
            this.highlightCorrectAnswer();
            setTimeout(() => this.gameOver(), 1500);
        }
    }

    highlightCorrectAnswer() {
        const q = this.state.currentQuestion;
        if (!q) return;
        const correctIdx = q.answers.indexOf(q.correctAnswer);
        const buttons = this.ui.elements.options?.querySelectorAll('.option-btn') || [];
        buttons.forEach(btn => {
            if (parseInt(btn.dataset.originalIndex) === correctIdx) btn.classList.add('correct');
        });
    }

    calculateScore() {
        const points = (100 + Math.floor(this.state.timeLeft * 10)) * this.state.level;
        this.state.score += points;
        this.state.level++;
        this.updateUI();
    }

    useLifeline(type) {
        if (type === '5050' && this.state.lifelines['5050'] && this.state.isPlaying && this.state.currentQuestion) {
            const buttons = Array.from(this.ui.elements.options?.querySelectorAll('.option-btn') || []);
            const q = this.state.currentQuestion;
            const correctIdx = q.answers.indexOf(q.correctAnswer);
            const wrongButtons = buttons.filter(b => parseInt(b.dataset.originalIndex) !== correctIdx);
            wrongButtons.sort(() => Math.random() - 0.5);
            wrongButtons.slice(0, 2).forEach(b => b.classList.add('hidden'));
            this.state.lifelines['5050'] = false;
            if (this.ui.elements.btn5050) this.ui.elements.btn5050.classList.add('used');
            this.audio.playTick();
        }
    }

    completeStage() {
        clearInterval(this.state.timerInterval);
        if (this.state.opponentInterval) clearTimeout(this.state.opponentInterval);
        this.state.isPlaying = false;
        
        const stageBonus = 500 * this.state.stage;
        this.state.score += stageBonus;
        this.state.stage++;
        this.state.currentQuestionIndex = 0;
        this.state.level = this.state.stage * 5;
        if (this.ui.elements.stageScore) this.ui.elements.stageScore.textContent = `+${stageBonus}`;
        this.audio.playStageComplete();
        this.updateUI();
        this.showScreen('stage');
    }

    nextStage() {
        this.state.isPlaying = true;
        this.showScreen('game');
        this.nextQuestion();
    }

    gameOver() {
        this.state.isPlaying = false;
        if (this.state.opponentInterval) clearTimeout(this.state.opponentInterval);

        if (this.state.isOnlineMode) {
            if (this.state.score > this.state.opponentScore) {
                this.ui.elements.gameOverTitle.textContent = '🎉 انتصرت في التحدي!';
                this.ui.elements.gameOverMsg.textContent = `لقد تغلبت على منافسك بفارق ${this.state.score - this.state.opponentScore} نقطة!`;
            } else if (this.state.score < this.state.opponentScore) {
                this.ui.elements.gameOverTitle.textContent = '📉 هزيمة!';
                this.ui.elements.gameOverMsg.textContent = `انتصر الخصم عليك بفارق ${this.state.opponentScore - this.state.score} نقطة. حظاً أوفر!`;
            } else {
                this.ui.elements.gameOverTitle.textContent = '🤝 تعادل صلب!';
                this.ui.elements.gameOverMsg.textContent = 'أنت ومنافسك أحرزتما نفس النقاط تماماً!';
            }
        } else {
            this.ui.elements.gameOverTitle.textContent = 'انتهت اللعبة';
            this.ui.elements.gameOverMsg.textContent = 'حظ أوفر في المرة القادمة!';
        }

        const currentHigh = parseInt(localStorage.getItem('quizHighScore') || 0);
        if (this.state.score > currentHigh) {
            localStorage.setItem('quizHighScore', this.state.score);
            this.loadHighScore();
        }
        if (this.ui.elements.finalScore) this.ui.elements.finalScore.textContent = this.state.score;
        if (this.ui.elements.finalHighScore) this.ui.elements.finalHighScore.textContent = localStorage.getItem('quizHighScore') || 0;
        this.showScreen('over');
    }

    reset() { 
        if (this.state.opponentInterval) clearInterval(this.state.opponentInterval);
        this.showScreen('start'); 
    }

    updateUI() {
        if (this.ui.elements.score) this.ui.elements.score.textContent = this.state.score;
        if (this.ui.elements.level) this.ui.elements.level.textContent = this.state.level;
        if (this.ui.elements.stage) this.ui.elements.stage.textContent = this.state.stage;
        if (this.ui.elements.qProgress) {
            this.ui.elements.qProgress.textContent = `${this.state.currentQuestionIndex + 1}/${this.state.questionsInStage}`;
        }
        if (this.ui.elements.stageProgress) {
            this.ui.elements.stageProgress.style.width = `${(this.state.currentQuestionIndex / this.state.questionsInStage) * 100}%`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
