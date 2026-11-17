/* LINE 正式版模式(index.html?line=1 才載入)。261117
   - 身分:LIFF 拿 LINE 的 ID token,每次呼叫老賈都帶著,老賈自己去 LINE 驗,只認驗回來的人
   - 次數、結果、記帳都在老賈(jarvis /slot/api/*);這裡只負責畫面
   規格:cowork-workspace/02_留存紀錄/261116_star_slot/spec_binding_spin_261117.md */
(function () {
  "use strict";
  const LIFF_ID = "2012655139-xhvnmiTV";   /* LINE Login 頻道「拉霸登入測試」(Provider 拉霸測試)的 LIFF「好利連連來拉霸」 */
  const QS = new URLSearchParams(location.search);
  /* 本機測試才有的開關:localhost 上可用 &api= 指到本機假伺服器、&mockliff=<假 token> 跳過 LINE 登入 */
  const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const API = LOCAL && QS.get("api") ? QS.get("api") : "https://parchment-bullhorn-shivering.ngrok-free.dev/slot/api/";
  if (LOCAL && QS.get("mockliff")) {
    window.liff = { init: async () => {}, isLoggedIn: () => true, getIDToken: () => QS.get("mockliff"), login() {}, logout() {} };
  }
  const A = window.__slotApi;
  const st = A.state, el = A.el;
  const acct = { ready: false, bound: false, status: "", role: "", total: 0, used: 0, remaining: 0 };
  let idToken = "", busy = false, auto = false, sessionSpins = 0, sessionPrize = 0;

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
  .lm-card label { display: flex; gap: 8px; align-items: flex-start; margin: 12px 0; }
  .lm-card input[type=text] { width: 100%; font: inherit; font-size: 17px; padding: 8px; border: 2px solid #f7c531; background: #fff; color: #222; }
  .lm-card button { display: block; width: 100%; margin-top: 12px; border: 0; font: inherit; font-size: 18px; padding: 10px 0; cursor: pointer;
                    color: #4a2500; background: #f7c531; box-shadow: inset 0 -4px 0 #b8860b; letter-spacing: 0.15em; }
  .lm-card button:disabled { background: #7a6a5a; color: #3a3030; box-shadow: none; }
  .lm-card .err { color: #ff8a8a; min-height: 1.4em; margin-top: 6px; }
  .lm-big { font-size: 34px; color: #ffd83d; text-align: center; margin: 8px 0; }`;
  document.head.appendChild(css);

  const info = document.createElement("div");
  info.className = "lineinfo"; info.id = "lineinfo";
  const stage = document.querySelector(".stage");
  stage.insertBefore(info, stage.firstChild);
  const autoBtn = document.createElement("button");
  autoBtn.className = "autobtn"; autoBtn.id = "autoall"; autoBtn.textContent = "一鍵轉完剩下的";
  el("pull").after(autoBtn);
  autoBtn.addEventListener("click", () => { if (!acct.ready || busy || st.spinning || acct.remaining <= 0) return; auto = true; A.audio(); pull(); });

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
          body: JSON.stringify(Object.assign({ idToken: idToken }, body || {}))
        });
        let j = {};
        try { j = await r.json(); } catch (e) { j = { ok: false, error: "老賈回應格式不對(" + r.status + ")" }; }
        j._status = r.status;
        if (r.status === 401 && j.relogin && i === 0) { liff.logout(); liff.login({ redirectUri: location.href }); return j; }
        return j;
      } catch (e) {
        if (i === tries - 1) return { ok: false, error: "連不到老賈,請稍後再試", _status: 0 };
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
    if (!acct.ready) { pullBtn.disabled = true; autoBtn.disabled = true; return; }
    const n = acct.total, y = acct.remaining, x = Math.min(acct.used + (st.spinning ? 0 : 1), n);
    el("counter").textContent = y > 0 ? "還剩 " + y + " 轉" : "轉完了";
    info.innerHTML = acct.role ? esc(acct.role) + "|" + (y > 0 ? "第 <b>" + x + "</b> 轉 / 共 " + n + " 轉 還剩 <b>" + y + "</b> 轉" + (y === 1 && !st.spinning ? "(最後一轉)" : "")
                                                       : "共 " + n + " 轉,已全部轉完") : "";
    pullBtn.disabled = st.spinning || busy || y <= 0;
    pullBtn.textContent = y <= 0 && !st.spinning ? "轉完了" : (y === 1 ? "最後一轉!" : "拉!");
    autoBtn.disabled = st.spinning || busy || y <= 1 || auto;
    autoBtn.style.display = y > 1 || auto ? "" : "none";
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
      A.setMsg(j.error || "這一轉沒成功,請再按一次"); refresh(); return;
    }
    apply(j); sessionSpins++; sessionPrize += j.result.prize || 0;
    A.startSpin(j.result);
  }

  function afterFinish(res) {
    if (acct.remaining <= 0) {
      auto = false;
      setTimeout(() => {
        A.setMsg(sessionPrize > 0 ? "轉完了!本次獲得星幣 " + sessionPrize : "轉完了,下次再來", sessionPrize > 0);
        overlay('<h2>轉完了</h2><div class="lm-big">' + (sessionPrize > 0 ? "星幣 " + sessionPrize : "這次沒中") + "</div>" +
          "<div>這次轉了 " + sessionSpins + " 轉" + (sessionPrize > 0 ? ",中獎的星幣會由客服確認後發放。" : "。") + "</div>" +
          "<div>之後再儲值滿額,就會有新的次數,從官方帳號選單的「拉霸」進來即可。</div>" +
          '<button id="lmclose">好</button>');
        document.getElementById("lmclose").onclick = closeOverlay;
      }, res.win && res.symbols[0] === 0 ? 4800 : 1400);
    } else if (auto) {
      setTimeout(pull, res.win ? (res.symbols[0] === 0 ? 4800 : 1800) : 900);
    } else if (acct.remaining === 1) {
      setTimeout(() => A.setMsg("剩最後一轉!"), 1400);
    }
    refresh();
  }

  /* 還有次數就離開:跳提醒(次數不會過期,下次進來還在) */
  addEventListener("beforeunload", e => { if (acct.ready && acct.remaining > 0) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && acct.ready && acct.remaining > 0 && !st.spinning && !busy && !auto)
      A.setMsg("還剩 " + acct.remaining + " 轉,次數會保留");
  });

  /* ---------- 綁定 ---------- */
  const TERMS = [
    "【活動說明與同意事項(測試版,正式內容以公告為準)】",
    "1. 本拉霸為儲值滿額回饋活動,次數依您的遊戲角色累計儲值金額計算(目前每滿 500 元 1 次,規則可能調整)。",
    "2. 為確認您是角色本人並記錄抽獎結果,我們會使用您的 LINE 內部識別碼與顯示名稱,僅用於本活動與客服查核。",
    "3. 一個遊戲角色只能綁定一個 LINE 帳號;綁定後如需更換,請洽客服。",
    "4. 抽中的獎勵須經客服審核後發放;如有冒用、異常或違反規定,主辦方得取消資格。",
    "5. 沒轉完的次數會保留,下次從官方帳號選單進來可以繼續。"
  ].map(esc).join("<br>");

  function showBind(note) {
    overlay('<h2>綁定遊戲角色</h2><div class="terms">' + TERMS + "</div>" +
      '<label><input type="checkbox" id="lmagree"> 我已閱讀並同意以上說明</label>' +
      '<div>請輸入您的遊戲角色名稱(只需要填一次)</div><input type="text" id="lmrole" maxlength="30" autocomplete="off">' +
      '<div class="err" id="lmerr">' + esc(note || "") + '</div><button id="lmgo" disabled>送出</button>');
    const agree = document.getElementById("lmagree"), role = document.getElementById("lmrole"), go = document.getElementById("lmgo");
    const upd = () => { go.disabled = !(agree.checked && role.value.trim()); };
    agree.onchange = upd; role.oninput = upd;
    go.onclick = async () => {
      go.disabled = true; go.textContent = "核對中…";
      const j = await api("bind", { role: role.value.trim(), consent: true, shop: A.SHOP_ID });
      go.textContent = "送出";
      if (!j.ok) { document.getElementById("lmerr").textContent = j.error || "送出失敗,請再試一次"; upd(); return; }
      apply(j);
      if (j.bound && j.status === "通過") { closeOverlay(); welcome(); }
      else showWait(j.message || "資料核對中,客服確認後就能開始玩。");
    };
  }
  function showWait(msg) {
    acct.ready = false; refresh();
    el("counter").textContent = "核對中"; A.setMsg("核對中,請稍候");
    overlay("<h2>收到了</h2><div>" + esc(msg) + "</div><div>確認好之後,從官方帳號選單的「拉霸」重新進來就可以玩。</div>");
  }
  function welcome() {
    acct.ready = true; refresh();
    if (acct.remaining > 0) {
      A.setMsg("拉下拉桿試試手氣");
      overlay("<h2>" + esc(acct.role) + "</h2><div class=\"lm-big\">您有 " + acct.remaining + " 轉</div>" +
        "<div style=\"text-align:center\">共 " + acct.total + " 轉,已轉 " + acct.used + " 轉</div><button id=\"lmstart\">開始</button>");
      document.getElementById("lmstart").onclick = () => { closeOverlay(); A.audio(); };
    } else {
      A.setMsg("目前沒有可轉的次數");
      overlay("<h2>" + esc(acct.role) + "</h2><div class=\"lm-big\">目前 0 轉</div><div>儲值滿額後就會有次數,再從官方帳號選單的「拉霸」進來。</div>" +
        '<button id="lmclose">好</button>');
      document.getElementById("lmclose").onclick = closeOverlay;
    }
  }

  /* ---------- 開始 ---------- */
  window.LINEMODE = { pull: pull, refresh: refresh, afterFinish: afterFinish, acct: acct };
  function fail(msg) { el("counter").textContent = "無法開始"; A.setMsg(msg); overlay("<h2>無法開始</h2><div>" + esc(msg) + "</div>"); }

  async function start() {
    try {
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      idToken = liff.getIDToken() || "";
      if (!idToken) { fail("拿不到 LINE 身分,請從官方帳號選單的「拉霸」重新進來"); return; }
      const j = await api("me");
      if (!j.ok) { fail(j.error || "連不到老賈,請稍後再試"); return; }
      apply(j);
      if (!j.bound) { el("counter").textContent = "請先綁定"; A.setMsg("請先綁定遊戲角色"); showBind(); }
      else if (j.status === "通過") welcome();
      else showWait(j.status === "衝突" ? "這個角色已經被綁定了,我們已通知客服協助確認。" : "資料核對中,客服確認後就能開始玩,請稍候。");
    } catch (e) {
      fail("LINE 登入沒成功(" + (e && e.message ? e.message : e) + "),請從官方帳號選單重新進來");
    }
  }
  if (window.liff) start();
  else {
    const sdk = document.createElement("script");
    sdk.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    sdk.onerror = () => fail("LINE 元件載入失敗,請關掉重開");
    sdk.onload = start;
    document.head.appendChild(sdk);
  }
  refresh();
})();
