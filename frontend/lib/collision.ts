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
 *   1. カーソルが、重なっているカード・列の上にあれば、それを使う(小さい、カードが先)。カーソルがない(キーボード操作の)ときは、ドラッグ中のカードと重なっているもの。
 *   2. それが「列そのもの」で、その列にカードがあれば、その列の中の、いちばん近いカードを選ぶ(列の余白の上でも、位置が決まる)。
 *   3. どこにも重なっていなければ、直前に重なっていたものを使う(ドラッグ中の、ちらつきを防ぐ)。
 * setOnTarget: 「いま、実際に何かの上にあるか」を、記録する(1、2 で決まれば true。3 の、直前のものを使ったときは false)。
 *   手を離したときに、列の外(何の上でもない)なら、移動せずに、元の位置に戻すために使う。
 *   (「直前のもの」を返すのは、ちらつきを防ぐための、見た目だけの仕組み。それを、離した場所として扱ってはいけない)
 * getItems: いまの、列ごとの並び(ドラッグ中でなければ null)。
 * getLastOverId / setLastOverId: 直前に重なっていたものを、読む・覚えておく。
 *   (React の決まりで、描画中に ref を渡せないので、ref そのものではなく、読み書きする関数を受け取る)
 */
export type CollisionOptions = {
  getItems: () => ColumnItems | null;
  getLastOverId: () => UniqueIdentifier | null;
  setLastOverId: (id: UniqueIdentifier | null) => void;
  setOnTarget: (onTarget: boolean) => void;
};

export function detectCollisions(
  args: Parameters<CollisionDetection>[0],
  { getItems, getLastOverId, setLastOverId, setOnTarget }: CollisionOptions,
): ReturnType<CollisionDetection> {
  // カーソル(マウス)があるときは、カーソルの下だけで決める。カーソルが、何の上にもない(列と列のすき間、列の外)ときは、
  // コピーのカードの重なりでは決めずに、直前の行き先を保つ(下の3)。
  //   重なりで決めると、カードが列を移るたびに、レイアウトが変わって、重なりの大きい列が入れ替わり、
  //   2つの列の間を、際限なく行き来して、「Maximum update depth exceeded」で画面が壊れる(実際のブラウザで起きた)。
  // カーソルがない(キーボードで動かしている)ときだけ、コピーのカードの重なりで決める。
  const intersections = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
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
    setOnTarget(true);
    return [{ id: overId }];
  }

  setOnTarget(false); // どこの上でもない。見た目のためだけに、直前のものを返す
  const lastOverId = getLastOverId();
  return lastOverId != null ? [{ id: lastOverId }] : [];
}
