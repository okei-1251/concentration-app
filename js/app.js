// ==========================================
// 1. 音源・実験条件の設定 
// ==========================================
const AUDIO_CONDITION = {
    mozart: 'audio/mozart.mp3',
    bach: 'audio/bach.mp3',
    debussy: 'audio/debussy.mp3',
    rain: 'audio/rain.mp3',
    noise528: 'audio/528hz_noise.mp3'
};

let currentAudio = new Audio();
currentAudio.loop = true; // シームレスなループ再生

// ライセンス画面へ移動
function goToLicense() {
    showScreen('screen-license');
}

function returnToTutorial() {
    showScreen('screen-tutorial');
}

// --- 実験データ管理マネージャー ---
const ExperimentDataManager = {
    data: {
        userEmail: "",
        selectedSound: "",
        baselineResults: {
            score: { correct: 0, total: 0 },
            logs: []
        },
        normalResults: {
            score: { correct: 0, total: 0 },
            logs: []
        },
        startedAt: null,
        finishedAt: null
    },

    init() {
        this.data.startedAt = new Date().toISOString();
        this.data.userEmail = localStorage.getItem('userEmail') || "";
        this.data.selectedSound = localStorage.getItem('selectedSound') || "none";
    },

    addLog(mode, round, testType, question, expected, userAnswer, isCorrect, responseTimeMs) {
        const logEntry = {
            round: round,
            testType: testType,
            question: question,
            expected: expected,
            userAnswer: userAnswer,
            isCorrect: isCorrect,
            responseTimeMs: responseTimeMs,
            timestamp: new Date().toISOString()
        };

        if (mode === 'baseline') {
            this.data.baselineResults.logs.push(logEntry);
            if (isCorrect) this.data.baselineResults.score.correct++;
            this.data.baselineResults.score.total++;
        } else {
            this.data.normalResults.logs.push(logEntry);
            if (isCorrect) this.data.normalResults.score.correct++;
            this.data.normalResults.score.total++;
        }
    },

    saveToLocalStorage() {
        localStorage.setItem('latestExperimentData', JSON.stringify(this.data));
    }, 

    sendToGoogleForm() {
        this.data.finishedAt = new Date().toISOString();
        
        const calculateStats = (logs) => {
            const result = {};
            ['N-Back', 'Calculation', 'Stroop'].forEach(type => {
                const typeLogs = logs.filter(l => l.testType === type);
                const correctCount = typeLogs.filter(l => l.isCorrect).length;
                const total = typeLogs.length;
                const validTimes = typeLogs.filter(l => l.responseTimeMs !== null).map(l => l.responseTimeMs);
                const avgRt = validTimes.length > 0 ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 0;
                result[type] = {
                    scoreStr: `${correctCount}/${total}`,
                    accuracy: total > 0 ? (correctCount / total * 100).toFixed(1) + '%' : '0%',
                    avgRtMs: avgRt + 'ms'
                };
            });
            return result;
        };

        const baselineStats = calculateStats(this.data.baselineResults.logs);
        const normalStats = calculateStats(this.data.normalResults.logs);

        const payload = {
            Email: this.data.userEmail,
            Sound: this.data.selectedSound,
            Baseline_NBack: `${baselineStats['N-Back'].scoreStr} (${baselineStats['N-Back'].avgRtMs})`,
            Baseline_Calc: `${baselineStats['Calculation'].scoreStr} (${baselineStats['Calculation'].avgRtMs})`,
            Baseline_Stroop: `${baselineStats['Stroop'].scoreStr} (${baselineStats['Stroop'].avgRtMs})`,
            Normal_NBack: `${normalStats['N-Back'].scoreStr} (${normalStats['N-Back'].avgRtMs})`,
            Normal_Calc: `${normalStats['Calculation'].scoreStr} (${normalStats['Calculation'].avgRtMs})`,
            Normal_Stroop: `${normalStats['Stroop'].scoreStr} (${normalStats['Stroop'].avgRtMs})`,
            StartedAt: this.data.startedAt,
            FinishedAt: this.data.finishedAt
        };

        const GAS_URL = "https://script.google.com/macros/s/AKfycbwmuIAIGbvALyAYg0dKjzSKdOrlqX2UF5Cv3sRFhHW-ANAQWdG9HYfgmR_wcBVXHWO2/exec"; 

        fetch(GAS_URL, {
            method: 'POST',
            mode: 'no-cors', // CORS制限回避用
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        })
        .then(() => {
            console.log("スプレッドシートへデータを直接送信しました。");
        })
        .catch(error => {
            console.error("送信エラー:", error);
        });
    }
};

// --- 画面切り替えの管理 ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    }
}

function goToLogin() {
    showScreen('screen-login');
}

function handleLogin() {
    const emailInput = document.getElementById('user-email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) {
        console.warn("メールアドレスが未入力です。");
        return;
    }
    localStorage.setItem('userEmail', email);
    ExperimentDataManager.init();

    const completedBaselineKey = `baseline_completed_${email}`;
    const isBaselineCompleted = localStorage.getItem(completedBaselineKey);

    if (isBaselineCompleted) {
        showScreen('screen-sound-select');
    } else {
        startConcentrationTestMode('baseline');
    }
}

// ==========================================
// 2. 音源選択・再生開始（10分間ロック）
// ==========================================
let lockTimerId = null;
let lockTimeRemaining = 600; // 10分

function startSoundPlay() {
    const soundSelect = document.getElementById('sound-select');
    if (soundSelect) {
        const selectedKey = soundSelect.value;
        localStorage.setItem('selectedSound', selectedKey);
        ExperimentDataManager.data.selectedSound = selectedKey;

        // 音声の再生処理
        stopExperimentAudio();
        const audioSrc = AUDIO_CONDITION[selectedKey];
        if (audioSrc) {
            currentAudio.src = audioSrc;
            currentAudio.volume = 0.5;
            currentAudio.play().catch(error => {
                console.warn("自動再生がブロックされました:", error);
            });
        }
    }
    showScreen('screen-home');
    startLockTimer();
}

function stopExperimentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }
}

function startLockTimer() {
    const btnConcentration = document.getElementById('btn-concentration');

    if (btnConcentration) btnConcentration.classList.add('locked');
    lockTimeRemaining = 600;

    if (lockTimerId) clearInterval(lockTimerId);

    lockTimerId = setInterval(() => {
        if (lockTimeRemaining > 0) {
            lockTimeRemaining--;
            let mins = Math.floor(lockTimeRemaining / 60);
            let secs = lockTimeRemaining % 60;
            const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            
            if (btnConcentration) {
                btnConcentration.innerText = `集中測定に進む (残り ${timeStr})`;
            }
        } else {
            clearInterval(lockTimerId);
            if (btnConcentration) {
                btnConcentration.innerText = "集中測定に進む";
                btnConcentration.classList.remove('locked');
            }
        }
    }, 1000);
}

function stopAndReturnToSoundSelect() {
    clearInterval(lockTimerId);
    stopExperimentAudio();
    showScreen('screen-sound-select');
}

function goToConcentrationTest() {
    const btnConcentration = document.getElementById('btn-concentration');
    if (btnConcentration && btnConcentration.classList.contains('locked')) {
        return;
    }
    startConcentrationTestMode('normal');
}

let currentExecutingTest = null;

function showTestInstruction(testName, bodyHtml, nextAction) {
    showScreen('screen-test');

    document.getElementById('nback-game').style.display = 'none';
    document.getElementById('calc-game').style.display = 'none';
    document.getElementById('stroop-game').style.display = 'none';
    document.getElementById('screen-test-result').style.display = 'none';

    const titleEl = document.getElementById('test-title');
    if (titleEl) titleEl.innerText = testName;

    const instructionScreen = document.getElementById('test-instruction-screen');
    const instructionBody = document.getElementById('test-instruction-body');
    
    instructionBody.innerHTML = bodyHtml;
    instructionScreen.style.display = 'block';

    currentExecutingTest = nextAction;
}

function startCurrentTestAfterInstruction() {
    document.getElementById('test-instruction-screen').style.display = 'none';
    if (typeof currentExecutingTest === 'function') {
        currentExecutingTest();
    }
}

// --- 各種テスト結果を表示する共通関数 ---
let nextStepCallback = null;

function showTestResultScreen(testTypeName, mode, nextActionCallback) {
    showScreen('screen-test');
    document.getElementById('test-instruction-screen').style.display = 'none';
    document.getElementById('nback-game').style.display = 'none';
    document.getElementById('calc-game').style.display = 'none';
    document.getElementById('stroop-game').style.display = 'none';

    const resultScreen = document.getElementById('screen-test-result');
    resultScreen.style.display = 'block';

    document.getElementById('result-test-name').innerText = `${testTypeName} の結果`;

    const logs = mode === 'baseline' ? ExperimentDataManager.data.baselineResults.logs : ExperimentDataManager.data.normalResults.logs;
    const testLogs = logs.filter(l => l.testType === testTypeName);

    const total = testLogs.length;
    const correctCount = testLogs.filter(l => l.isCorrect).length;
    const accuracy = total > 0 ? (correctCount / total * 100).toFixed(1) + '%' : '0%';
    
    const validTimes = testLogs.filter(l => l.responseTimeMs !== null).map(l => l.responseTimeMs);
    const avgRt = validTimes.length > 0 ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) + 'ms' : '0ms';
    
    const timeoutCount = testLogs.filter(l => l.userAnswer === 'TIMEOUT').length;

    document.getElementById('res-accuracy').innerText = accuracy;
    document.getElementById('res-avg-rt').innerText = avgRt;
    document.getElementById('res-score').innerText = `${correctCount} / ${total} 問`;
    document.getElementById('res-timeout').innerText = `${timeoutCount} 回`;

    nextStepCallback = nextActionCallback;
}

function proceedToNextStep() {
    document.getElementById('screen-test-result').style.display = 'none';
    if (typeof nextStepCallback === 'function') {
        nextStepCallback();
    }
}

// ==========================================
// --- Nバックテスト（3-back / 9ターゲット） ---
// ==========================================
const NBackTest = {
    totalTrials: 24,
    nBack: 3,
    displayDuration: 900,
    intervalDuration: 600,
    
    currentTrial: 0,
    sequence: [],
    userResponded: false,
    startTime: 0,
    currentMode: 'baseline',
    currentRound: 1,

    start(mode = 'baseline', round = 1) {
        this.currentMode = mode;
        this.currentRound = round;

        const titleText = mode === 'baseline' ? '【基準値測定】Nバックテスト' : '【集中測定】Nバックテスト';
        const instructionHtml = `
            <h3>Nバックテスト (3-back) の手順</h3>
            <p>・3x3のマス目のどこかに青いマスが一瞬点灯します。</p>
            <p>・<strong>「今点灯した場所」が「3つ前に点灯した場所」と同じ</strong>場合のみ、「同じ」ボタンを押してください。</p>
            <p>・全24回行われます。準備ができたらスタートを押してください。</p>
        `;

        showTestInstruction(titleText, instructionHtml, () => {
            this.runActualTest();
        });
    },

    runActualTest() {
        this.currentTrial = 0;
        this.sequence = [];
        this.generateSequence();

        showScreen('screen-test');
        
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const existingMsg = document.getElementById('test-complete-msg');
        if (existingMsg) existingMsg.remove();

        const countdownElem = document.getElementById('nback-countdown');
        const gameElem = document.getElementById('nback-game');
        const matchBtnElem = document.getElementById('nback-match-btn');

        if (countdownElem) countdownElem.style.display = 'block';
        if (gameElem) gameElem.style.display = 'none';
        if (matchBtnElem) matchBtnElem.style.display = 'block';

        this.runCountdown(() => {
            if (countdownElem) countdownElem.style.display = 'none';
            if (gameElem) gameElem.style.display = 'block';
            this.nextTrial();
        });

        if (matchBtnElem) {
            matchBtnElem.onclick = (e) => {
                e.preventDefault();
                this.handleUserResponse();
            };
        }
    },

    runCountdown(callback) {
        const cdElem = document.getElementById('nback-countdown');
        if (!cdElem) return callback();
        let count = 3;
        cdElem.textContent = count;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                cdElem.textContent = count;
            } else {
                clearInterval(interval);
                callback();
            }
        }, 1000);
    },

    generateSequence() {
        this.sequence = [];
        for (let i = 0; i < this.nBack; i++) {
            this.sequence.push(Math.floor(Math.random() * 9));
        }

        const remainingTrials = this.totalTrials - this.nBack;
        const targetCount = 9;

        let flags = [];
        for (let i = 0; i < targetCount; i++) flags.push(true);
        for (let i = 0; i < (remainingTrials - targetCount); i++) flags.push(false);

        for (let i = flags.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [flags[i], flags[j]] = [flags[j], flags[i]];
        }

        for (let i = 0; i < remainingTrials; i++) {
            const trialIdx = i + this.nBack;
            if (flags[i]) {
                this.sequence.push(this.sequence[trialIdx - this.nBack]);
            } else {
                let randPos;
                do {
                    randPos = Math.floor(Math.random() * 9);
                } while (randPos === this.sequence[trialIdx - this.nBack]);
                this.sequence.push(randPos);
            }
        }
    },

    nextTrial() {
        if (this.currentTrial >= this.totalTrials) {
            this.finishTest();
            return;
        }

        const progressElem = document.getElementById('nback-progress');
        if (progressElem) {
            progressElem.textContent = `${this.currentTrial + 1} / ${this.totalTrials} 試行・3バック`;
        }

        const matchBtn = document.getElementById('nback-match-btn');
        if (matchBtn) {
            matchBtn.textContent = "同じ";
            matchBtn.classList.remove('recorded');
        }
        this.userResponded = false;

        const activeIndex = this.sequence[this.currentTrial];
        const cells = document.querySelectorAll('.grid-cell');
        
        if (cells[activeIndex]) {
            cells[activeIndex].classList.add('active');
        }
        this.startTime = performance.now();

        setTimeout(() => {
            if (cells[activeIndex]) {
                cells[activeIndex].classList.remove('active');
            }

            setTimeout(() => {
                this.evaluateAndLog();
                this.currentTrial++;
                this.nextTrial();
            }, this.intervalDuration);

        }, this.displayDuration);
    },

    handleUserResponse() {
        if (this.userResponded) return;
        this.userResponded = true;

        const matchBtn = document.getElementById('nback-match-btn');
        if (matchBtn) {
            matchBtn.textContent = "記録しました";
            matchBtn.classList.add('recorded');
        }
    },

    evaluateAndLog() {
        const isTarget = (this.currentTrial >= this.nBack) && 
                         (this.sequence[this.currentTrial] === this.sequence[this.currentTrial - this.nBack]);

        let isCorrect = (isTarget && this.userResponded) || (!isTarget && !this.userResponded);
        const responseTimeMs = this.userResponded ? Math.round(performance.now() - this.startTime) : null;

        ExperimentDataManager.addLog(
            this.currentMode,
            this.currentRound,
            "N-Back",
            `Trial ${this.currentTrial + 1} (Pos: ${this.sequence[this.currentTrial]})`,
            isTarget ? "MATCH" : "NO_MATCH",
            this.userResponded ? "MATCH" : "NO_MATCH",
            isCorrect,
            responseTimeMs
        );
    },

    finishTest() {
        document.getElementById('nback-game').style.display = 'none';
        showTestResultScreen("N-Back", this.currentMode, () => {
            CalcTest.start(this.currentMode, this.currentRound);
        });
    }
};

// ==========================================
// --- 計算テスト（4択 / 5秒制限 / 10問） ---
// ==========================================
const CalcTest = {
    totalQuestions: 20,
    timeLimitMs: 5000,
    currentQuestion: 0,
    questions: [],
    
    timerId: null,
    barIntervalId: null,
    startTime: 0,
    userResponded: false,
    currentMode: 'baseline',
    currentRound: 1,

    start(mode = 'baseline', round = 1) {
        this.currentMode = mode;
        this.currentRound = round;

        const titleText = mode === 'baseline' ? '【基準値測定】計算テスト' : '【集中測定】計算テスト';
        const instructionHtml = `
            <h3>計算テスト (全10問) の手順</h3>
            <p>・2桁の足し算または引き算が表示されます。</p>
            <p>・<strong>1問につき5秒以内</strong>に正しい答えのボタンをタップしてください。</p>
            <p>・時間切れになると自動で次の問題に進みます。</p>
        `;

        showTestInstruction(titleText, instructionHtml, () => {
            this.runActualTest();
        });
    },

    runActualTest() {
        this.currentQuestion = 0;
        this.generateQuestions();

        document.getElementById('calc-game').style.display = 'block';

        const buttons = document.querySelectorAll('.calc-btn');
        buttons.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const selectedVal = parseInt(btn.textContent, 10);
                this.handleResponse(selectedVal);
            };
        });

        this.nextQuestion();
    },

    generateQuestions() {
        this.questions = [];
        for (let i = 0; i < this.totalQuestions; i++) {
            const isAddition = Math.random() < 0.5;
            let a, b, answer;
            
            if (isAddition) {
                a = Math.floor(Math.random() * 40) + 15;
                b = Math.floor(Math.random() * 40) + 15;
                answer = a + b;
            } else {
                a = Math.floor(Math.random() * 50) + 45;
                b = Math.floor(Math.random() * 30) + 15;
                answer = a - b;
            }

            let distractors = new Set();
            distractors.add(answer + 10);
            distractors.add(answer - 10);
            distractors.add(answer + 1);
            distractors.add(answer - 1);
            distractors.add(answer + 9);
            distractors.add(answer - 9);

            let distArray = Array.from(distractors).filter(d => d !== answer && d > 0);
            distArray.sort(() => Math.random() - 0.5);

            let options = [answer, distArray[0], distArray[1], distArray[2]];
            options.sort(() => Math.random() - 0.5);

            this.questions.push({
                text: `${a} ${isAddition ? '+' : '-'} ${b} = ?`,
                answer: answer,
                options: options
            });
        }
    },

    nextQuestion() {
        if (this.currentQuestion >= this.totalQuestions) {
            this.finishTest();
            return;
        }

        this.userResponded = false;
        const q = this.questions[this.currentQuestion];

        document.getElementById('calc-progress').textContent = `${this.currentQuestion + 1} / ${this.totalQuestions} 問`;
        document.getElementById('calc-question').textContent = q.text;

        const buttons = document.querySelectorAll('.calc-btn');
        buttons.forEach((btn, idx) => {
            btn.textContent = q.options[idx];
            btn.disabled = false;
        });

        this.startTime = performance.now();
        this.startTimerBar();

        this.timerId = setTimeout(() => {
            this.handleTimeout();
        }, this.timeLimitMs);
    },

    startTimerBar() {
        const bar = document.getElementById('calc-timer-bar');
        if (!bar) return;
        bar.style.width = '100%';
        let elapsed = 0;
        const step = 100;

        if (this.barIntervalId) clearInterval(this.barIntervalId);

        this.barIntervalId = setInterval(() => {
            elapsed += step;
            let percentage = Math.max(0, 100 - (elapsed / this.timeLimitMs) * 100);
            bar.style.width = percentage + '%';
            if (elapsed >= this.timeLimitMs) {
                clearInterval(this.barIntervalId);
            }
        }, step);
    },

    handleResponse(userAnswer) {
        if (this.userResponded) return;
        this.userResponded = true;

        clearTimeout(this.timerId);
        clearInterval(this.barIntervalId);

        const responseTimeMs = Math.round(performance.now() - this.startTime);
        const currentQ = this.questions[this.currentQuestion];
        const isCorrect = (userAnswer === currentQ.answer);

        ExperimentDataManager.addLog(
            this.currentMode,
            this.currentRound,
            "Calculation",
            currentQ.text,
            currentQ.answer.toString(),
            userAnswer.toString(),
            isCorrect,
            responseTimeMs
        );

        this.currentQuestion++;
        this.nextQuestion();
    },

    handleTimeout() {
        if (this.userResponded) return;
        this.userResponded = true;

        clearInterval(this.barIntervalId);

        const currentQ = this.questions[this.currentQuestion];

        ExperimentDataManager.addLog(
            this.currentMode,
            this.currentRound,
            "Calculation",
            currentQ.text,
            currentQ.answer.toString(),
            "TIMEOUT",
            false,
            null
        );

        this.currentQuestion++;
        this.nextQuestion();
    },

    finishTest() {
        document.getElementById('calc-game').style.display = 'none';
        showTestResultScreen("Calculation", this.currentMode, () => {
            StroopTest.start(this.currentMode, this.currentRound);
        });
    }
};

// ==========================================
// --- ストループテスト（全20問 / 6色 / 5秒制限） ---
// ==========================================
let retryAllowed = true;
let baselineRetryAllowed = true;

const StroopTest = {
    totalTrials: 20,
    timeLimitMs: 5000,
    currentTrial: 0,
    trials: [],
    timerId: null,
    barIntervalId: null,
    startTime: 0,
    userResponded: false,
    currentMode: 'baseline',
    currentRound: 1,

    colors: [
        { name: '赤', code: '#ff1900' },
        { name: '青', code: '#0039f4' },
        { name: '緑', code: '#19d600' },
        { name: '黄', code: '#edf50d' },
        { name: '紫', code: '#7700a6' },
        { name: '橙', code: '#d77607' }
    ],

    start(mode = 'baseline', round = 1) {
        this.currentMode = mode;
        this.currentRound = round;

        const titleText = mode === 'baseline' ? '【基準値測定】ストループテスト' : '【集中測定】ストループテスト';
        const instructionHtml = `
            <h3>ストループテスト (全20問) の手順</h3>
            <p>・文字が表示されます（例：「あお」）。</p>
            <p>・<strong>文字の意味ではなく、「表示されている文字の色」</strong>のボタンを選んでタップしてください。</p>
            <p>・<strong>1問につき5秒以内</strong>に回答してください。</p>
            <p>・ボタンの位置は毎問シャッフルされます。</p>
        `;

        showTestInstruction(titleText, instructionHtml, () => {
            this.runActualTest();
        });
    },

    runActualTest() {
        this.currentTrial = 0;
        this.generateTrials();

        const countdownElem = document.getElementById('nback-countdown');
        const stroopGameElem = document.getElementById('stroop-game');

        if (countdownElem) countdownElem.style.display = 'block';
        if (stroopGameElem) stroopGameElem.style.display = 'none';

        this.runCountdown(() => {
            if (countdownElem) countdownElem.style.display = 'none';
            if (stroopGameElem) stroopGameElem.style.display = 'block';
            this.nextTrial();
        });
    },

    runCountdown(callback) {
        const cdElem = document.getElementById('nback-countdown');
        if (!cdElem) return callback();
        let count = 3;
        cdElem.textContent = count;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                cdElem.textContent = count;
            } else {
                clearInterval(interval);
                callback();
            }
        }, 1000);
    },

    generateTrials() {
        this.trials = [];
        let trialPool = [];
        for (let i = 0; i < this.totalTrials; i++) {
            const textObj = this.colors[i % this.colors.length];
            let colorObj;
            if (Math.random() < 0.8) {
                const otherColors = this.colors.filter(c => c.name !== textObj.name);
                colorObj = otherColors[Math.floor(Math.random() * otherColors.length)];
            } else {
                colorObj = textObj;
            }
            trialPool.push({
                text: textObj.name,
                colorName: colorObj.name,
                colorCode: colorObj.code
            });
        }
        for (let i = trialPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [trialPool[i], trialPool[j]] = [trialPool[j], trialPool[i]];
        }
        this.trials = trialPool;
    },

    nextTrial() {
        if (this.currentTrial >= this.totalTrials) {
            this.finishTest();
            return;
        }

        this.userResponded = false;
        const current = this.trials[this.currentTrial];

        document.getElementById('stroop-progress').textContent = `${this.currentTrial + 1} / ${this.totalTrials} 問`;

        const targetEl = document.getElementById('stroop-target');
        targetEl.textContent = current.text;
        targetEl.style.color = current.colorCode;

        let shuffledColors = [...this.colors];
        shuffledColors.sort(() => Math.random() - 0.5);

        const buttons = document.querySelectorAll('.stroop-btn');
        buttons.forEach((btn, idx) => {
            const colorInfo = shuffledColors[idx];
            btn.textContent = colorInfo.name;
            btn.onclick = (e) => {
                e.preventDefault();
                this.handleResponse(colorInfo.name);
            };
        });

        this.startTime = performance.now();
        this.startTimerBar();

        this.timerId = setTimeout(() => {
            this.handleTimeout();
        }, this.timeLimitMs);
    },

    startTimerBar() {
        const bar = document.getElementById('stroop-timer-bar');
        if (!bar) return;
        bar.style.width = '100%';
        let elapsed = 0;
        const step = 100;

        if (this.barIntervalId) clearInterval(this.barIntervalId);

        this.barIntervalId = setInterval(() => {
            elapsed += step;
            let percentage = Math.max(0, 100 - (elapsed / this.timeLimitMs) * 100);
            bar.style.width = percentage + '%';
            if (elapsed >= this.timeLimitMs) {
                clearInterval(this.barIntervalId);
            }
        }, step);
    },

    handleResponse(selectedColorName) {
        if (this.userResponded) return;
        this.userResponded = true;

        clearTimeout(this.timerId);
        clearInterval(this.barIntervalId);

        const responseTimeMs = Math.round(performance.now() - this.startTime);
        const current = this.trials[this.currentTrial];
        const isCorrect = (selectedColorName === current.colorName);

        ExperimentDataManager.addLog(
            this.currentMode,
            this.currentRound,
            "Stroop",
            `Text: ${current.text}, Color: ${current.colorName}`,
            current.colorName,
            selectedColorName,
            isCorrect,
            responseTimeMs
        );

        this.currentTrial++;
        this.nextTrial();
    },

    handleTimeout() {
        if (this.userResponded) return;
        this.userResponded = true;

        clearInterval(this.barIntervalId);

        const current = this.trials[this.currentTrial];

        ExperimentDataManager.addLog(
            this.currentMode,
            this.currentRound,
            "Stroop",
            `Text: ${current.text}, Color: ${current.colorName}`,
            current.colorName,
            "TIMEOUT",
            false,
            null
        );

        this.currentTrial++;
        this.nextTrial();
    },

    finishTest() {
        document.getElementById('stroop-game').style.display = 'none';
        showTestResultScreen("Stroop", this.currentMode, () => {
            this.finalizeAllTests();
        });
    },

    finalizeAllTests() {
        if (this.currentMode !== 'baseline') {
            ExperimentDataManager.saveToLocalStorage();
            ExperimentDataManager.sendToGoogleForm();
        }

        const testTitle = document.getElementById('test-title');
        if (testTitle) {
            testTitle.innerText = this.currentMode === 'baseline' ? '基準値測定完了' : '集中測定完了';
        }

        const testScreen = document.getElementById('screen-test');
        let existingMsg = document.getElementById('test-complete-msg');
        if (existingMsg) existingMsg.remove();

        const msgDiv = document.createElement('div');
        msgDiv.id = 'test-complete-msg';
        msgDiv.style.textAlign = 'center';
        msgDiv.style.padding = '20px';

        if (this.currentMode === 'baseline') {
            const userEmail = ExperimentDataManager.data.userEmail;
            if (userEmail) {
                localStorage.setItem(`baseline_completed_${userEmail}`, 'true');
            }

            let retryBaselineButtonHtml = '';
            if (baselineRetryAllowed) {
                retryBaselineButtonHtml = `<button class="btn-settings" onclick="retryBaselineTest()" style="margin-top: 15px; background-color: #e67e22; width: 100%;">1回だけ再測定する</button><br>`;
            }

            msgDiv.innerHTML = `
                <p style="font-size: 20px; color: #27ae60; font-weight: bold; margin: 20px 0;">基準値測定が完了しました！</p>
                ${retryBaselineButtonHtml}
                <button class="btn-main" onclick="finishBaselineToSound()" style="margin-top: 15px;">音源選択画面に進む</button>
            `;
        } else {
            let retryButtonHtml = '';
            if (retryAllowed) {
                retryButtonHtml = `<button class="btn-settings" onclick="retryConcentrationTest()" style="margin-top: 15px; background-color: #e67e22; width: 100%;">1回だけ再測定する</button><br>`;
            }

            msgDiv.innerHTML = `
                <p style="font-size: 20px; color: #27ae60; font-weight: bold; margin: 20px 0;">集中測定が完了しました！データが自動送信されました。</p>
                ${retryButtonHtml}
                <button class="btn-main" onclick="goToFeedbackForm()" style="margin-top: 15px;">フィードバック（Googleフォーム）へ進む</button>
            `;
        }
        testScreen.appendChild(msgDiv);
    }
};

function retryBaselineTest() {
    if (!baselineRetryAllowed) return;
    baselineRetryAllowed = false;
    
    ExperimentDataManager.data.baselineResults = { score: { correct: 0, total: 0 }, logs: [] };
    startConcentrationTestMode('baseline');
}

function retryConcentrationTest() {
    if (!retryAllowed) return;
    retryAllowed = false;
    
    ExperimentDataManager.data.normalResults = { score: { correct: 0, total: 0 }, logs: [] };
    startConcentrationTestMode('normal');
}

function startConcentrationTestMode(mode) {
    NBackTest.start(mode, 1);
}

function finishBaselineToSound() {
    showScreen('screen-sound-select');
}

function goToFeedbackForm() {
    stopExperimentAudio(); // 音声を停止

    // ローカルストレージまたは ExperimentDataManager からユーザーIDを取得
    const userEmail = localStorage.getItem('userEmail') || ExperimentDataManager.data.userEmail || '';

    // /u/2/ などのアカウント指定を省いたクリーンなベースURL
    const baseUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfFaxyFl_JGlTo5LUmdFj9sEzv0HmEw-xbm4f_qv3wZ1Xr-aA/viewform';
    
    // 先ほど特定したログインID用のエントリーID
    const entryId = 'entry.757322391';
    const encodedEmail = encodeURIComponent(userEmail);

    // 最終的なURLを組み立てる（プレフィル用パラメータ付与）
    const finalUrl = `${baseUrl}?usp=pp_url&${entryId}=${encodedEmail}`;

    // 別タブで開く
    window.open(finalUrl, '_blank');
}

// --- 作業用タイマーのロジック ---
let workTimerId = null;
let timerCurrentSeconds = 0;
let isTimerRunning = false;
let currentTimerMode = 'up';

let timerPhase = 'work';
let currentSet = 1;
let maxSets = 1;
let workSecondsTotal = 0;
let breakSecondsTotal = 0;

function validatePositiveInput(input) {
    let val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
        input.value = 0;
        val = 0;
    }
    
    if (input.id === 'set-count') {
        maxSets = parseInt(val) || 1;
    }

    if (!isTimerRunning) {
        updateTimerSettingsPreview();
    }
}

function updateTimerSettingsPreview() {
    const wMin = parseInt(document.getElementById('work-min')?.value) || 0;
    const wSec = parseInt(document.getElementById('work-sec')?.value) || 0;
    const workTotal = (wMin * 60) + wSec;

    const setEl = document.getElementById('set-count');
    if (setEl) {
        maxSets = parseInt(setEl.value) || 1;
    }

    if (currentTimerMode === 'up') {
        timerCurrentSeconds = 0;
    } else if (currentTimerMode === 'down' || currentTimerMode === 'break') {
        timerCurrentSeconds = workTotal;
    }
    updateTimerDisplay();
}

function switchTimerMode() {
    if (isTimerRunning) {
        return;
    }
    const radios = document.getElementsByName('timer-mode');
    for (let r of radios) {
        if (r.checked) currentTimerMode = r.value;
    }

    const breakSetting = document.getElementById('setting-break');
    const setsSetting = document.getElementById('setting-sets');
    const workGroup = document.getElementById('setting-work');

    if (breakSetting) breakSetting.style.display = (currentTimerMode === 'break') ? 'block' : 'none';
    if (setsSetting) setsSetting.style.display = (currentTimerMode === 'break') ? 'block' : 'none';
    if (workGroup) workGroup.style.display = (currentTimerMode === 'up') ? 'none' : 'block';

    resetWorkTimer();
}

function toggleWorkTimer() {
    const btn = document.getElementById('timer-control-btn');
    if (!isTimerRunning) {
        if (!initTimerValues()) return;

        try {
            const unlockAudio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
            unlockAudio.volume = 0.0;
            unlockAudio.play().catch(e => console.log("音声アンロック:", e));
        } catch (e) {}

        isTimerRunning = true;
        if (btn) {
            btn.innerText = "一時停止";
            btn.style.backgroundColor = "#e74c3c";
        }
        workTimerId = setInterval(runTimerTick, 1000);
    } else {
        clearInterval(workTimerId);
        isTimerRunning = false;
        if (btn) {
            btn.innerText = "再開";
            btn.style.backgroundColor = "#27ae60";
        }
    }
}

function initTimerValues() {
    if (timerCurrentSeconds > 0 && isTimerRunning === false) {
        return true;
    }

    const wMinEl = document.getElementById('work-min');
    const wSecEl = document.getElementById('work-sec');
    const wMin = wMinEl ? parseInt(wMinEl.value) || 0 : 0;
    const wSec = wSecEl ? parseInt(wSecEl.value) || 0 : 0;
    workSecondsTotal = (wMin * 60) + wSec;

    if (currentTimerMode === 'up') {
        timerCurrentSeconds = 0;
    } else if (currentTimerMode === 'down') {
        if (workSecondsTotal <= 0) return false;
        timerCurrentSeconds = workSecondsTotal;
    } else if (currentTimerMode === 'break') {
        const bMinEl = document.getElementById('break-min');
        const bSecEl = document.getElementById('break-sec');
        const setEl = document.getElementById('set-count');
        const bMin = bMinEl ? parseInt(bMinEl.value) || 0 : 0;
        const bSec = bSecEl ? parseInt(bSecEl.value) || 0 : 0;
        
        breakSecondsTotal = (bMin * 60) + bSec;
        maxSets = setEl ? parseInt(setEl.value) || 1 : 1;

        if (workSecondsTotal <= 0 || breakSecondsTotal <= 0 || maxSets <= 0) return false;

        timerPhase = 'work';
        currentSet = 1;
        timerCurrentSeconds = workSecondsTotal;
    }
    updateTimerDisplay();
    return true;
}

function runTimerTick() {
    if (currentTimerMode === 'up') {
        timerCurrentSeconds++;
        updateTimerDisplay();
    } else if (currentTimerMode === 'down') {
        if (timerCurrentSeconds > 0) {
            timerCurrentSeconds--;
            updateTimerDisplay();
            if (timerCurrentSeconds === 0) playTimerAlarm();
        } else {
            clearInterval(workTimerId);
            isTimerRunning = false;
            resetWorkTimer();
        }
    } else if (currentTimerMode === 'break') {
        if (timerCurrentSeconds > 0) {
            timerCurrentSeconds--;
            updateTimerDisplay();
            if (timerCurrentSeconds === 0) playTimerAlarm();
        } else {
            if (timerPhase === 'work') {
                if (currentSet >= maxSets) {
                    clearInterval(workTimerId);
                    isTimerRunning = false;
                    resetWorkTimer();
                    return;
                } else {
                    timerPhase = 'break';
                    const bMin = parseInt(document.getElementById('break-min')?.value) || 0;
                    const bSec = parseInt(document.getElementById('break-sec')?.value) || 0;
                    breakSecondsTotal = (bMin * 60) + bSec;
                    timerCurrentSeconds = breakSecondsTotal > 0 ? breakSecondsTotal : 1;
                }
            } else if (timerPhase === 'break') {
                timerPhase = 'work';
                currentSet++;
                const wMin = parseInt(document.getElementById('work-min')?.value) || 0;
                const wSec = parseInt(document.getElementById('work-sec')?.value) || 0;
                workSecondsTotal = (wMin * 60) + wSec;
                timerCurrentSeconds = workSecondsTotal > 0 ? workSecondsTotal : 1;
            }
            updateTimerDisplay();
        }
    }
}

function updateTimerDisplay() {
    let m = Math.floor(timerCurrentSeconds / 60);
    let s = timerCurrentSeconds % 60;
    let timeString = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const displayEl = document.getElementById('work-timer-display');
    if (displayEl) displayEl.innerText = timeString;

    const homeDisplayEl = document.getElementById('home-timer-display');
    if (homeDisplayEl) homeDisplayEl.innerText = timeString;

    const phaseDisplay = document.getElementById('timer-phase-display');
    const homePhaseDisplay = document.getElementById('home-timer-phase');
    
    let phaseText = '';
    if (currentTimerMode === 'break' && isTimerRunning) {
        const setEl = document.getElementById('set-count');
        let currentMaxSets = setEl ? parseInt(setEl.value) || maxSets : maxSets;
        phaseText = timerPhase === 'work' ? `【作業中】 (セット ${currentSet} / ${currentMaxSets})` : `【休憩中】 (セット ${currentSet} / ${currentMaxSets})`;
    }

    if (phaseDisplay) phaseDisplay.innerText = phaseText;
    if (homePhaseDisplay) homePhaseDisplay.innerText = phaseText;
}

function playTimerAlarm() {
    try {
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audio.play();
    } catch (e) {
        console.log("音声再生エラー", e);
    }
}

function resetWorkTimer() {
    clearInterval(workTimerId);
    isTimerRunning = false;
    timerCurrentSeconds = 0;
    timerPhase = 'work';
    currentSet = 1;
    
    const btn = document.getElementById('timer-control-btn');
    if (btn) {
        btn.innerText = "タイマー開始";
        btn.style.backgroundColor = "#27ae60";
    }

    const setEl = document.getElementById('set-count');
    if (setEl) maxSets = parseInt(setEl.value) || 1;

    if (currentTimerMode === 'down' || currentTimerMode === 'break') {
        const wMinEl = document.getElementById('work-min');
        const wSecEl = document.getElementById('work-sec');
        const wMin = wMinEl ? parseInt(wMinEl.value) || 0 : 0;
        const wSec = wSecEl ? parseInt(wSecEl.value) || 0 : 0;
        timerCurrentSeconds = (wMin * 60) + wSec;
    }
    updateTimerDisplay();
}

function goToTimerSettings() {
    showScreen('screen-timer');
    switchTimerMode();
    if (!isTimerRunning) resetWorkTimer();
}

function showTutorial() {
    showScreen('screen-tutorial');
}

function returnToHome() {
    showScreen('screen-home');
}

// 起動時初期化
document.addEventListener('DOMContentLoaded', () => {
    showScreen('screen-tutorial');
    switchTimerMode();
});