(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const tatarLessons = Array.isArray(window.COURSE_DATA) ? window.COURSE_DATA : [];
  const russianLessons = Array.isArray(window.COURSE_DATA_RU) ? window.COURSE_DATA_RU : [];
  const isRu = params.get('lang') === 'ru' && russianLessons.length === tatarLessons.length;
  const lessons = isRu ? russianLessons : tatarLessons;
  const byNumber = new Map(lessons.map(lesson => [lesson.n, lesson]));
  const originalByNumber = new Map(tatarLessons.map(lesson => [lesson.n, lesson]));
  const tr = (tatar, russian) => isRu ? russian : tatar;
  const requested = Number(params.get('lesson'));
  let current = byNumber.get(requested) || lessons[0];
  let reviewIndex = 0;
  let quizIndex = 0;
  let quizAnswers = [];
  let checked = false;
  let startedAt = 0;
  let attemptId = '';
  let sent = false;
  const resultsEndpoint = 'https://kxwhwmxzmtvueksyayvz.supabase.co/functions/v1/submit-tajwid2-quiz';
  const localPreview = location.protocol === 'file:' || ['127.0.0.1', 'localhost'].includes(location.hostname);
  const $ = id => document.getElementById(id);
  function setupLanguage() {
    document.documentElement.lang = isRu ? 'ru' : 'tt';
    $('languageSwitch').querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.lang === (isRu ? 'ru' : 'tt')));
      button.addEventListener('click', () => {
        const url = new URL(location.href);
        if (button.dataset.lang === 'ru') url.searchParams.set('lang', 'ru');
        else url.searchParams.delete('lang');
        location.href = url.toString();
      });
    });
    if (!isRu) return;
    document.querySelector('.brand small').textContent = '25 УРОКОВ · ТЕОРИЯ И ТЕСТ';
    $('coursePill').textContent = '25 уроков';
    document.querySelector('#home .eyebrow').textContent = 'Таджвид 2';
    document.querySelector('#home h1').textContent = 'Уроки и проверка знаний';
    document.querySelector('#home .lead').textContent = 'В каждом из 25 уроков прочитайте теорию, повторите материал по пяти вопросам и пройдите тест из семи вопросов. Произношение отдельно проверяет преподаватель на занятии.';
    document.querySelector('.teacher .eyebrow').textContent = 'Для преподавателя';
    document.querySelector('.teacher h2').textContent = 'Ссылка на урок';
    document.querySelector('.teacher p:not(.eyebrow)').textContent = 'Выберите урок и группу, затем отправьте ученику готовую ссылку.';
    document.querySelector('label.field:has(#teacherLesson)').firstChild.nodeValue = 'Урок';
    $('copyLinkBtn').textContent = 'Скопировать ссылку';
    document.querySelector('.teacher a').textContent = 'Журнал результатов →';
    document.querySelector('#intro .eyebrow').textContent = 'Текст урока';
    document.querySelector('#intro .summary').textContent = 'После чтения текста попробуйте ответить на пять вопросов самостоятельно и сравните ответы с готовыми. Затем начнётся тест из семи вопросов.';
    $('startReviewBtn').textContent = 'Перейти к вопросам';
    document.querySelector('#review .eyebrow').textContent = 'Повторение по вопросам';
    document.querySelector('#review .lead').textContent = 'Сначала обдумайте ответ, затем сравните его с готовым.';
    document.querySelector('#reviewAnswer strong').textContent = 'Ответ';
    $('showAnswerBtn').textContent = 'Посмотреть ответ';
    document.querySelector('#identity .eyebrow').textContent = 'Сведения об ученике';
    document.querySelector('#identity h2').textContent = 'Кто проходит тест?';
    document.querySelector('#identity .lead').textContent = 'Напишите имя и фамилию и выберите группу, чтобы результат появился в журнале преподавателя.';
    document.querySelector('label.field:has(#studentName)').firstChild.nodeValue = 'Имя и фамилия';
    $('startTestBtn').textContent = 'Начать тест';
    document.querySelector('#result .eyebrow').textContent = 'Урок завершён';
    document.querySelector('#result h1').textContent = 'Вы прошли урок!';
    document.querySelector('.score span').textContent = 'Правильных ответов';
    $('retryBtn').textContent = 'Пройти ещё раз';
  }
  function fillGroupSelect(id, placeholder) {
    const select = $(id);
    select.add(new Option(placeholder, ''));
    const addBlock = (label, count, prefix = label) => {
      const block = document.createElement('optgroup');
      block.label = label;
      for (let number = 1; number <= count; number++) {
        const value = `${prefix} — ${number} группа`;
        block.append(new Option(value, value));
      }
      select.add(block);
    };
    for (let course = 1; course <= 4; course++) {
      addBlock(`${course} курс`, 8);
      addBlock(`Онлайн ${course} курс`, 10);
    }
    for (const direction of ['Дагват', 'Мәгърифәт', 'Остазлар']) {
      addBlock(`${direction}, 1 курс`, 3);
    }
    addBlock('Коръән уку мәктәбе', 10);
  }
  const screens = ['home', 'intro', 'review', 'identity', 'quiz', 'result'];
  const stageNames = {
    intro: tr('Дәрес белән танышу', 'Знакомство с уроком'),
    review: tr('Сораулар аша кабатлау', 'Повторение по вопросам'),
    identity: tr('Укучы турында мәгълүмат', 'Сведения об ученике'),
    quiz: tr('Белемне тикшерү', 'Проверка знаний'),
    result: tr('Дәрес тәмам', 'Урок завершён')
  };

  function show(screen) {
    screens.forEach(name => $(name).classList.toggle('hidden', name !== screen));
    $('progress').classList.toggle('hidden', screen === 'home');
    if (screen !== 'home') {
      const step = screens.indexOf(screen);
      $('stageName').textContent = stageNames[screen];
      $('stageCount').textContent = `${step} / 5`;
      $('stageFill').style.width = `${step * 20}%`;
    }
    window.scrollTo(0, 0);
  }

  function setupHome() {
    const cards = $('lessonCards');
    lessons.forEach(lesson => {
      const link = document.createElement('a');
      link.className = 'card';
      link.href = `?lesson=${lesson.n}${isRu ? '&lang=ru' : ''}`;
      const number = document.createElement('span');
      number.className = 'number';
      number.textContent = lesson.n;
      const title = document.createElement('strong');
      title.textContent = lesson.title;
      link.append(number, title);
      cards.append(link);
      const option = document.createElement('option');
      option.value = lesson.n;
      option.textContent = `${lesson.n}. ${lesson.title}`;
      $('teacherLesson').append(option);
    });
    if (current) $('teacherLesson').value = current.n;
  }

  function setupLesson() {
    if (!current) return;
    $('introTitle').textContent = current.title;
    $('introGoal').textContent = current.goal;
    const reading = $('lessonReading');
    reading.replaceChildren();
    if (current.intro) {
      const intro = document.createElement('p');
      intro.textContent = current.intro;
      reading.append(intro);
    }
    current.sections.forEach(section => {
      const wrap = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = section.title;
      wrap.append(heading);
      if (section.note) {
        const note = document.createElement('p');
        note.className = 'note-text';
        note.textContent = section.note;
        wrap.append(note);
      }
      let readingBlock;
      let blockIndex = 0;
      section.paragraphs.forEach(value => {
        const isSubheading = value.length < 130 && /^\d{1,2}[.)]\s+/.test(value);
        if (!readingBlock || isSubheading || readingBlock.childElementCount >= 7) {
          readingBlock = document.createElement('div');
          readingBlock.className = `reading-block reading-block-${blockIndex % 3 + 1}`;
          blockIndex += 1;
          wrap.append(readingBlock);
        }
        const paragraph = document.createElement('p');
        if (isSubheading) paragraph.className = 'reading-subheading';
        paragraph.textContent = value;
        readingBlock.append(paragraph);
      });
      reading.append(wrap);
    });
    if (current.sources) {
      const sources = document.createElement('p');
      sources.className = 'source';
      sources.textContent = `${tr('Таяныч чыганаклар', 'Источники')}: ${current.sources}`;
      reading.append(sources);
    }
    if (byNumber.has(requested)) {
      document.title = tr(`${current.n} нче дәрес — Тәҗвид 2`, `Урок ${current.n} — Таджвид 2`);
      $('coursePill').textContent = tr(`${current.n} нче дәрес`, `Урок ${current.n}`);
    }
  }

  function lessonUrl() {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('lesson', $('teacherLesson').value);
    if (isRu) url.searchParams.set('lang', 'ru');
    const group = $('teacherGroup').value.trim();
    if (group) url.searchParams.set('group', group);
    return url.toString();
  }

  async function copyText(text, fallbackInput) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      if (fallbackInput) {
        fallbackInput.value = text;
        fallbackInput.classList.remove('hidden');
        fallbackInput.focus();
        fallbackInput.select();
      }
      return false;
    }
  }

  function renderReview() {
    const item = current.study[reviewIndex];
    $('reviewCounter').textContent = `${reviewIndex + 1} / ${current.study.length}`;
    $('reviewQuestion').textContent = `${reviewIndex + 1}. ${item.q}`;
    $('reviewAnswerText').textContent = item.a;
    $('reviewAnswer').classList.add('hidden');
    $('showAnswerBtn').classList.remove('hidden');
    $('nextReviewBtn').classList.add('hidden');
    $('nextReviewBtn').textContent = reviewIndex === current.study.length - 1
      ? tr('Тестка әзерләнергә', 'Подготовиться к тесту')
      : tr('Киләсе сорау', 'Следующий вопрос');
  }

  function renderQuiz() {
    checked = false;
    $('quizError').classList.add('hidden');
    $('quizFeedback').classList.add('hidden');
    $('quizOptions').replaceChildren();
    $('quizEyebrow').textContent = `Тест · ${quizIndex + 1} / ${current.questions.length}`;
    $('nextQuizBtn').textContent = tr('Тикшерергә', 'Проверить');
    const item = current.questions[quizIndex];
    $('quizQuestion').textContent = item.q;
    item.o.forEach((answer, index) => {
      const label = document.createElement('label');
      label.className = 'option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'choice';
      input.value = String(index);
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = ['А', 'Б', 'В'][index];
      const text = document.createElement('span');
      text.textContent = answer;
      label.append(input, letter, text);
      $('quizOptions').append(label);
    });
  }

  function finish() {
    const right = current.questions.map((question, index) => Number(quizAnswers[index] === question.a));
    $('scoreText').textContent = `${right.reduce((a, b) => a + b, 0)} / ${current.questions.length}`;
    $('resultText').textContent = `${$('studentName').value.trim()} · ${$('studentGroup').value.trim()}. ${tr('Җавапларны карап, дәресне кабат үтәргә мөмкин.', 'Можно посмотреть ответы и пройти урок ещё раз.')}`;
    $('sendResultBtn').classList.add('hidden');
    $('retryBtn').classList.add('hidden');
    $('sendInstruction').textContent = '';
    $('sendInstruction').classList.add('pending');
    $('sendInstruction').setAttribute('aria-busy', 'true');
    $('resultSendNote').textContent = '';
    show('result');
    if (localPreview) {
      $('retryBtn').classList.remove('hidden');
      $('sendInstruction').classList.remove('pending');
      $('sendInstruction').setAttribute('aria-busy', 'false');
      $('sendInstruction').textContent = tr('Бу — карау өчен үрнәк. Әлегә нәтиҗә укытучы журналына җибәрелми.', 'Это предварительный просмотр. Результат пока не отправляется в журнал преподавателя.');
    } else {
      void sendResult();
    }
  }

  if (!current || lessons.length !== 25) {
    document.querySelector('main').textContent = tr('Дәрес мәгълүматларын йөкләп булмады.', 'Не удалось загрузить данные урока.');
    return;
  }
  setupLanguage();
  setupHome();
  setupLesson();
  fillGroupSelect('teacherGroup', tr('Төркемне укучы сайлый', 'Группу выберет ученик'));
  fillGroupSelect('studentGroup', tr('Төркемне сайлагыз', 'Выберите группу'));
  const presetGroup = params.get('group') || '';
  if ([...$('studentGroup').options].some(option => option.value === presetGroup && presetGroup)) {
    $('studentGroup').value = presetGroup;
  }

  $('copyLinkBtn').addEventListener('click', async () => {
    const copied = await copyText(lessonUrl(), $('teacherLink'));
    $('copyNote').textContent = copied
      ? tr('Сылтама күчереп алынды.', 'Ссылка скопирована.')
      : tr('Сылтаманы астагы юлдан күчереп алыгыз.', 'Скопируйте ссылку из поля ниже.');
  });
  for (const id of ['teacherLesson', 'teacherGroup']) {
    $(id).addEventListener('change', () => {
      $('teacherLink').classList.add('hidden');
      $('copyNote').textContent = '';
    });
  }
  $('startReviewBtn').addEventListener('click', () => { reviewIndex = 0; renderReview(); show('review'); });
  $('showAnswerBtn').addEventListener('click', () => {
    $('reviewAnswer').classList.remove('hidden');
    $('showAnswerBtn').classList.add('hidden');
    $('nextReviewBtn').classList.remove('hidden');
  });
  $('nextReviewBtn').addEventListener('click', () => {
    if (++reviewIndex < current.study.length) { renderReview(); window.scrollTo(0, 0); }
    else show('identity');
  });
  $('startTestBtn').addEventListener('click', () => {
    if (!$('studentName').value.trim() || !$('studentGroup').value.trim()) {
      $('identityError').textContent = tr('Исем-фамилияне языгыз һәм группаны сайлагыз.', 'Напишите имя и фамилию и выберите группу.');
      $('identityError').classList.remove('hidden');
      return;
    }
    $('identityError').classList.add('hidden');
    quizIndex = 0;
    quizAnswers = Array(current.questions.length).fill(null);
    startedAt = Date.now();
    attemptId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sent = false;
    renderQuiz();
    show('quiz');
  });
  $('nextQuizBtn').addEventListener('click', () => {
    if (quizIndex < current.questions.length) {
      if (checked) {
        quizIndex++;
        if (quizIndex === current.questions.length) finish();
        else { renderQuiz(); window.scrollTo(0, 0); }
        return;
      }
      const chosen = document.querySelector('input[name="choice"]:checked');
      if (!chosen) {
        $('quizError').textContent = tr('Бер җавапны сайлагыз.', 'Выберите один ответ.');
        $('quizError').classList.remove('hidden');
        return;
      }
      const selected = Number(chosen.value);
      const item = current.questions[quizIndex];
      const correct = selected === item.a;
      quizAnswers[quizIndex] = selected;
      checked = true;
      document.querySelectorAll('.option').forEach((option, index) => {
        option.classList.add('locked');
        option.querySelector('input').disabled = true;
        if (index === item.a) option.classList.add('correct');
        if (index === selected && !correct) option.classList.add('wrong');
      });
      $('quizFeedback').className = `feedback ${correct ? 'right' : 'wrong'}`;
      $('feedbackTitle').textContent = correct
        ? tr('Дөрес җавап!', 'Верный ответ!')
        : tr('Бу җавап дөрес түгел.', 'Этот ответ неверный.');
      $('feedbackText').textContent = `${item.rationale || ''} ${tr('Дөрес җавап', 'Правильный ответ')}: ${item.o[item.a]}`;
      $('quizError').classList.add('hidden');
      $('nextQuizBtn').textContent = tr('Алга', 'Далее');
      return;
    }
  });
  async function sendResult() {
    if (sent) return;
    const button = $('sendResultBtn');
    button.disabled = true;
    $('sendInstruction').textContent = '';
    $('sendInstruction').classList.add('pending');
    $('sendInstruction').setAttribute('aria-busy', 'true');
    $('resultSendNote').textContent = '';
    const score = current.questions.reduce((sum, question, index) => sum + Number(quizAnswers[index] === question.a), 0);
    const payload = {
      attemptId,
      studentName: $('studentName').value.trim(),
      group: $('studentGroup').value.trim(),
      lessonId: current.n,
      lessonTitle: originalByNumber.get(current.n)?.title || current.title,
      score,
      total: current.questions.length,
      durationSeconds: Math.min(86400, Math.max(1, Math.round((Date.now() - startedAt) / 1000))),
      answers: current.questions.map((question, index) => ({
        number: index + 1,
        selected: quizAnswers[index],
        correct: question.a,
        isCorrect: quizAnswers[index] === question.a
      }))
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(resultsEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'send_failed');
      sent = true;
      button.textContent = tr('Җибәрелде', 'Отправлено');
      $('sendInstruction').classList.remove('pending');
      $('sendInstruction').setAttribute('aria-busy', 'false');
      $('sendInstruction').textContent = tr('Эшегез укытучы журналына теркәлде.', 'Ваша работа записана в журнале преподавателя.');
      $('resultSendNote').textContent = tr('Башка бернәрсә эшләргә кирәкми.', 'Больше ничего делать не нужно.');
      button.classList.add('hidden');
      $('retryBtn').classList.remove('hidden');
    } catch {
      button.disabled = false;
      button.textContent = tr('Кабат җибәрергә', 'Отправить ещё раз');
      button.classList.remove('hidden');
      $('sendInstruction').classList.remove('pending');
      $('sendInstruction').setAttribute('aria-busy', 'false');
      $('sendInstruction').textContent = tr('Эшегез журналга теркәлмәде. Кабат җибәрергә кирәк.', 'Работа не записана в журнале. Отправьте её ещё раз.');
      $('resultSendNote').textContent = tr('Түбәндәге «Кабат җибәрергә» төймәсенә басыгыз.', 'Нажмите кнопку «Отправить ещё раз» ниже.');
    }
  }
  $('sendResultBtn').addEventListener('click', sendResult);
  $('retryBtn').addEventListener('click', () => {
    if (!sent && !confirm(tr('Нәтиҗә әле укытучыга җибәрелмәде. Чыннан да кабат үтәргәме?', 'Результат ещё не отправлен преподавателю. Вы действительно хотите пройти урок заново?'))) return;
    reviewIndex = quizIndex = 0;
    quizAnswers = [];
    show('intro');
  });
  show(byNumber.has(requested) ? 'intro' : 'home');
})();
