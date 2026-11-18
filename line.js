/* LINE 正式版模式(index.html?line=1 才載入)。261117
   - 身分:LIFF 拿 LINE 的 ID token,每次呼叫伺服器都帶著，伺服器自己去 LINE 驗，只認驗回來的人
   - 次數、結果、記帳都在 Mac mini 活動服務(/slot/api/*,261117 由老賈 jarvis 搬過去);這裡只負責畫面
   - 連不到 / 伺服器回維護中 → 一律顯示 MAINT 那句(261117 Tai 拷問第 4 題),客人畫面不出現「老賈」
   規格:cowork-workspace/02_留存紀錄/261116_star_slot/spec_binding_spin_261117.md */
(function () {
  "use strict";
  const QS = new URLSearchParams(location.search);
  /* 兩個入口(261117 Tai:綁好再點卡片不能重綁、不出現機台):
     卡片 → LIFF「好利連連來綁定」(endpoint 帶 mode=bind),只管綁定;選單 → LIFF「好利連連來拉霸」,玩。
     兩個都在 LINE Login 頻道「拉霸登入測試」(2012655139)底下,ID token 老賈照樣驗得過 */
  const BIND_MODE = QS.get("mode") === "bind";
  const LIFF_ID = BIND_MODE ? "2012655139-D8LHZbUz" : "2012655139-xhvnmiTV";
  /* 本機測試才有的開關:localhost 上可用 &api= 指到本機假伺服器、&mockliff=<假 token> 跳過 LINE 登入 */
  const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const API = LOCAL && QS.get("api") ? QS.get("api") : "https://baton-alkalize-tamale.ngrok-free.dev/slot/api/";
  if (LOCAL && QS.get("mockliff")) {
    window.liff = { init: async () => {}, isLoggedIn: () => true, getIDToken: () => QS.get("mockliff"), login() {}, logout() {} };
  }
  const A = window.__slotApi;
  const SHOPN = A.SHOP.name;
  const CS = SHOPN + "客服";   /* 261117 Tai:客服一律寫商號客服，不用通稱(好利來客服 / 本尊吉客發客服) */
  const MAINT = "系統維護中,請稍後再試。您的拉霸次數都保留著,不會減少。如有問題請洽" + CS;
  const st = A.state, el = A.el;
  const acct = { ready: false, bound: false, status: "", role: "", total: 0, used: 0, remaining: 0 };
  let idToken = "", busy = false, auto = false, sessionSpins = 0, sessionPrize = 0;
  let toAck = null;   /* 261118 斷線補看:這一轉動畫播完後要告訴主機「看過了」 */

  /* ---------- 樣式與元件 ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .lineinfo { width: 21em; margin: 0 auto 0.5em; text-align: center; font-size: 1.05em; color: #fff3a0; letter-spacing: 0.05em; min-height: 1.4em; }
  .lineinfo b { color: #ffd83d; }
  .autobtn { display: block; width: 100%; margin-top: 0.4em; border: 0; cursor: pointer; font: inherit; font-size: 1em; padding: 0.4em 0;
             color: #e8d4ff; background: #3a1626; box-shadow: inset 0 -0.2em 0 #00000055; letter-spacing: 0.1em; }
  .autobtn:disabled { opacity: 0.4; cursor: default; }
  .lm-ov { position: fixed; inset: 0; z-index: 8; background: rgba(15, 5, 25, 0.88); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .lm-card { width: min(92vw, 420px); max-height: 88vh; overflow: auto; background: #2a1020; border: 4px solid #f7c531; box-shadow: 0 0 0 4px #7a3b00;
             padding: 18px 16px; color: #f6e9c8; font-size: 15px; font-weight: 700; line-height: 1.6; }
  .lm-card h2 { margin: 0 0 10px; color: #ffd83d; font-size: 20px; text-align: center; letter-spacing: 0.08em; }
  .lm-card .terms { background: #160a14; padding: 10px 12px; font-size: 13px; font-weight: 500; max-height: 34vh; overflow: auto; }
  .lm-card .terms p { margin: 0 0 8px; }
  .lm-card .terms .th { color: #ffd83d; }
  .lm-card label { display: flex; gap: 8px; align-items: flex-start; margin: 12px 0; }
  .lm-card input[type=text] { width: 100%; font: inherit; font-size: 17px; padding: 8px; border: 2px solid #f7c531; background: #fff; color: #222; }
  .lm-card button { display: block; width: 100%; margin-top: 12px; border: 0; font: inherit; font-size: 18px; padding: 10px 0; cursor: pointer;
                    color: #4a2500; background: #f7c531; box-shadow: inset 0 -4px 0 #b8860b; letter-spacing: 0.15em; }
  .lm-card button:disabled { background: #7a6a5a; color: #3a3030; box-shadow: none; }
  .lm-card .err { color: #ff8a8a; min-height: 1.4em; margin-top: 6px; }
  .lm-big { font-size: 34px; color: #ffd83d; text-align: center; margin: 8px 0; }
  .lm-list { margin: 8px 0; padding: 0; list-style: none; }
  .lm-list li { padding: 6px 4px; border-bottom: 1px dashed #7a3b00; }
  .lm-list .win { color: #ffd83d; }
  .lm-list .no { color: #c9b8a8; font-weight: 500; }`;
  document.head.appendChild(css);

  const info = document.createElement("div");
  info.className = "lineinfo"; info.id = "lineinfo";
  const stage = document.querySelector(".stage");
  const stageEl = stage;
  stageEl.style.visibility = "hidden";          /* 先藏拉霸機:確認是「已綁定且通過」才露出來 */
  stage.insertBefore(info, stage.firstChild);
  /* 261117 Tai:不分兩顆按鈕,只留「拉!」,按一下就把剩下的次數全部自動轉完(拉桿、空白鍵同一顆) */
  function pullAll() {
    if (!acct.ready || busy || st.spinning || auto || acct.remaining <= 0) return;
    auto = true; A.audio(); pull();
  }

  function overlay(html) {
    closeOverlay();
    const ov = document.createElement("div"); ov.className = "lm-ov"; ov.id = "lmov";
    ov.innerHTML = '<div class="lm-card">' + html + "</div>";
    document.body.appendChild(ov);
    return ov;
  }
  function closeOverlay() { const o = document.getElementById("lmov"); if (o) o.remove(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  /* ---------- 呼叫老賈 ---------- */
  async function api(path, body, tries) {
    tries = tries || 2;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(API + path, {
          method: "POST", mode: "cors", cache: "no-store",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
          body: JSON.stringify(Object.assign({ idToken: idToken, shop: A.SHOP_ID }, body || {}))
        });
        let j = {};
        try { j = await r.json(); } catch (e) { j = { ok: false, error: MAINT }; }   /* 伺服器沒開時 ngrok 回的是網頁不是 JSON */
        j._status = r.status;
        if (r.status === 401 && j.relogin && i === 0) { liff.logout(); liff.login({ redirectUri: location.href }); return j; }
        return j;
      } catch (e) {
        if (i === tries - 1) return { ok: false, error: MAINT, _status: 0 };
        await new Promise(res => setTimeout(res, 1200));
      }
    }
  }
  function apply(j) {
    acct.bound = !!j.bound; acct.status = j.status || ""; acct.role = j.role || "";
    if (typeof j.total === "number") { acct.total = j.total; acct.used = j.used; acct.remaining = j.remaining; }
    st.used = acct.used; A.setLimit(acct.total);
  }

  /* ---------- 畫面 ---------- */
  function refresh() {
    const pullBtn = el("pull");
    if (!acct.ready) { pullBtn.disabled = true; return; }
    const n = acct.total, y = acct.remaining, x = Math.min(acct.used + (st.spinning ? 0 : 1), n);
    el("counter").textContent = y > 0 ? "還剩 " + y + " 轉" : "轉完了";
    info.innerHTML = acct.role ? esc(acct.role) + "|" + (y > 0 ? "第 <b>" + x + "</b> 轉 / 共 " + n + " 轉 還剩 <b>" + y + "</b> 轉" + (y === 1 && !st.spinning ? "(最後一轉)" : "")
                                                       : "共 " + n + " 轉，已全部轉完") : "";
    pullBtn.disabled = st.spinning || busy || auto || y <= 0;
    pullBtn.textContent = auto ? "轉動中…" : (y <= 0 && !st.spinning ? "轉完了" : "拉！");
  }

  async function pull() {
    if (!acct.ready || busy || st.spinning || acct.remaining <= 0) return;
    busy = true; refresh();
    A.hideJackpot(); A.audio(); A.sfx.pull();
    A.setMsg("轉動中…");
    const reqId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const j = await api("spin", { reqId: reqId }, 3);
    busy = false;
    if (!j.ok || !j.result) {
      auto = false;
      if (typeof j.remaining === "number") apply(j);
      A.setMsg(j.error || "這一轉沒成功，請再按一次"); refresh(); return;
    }
    apply(j); sessionSpins++; sessionPrize += j.result.prize || 0;
    toAck = j.spinNo || null;
    A.startSpin(j.result);
  }

  /* 261118 斷線補看:動畫播完才算客人看過;送失敗沒關係,下次打開會再補跳 */
  function ackSeen(nos) {
    nos = (nos || []).filter(n => n);
    if (!nos.length) return Promise.resolve();
    return api("seen", { spinNos: nos }, 1).catch(() => {});
  }

  function afterFinish(res) {
    if (toAck) { ackSeen([toAck]); toAck = null; }
    if (acct.remaining <= 0) {
      auto = false;
      setTimeout(() => {
        A.setMsg(sessionPrize > 0 ? "轉完了！本次獲得星幣 " + sessionPrize : "轉完了，下次再來", sessionPrize > 0);
        overlay('<h2>謝謝您的參與</h2><div class="lm-big">' + (sessionPrize > 0 ? "星幣 " + sessionPrize : "下次再來") + "</div>" +
          (sessionPrize > 0
            ? "<div>本次共轉 " + sessionSpins + " 次，獲得星幣 " + sessionPrize + "。中獎回饋會由" + CS + "確認後發放。</div>"
            : "<div>本次共轉 " + sessionSpins + " 次，這次運氣稍微害羞了一點。累計儲值滿額會再送次數，下次再來試試手氣！</div>") +
          '<button id="lmclose">好</button>');
        document.getElementById("lmclose").onclick = closeOverlay;
      }, res.win && res.symbols[0] === 0 ? 4800 : 1400);
    } else if (auto) {
      setTimeout(pull, res.win ? (res.symbols[0] === 0 ? 4800 : 1800) : 900);
    } else if (acct.remaining === 1) {
      setTimeout(() => A.setMsg("剩最後一轉！"), 1400);
    }
    refresh();
  }

  /* 還有次數就離開:跳提醒(次數不會過期，下次進來還在) */
  addEventListener("beforeunload", e => { if (acct.ready && acct.remaining > 0) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && acct.ready && acct.remaining > 0 && !st.spinning && !busy && !auto)
      A.setMsg("還剩 " + acct.remaining + " 次，次數會為您保留");
  });

  /* ---------- 綁定 ---------- */
  /* 活動說明與同意事項:261117 Tai 給的「星期五」潤筆版(第二則),照原文 */
  const TERMS_INTRO = "親愛的玩家，您好！謝謝您一直以來的支持。為了讓這份回饋順利送到您手上，綁定前請花一分鐘看看以下說明。閱讀並同意後，就可以繼續綁定角色。";
  const TERMS_ITEMS = [
    ["① 回饋次數怎麼算", "這是我們為您準備的回饋贈禮，參加無須另外付費。回饋次數依您的遊戲角色累計儲值金額計算，目前每滿 500 元可轉 1 次，計算方式可能隨活動調整。"],
    ["② 您的資料會用在哪裡", "我們會使用您的 LINE 顯示名稱與識別碼，確認角色是由您本人綁定，並記錄回饋結果。資料僅用於本活動的身分確認、回饋發放與客服查核。"],
    ["③ 綁定後想更換 LINE 帳號", "每個遊戲角色限綁定一個 LINE 帳號。綁定後如需更換，歡迎聯繫" + CS + "，我們會協助您處理。"],
    ["④ 中獎後怎麼領取", "中獎回饋會由" + CS + "確認後發放。如果收到自稱可以「代領」或「代辦」的訊息，請勿相信。有疑問，歡迎向" + CS + "確認。"],
    ["⑤ 這次沒轉完，下次可以接著轉", "剩下的次數會為您保留。下次從" + SHOPN + " LINE 的選單進入活動，就可以接著轉。"],
    ["⑥ 活動規則與異常處理", "回饋內容與活動規則以" + SHOPN + "公告為準。如發現冒用、異常或違反活動規定，主辦方得取消活動資格與回饋，並保留調整、暫停或終止活動的權利。"]
  ];
  const TERMS = "<p>" + esc(TERMS_INTRO) + "</p>" +
    TERMS_ITEMS.map(t => '<p><b class="th">' + esc(t[0]) + "</b><br>" + esc(t[1]) + "</p>").join("");

  function showBind(note) {
    overlay('<h2>贈禮回饋綁定</h2><div class="terms">' + TERMS + "</div>" +
      '<label><input type="checkbox" id="lmagree"> 我已閱讀並同意以上說明</label>' +
      '<div>請輸入您的遊戲角色名稱(只需要填一次)</div><input type="text" id="lmrole" maxlength="30" autocomplete="off">' +
      '<div class="err" id="lmerr">' + esc(note || "") + '</div><button id="lmgo" disabled>送出綁定</button>');
    const agree = document.getElementById("lmagree"), role = document.getElementById("lmrole"), go = document.getElementById("lmgo");
    const upd = () => { go.disabled = !(agree.checked && role.value.trim()); };
    agree.onchange = upd; role.oninput = upd;
    go.onclick = async () => {
      go.disabled = true; go.textContent = "核對中…";
      const j = await api("bind", { role: role.value.trim(), consent: true, shop: A.SHOP_ID });
      go.textContent = "送出綁定";
      if (!j.ok) { document.getElementById("lmerr").textContent = j.error || "送出失敗，請再試一次"; upd(); return; }
      apply(j);
      if (j.bound && j.status === "通過") bindDone();
      else showWait(j.status === "衝突");
    };
  }
  /* 261117 Tai:「送出綁定後 不要有拉霸的畫面出現」→ 綁好只顯示完成與次數,要玩從選單再進來 */
  function bindDone(already) {
    acct.ready = false; refresh();
    overlay("<h2>" + (already ? "您已完成綁定" : "綁定完成") + "</h2><div class=\"lm-big\">" + esc(acct.role) + "</div>" +
      "<div>" + (already ? "您的 LINE 帳號已經綁定這個遊戲角色囉！如需更換，請聯繫" + CS + "。" : "您的遊戲角色已經和 LINE 帳號完成綁定囉！") +
      (acct.remaining > 0 ? "目前可以轉 " + acct.remaining + " 次，" : "目前還沒有回饋次數，累計儲值滿額後就會自動增加，") +
      "請從" + SHOPN + " LINE 下方選單進入拉霸，就可以開始轉囉！</div>" +
      '<button id="lmclose">好</button>');
    document.getElementById("lmclose").onclick = () => {
      try { if (window.liff && liff.closeWindow) { liff.closeWindow(); return; } } catch (e) {}
      overlay("<h2>綁定完成</h2><div>可以關閉這個頁面了。</div>");
    };
  }
  function showWait(conflict) {
    acct.ready = false; refresh();
    el("counter").textContent = "核對中"; A.setMsg("核對中，請稍候");
    if (conflict) overlay("<h2>需要" + CS + "協助</h2><div>這個角色已經綁定過了。我們已通知" + CS + "，會盡快協助您確認。</div>");
    else overlay("<h2>收到囉</h2><div>謝謝您！我們正在幫您核對資料，確認好之後，從" + SHOPN + " LINE 選單進來就可以開始。</div>");
  }
  /* 261118 斷線補看:主機記了、客人沒看到的轉(連線中斷),打開時先逐筆列出,按「好」才進正常畫面 */
  function showUnseen(list, then) {
    const won = list.filter(u => u.win || u.prize > 0);
    const sum = won.reduce((a, u) => a + (u.prize || 0), 0);
    overlay("<h2>上次連線中斷時的結果</h2>" +
      (sum > 0 ? '<div class="lm-big">中獎 星幣 ' + sum + "</div>" : "") +
      "<div>上次轉的時候網路斷了，下面這 " + list.length + " 轉的結果都有記錄下來：</div>" +
      '<ul class="lm-list">' + list.map(u => "<li>" + esc((u.names || []).join(" ")) + "，" +   /* 261118 Tai「照建議 拿掉」:不顯示全站序號 */
        (u.win || u.prize > 0 ? '<span class="win">中 ' + esc(u.prize) + " 星幣</span>" : '<span class="no">沒中</span>') + "</li>").join("") + "</ul>" +
      (sum > 0 ? "<div>中獎回饋會由" + CS + "確認後發放。</div>" : "") +
      '<button id="lmseen">好</button>');
    document.getElementById("lmseen").onclick = async (e) => {
      e.target.disabled = true;
      await ackSeen(list.map(u => u.spinNo));
      then();
    };
  }

  function welcome() {
    stageEl.style.visibility = "visible";        /* 通過的人才看得到拉霸機 */
    acct.ready = true; refresh();
    if (acct.remaining > 0) {
      A.setMsg("拉下拉桿試試手氣");
      overlay("<h2>" + esc(acct.role) + "</h2><div class=\"lm-big\">您可以轉 " + acct.remaining + " 次</div>" +
        "<div style=\"text-align:center\">共 " + acct.total + " 次，已轉 " + acct.used + " 次。祝您好運！</div><button id=\"lmstart\">開始</button>");
      document.getElementById("lmstart").onclick = () => { closeOverlay(); A.audio(); };
    } else {
      A.setMsg("目前還沒有回饋次數");
      overlay("<h2>" + esc(acct.role) + "</h2><div class=\"lm-big\">目前 0 次</div><div>目前還沒有回饋次數。累計儲值滿額後就會自動增加，到時再從" + SHOPN + " LINE 選單進來就可以囉。</div>" +
        '<button id="lmclose">好</button>');
      document.getElementById("lmclose").onclick = closeOverlay;
    }
  }

  /* ---------- 開始 ---------- */
  window.LINEMODE = { pull: pullAll, refresh: refresh, afterFinish: afterFinish, acct: acct };
  function fail(msg) { el("counter").textContent = "無法開始"; A.setMsg(msg); overlay("<h2>無法開始</h2><div>" + esc(msg) + "</div>"); }

  async function start() {
    overlay("<h2>" + esc(SHOPN) + "</h2><div style=\"text-align:center\">正在確認您的 LINE…</div>");
    try {
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      idToken = liff.getIDToken() || "";
      if (!idToken) { fail("拿不到 LINE 身分，請從" + SHOPN + " LINE 選單重新進來"); return; }
      const j = await api("me");
      if (!j.ok) { fail(j.error || MAINT); return; }
      apply(j);
      if (!j.bound) { el("counter").textContent = "請先綁定"; A.setMsg("請先綁定遊戲角色"); showBind(); }
      else if (j.status === "通過" && BIND_MODE) bindDone(true);   /* 卡片入口:已綁定就只告知,不給重綁、不出機台 */
      else if (j.status === "通過" && j.unseen && j.unseen.length) showUnseen(j.unseen, welcome);
      else if (j.status === "通過") welcome();
      else showWait(j.status === "衝突");
    } catch (e) {
      fail("LINE 登入沒成功(" + (e && e.message ? e.message : e) + "),請從" + SHOPN + " LINE 選單重新進來");
    }
  }
  if (window.liff) start();
  else {
    const sdk = document.createElement("script");
    sdk.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    sdk.onerror = () => fail("LINE 元件載入失敗，請關掉重開");
    sdk.onload = start;
    document.head.appendChild(sdk);
  }
  refresh();
})();
