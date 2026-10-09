(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const data = window.CAREER_LADDER_DATA;
  if (!data || !data.traits || !Array.isArray(data.jobs)) {
    console.error('Career Ladder data failed to load.');
    return;
  }

  const ui = {
    content: $('#content'), speech: $('#speech-text'), avatar: $('#avatar'), phase: $('#phase-label'),
    timer: $('#timer'), timerWrap: $('#timer-wrap'), round: $('#round-label'), questions: $('#question-count'),
    possible: $('#possible-count'), best: $('#best-guess'), progress: $('#progress-bar'), progressText: $('#progress-caption'),
    climb: $('#climb-fill'), streak: $('#streak'), save: $('#save-status'), sound: $('#sound-toggle'), tip: $('#tip-text')
  };
  const ANSWERS = ['Yes', 'No', 'I Don’t Know', 'Probably', 'Probably Not'];
  const ANSWER_LIKELIHOOD = [
    [.70, .03], // Yes: probability given a matching / non-matching job profile
    [.03, .70], // No
    [.08, .08], // I don't know: deliberately carries almost no evidence
    [.16, .03], // Probably
    [.03, .16]  // Probably not
  ];
  const LIMIT_SECONDS = 300;
  const ROUND_SIZE = 10;
  const OVERTIME_SECONDS = 60;
  const OUTBOX_KEY = 'career-ladder-outbox-v2';
  const VOTER_KEY = 'career-ladder-voter-v2';
  const traits = data.traits;
  const questionBank = Object.entries(traits).flatMap(([trait, phrasings]) => phrasings.map((text, index) => ({
    id: `${trait}-${index + 1}`, trait, text: `Is it true that your job ${text}?`
  })));
  const openingPrompts = [
    { id: 'broad-digital', trait: 'broad-digital', tags: ['computer', 'technology', 'media', 'words', 'design', 'research', 'numbers'], phrases: ['Is your job mainly digital or computer-based?', 'Would you describe your work as mostly digital?'] },
    { id: 'broad-technical', trait: 'broad-technical', tags: ['technology', 'tools', 'machinery', 'science', 'computer', 'architecture'], phrases: ['Does your job involve technical systems or specialist tools?', 'Would you describe your work as technical?'] },
    { id: 'broad-people', trait: 'broad-people', tags: ['people', 'customer', 'care', 'education', 'communication', 'hospitality', 'social', 'sales'], phrases: ['Do you work directly with people most days?', 'Is your job mainly people-facing?'] },
    { id: 'broad-hands-on', trait: 'broad-hands-on', tags: ['outdoors', 'physical', 'tools', 'build', 'agriculture', 'animals', 'driving', 'travel'], phrases: ['Is much of your work hands-on or outdoors?', 'Do you spend a lot of time doing practical work away from a desk?'] }
  ];
  const uniqueJobs = [...new Map(data.jobs.map(([name, tags]) => [name.toLowerCase(), {
    name, tags: new Set(tags.split(' ').filter(Boolean))
  }])).values()];

  const state = {
    screen: 'welcome', answers: [], guesses: [], used: new Set(), current: null,
    candidates: [], eliminatedGuesses: new Set(), seconds: LIMIT_SECONDS, elapsedSeconds: 0, timerId: null,
    locked: true, streak: 0, gameId: '', openingQuestions: [], lastGuessAt: 0,
    audio: null, audioOn: false, musicId: null
  };

  const uuid = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    return [...bytes].map((b, i) => `${[4, 6, 8, 10].includes(i) ? '-' : ''}${b.toString(16).padStart(2, '0')}`).join('');
  };
  const shuffled = (items) => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  };
  const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  const clockText = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  function setPhase(label) { ui.phase.textContent = label; }
  function setFace(expression = 'neutral') {
    ui.avatar.className = `avatar avatar-${expression}`;
  }
  function say(text, expression = 'neutral') {
    setFace(expression);
    ui.speech.textContent = text;
  }
  function setSaveState(kind, text) {
    ui.save.classList.toggle('offline', kind === 'offline');
    ui.save.classList.toggle('error', kind === 'error');
    ui.save.replaceChildren(document.createElement('i'), document.createTextNode(` ${text}`));
  }

  function baseCandidates() {
    return uniqueJobs.filter((job) => !state.eliminatedGuesses.has(job.name.toLowerCase()))
      .map((job) => ({ job, score: 0, probability: 1 }));
  }
  function resetRun() {
    stopTimer();
    state.answers = []; state.guesses = []; state.used = new Set(); state.current = null;
    state.eliminatedGuesses = new Set(); state.candidates = baseCandidates();
    state.seconds = LIMIT_SECONDS; state.elapsedSeconds = 0; state.lastGuessAt = 0;
    state.openingQuestions = []; state.locked = true; state.streak = 0; state.gameId = uuid();
    $('#timer').textContent = '05:00'; ui.timerWrap.classList.remove('active', 'low');
    ui.questions.textContent = '0'; ui.possible.textContent = String(uniqueJobs.length); ui.best.textContent = '—';
    ui.streak.textContent = '★ 0'; ui.climb.style.width = '0%';
    setFace('neutral');
    document.querySelectorAll('.mission-list li').forEach((item, i) => {
      item.classList.toggle('mission-active', i === 0); item.classList.remove('mission-done');
    });
    updateStats();
  }

  function showWelcome() {
    resetRun(); state.screen = 'welcome'; setPhase('WELCOME'); ui.round.textContent = 'READY PLAYER?';
    say('Welcome to the Career Ladder. Pick a job and keep it secret.', 'neutral');
    ui.content.innerHTML = `<div class="welcome-layout"><div class="welcome-copy"><h2>Climb the ladder.<br><span class="title-mark">Keep your job a secret.</span></h2><p>I’ll compare ${uniqueJobs.length.toLocaleString()} jobs. Start with broad clues, then get a fresh best guess every ten questions. You have five minutes, with extra time available if you need it.</p></div><button class="primary-btn" id="start-game" type="button">Start game →</button></div>`;
    $('#start-game').addEventListener('click', startGame);
  }

  function startGame() {
    resetRun();
    state.audioOn = true;
    setSoundButton(); startMusic();
    showJobGate();
  }

  function showJobGate() {
    state.screen = 'gate'; state.locked = true; setPhase('QUICK CHECK'); ui.round.textContent = 'LEVEL 01 · JOB CHECK';
    say('Hope you don’t have to hold your bladder, ’cause it’s time for the Career Ladder!', 'happy');
    ui.content.innerHTML = `<div class="question-wrap"><div class="question-meta"><span class="q-count">CHECKPOINT 01</span><span>·</span><span>ONE QUICK QUESTION</span></div><h2 class="question-title">Do you have a job?</h2><p class="question-sub">Think of a current job, a dream job, or any job you know well.</p><div class="guess-actions"><button class="primary-btn" id="job-yes" type="button">Yes — let’s play</button><button class="secondary-btn" id="job-no" type="button">No</button></div></div>`;
    $('#job-yes').addEventListener('click', beginQuestions);
    $('#job-no').addEventListener('click', showNoJob);
  }

  function showNoJob() {
    stopTimer(); state.screen = 'no-job'; setPhase('NEED A JOB');
    say('Ahhh! You need a job for this one.', 'sad');
    ui.content.innerHTML = `<div class="result-panel"><h2 class="result-title">Ahhh! You need a job for this one.</h2><p class="result-copy">Come back when you have a current job, a dream job, or a job you want me to guess.</p><div class="action-row"><button class="primary-btn" id="back-to-welcome" type="button">Back to start</button></div></div>`;
    $('#back-to-welcome').addEventListener('click', showWelcome);
  }

  function beginQuestions() {
    state.screen = 'question'; state.locked = false; state.answers = []; state.guesses = [];
    state.used.clear(); state.eliminatedGuesses.clear(); state.candidates = baseCandidates();
    state.openingQuestions = openingPrompts.map((prompt) => ({
      id: prompt.id, trait: prompt.trait, tags: prompt.tags,
      text: prompt.phrases[Math.floor(Math.random() * prompt.phrases.length)]
    }));
    state.openingQuestions = shuffled(state.openingQuestions);
    document.querySelectorAll('.mission-list li').forEach((item, i) => {
      item.classList.toggle('mission-active', i === 1); if (i === 0) item.classList.add('mission-done');
    });
    askNext();
  }

  function normalizeCandidates() {
    if (!state.candidates.length) return;
    const max = Math.max(...state.candidates.map((candidate) => candidate.score));
    const weights = state.candidates.map((candidate) => Math.exp(Math.max(-30, candidate.score - max)));
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    state.candidates.forEach((candidate, i) => { candidate.probability = weights[i] / total; });
    state.candidates.sort((a, b) => b.probability - a.probability);
  }

  function jobMatches(job, question) {
    const tags = question.tags || [question.trait];
    return tags.some((tag) => job.tags.has(tag));
  }

  function questionInformation(question) {
    let yes = 0;
    for (const candidate of state.candidates) if (jobMatches(candidate.job, question)) yes += candidate.probability;
    if (yes <= 0 || yes >= 1) return 0;
    const likelihoods = ANSWER_LIKELIHOOD.map(([givenMatch, givenNoMatch]) => ({
      givenMatch, givenNoMatch, probability: yes * givenMatch + (1 - yes) * givenNoMatch
    }));
    const entropy = (probabilities) => -probabilities.reduce((sum, probability) =>
      probability > 0 ? sum + probability * Math.log2(probability) : sum, 0);
    const outcomeEntropy = entropy(likelihoods.map((item) => item.probability));
    const responseEntropy = (matched) => entropy(likelihoods.map((item) => matched ? item.givenMatch : item.givenNoMatch));
    return outcomeEntropy - yes * responseEntropy(true) - (1 - yes) * responseEntropy(false);
  }

  function chooseQuestion() {
    const answeredTraits = new Set(state.answers.map((answer) => answer.trait));
    const seenTraits = new Set(questionBank.filter((question) => state.used.has(question.id)).map((question) => question.trait));
    const available = questionBank.filter((question) => !state.used.has(question.id)
      && !answeredTraits.has(question.trait) && !seenTraits.has(question.trait));
    if (!available.length) return null;
    const recentTraits = new Set(state.answers.slice(-3).map((answer) => answer.trait));
    let pool = available.filter((question) => !recentTraits.has(question.trait));
    if (!pool.length) pool = available;
    const fresh = pool.filter((question) => !state.answers.some((answer) => answer.trait === question.trait));
    if (fresh.length) pool = fresh;
    const ranked = pool.map((question) => ({ question, score: questionInformation(question) }))
      .sort((a, b) => b.score - a.score);
    const bestScore = ranked[0]?.score || 0;
    const best = ranked.filter((entry) => entry.score >= bestScore - 0.1);
    const bestTraits = [...new Set(best.map((entry) => entry.question.trait))];
    const chosenTrait = bestTraits[Math.floor(Math.random() * bestTraits.length)];
    const variants = best.filter((entry) => entry.question.trait === chosenTrait);
    return variants[Math.floor(Math.random() * variants.length)]?.question || ranked[0]?.question || null;
  }

  function askNext() {
    if (state.screen !== 'question') return;
    normalizeCandidates();
    if (!state.candidates.length) { showSavePrompt('player_won', ''); return; }
    if (state.answers.length > 0 && state.answers.length % ROUND_SIZE === 0 && state.lastGuessAt < state.answers.length) {
      state.lastGuessAt = state.answers.length;
      showGuess(state.candidates[0]); return;
    }
    const opening = state.openingQuestions.find((prompt) => !state.used.has(prompt.id));
    const question = opening || chooseQuestion();
    if (!question) { showSavePrompt('player_won', ''); return; }
    state.current = question; state.used.add(question.id); renderQuestion(question);
  }

  function renderQuestion(question) {
    state.screen = 'question'; state.current = question; state.locked = false;
    setPhase('YOUR TURN'); ui.round.textContent = `LEVEL 02 · QUESTION ${String(state.answers.length + 1).padStart(2, '0')}`;
    say('Choose the answer that fits best. I’m listening.', 'curious');
    ui.timer.textContent = clockText(state.seconds); ui.timerWrap.classList.add('active');
    ui.timerWrap.classList.toggle('low', state.seconds <= 20); startTimer();
    ui.content.innerHTML = `<div class="question-wrap"><div class="question-meta"><span class="q-count">QUESTION ${String(state.answers.length + 1).padStart(2, '0')}</span><span>·</span><span>${state.candidates.length.toLocaleString()} JOBS ON THE MAP</span></div><h2 class="question-title">${esc(question.text)}</h2><p class="question-sub">Pick the closest answer. “Probably” and “I don’t know” still count.</p><div class="answers">${ANSWERS.map((answer, i) => `<button class="answer-btn" type="button" data-answer="${i}">${esc(answer)}</button>`).join('')}</div><div class="question-actions"><button class="text-button" id="go-back" type="button">← Go back</button><span class="answer-chip">TIMER RUNNING</span></div></div>`;
    ui.content.querySelectorAll('.answer-btn').forEach((button) => button.addEventListener('click', () => handleAnswer(Number(button.dataset.answer), question)));
    $('#go-back').addEventListener('click', goBack);
  }

  function handleAnswer(index, question) {
    if (state.locked || state.screen !== 'question' || question.id !== state.current?.id) return;
    const answer = ANSWERS[index];
    if (!answer) return;
    state.locked = true; stopTimer();
    state.answers.push({ id: question.id, trait: question.trait, tags: question.tags, question: question.text, answer, at: new Date().toISOString() });
    const likelihood = ANSWER_LIKELIHOOD[index];
    for (const candidate of state.candidates) {
      const match = jobMatches(candidate.job, question);
      candidate.score += Math.log(match ? likelihood[0] : likelihood[1]);
    }
    normalizeCandidates(); state.streak++; ui.streak.textContent = `★ ${state.streak}`;
    ui.climb.style.width = `${Math.min(100, Math.round(state.answers.length / 25 * 100))}%`;
    say(answer === 'No' ? 'Got it. I’ll take another route.' : 'Nice, that helps narrow it down.', answer === 'No' ? 'thinking' : 'happy');
    updateStats(); askNext();
  }

  function rebuildCandidates() {
    state.candidates = baseCandidates();
    for (const answer of state.answers) {
      const answerIndex = ANSWERS.indexOf(answer.answer);
      const likelihood = ANSWER_LIKELIHOOD[answerIndex];
      for (const candidate of state.candidates) {
        const match = jobMatches(candidate.job, answer);
        candidate.score += Math.log(match ? likelihood[0] : likelihood[1]);
      }
    }
    normalizeCandidates();
  }

  function goBack() {
    if (state.screen !== 'question' || state.locked) return;
    stopTimer();
    if (!state.answers.length) { showJobGate(); return; }
    const previous = state.answers.pop();
    // Keep its ID marked used: Go Back lets the player change the old answer,
    // but the selector must not ask that same clue again later in the run.
    state.current = questionBank.find((question) => question.id === previous.id)
      || state.openingQuestions.find((question) => question.id === previous.id)
      || { ...previous, text: previous.question };
    state.used.add(previous.id); rebuildCandidates();
    state.lastGuessAt = Math.floor(state.answers.length / ROUND_SIZE) * ROUND_SIZE;
    state.seconds = Math.min(LIMIT_SECONDS, state.seconds + 8);
    state.streak = Math.max(0, state.streak - 1); ui.streak.textContent = `★ ${state.streak}`;
    renderQuestion(state.current); updateStats();
  }

  function showGuess(candidate) {
    if (!candidate) { showSavePrompt('player_won', ''); return; }
    stopTimer(); state.screen = 'guess'; state.locked = true; setPhase('FINAL GUESS'); ui.round.textContent = 'BOSS LEVEL · FINAL GUESS';
    document.querySelectorAll('.mission-list li').forEach((item, i) => {
      item.classList.toggle('mission-active', i === 2); if (i < 2) item.classList.add('mission-done');
    });
    say(`I’ve compared your clues. My best match is ${candidate.job.name}. Is that it?`, 'curious');
    ui.content.innerHTML = `<div class="question-wrap"><div class="question-meta"><span class="q-count">GUESS AFTER ${state.answers.length} QUESTIONS</span><span>·</span><span>${Math.round(candidate.probability * 100)}% MATCH SCORE</span></div><h2 class="question-title guess-title">Is your job <span class="title-mark">${esc(candidate.job.name)}</span>?</h2><p class="question-sub">If I missed, I’ll rule it out and use your next clues to improve the match.</p><div class="guess-actions"><button class="primary-btn" id="guess-yes" type="button">Yes, that’s it</button><button class="secondary-btn" id="guess-no" type="button">No, keep going</button></div><div class="question-actions"><button class="text-button" id="go-back" type="button">← Go back</button><span class="answer-chip">${state.answers.length} CLUES COLLECTED</span></div></div>`;
    $('#guess-yes').addEventListener('click', () => showSavePrompt('guessed', candidate.job.name));
    $('#guess-no').addEventListener('click', () => {
      state.eliminatedGuesses.add(candidate.job.name.toLowerCase());
      state.guesses.push({ id: `guess-${candidate.job.name.toLowerCase()}`, trait: 'guess', question: `Is your job ${candidate.job.name}?`, answer: 'No', at: new Date().toISOString() });
      state.candidates = state.candidates.filter((item) => item.job.name !== candidate.job.name);
      state.screen = 'question'; state.locked = false;
      updateStats();
      if (!state.candidates.length) { showSavePrompt('player_won', ''); return; }
      askNext();
    });
    $('#go-back').addEventListener('click', () => {
      state.screen = 'question'; state.locked = false;
      if (state.answers.length) goBack(); else showJobGate();
    });
  }

  function showTimeUp() {
    stopTimer(); state.screen = 'time-up'; state.locked = true; setPhase('TIME BOOST');
    ui.timer.textContent = '00:00'; ui.timerWrap.classList.remove('active');
    say('Clock’s up, but your run isn’t over. Want another minute or should I make a guess?', 'thinking');
    ui.content.innerHTML = `<div class="result-panel"><h2 class="result-title">Time for a breather?</h2><p class="result-copy">Your clues are saved for this round. Add a minute to keep playing, or let me take my best shot now.</p><div class="action-row"><button class="primary-btn" id="add-minute" type="button">Add one minute</button><button class="secondary-btn" id="guess-now" type="button">Make a guess</button></div></div>`;
    $('#add-minute').addEventListener('click', () => {
      state.seconds = OVERTIME_SECONDS; state.screen = 'question'; state.locked = false;
      renderQuestion(state.current);
    });
    $('#guess-now').addEventListener('click', () => showGuess(state.candidates[0]));
  }

  function showSavePrompt(outcome, guessedJob) {
    stopTimer(); state.screen = 'save'; state.locked = true; setPhase('SAVE YOUR RUN'); ui.round.textContent = outcome === 'guessed' ? 'BOT WINS · SCORECARD' : 'YOU WIN · SCORECARD';
    const won = outcome === 'player_won';
    say(won ? 'Alright, you win! What job did I miss, and what name should I put on the scorecard?' : `Nailed it! I guessed ${guessedJob}. What name should I put on the scorecard?`, won ? 'happy' : 'happy');
    const prompt = won ? `<input class="text-input" name="job" id="job-input" maxlength="80" placeholder="What’s your job?" autocomplete="organization-title" required>` : `<div class="answer-recap">Job guessed: <strong>${esc(guessedJob)}</strong></div>`;
    ui.content.innerHTML = `<div class="result-panel"><h2 class="result-title">${won ? 'You beat the bot!' : 'I got it!'}</h2><p class="result-copy">${won ? 'Tell me what job I missed and what name to put on the scorecard.' : 'You got guessed. Add a name to save this run and its answers.'}</p><form id="save-form"><div class="input-row">${prompt}<input class="text-input" name="name" id="name-input" maxlength="50" placeholder="Your name or nickname" autocomplete="nickname" required></div><label class="privacy-note"><input type="checkbox" name="save-consent" required> I understand my name, job, and answers will be saved to the game database.</label><div class="action-row"><button class="primary-btn" type="submit">Save scorecard</button><span class="save-status">${state.answers.length + state.guesses.length + 1} answers to save</span></div><div class="mistake" id="form-error" role="alert"></div></form></div>`;
    $('#save-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const job = won ? $('#job-input').value.trim() : guessedJob;
      const name = $('#name-input').value.trim();
      if (!job || !name) {
        $('#form-error').textContent = !job ? 'Add the job name before saving.' : 'Add a name or nickname before saving.';
        return;
      }
      finishGame(outcome, job, name);
    });
    updateStats();
  }

  function finishGame(outcome, job, name) {
    stopTimer(); state.screen = 'finished'; state.locked = true;
    const cleanJob = job.trim().replace(/\s+/g, ' ').slice(0, 80);
    const playerName = name.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 50);
    const normalizedJob = cleanJob.toLocaleLowerCase();
    const allAnswers = [
      { id: 'job-check', trait: 'gate', question: 'Do you have a job?', answer: 'Yes', at: new Date().toISOString() },
      ...state.answers, ...state.guesses
    ];
    const game = {
      id: state.gameId, nickname: playerName, submitted_job: cleanJob,
      normalized_job: normalizedJob, outcome, question_count: allAnswers.length,
      answers: allAnswers, elapsed_seconds: Math.min(3600, state.elapsedSeconds),
      created_at: new Date().toISOString()
    };
    const vote = { job_key: normalizedJob, voter_id: getVoterId() };
    say(outcome === 'guessed' ? `I guessed ${cleanJob}. Nice round, ${playerName}!` : `Victory, ${playerName}! The ladder learned ${cleanJob}.`, 'happy');
    ui.content.innerHTML = `<div class="result-panel"><h2 class="result-title">${outcome === 'guessed' ? 'Nailed it!' : 'You beat the bot!'}</h2><p class="result-copy">Thanks, <strong>${esc(playerName)}</strong>. The job was <strong>${esc(cleanJob)}</strong>.</p><div class="answer-recap">${allAnswers.length} answers · DATABASE SAVE: <span id="final-save-status">saving…</span></div><div class="action-row"><button class="primary-btn" id="play-again" type="button">Play again</button><button class="secondary-btn" id="share-result" type="button">Copy result</button></div></div>`;
    $('#play-again').addEventListener('click', showWelcome);
    $('#share-result').addEventListener('click', async () => {
      const text = `I ${outcome === 'guessed' ? 'got guessed' : 'beat the bot'} at Career Ladder! Can you do better?`;
      try { await navigator.clipboard.writeText(text); $('#share-result').textContent = 'Copied!'; }
      catch { $('#share-result').textContent = 'Copy unavailable'; }
    });
    saveGame(game, vote);
  }

  function getVoterId() {
    try {
      let id = localStorage.getItem(VOTER_KEY);
      if (!id) { id = uuid(); localStorage.setItem(VOTER_KEY, id); }
      return id;
    } catch { return uuid(); }
  }

  const config = window.CAREER_LADDER_CONFIG || {};
  const hasDatabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  function authHeaders(prefer = '') {
    return { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}`, 'Content-Type': 'application/json', Prefer: prefer };
  }
  async function dbRequest(path, options = {}) {
    if (!hasDatabaseConfig) throw new Error('Supabase URL or anon key is missing from config.js');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
        method: options.method || 'GET', headers: { ...authHeaders(options.prefer || ''), ...(options.headers || {}) },
        body: options.body ? JSON.stringify(options.body) : undefined, signal: controller.signal
      });
      const text = await response.text();
      let payload = null; try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
      if (!response.ok) {
        const error = new Error(payload?.message || `Supabase returned HTTP ${response.status}`);
        error.status = response.status; error.details = payload; throw error;
      }
      return { response, payload };
    } finally { window.clearTimeout(timeout); }
  }
  async function insertOnce(path, row) {
    try { await dbRequest(path, { method: 'POST', body: row, prefer: 'return=minimal' }); }
    catch (error) {
      // A retry can arrive after the server committed but before the browser
      // received its response. Treat that one unique-key conflict as success.
      if (error.status === 409 && error.details?.code === '23505') return;
      throw error;
    }
  }

  async function checkDatabase() {
    if (!hasDatabaseConfig) { setSaveState('offline', 'DATABASE NOT CONFIGURED'); return; }
    try {
      await dbRequest('career_ladder_job_votes?select=id&limit=0');
      setSaveState('', 'DATABASE CONNECTED');
      await retryOutbox();
    } catch (error) {
      console.warn('[Career Ladder] Database check failed:', error.details || error.message);
      setSaveState('offline', error.status === 404 ? 'RUN DATABASE SETUP' : 'DATABASE UNAVAILABLE');
    }
  }

  function getOutbox() {
    try { const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  function putOutbox(items) {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)); return true; }
    catch { return false; }
  }
  function queueGame(game, vote) {
    const items = getOutbox();
    if (!items.some((item) => item.game?.id === game.id)) items.push({ game, vote });
    return putOutbox(items);
  }

  async function saveGame(game, vote) {
    const status = $('#final-save-status');
    try {
      await insertOnce('career_ladder_games', game);
      await insertOnce('career_ladder_job_votes', vote);
      let countLabel = 'vote counted';
      try {
        const result = await dbRequest(`career_ladder_job_votes?select=voter_id&job_key=eq.${encodeURIComponent(vote.job_key)}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
        const count = Number(result.response.headers.get('content-range')?.split('/').pop());
        if (Number.isFinite(count)) countLabel = count >= 4 ? `job verified by ${count} players` : `${count}/4 confirmations`;
      } catch { /* The game and answer record are already saved. */ }
      if (status) status.textContent = `saved · ${countLabel}`;
      setSaveState('', `SAVED · ${countLabel.toUpperCase()}`);
    } catch (error) {
      console.error('[Career Ladder] Could not save the run:', error.details || error.message);
      const queued = queueGame(game, vote);
      if (status) status.textContent = queued ? `offline · saved on this device for retry (${saveErrorText(error)})` : `save failed · ${saveErrorText(error)}`;
      setSaveState('error', queued ? 'OFFLINE SAVE QUEUED' : 'SAVE FAILED');
    }
  }
  function saveErrorText(error) {
    const code = error.details?.code || `HTTP ${error.status || 'network'}`;
    const message = error.details?.message || error.message || 'Unknown Supabase error';
    if (error.status === 401) return 'Supabase rejected the public key (401). Check config.js.';
    if (error.status === 404 || code === 'PGRST205' || code === '42P01') return 'Game tables are missing or not exposed. Run the Supabase setup SQL.';
    if (code === '42501') return `Database permission error: ${message}`;
    if (code === '23514' || code === '23502' || code === '22P02') return `Database rejected a field: ${message}`;
    if (error.status === 403) return `Supabase blocked this request (${code}): ${message}`;
    if (error.name === 'AbortError') return 'Supabase request timed out. The run is queued to retry.';
    return `Save failed (${code}): ${message}`;
  }
  async function retryOutbox() {
    const items = getOutbox();
    if (!items.length) return;
    const remaining = [];
    for (const item of items) {
      try {
        await insertOnce('career_ladder_games', item.game);
        await insertOnce('career_ladder_job_votes', item.vote);
      } catch (error) { console.warn('[Career Ladder] Saved run will retry later:', error.details || error.message); remaining.push(item); }
    }
    putOutbox(remaining);
    if (items.length && !remaining.length) setSaveState('', 'OFFLINE RUNS SYNCED');
  }

  function startTimer() {
    stopTimer(); ui.timerWrap.classList.add('active');
    state.timerId = window.setInterval(() => {
      if (state.locked || state.screen !== 'question') return;
      state.seconds = Math.max(0, state.seconds - 1); state.elapsedSeconds++;
      ui.timer.textContent = clockText(state.seconds);
      ui.timerWrap.classList.toggle('low', state.seconds <= 20);
      if (state.seconds === 0) showTimeUp();
    }, 1000);
  }
  function stopTimer() { if (state.timerId !== null) window.clearInterval(state.timerId); state.timerId = null; }

  function updateStats() {
    if (!ui.questions) return;
    normalizeCandidates();
    const top = state.candidates[0];
    ui.questions.textContent = String(state.answers.length);
    ui.possible.textContent = String(state.candidates.filter((candidate) => candidate.probability > .002).length || 0);
    ui.best.textContent = top ? top.job.name : '—';
    const confidence = top?.probability || 0;
    ui.progress.style.width = `${Math.round(confidence * 100)}%`;
    ui.progressText.textContent = state.answers.length ? `${Math.round(confidence * 100)}% top match confidence` : 'Start a new climb';
    const tips = [
      'Questions change with your answers. No fixed loop.',
      '“Probably” nudges a match without locking it in.',
      'A wrong guess is removed from this round.',
      'Go Back restores the last clue and gives you a little time.',
      'The next clue is picked to split the remaining jobs.'
    ];
    ui.tip.textContent = tips[state.answers.length % tips.length];
  }

  function setSoundButton() {
    ui.sound.innerHTML = state.audioOn ? '♫ <span>Sound on</span>' : '♫ <span>Sound off</span>';
    ui.sound.setAttribute('aria-label', state.audioOn ? 'Turn sound off' : 'Turn sound on');
  }
  function startMusic() {
    if (!state.audioOn || state.musicId !== null) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) { setSoundButton(); return; }
      if (!state.audio) state.audio = new AudioContext();
      if (state.audio.state === 'suspended') state.audio.resume();
      const notes = [261.63, 293.66, 329.63, 392, 329.63, 293.66, 261.63, 220, 246.94, 293.66, 329.63, 293.66, 246.94, 220, 196, 220];
      let index = 0;
      state.musicId = window.setInterval(() => {
        if (!state.audio || !state.audioOn || state.audio.state !== 'running') return;
        const oscillator = state.audio.createOscillator(); const volume = state.audio.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = notes[index++ % notes.length];
        volume.gain.setValueAtTime(.0001, state.audio.currentTime);
        volume.gain.exponentialRampToValueAtTime(.004, state.audio.currentTime + .08);
        volume.gain.exponentialRampToValueAtTime(.0001, state.audio.currentTime + .46);
        oscillator.connect(volume); volume.connect(state.audio.destination);
        oscillator.start(); oscillator.stop(state.audio.currentTime + .48);
      }, 520);
    } catch (error) { console.warn('[Career Ladder] Audio is unavailable:', error.message); }
  }
  function stopMusic() {
    if (state.musicId !== null) { window.clearInterval(state.musicId); state.musicId = null; }
    if (state.audio && state.audio.state === 'running') state.audio.suspend();
  }
  ui.sound.addEventListener('click', () => {
    state.audioOn = !state.audioOn; setSoundButton();
    if (state.audioOn) startMusic(); else stopMusic();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else if (state.screen === 'question' && !state.locked) startTimer();
  });
  window.addEventListener('online', retryOutbox);
  $('#year').textContent = String(new Date().getFullYear());
  setSaveState('offline', 'CHECKING DATABASE');
  showWelcome();
  checkDatabase();
})();

