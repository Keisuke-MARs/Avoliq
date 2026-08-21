# Avoliq

思考を整え、次の一歩へ進めるmacOS向けタスク管理パレットです。

## 配色まわりの注意

`npx shadcn add` を実行すると `src/index.css` の shadcn テーマ変数が
直値で上書きされ、`var(--av-*)` への参照が失われる。
CLI を実行した後は必ず `git diff src/index.css` を確認して、
テーマ変数が `var(--av-*)` を指したままであることを確かめること。

色の実値は `src/index.css` のトークン定義ブロックにだけ置く。
設計は `docs/superpowers/specs/2026-08-21-avoliq-color-system-design.md` を参照。
