// ドラッグ中の、「いま、どのカード・どの列の上にいるか」の判定。@dnd-kit の公式の、複数の列の例に合わせた形。
import {
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { statusFromColumnDropId, type ColumnItems } from "@/lib/drag";

/*
 * 判定の順番:
 *   1. カーソルが、重なっているカード・列の上にあれば、それを使う(小さい、カードが先)。なければ、ドラッグ中のカードと重なっているもの。
 *   2. それが「列そのもの」で、その列にカードがあれば、その列の中の、いちばん近いカードを選ぶ(列の余白の上でも、位置が決まる)。
 *   3. どこにも重なっていなければ、直前に重なっていたものを使う(ドラッグ中の、ちらつきを防ぐ)。
 * getItems: いまの、列ごとの並び(ドラッグ中でなければ null)。
 * getLastOverId / setLastOverId: 直前に重なっていたものを、読む・覚えておく。
 *   (React の決まりで、描画中に ref を渡せないので、ref そのものではなく、読み書きする関数を受け取る)
 */
export type CollisionOptions = {
  getItems: () => ColumnItems | null;
  getLastOverId: () => UniqueIdentifier | null;
  setLastOverId: (id: UniqueIdentifier | null) => void;
};

export function detectCollisions(
  args: Parameters<CollisionDetection>[0],
  { getItems, getLastOverId, setLastOverId }: CollisionOptions,
): ReturnType<CollisionDetection> {
  const pointerCollisions = pointerWithin(args);
  const intersections = pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
  let overId = getFirstCollision(intersections, "id");

  if (overId != null) {
    const status = statusFromColumnDropId(overId);
    const ids = status ? (getItems()?.[status] ?? []) : [];
    if (status && ids.length > 0) {
      const closest = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => container.id !== overId && ids.includes(container.id as number),
        ),
      });
      overId = closest[0]?.id ?? overId;
    }
    setLastOverId(overId);
    return [{ id: overId }];
  }

  const lastOverId = getLastOverId();
  return lastOverId != null ? [{ id: lastOverId }] : [];
}
