//! macOSウィンドウまわりの副作用をまとめる。
//! NSPanel化・グローバルショートカット・メニューバートレイをここで扱う。

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Emitter, Manager, WebviewWindow,
};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::commands::DbState;
use crate::db::repo;

/// メインウィンドウのラベル（tauri.conf.json の windows[].label と一致させる）
pub const MAIN_WINDOW_LABEL: &str = "main";

/// パネルの角丸半径。
/// tauri.conf.json の windowEffects.radius と CSS の .av-glass の border-radius が
/// 同じ値である必要がある。ズレると効果ビューだけ四角くなり、影も角丸に沿わなくなる。
pub const PANEL_CORNER_RADIUS: f64 = 16.0;

// NSPanelのサブクラスを定義する。
// can_become_key_window: 装飾なしウィンドウでもキーボード入力を受け取れるようにする
// is_floating_panel: 他アプリのウィンドウより手前に浮かせる
// hides_on_deactivate: 勝手に消えると操作しづらいので false（明示的なEsc/ホットキーで閉じる）
tauri_panel! {
    panel!(AvoliqPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })

    // パネルのNSWindowDelegate。キーウィンドウでなくなったことを検知する。
    panel_event!(AvoliqPanelEvents {
        window_did_resign_key(notification: &NSNotification) -> ()
    })
}

/// メインウィンドウをNSPanel化し、Spotlight風の見た目・挙動を設定する。
pub fn init_panel(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let window: WebviewWindow = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or("メインウィンドウが見つかりません")?;

    let panel = window.to_panel::<AvoliqPanel>()?;

    // 非アクティブ化パネル: アプリをアクティブにせずキー入力だけ受け取る（＝フォーカスを奪わない）
    // borderless: タイトルバーなし
    // 注意: StyleMask::borderless() はビットORではなくマスク全体を上書きする実装なので、
    // 必ず borderless() を先に呼んでから nonactivating_panel() を足すこと。
    // 逆順にすると NonactivatingPanel ビットが消えてフォーカスを奪う挙動になる。
    panel.set_style_mask(StyleMask::empty().borderless().nonactivating_panel().value());

    // 通常ウィンドウより手前のフローティングレベル
    panel.set_level(PanelLevel::Floating.value());

    // 全スペースで表示し、スペース移動に追従せず、フルスクリーンアプリの上にも出す。
    // Cmd+Tab のウィンドウ循環には出さない。
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .stationary()
            .full_screen_auxiliary()
            .ignores_cycle()
            .value(),
    );

    // 角丸はネイティブ側にも伝える（透過ウィンドウの影を角丸に合わせるため）
    panel.set_corner_radius(PANEL_CORNER_RADIUS);
    panel.set_transparent(true);
    panel.set_has_shadow(true);

    // パレット外のクリック等でキーウィンドウでなくなったら、Spotlightと同様に自動で閉じる。
    // 非アクティブ化パネルは hides_on_deactivate では拾えないため、resignKey で検知する。
    // ハンドラは set_event_handler 側が retain して保持する。
    let events = AvoliqPanelEvents::new();
    let app_handle = window.app_handle().clone();
    events.window_did_resign_key(move |_notification| {
        hide_panel(&app_handle);
    });
    panel.set_event_handler(Some(events.as_ref()));

    Ok(())
}

/// パレットを表示してキーウィンドウにする
pub fn show_panel(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(MAIN_WINDOW_LABEL) {
        panel.show_and_make_key();
    }
}

/// パレットを隠す
pub fn hide_panel(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(MAIN_WINDOW_LABEL) {
        panel.hide();
    }
}

/// パレットの表示/非表示を切り替える。
/// グローバルショートカットのハンドラとホットキー再登録処理の両方がここを呼ぶ。
pub fn toggle_panel(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(MAIN_WINDOW_LABEL) {
        if panel.is_visible() {
            panel.hide();
        } else {
            panel.show_and_make_key();
        }
    }
}

/// ホットキー登録に失敗したときにフロントへ通知するイベント名（payloadは失敗メッセージ文字列）
pub const HOTKEY_ERROR_EVENT: &str = "hotkey-error";

/// settingsテーブルの hotkey キー（既定 Alt+Space）を読んでグローバルショートカットを登録する。
///
/// 登録に失敗したらフロントへ `hotkey-error` を emit する。ただし起動直後はフロントの
/// listen が間に合わないことがあるので、同じメッセージを settings の `hotkeyError` にも書く。
/// 成功したときは空文字で上書きして過去のエラーをクリアする。
///
/// emit・settings記録は成功/失敗いずれでも行ったうえで、失敗時は呼び出し元へ Err を返す。
/// 呼び出し元（起動時 / reregister_hotkey）が失敗時の扱いを判断する。
pub fn register_hotkey(app: &AppHandle) -> Result<(), String> {
    let hotkey = {
        let state = app.state::<DbState>();
        let mut conn = state
            .0
            .lock()
            .map_err(|_| "DB接続のロックに失敗しました".to_string())?;
        repo::setting_get(&mut conn, repo::HOTKEY_SETTING_KEY)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| repo::DEFAULT_HOTKEY.to_string())
    };

    let result = app
        .global_shortcut()
        .on_shortcut(hotkey.as_str(), |app, _shortcut, event| {
            // 押した瞬間だけ反応させる（離したときにも来るので無視する）
            if event.state() == ShortcutState::Pressed {
                toggle_panel(app);
            }
        });

    let message = match result {
        Ok(()) => String::new(),
        Err(error) => format!("ホットキー {hotkey} を登録できませんでした: {error}"),
    };

    if !message.is_empty() {
        let _ = app.emit(HOTKEY_ERROR_EVENT, message.clone());
    }

    let state = app.state::<DbState>();
    let mut conn = state
        .0
        .lock()
        .map_err(|_| "DB接続のロックに失敗しました".to_string())?;
    repo::setting_set(&mut conn, repo::HOTKEY_ERROR_SETTING_KEY, &message)
        .map_err(|e| e.to_string())?;

    if message.is_empty() {
        Ok(())
    } else {
        Err(message)
    }
}

/// 登録済みのショートカットを全部外してから、settingsのhotkeyで登録し直す。
/// ホットキー設定を変更したときに呼ぶ。
pub fn reregister_hotkey(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    register_hotkey(app)
}

/// メニューバー常駐アイコン（開く / 終了）を作る。
pub fn init_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItem::with_id(app, "open", "開く", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .ok_or("既定のウィンドウアイコンが見つかりません")?
                .clone(),
        )
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_panel(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}
