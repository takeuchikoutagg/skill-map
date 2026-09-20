/*
 * skill-map プロトタイプ: 動きの中心(画面に依存しない関数)
 *
 * docs の仕様どおりに、スキルの移動・習得日の記録・優先度順の並べ替え・入力チェックを行う。
 * どの関数も、渡されたスキルの配列を書き換えず、新しい配列を返す。
 * スキルの並び順は、同じ状態(status)の中での配列の順番で表す。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SkillLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATUSES = ['unlearned', 'learning', 'mastered'];
  var PRIORITIES = ['high', 'medium', 'low'];
  var PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

  var NAME_MAX = 100;
  var NOTE_MAX = 5000;

  // 今日の日付を YYYY-MM-DD で返す(習得日の記録に使う)
  function todayString(now) {
    var d = now || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function newId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 期限切れ: 期限が今日より前で、習得済みではないスキル
  function isOverdue(skill, today) {
    return skill.status !== 'mastered' && skill.dueDate !== '' && skill.dueDate < today;
  }

  // 入力チェック。問題がなければ空のオブジェクトを返す
  function validateSkillInput(input) {
    var errors = {};
    var name = String(input.name == null ? '' : input.name).trim();
    var note = String(input.note == null ? '' : input.note);
    var dueDate = String(input.dueDate == null ? '' : input.dueDate);

    if (name === '') {
      errors.name = 'スキル名を入力してください。';
    } else if (name.length > NAME_MAX) {
      errors.name = 'スキル名は' + NAME_MAX + '文字以内で入力してください。';
    }
    if (PRIORITIES.indexOf(input.priority) === -1) {
      errors.priority = '優先度を選んでください。';
    }
    if (dueDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      errors.dueDate = '期限は日付で入力してください。';
    }
    if (note.length > NOTE_MAX) {
      errors.note = 'ポイント・考察は' + NOTE_MAX.toLocaleString('ja-JP') + '文字以内で入力してください。';
    }
    return errors;
  }

  // スキル追加。未習得と習得中にだけ追加できる(習得済みは不可)。列の末尾に置く
  function addSkill(skills, status, input, id) {
    if (status !== 'unlearned' && status !== 'learning') {
      throw new Error('習得済みの列には、スキルを直接追加できません。');
    }
    var errors = validateSkillInput(input);
    if (Object.keys(errors).length > 0) {
      throw new Error('入力内容に誤りがあります。');
    }
    var skill = {
      id: id || newId(),
      name: String(input.name).trim(),
      note: String(input.note == null ? '' : input.note),
      status: status,
      priority: input.priority,
      dueDate: String(input.dueDate == null ? '' : input.dueDate),
      acquiredOn: ''
    };
    return skills.concat([skill]);
  }

  // スキル編集。変えられるのは、スキル名・ポイント・優先度・期限だけ(習得日と状態は変えない)
  function updateSkill(skills, id, input) {
    var errors = validateSkillInput(input);
    if (Object.keys(errors).length > 0) {
      throw new Error('入力内容に誤りがあります。');
    }
    return skills.map(function (s) {
      if (s.id !== id) return s;
      return Object.assign({}, s, {
        name: String(input.name).trim(),
        note: String(input.note == null ? '' : input.note),
        priority: input.priority,
        dueDate: String(input.dueDate == null ? '' : input.dueDate)
      });
    });
  }

  function deleteSkill(skills, id) {
    return skills.filter(function (s) { return s.id !== id; });
  }

  /*
   * スキル移動(列間の移動と、列内の並び替え)。習得日もここで更新する。
   *   習得済み以外 → 習得済み: 今日の日付を記録
   *   習得済み → 習得済み以外: 消す
   *   習得済み内の並び替え、他の列どうしの移動: 変更しない
   * index は、移動先の列の中の位置(移動するスキル自身を除いて数える)
   */
  function moveSkill(skills, id, toStatus, index, today) {
    var target = skills.filter(function (s) { return s.id === id; })[0];
    if (!target || STATUSES.indexOf(toStatus) === -1) return skills;

    var rest = skills.filter(function (s) { return s.id !== id; });
    var wasMastered = target.status === 'mastered';
    var toMastered = toStatus === 'mastered';

    var acquiredOn = target.acquiredOn;
    if (toMastered && !wasMastered) {
      acquiredOn = today || todayString();
    } else if (!toMastered) {
      acquiredOn = '';
    }

    var moved = Object.assign({}, target, { status: toStatus, acquiredOn: acquiredOn });

    var inTarget = rest.filter(function (s) { return s.status === toStatus; });
    var pos = Math.max(0, Math.min(index, inTarget.length));
    var at;
    if (pos >= inTarget.length) {
      var last = inTarget[inTarget.length - 1];
      at = last ? rest.indexOf(last) + 1 : rest.length;
    } else {
      at = rest.indexOf(inTarget[pos]);
    }
    return rest.slice(0, at).concat([moved], rest.slice(at));
  }

  /*
   * 優先度順の並べ替え。未習得と習得中だけ。高 → 中 → 低の順にし、
   * 同じ優先度どうしは、並べ替える前の順番を保つ。
   */
  function sortByPriority(skills, status) {
    if (status !== 'unlearned' && status !== 'learning') {
      throw new Error('習得済みの列は、優先度順に並べ替えできません。');
    }
    var sorted = skills
      .filter(function (s) { return s.status === status; })
      .map(function (s, i) { return { s: s, i: i }; })
      .sort(function (a, b) {
        return (PRIORITY_RANK[a.s.priority] - PRIORITY_RANK[b.s.priority]) || (a.i - b.i);
      })
      .map(function (x) { return x.s; });
    var k = 0;
    return skills.map(function (s) { return s.status === status ? sorted[k++] : s; });
  }

  // 保存されていたデータが、使える形かを確かめる
  function isValidSkillList(list) {
    if (!Array.isArray(list)) return false;
    return list.every(function (s) {
      return s && typeof s === 'object' &&
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        typeof s.note === 'string' &&
        STATUSES.indexOf(s.status) !== -1 &&
        PRIORITIES.indexOf(s.priority) !== -1 &&
        typeof s.dueDate === 'string' &&
        typeof s.acquiredOn === 'string' &&
        (s.status === 'mastered') === (s.acquiredOn !== '');
    });
  }

  // 初期のサンプルデータ
  function sampleSkills() {
    return [
      { id: 's1', name: 'クレーム対応', note: '', status: 'unlearned', priority: 'low', dueDate: '2026-12-31', acquiredOn: '' },
      { id: 's2', name: '発注書の確認', note: '数量と単価を、注文書と見比べる。', status: 'unlearned', priority: 'medium', dueDate: '2026-11-15', acquiredOn: '' },
      { id: 's3', name: '受発注システムの操作', note: '手順書を先に読む。画面の名前と、業務の流れを対応させて覚える。', status: 'unlearned', priority: 'high', dueDate: '2026-09-10', acquiredOn: '' },
      { id: 's4', name: '請求書の発行', note: '締め日に注意。月末は先輩に確認してから発行する。', status: 'learning', priority: 'medium', dueDate: '2026-10-15', acquiredOn: '' },
      { id: 's5', name: '月次レポートの作成', note: '', status: 'learning', priority: 'high', dueDate: '2026-10-31', acquiredOn: '' },
      { id: 's6', name: 'レジ締め', note: '現金の過不足を必ず二人で確認する。', status: 'mastered', priority: 'medium', dueDate: '', acquiredOn: '2026-09-01' }
    ];
  }

  return {
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    NAME_MAX: NAME_MAX,
    NOTE_MAX: NOTE_MAX,
    todayString: todayString,
    newId: newId,
    isOverdue: isOverdue,
    validateSkillInput: validateSkillInput,
    addSkill: addSkill,
    updateSkill: updateSkill,
    deleteSkill: deleteSkill,
    moveSkill: moveSkill,
    sortByPriority: sortByPriority,
    isValidSkillList: isValidSkillList,
    sampleSkills: sampleSkills
  };
});
