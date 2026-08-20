import React from "react";
import ReactDOM from "react-dom/client";
// BlockNoteのスタイルはアプリ側のCSSより先に読み込む(index.cssの上書きを効かせるため)
// フォントはアプリ全体で-apple-systemに揃えるため、@blocknote/core/fonts/inter.css は読み込まない
import "@blocknote/shadcn/style.css";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
