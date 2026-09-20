/*
 * skill-map プロトタイプ: 画面の動き
 * 動きの中心は logic.js にある。ここは、描画・ドラッグ&ドロップ・ダイアログ・保存を担当する。
 * ユーザーが入力した文字は、必ず textContent で表示する(HTML として解釈させない)。
 */
(function () {
  'use strict';

  var L = window.SkillLogic;
  var STORAGE_KEY = 'skill-map-prototype-v1';

  var STATUS_LABEL = { unlearned: '未習得', learning: '習得中', mastered: '習得済み' };
  var PRIORITY_LABEL = { high: '高', medium: '中', low: '低' };

  var skills = [];
  var storageOk = true;

  var dragId = null;      // ドラッグ中のスキルのID
  var editingId = null;   // 編集中のスキルのID(追加のときは null)
  var addingStatus = null; // 追加先の状態(編集のときは null)
  var confirmAction = null; // 確認ダイアログで「OK」を押したときの処理

  var boardEl = document.getElementById('board');
  var skillDialog = document.getElementById('skill-dialog');
  var skillForm = document.getElementById('skill-form');
  var confirmDialog = document.getElementById('confirm-dialog');

  var dropLine = document.createElement('div');
  dropLine.className = 'drop-line';

  // ---------- 保存と読み込み ----------

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (L.isValidSkillList(parsed)) return parsed;
      }
    } catch (e) {
      storageOk = false;
    }
    return L.sampleSkills();
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
    } catch (e) {
      storageOk = false;
    }
    document.getElementById('storage-warning').hidden = storageOk;
  }

  // ---------- 描画 ----------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    var today = L.todayString();
    boardEl.replaceChildren.apply(boardEl, L.STATUSES.map(function (status) {
      return renderList(status, today);
    }));
  }

  function renderList(status, today) {
    var items = skills.filter(function (s) { return s.status === status; });

    var list = el('section', 'list' + (status === 'mastered' ? ' list-done' : ''));
    list.dataset.status = status;
    list.setAttribute('aria-labelledby', 'list-' + status);

    // 見出し: 列名、件数、優先度順ボタン(未習得・習得中だけ)
    var head = el('div', 'list-head');
    var title = el('h2', null, STATUS_LABEL[status]);
    title.id = 'list-' + status;
    var tools = el('div', 'list-tools');
    tools.appendChild(el('span', 'count', String(items.length)));
    if (status !== 'mastered') {
      var sortBtn = el('button', 'sort-btn', '優先度順');
      sortBtn.type = 'button';
      sortBtn.dataset.action = 'sort';
      if (items.length < 2) {
        sortBtn.disabled = true;
        sortBtn.title = 'スキルが2件以上あると、並べ替えできます';
      } else {
        sortBtn.title = '高 → 中 → 低の順に並べ替えます';
      }
      tools.appendChild(sortBtn);
    }
    head.appendChild(title);
    head.appendChild(tools);
    list.appendChild(head);

    // カードを並べる場所(ドロップ先)
    var cards = el('div', 'cards');
    if (items.length === 0) {
      cards.appendChild(el('p', 'empty', 'スキルがありません'));
    }
    items.forEach(function (skill) {
      cards.appendChild(renderCard(skill, today));
    });
    list.appendChild(cards);

    // スキル追加ボタン(未習得・習得中だけ。習得済みには置かない)
    if (status !== 'mastered') {
      var add = el('button', 'add-skill', '+ スキルを追加');
      add.type = 'button';
      add.dataset.action = 'add';
      list.appendChild(add);
    }
    return list;
  }

  function renderCard(skill, today) {
    var card = el('article', 'card');
    card.dataset.id = skill.id;
    card.draggable = true;

    var titleWrap = el('h3');
    var titleBtn = el('button', 'card-title', skill.name);
    titleBtn.type = 'button';
    titleBtn.dataset.action = 'edit';
    titleWrap.appendChild(titleBtn);
    card.appendChild(titleWrap);

    // 優先度と期限
    var meta = el('p', 'meta');
    meta.appendChild(el('span', 'prio prio-' + skill.priority, '優先度: ' + PRIORITY_LABEL[skill.priority]));
    var overdue = L.isOverdue(skill, today);
    var dueText = '期限: ' + (skill.dueDate === '' ? '-' : skill.dueDate) + (overdue ? '(期限切れ)' : '');
    meta.appendChild(el('span', 'due' + (overdue ? ' overdue' : ''), dueText));
    card.appendChild(meta);

    // 習得日は、習得済みのカードにだけ表示する
    if (skill.status === 'mastered') {
      card.appendChild(el('p', 'acquired', '習得日: ' + skill.acquiredOn));
    }

    if (skill.note !== '') {
      card.appendChild(el('p', 'note', skill.note));
    }

    var del = el('button', 'delete', '削除');
    del.type = 'button';
    del.dataset.action = 'delete';
    card.appendChild(del);
    return card;
  }

  // ---------- ダイアログ ----------

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function findSkill(id) {
    return skills.filter(function (s) { return s.id === id; })[0];
  }

  function clearErrors() {
    ['err-name', 'err-priority', 'err-due', 'err-note'].forEach(function (id) {
      document.getElementById(id).textContent = '';
    });
  }

  function openSkillDialog(status, skill) {
    editingId = skill ? skill.id : null;
    addingStatus = skill ? null : status;
    clearErrors();

    document.getElementById('skill-dialog-title').textContent =
      skill ? 'スキルを編集' : 'スキルを追加(' + STATUS_LABEL[status] + ')';
    document.getElementById('f-name').value = skill ? skill.name : '';
    document.getElementById('f-priority').value = skill ? skill.priority : 'medium';
    document.getElementById('f-due').value = skill ? skill.dueDate : '';
    document.getElementById('f-note').value = skill ? skill.note : '';

    // 習得日は、習得済みのスキルの編集フォームにだけ、表示のみで出す
    var showAcquired = !!skill && skill.status === 'mastered';
    document.getElementById('acquired-row').hidden = !showAcquired;
    document.getElementById('acquired-value').textContent = showAcquired ? skill.acquiredOn : '';

    openDialog(skillDialog);
    document.getElementById('f-name').focus();
  }

  function openConfirm(options) {
    document.getElementById('confirm-title').textContent = options.title;
    document.getElementById('confirm-message').textContent = options.message;
    document.getElementById('confirm-ok').textContent = options.okLabel;
    confirmAction = options.onOk;
    openDialog(confirmDialog);
  }

  skillForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = {
      name: document.getElementById('f-name').value,
      priority: document.getElementById('f-priority').value,
      dueDate: document.getElementById('f-due').value,
      note: document.getElementById('f-note').value
    };
    var errors = L.validateSkillInput(input);
    clearErrors();
    if (errors.name) document.getElementById('err-name').textContent = errors.name;
    if (errors.priority) document.getElementById('err-priority').textContent = errors.priority;
    if (errors.dueDate) document.getElementById('err-due').textContent = errors.dueDate;
    if (errors.note) document.getElementById('err-note').textContent = errors.note;
    if (Object.keys(errors).length > 0) return;

    if (editingId) {
      skills = L.updateSkill(skills, editingId, input);
    } else {
      skills = L.addSkill(skills, addingStatus, input);
    }
    save();
    closeDialog(skillDialog);
    render();
  });

  document.getElementById('skill-cancel').addEventListener('click', function () {
    closeDialog(skillDialog);
  });

  document.getElementById('confirm-cancel').addEventListener('click', function () {
    confirmAction = null;
    closeDialog(confirmDialog);
  });

  document.getElementById('confirm-ok').addEventListener('click', function () {
    var action = confirmAction;
    confirmAction = null;
    closeDialog(confirmDialog);
    if (action) action();
  });

  // ダイアログの外側(暗い部分)をクリックしたら閉じる
  [skillDialog, confirmDialog].forEach(function (dialog) {
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) closeDialog(dialog);
    });
  });

  // ---------- ボードのクリック操作 ----------

  boardEl.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    var card = e.target.closest('.card');
    var list = e.target.closest('.list');

    if (target && target.dataset.action === 'add' && list) {
      openSkillDialog(list.dataset.status, null);
    } else if (target && target.dataset.action === 'sort' && list) {
      skills = L.sortByPriority(skills, list.dataset.status);
      save();
      render();
    } else if (target && target.dataset.action === 'delete' && card) {
      var skill = findSkill(card.dataset.id);
      if (!skill) return;
      openConfirm({
        title: '「' + skill.name + '」を削除しますか?',
        message: 'この操作は取り消せません。',
        okLabel: '削除',
        onOk: function () {
          skills = L.deleteSkill(skills, skill.id);
          save();
          render();
        }
      });
    } else if (card) {
      // カードのどこをクリックしても、編集フォームを開く
      var editSkill = findSkill(card.dataset.id);
      if (editSkill) openSkillDialog(null, editSkill);
    }
  });

  document.getElementById('reset-btn').addEventListener('click', function () {
    openConfirm({
      title: 'サンプルデータに戻しますか?',
      message: '今のスキルはすべて消えて、最初のサンプルに戻ります。',
      okLabel: '戻す',
      onOk: function () {
        skills = L.sampleSkills();
        save();
        render();
      }
    });
  });

  // ---------- ドラッグ&ドロップ ----------

  // カーソルの高さから、列の中の挿入位置を決める(ドラッグ中のカード自身は数えない)
  function insertionIndex(cardsEl, y) {
    var cards = cardsEl.querySelectorAll('.card:not(.dragging)');
    var i = 0;
    for (; i < cards.length; i++) {
      var rect = cards[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) break;
    }
    return i;
  }

  function showDropLine(list, y) {
    var cardsEl = list.querySelector('.cards');
    var cards = cardsEl.querySelectorAll('.card:not(.dragging)');
    var idx = insertionIndex(cardsEl, y);
    var before = cards[idx] || null;

    if (dropLine.parentNode !== cardsEl || dropLine.nextElementSibling !== before) {
      cardsEl.insertBefore(dropLine, before);
    }
    Array.prototype.forEach.call(boardEl.querySelectorAll('.list.drop-target'), function (l) {
      if (l !== list) l.classList.remove('drop-target');
    });
    list.classList.add('drop-target');
  }

  function endDrag() {
    dragId = null;
    if (dropLine.parentNode) dropLine.parentNode.removeChild(dropLine);
    Array.prototype.forEach.call(boardEl.querySelectorAll('.dragging, .drop-target'), function (n) {
      n.classList.remove('dragging');
      n.classList.remove('drop-target');
    });
  }

  boardEl.addEventListener('dragstart', function (e) {
    var card = e.target.closest ? e.target.closest('.card') : null;
    if (!card) return;
    dragId = card.dataset.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* 使えなくても動く */ }
    }
    card.classList.add('dragging');
  });

  boardEl.addEventListener('dragover', function (e) {
    var list = e.target.closest ? e.target.closest('.list') : null;
    if (!dragId || !list) return;
    e.preventDefault(); // ドロップを許可する
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    showDropLine(list, e.clientY);
  });

  boardEl.addEventListener('dragleave', function (e) {
    var list = e.target.closest ? e.target.closest('.list') : null;
    if (list && !list.contains(e.relatedTarget)) {
      list.classList.remove('drop-target');
      if (dropLine.parentNode && list.contains(dropLine)) {
        dropLine.parentNode.removeChild(dropLine);
      }
    }
  });

  boardEl.addEventListener('drop', function (e) {
    var list = e.target.closest ? e.target.closest('.list') : null;
    if (!dragId || !list) return;
    e.preventDefault();
    var idx = insertionIndex(list.querySelector('.cards'), e.clientY);
    skills = L.moveSkill(skills, dragId, list.dataset.status, idx, L.todayString());
    endDrag();
    save();
    render();
  });

  boardEl.addEventListener('dragend', endDrag);

  // ---------- 開始 ----------

  skills = load();
  save();
  render();
})();
