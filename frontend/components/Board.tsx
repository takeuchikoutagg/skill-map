"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useRef, useState } from "react";
import { Column } from "@/components/Column";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkillCard } from "@/components/SkillCard";
import { SkillForm } from "@/components/SkillForm";
import { ApiError, browserApiUrl, createSkill, deleteSkill, fetchSkills, requestMove, requestSort, updateSkill } from "@/lib/api";
import { groupByStatus, moveSkill, removeSkill, replaceColumn, replaceSkill, type SkillInput } from "@/lib/board";
import { detectCollisions } from "@/lib/collision";
import {
  buildAnnouncements,
  columnsFromItems,
  currentPosition,
  findStatus,
  isBelow,
  itemsFromSkills,
  moveOver,
  resolveDrop,
  SCREEN_READER_INSTRUCTIONS,
  type ColumnItems,
  type DropTarget,
} from "@/lib/drag";
import { toFormErrors } from "@/lib/skill-form";
import { STATUS_LABELS, STATUSES, type Skill, type Status } from "@/lib/types";

// 開いているフォームの中身: 追加(どの列に追加するか)か、編集(どのスキルを編集するか)
type FormTarget = { kind: "add"; status: Status } | { kind: "edit"; skill: Skill };

// 画面の上に出す、お知らせ。info: 知らせ(別の場所で、すでに削除されていた、など)。error: 失敗(移動できなかった、など)
type Notice = { text: string; tone: "info" | "error" };

const NOOP = () => {};

// スキルボード。3つの列(未習得・習得中・習得済み)を、左から並べる。
// スキルの一覧を、この部品が「状態」として持つ。操作(追加・編集・削除・移動)をするたびに、状態を更新して、画面に反映する。
// initialSkills は、サーバーが API から取得した、最初の一覧。
export function Board({ initialSkills, today }: { initialSkills: Skill[]; today: string }) {
  const [skills, setSkills] = useState(initialSkills);
  const [form, setForm] = useState<FormTarget | null>(null); // 追加・編集フォームの、開いている中身(閉じているときは null)
  const [deleting, setDeleting] = useState<Skill | null>(null); // 削除の確認ダイアログの、対象(閉じているときは null)
  const [notice, setNotice] = useState<Notice | null>(null); // 画面の上に出す、お知らせ
  const [busy, setBusy] = useState(false); // 移動・並べ替えの通信中か(通信中は、次のドラッグと並べ替えを受け付けない)
  const [sortingStatus, setSortingStatus] = useState<Status | null>(null); // 並べ替えの通信中の列(ボタンの表示用)
  const focusAfterRender = useRef<Status | null>(null); // 次の描画のあとに、フォーカスを移す列(削除のあと)
  const sortingRef = useRef(false); // 並べ替えの通信中か(同じ瞬間の、2回目のクリックも防ぐため、画面の更新を待たずに読める形で持つ)

  // ドラッグ中の状態。ドラッグしていないときは、どちらも null
  const [activeId, setActiveId] = useState<number | null>(null); // つかんでいるカード
  const [dragItems, setDragItems] = useState<ColumnItems | null>(null); // 列ごとの、カードの並び(見た目用。まだ保存しない)
  const dragItemsRef = useRef<ColumnItems | null>(null); // dragItems の、最新の値(判定の関数から、すぐ読めるように)
  const lastOverId = useRef<UniqueIdentifier | null>(null); // 直前に重なっていたカード・列
  const onTarget = useRef(true); // いま、カーソルが、実際にカード・列の上にあるか(離したときに、列の外なら、移動しない)

  const sensors = useSensors(
    // マウスは、6px 以上動かしたときだけ、ドラッグを始める(少し動かしただけなら、クリック=編集を開く)
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // キーボード: Space でつかみ、矢印で動かし、Space で置く。Esc でやめる
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // ドラッグ中は、見た目用の並びで表示する。そうでなければ、スキルの一覧から作る
  const columns = dragItems ? columnsFromItems(skills, dragItems) : groupByStatus(skills);
  const activeSkill = activeId === null ? null : (skills.find((skill) => skill.id === activeId) ?? null);
  const dropStatus = dragItems && activeId !== null ? findStatus(dragItems, activeId) : null; // 置かれる列(枠を強調する)

  // 削除のあと、その列の見出しにフォーカスを移す(キーボードの人が、ページの先頭に戻されないように)。
  // ダイアログが閉じて、フォーカスが戻ろうとするのは、もう消えたボタン。その動きより、あとで実行する必要がある(この部品の描画のあと)
  useEffect(() => {
    const status = focusAfterRender.current;
    if (status === null) return;
    focusAfterRender.current = null;
    document.getElementById(`list-${status}`)?.focus();
  });

  function updateDragItems(next: ColumnItems | null) {
    dragItemsRef.current = next;
    setDragItems(next);
  }

  function endDrag() {
    setActiveId(null);
    updateDragItems(null);
    lastOverId.current = null;
  }

  // 別の場所で、すでに削除されていた(404)ときに、API から最新の一覧を取り直す。取り直せたら true
  async function refreshFromServer(message: string): Promise<boolean> {
    try {
      setSkills(await fetchSkills(browserApiUrl()));
      setNotice({ text: message, tone: "info" });
      return true;
    } catch {
      return false; // 取り直せなかったときは、もとのエラーを、フォームやダイアログに表示する
    }
  }

  // 追加・編集フォームの「保存」。成功したら、画面に反映して、フォームを閉じる。
  // 失敗したら、例外がフォームに伝わり、フォームの中に、エラーが表示される。
  async function handleSubmit(target: FormTarget, input: SkillInput) {
    try {
      if (target.kind === "add") {
        const created = await createSkill(target.status, input);
        setSkills((current) => [...current, created]); // その列の末尾に増える(並び順は、サーバーが決めた値)
      } else {
        const updated = await updateSkill(target.skill.id, input);
        setSkills((current) => replaceSkill(current, updated));
      }
      setNotice(null);
      setForm(null);
    } catch (error) {
      if (target.kind === "edit" && error instanceof ApiError && error.status === 404) {
        const refreshed = await refreshFromServer(`「${target.skill.name}」は、すでに削除されていました。最新の状態に更新しました。`);
        if (refreshed) {
          setForm(null);
          return;
        }
      }
      throw error;
    }
  }

  // 削除の確認の「削除」。成功したら、画面から消して(同じ列の並び順を詰める)、ダイアログを閉じる。
  async function handleDelete(target: Skill) {
    try {
      await deleteSkill(target.id);
      focusAfterRender.current = target.status; // 消えたカードのボタンから、フォーカスが行き場をなくさないように、その列の見出しへ移す
      setSkills((current) => removeSkill(current, target.id));
      setNotice(null);
      setDeleting(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        const refreshed = await refreshFromServer(`「${target.name}」は、すでに削除されていました。最新の状態に更新しました。`);
        if (refreshed) {
          setDeleting(null);
          return;
        }
      }
      throw error;
    }
  }

  // ---------- ドラッグ&ドロップ ----------

  function handleDragStart(event: DragStartEvent) {
    if (busy) return; // 前の移動・並べ替えの通信中は、受け付けない
    lastOverId.current = null;
    onTarget.current = true; // つかんだ時点では、カードの上にある
    setActiveId(Number(event.active.id));
    updateDragItems(itemsFromSkills(skills)); // 見た目用の並びを、いまの一覧から作る
  }

  // ドラッグ中、別の列の上に来たら、その列に、一時的に入れる(見た目で、場所を空ける)
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    const items = dragItemsRef.current;
    if (!over || !items) return;

    const translated = active.rect.current.translated;
    const next = moveOver(items, Number(active.id), over.id, translated ? isBelow(translated, over.rect) : false);
    if (next !== items) updateDragItems(next);
  }

  // 手を離した。行き先を決めて、動いていれば、移動する
  function handleDragEnd(event: DragEndEvent) {
    const items = dragItemsRef.current;
    const id = Number(event.active.id);
    endDrag();
    // 置ける場所の外で離した(何の上でもない): 元のまま。(event.over は、ちらつき防止のための「直前の行き先」のことがあるので、onTarget でも確かめる)
    if (!items || !event.over || !onTarget.current) return;

    const target = resolveDrop(items, id, event.over.id);
    const current = currentPosition(skills, id);
    if (!target || !current) return;
    if (target.status === current.status && target.index === current.index) return; // 同じ場所: 何もしない

    void commitMove(id, target);
  }

  // 移動する。先に画面を更新して(待たせない)、API に送る。成功したら、サーバーが決めた値(習得日など)で更新する。
  // 失敗したら、元の位置に戻して、エラーを出す。
  async function commitMove(id: number, target: DropTarget) {
    const moved = skills.find((skill) => skill.id === id);
    if (!moved) return;

    const previous = skills; // 失敗したときに、戻すための、元の一覧
    setSkills(moveSkill(previous, id, target.status, target.index, today));
    setBusy(true);
    setNotice(null);

    try {
      const fromServer = await requestMove(id, target.status, target.index);
      setSkills((current) => replaceSkill(current, fromServer)); // 習得日などは、サーバーが決めた値にする
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        const refreshed = await refreshFromServer(`「${moved.name}」は、すでに削除されていました。最新の状態に更新しました。`);
        if (refreshed) return;
      }
      setSkills(previous);
      setNotice({
        text: `「${moved.name}」を移動できませんでした。元の位置に戻しました。${toFormErrors(error).general ?? ""}`,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  // 「優先度順」。API に頼んで、返ってきた「その列のスキル」で、列を置き換える(並び順は、サーバーが決めた値)。
  // 失敗したら、画面はそのままで、エラーを出す。
  async function handleSort(status: Status) {
    // 通信中・ドラッグ中は、ボタンが押せない(sortDisabled)。ここでは、同じ瞬間の2回目のクリックだけを、防ぐ(画面の更新を待たない)
    if (status === "mastered" || sortingRef.current) return;
    sortingRef.current = true;
    setSortingStatus(status);
    setBusy(true);
    setNotice(null);

    try {
      const sorted = await requestSort(status);
      setSkills((current) => replaceColumn(current, status, sorted));
    } catch (error) {
      setNotice({
        text: `「${STATUS_LABELS[status]}」を優先度順に並べ替えできませんでした。${toFormErrors(error).general ?? ""}`,
        tone: "error",
      });
    } finally {
      sortingRef.current = false;
      setSortingStatus(null);
      setBusy(false);
    }
  }

  const editing = form?.kind === "edit" ? form.skill : null;

  return (
    <>
      {notice && (
        <div
          className={`notice${notice.tone === "error" ? " error" : ""}`}
          role={notice.tone === "error" ? "alert" : "status"}
          aria-label="お知らせ" // 名前をつける(@dnd-kit の、読み上げ用の領域と、区別できるように)
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)}>
            閉じる
          </button>
        </div>
      )}

      <DndContext
        id="skill-board-drag-instructions" // つかみ方の説明の要素の id(画面の作り直しのときに、id が食い違わないように、固定する)
        sensors={sensors}
        // 「いま、どのカード・列の上にいるか」の判定(ドラッグ中に、呼ばれる)
        collisionDetection={(args) =>
          detectCollisions(args, {
            getItems: () => dragItemsRef.current,
            getLastOverId: () => lastOverId.current,
            setLastOverId: (id) => {
              lastOverId.current = id;
            },
            setOnTarget: (value) => {
              onTarget.current = value;
            },
          })
        }
        accessibility={{
          announcements: buildAnnouncements(skills),
          screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={endDrag}
      >
        <main className="board" aria-label="スキルボード">
          {STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              skills={columns[status]}
              today={today}
              onAdd={(addStatus) => setForm({ kind: "add", status: addStatus })}
              onEdit={(skill) => setForm({ kind: "edit", skill })}
              onDelete={setDeleting}
              onSort={handleSort}
              sortDisabled={busy || activeId !== null}
              sorting={sortingStatus === status}
              highlighted={dropStatus === status}
              dragDisabled={busy}
            />
          ))}
        </main>

        {/* ドラッグ中に、カーソルについて動くコピー */}
        <DragOverlay>
          {activeSkill ? <SkillCard skill={activeSkill} today={today} overlay onEdit={NOOP} onDelete={NOOP} /> : null}
        </DragOverlay>
      </DndContext>

      <SkillForm
        open={form !== null}
        heading={form?.kind === "add" ? `スキルを追加(${STATUS_LABELS[form.status]})` : "スキルを編集"}
        initial={
          editing
            ? { name: editing.name, note: editing.note ?? "", priority: editing.priority, dueDate: editing.dueDate ?? "" }
            : undefined
        }
        // 習得日は、習得済みのスキルの編集のときだけ、表示のみで出す
        readonlyAcquiredOn={editing?.status === "mastered" ? (editing.acquiredOn ?? "-") : undefined}
        onSubmit={(input) => handleSubmit(form!, input)}
        onCancel={() => setForm(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`「${deleting?.name ?? ""}」を削除しますか?`}
        message="この操作は取り消せません。"
        confirmLabel="削除"
        onConfirm={() => handleDelete(deleting!)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
