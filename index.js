const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
require('dotenv').config();

const app = express();

// LINE Bot 設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(lineConfig);

// Supabase 設定
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ===== 台灣時區處理 =====
// 台灣固定為 UTC+8，且不實施日光節約時間，所以用固定位移即可
const TW_OFFSET_MS = 8 * 60 * 60 * 1000;

// 取得「現在」的台灣日曆時間（年月日時分）
function taiwanNowParts() {
  const tw = new Date(Date.now() + TW_OFFSET_MS);
  return {
    y: tw.getUTCFullYear(),
    mo: tw.getUTCMonth() + 1, // 1-12
    d: tw.getUTCDate(),
    hh: tw.getUTCHours(),
    mm: tw.getUTCMinutes()
  };
}

// 把「台灣的某個年月日時分」轉成 UTC ISO 字串（存DB或查詢比較用）
function taiwanToUTC(y, mo, d, hh = 0, mm = 0, ss = 0, ms = 0) {
  return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss, ms) - TW_OFFSET_MS).toISOString();
}

// 取得台灣「某一天」的起訖時間（回傳 UTC ISO，給資料庫查詢用）
function taiwanDayRangeISO(y, mo, d) {
  return {
    startISO: taiwanToUTC(y, mo, d, 0, 0, 0, 0),
    endISO: taiwanToUTC(y, mo, d, 23, 59, 59, 999)
  };
}

// ===== 台灣時區的顯示格式 =====
function fmtTWDate(dateInput) {
  return new Date(dateInput).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}
function fmtTWTime(dateInput) {
  return new Date(dateInput).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit'
  });
}
function fmtTWTimeSec(dateInput) {
  return new Date(dateInput).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// 公司位置設定 - 動態讀取環境變數，支援任意數量地點
// 每個地點用 LOCATION{N}_NAME / LOCATION{N}_LAT / LOCATION{N}_LNG / LOCATION{N}_RADIUS 設定
// 沒設定環境變數時使用以下預設值
const DEFAULT_LOCATIONS = [
  { name: '民權總店',   lat: 25.06334,   lng: 121.52144,   radiusMeters: 200 },
  { name: '松山分店',   lat: 25.04913,   lng: 121.57901,   radiusMeters: 300 },
  { name: '宏匯百貨',   lat: 25.05965,   lng: 121.44954,   radiusMeters: 200 },
  { name: '三創',       lat: 25.04552,   lng: 121.53132,   radiusMeters: 200 },
  { name: '統一',       lat: 25.04087,   lng: 121.56540,   radiusMeters: 200 },
  { name: '北藝中心',   lat: 25.0846858, lng: 121.5211427, radiusMeters: 200 },
  { name: '中正紀念堂', lat: 25.034611,  lng: 121.52178,   radiusMeters: 200 }
];

function loadLocations() {
  const locations = [];
  // 從 LOCATION1 開始逐一檢查環境變數，最多支援 50 個地點
  for (let i = 1; i <= 50; i++) {
    const lat = process.env[`LOCATION${i}_LAT`];
    const lng = process.env[`LOCATION${i}_LNG`];
    if (lat === undefined || lng === undefined) continue; // 沒設定就跳過這個編號

    const defaultLoc = DEFAULT_LOCATIONS[i - 1] || {};
    locations.push({
      name: process.env[`LOCATION${i}_NAME`] || defaultLoc.name || `地點${i}`,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radiusMeters: parseInt(process.env[`LOCATION${i}_RADIUS`] || defaultLoc.radiusMeters || 200)
    });
  }
  // 完全沒設定環境變數時，使用內建預設地點
  return locations.length > 0 ? locations : DEFAULT_LOCATIONS;
}

const COMPANY_LOCATIONS = loadLocations();
console.log(`📍 已載入 ${COMPANY_LOCATIONS.length} 個預設打卡地點:`, COMPANY_LOCATIONS.map(l => l.name).join('、'));

// ===== 可自訂規則參數（預設值：環境變數 > 內建）=====
const DEFAULT_MIN_WORK_MINUTES = parseInt(process.env.MIN_WORK_MINUTES || '60');
const DEFAULT_AUTO_CLOCKOUT_TIME = process.env.AUTO_CLOCKOUT_TIME || '23:59';

// 從資料庫讀取規則設定（沒有就用預設值）
async function getRuleSettings() {
  try {
    const { data } = await supabase.from('settings').select('*');
    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });
    const minutes = parseInt(map.min_work_minutes);
    return {
      minWorkMinutes: (Number.isFinite(minutes) && minutes >= 0) ? minutes : DEFAULT_MIN_WORK_MINUTES,
      autoClockoutTime: (map.auto_clockout_time && /^\d{1,2}:\d{2}$/.test(map.auto_clockout_time))
        ? map.auto_clockout_time : DEFAULT_AUTO_CLOCKOUT_TIME
    };
  } catch (e) {
    // settings 表不存在或讀取失敗時，退回預設值，系統照常運作
    return { minWorkMinutes: DEFAULT_MIN_WORK_MINUTES, autoClockoutTime: DEFAULT_AUTO_CLOCKOUT_TIME };
  }
}

// 從資料庫讀取啟用中的據點（資料庫沒有資料時退回環境變數/內建據點）
async function getActiveLocations() {
  try {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (data && data.length > 0) {
      return data.map(l => ({
        name: l.name,
        lat: parseFloat(l.lat),
        lng: parseFloat(l.lng),
        radiusMeters: parseInt(l.radius_meters) || 200
      }));
    }
  } catch (e) {
    // locations 表不存在時退回預設
  }
  return COMPANY_LOCATIONS;
}

// 計算兩點之間的距離（公尺）
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 地球半徑（公尺）
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // 距離（公尺）
}

// 驗證 GPS 位置 - 檢查是否在任一公司地點範圍內
function isWithinCompanyLocation(latitude, longitude, locations) {
  let closestLocation = null;
  let minDistance = Infinity;
  
  // 檢查所有地點，找出最近的
  for (const location of locations) {
    const distance = calculateDistance(
      location.lat,
      location.lng,
      latitude,
      longitude
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestLocation = location;
    }
  }
  
  const isValid = minDistance <= closestLocation.radiusMeters;
  
  return {
    valid: isValid,
    distance: Math.round(minDistance),
    locationName: closestLocation.name,
    allowedRadius: closestLocation.radiusMeters
  };
}

// 處理打卡
async function handleAttendance(userId, userName, type, latitude, longitude) {
  try {
    // 先取得使用者資料（要檢查在職狀態，也要用後台設定的姓名）
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('line_user_id', userId)
      .single();

    // 離職/停用員工不能打卡
    if (user && user.is_active === false) {
      return {
        success: false,
        message: '❌ 無法打卡\n\n您的帳號已被停用\n如有疑問請聯繫管理員'
      };
    }

    // 讀取目前的據點與規則設定（後台可即時修改）
    const [activeLocations, ruleSettings] = await Promise.all([
      getActiveLocations(),
      getRuleSettings()
    ]);

    // 驗證 GPS
    const locationCheck = isWithinCompanyLocation(latitude, longitude, activeLocations);
    
    if (!locationCheck.valid) {
      return {
        success: false,
        message: `❌ 打卡失敗\n\n最近的地點: ${locationCheck.locationName}\n您距離 ${locationCheck.distance} 公尺\n超出允許範圍 ${locationCheck.allowedRadius} 公尺\n請在公司範圍內打卡`
      };
    }

    // 下班打卡：檢查「今天」最近一次上班是否已滿最低工作時間
    if (type === 'clock_out') {
      const tw = taiwanNowParts();
      const { startISO, endISO } = taiwanDayRangeISO(tw.y, tw.mo, tw.d);

      const { data: todayClockIns } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'clock_in')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastClockIn = (todayClockIns && todayClockIns.length > 0) ? todayClockIns[0] : null;

      if (lastClockIn) {
        const lastClockInTime = new Date(lastClockIn.created_at);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastClockInTime) / 1000 / 60);

        if (diffMinutes < ruleSettings.minWorkMinutes) {
          return {
            success: false,
            message: `⚠️ 下班打卡失敗\n\n您在 ${diffMinutes} 分鐘前剛上班打卡\n需要上班至少 ${ruleSettings.minWorkMinutes} 分鐘後才能下班打卡\n\n還需要等待 ${ruleSettings.minWorkMinutes - diffMinutes} 分鐘`
          };
        }
      }
    }

    // 決定記錄用的姓名：優先用後台設定的姓名，其次才是 LINE 暱稱
    const recordName = (user && user.name) ? user.name : (userName || '員工');

    // 使用者不存在時建立（第一次打卡的新員工）
    if (!user) {
      await supabase
        .from('users')
        .insert([
          {
            line_user_id: userId,
            name: userName || '員工',
            is_active: true
          }
        ]);
    }

    // 記錄打卡
    const { data, error } = await supabase
      .from('attendance')
      .insert([
        {
          user_id: userId,
          user_name: recordName,
          type: type,
          latitude: latitude,
          longitude: longitude,
          distance_from_company: locationCheck.distance,
          location_name: locationCheck.locationName
        }
      ])
      .select()
      .single();

    if (error) throw error;

    const time = fmtTWTimeSec(data.created_at);

    return {
      success: true,
      message: `✅ ${type === 'clock_in' ? '上班' : '下班'}打卡成功！\n\n時間: ${time}\n地點: ${locationCheck.locationName}\n距離: ${locationCheck.distance} 公尺`
    };

  } catch (error) {
    console.error('打卡錯誤:', error);
    return {
      success: false,
      message: '❌ 系統錯誤，請稍後再試或聯繫管理員'
    };
  }
}

// 把長訊息依 LINE 單則上限切成多則（保險起見設 4500 字，LINE 上限約 5000）
function splitMessage(text, maxLen = 4500) {
  if (text.length <= maxLen) return [text];
  const lines = text.split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    // 加上這一行後若超過上限，先把目前累積的存起來
    if ((current + line + '\n').length > maxLen && current.length > 0) {
      chunks.push(current.trimEnd());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim().length > 0) chunks.push(current.trimEnd());
  return chunks;
}

// 查詢出勤記錄
// year, month(1-12) 指定要查的月份。不傳則預設本月。
// 回傳「字串陣列」，每個元素是一則要送出的訊息（整月可能超過 LINE 單則上限需分段）
async function getMonthlyAttendance(userId, year, month) {
  try {
    const twNow = taiwanNowParts();
    // 沒指定就用台灣的本月
    const y = (typeof year === 'number') ? year : twNow.y;
    const m = (typeof month === 'number') ? month : twNow.mo; // 1-12

    // 該月在台灣時區的第一天 00:00 與最後一天 23:59:59（轉成 UTC 給DB查詢）
    const firstDay = taiwanToUTC(y, m, 1, 0, 0, 0, 0);
    // 下個月的第 0 天 = 這個月最後一天
    const lastDayDate = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 該月天數
    const lastDay = taiwanToUTC(y, m, lastDayDate, 23, 59, 59, 999);

    const monthLabel = `${y}年${m}月`;
    // 判斷是不是台灣的本月
    const isCurrentMonth = (y === twNow.y && m === twNow.mo);
    const periodText = isCurrentMonth ? '本月' : '';

    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', firstDay)
      .lte('created_at', lastDay)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const title = periodText ? `${monthLabel}（${periodText}）` : monthLabel;

    if (!data || data.length === 0) {
      return [`📊 ${title}尚無出勤記錄`];
    }

    // 按日期分組，每天可以有多筆上班/下班記錄（資料已由舊到新排序）
    const grouped = {};
    data.forEach(record => {
      const date = fmtTWDate(record.created_at);
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push({
        type: record.type,
        time: fmtTWTime(record.created_at),
        location: record.location_name || ''
      });
    });

    const dates = Object.keys(grouped);
    let message = `📊 ${title}出勤記錄\n（共 ${dates.length} 天）\n\n`;
    dates.forEach(date => {
      message += `${date}\n`;
      grouped[date].forEach(rec => {
        const typeText = rec.type === 'clock_in' ? '上班' : '下班';
        const locationText = rec.location ? `（${rec.location}）` : '';
        message += `  ${typeText}: ${rec.time}${locationText}\n`;
      });
      message += '\n';
    });

    // 整月內容可能很長，分段送出
    const parts = splitMessage(message.trimEnd());
    // LINE replyMessage 一次最多 5 則，超過則保留前 4 則並附提示
    if (parts.length > 5) {
      const kept = parts.slice(0, 4);
      kept.push('⚠️ 本月記錄過多，僅顯示部分。\n如需完整資料，請聯繫管理員從後台匯出。');
      return kept;
    }
    return parts;

  } catch (error) {
    console.error('查詢錯誤:', error);
    return ['❌ 查詢失敗，請稍後再試'];
  }
}

// 產生「選擇月份」的 Quick Reply 按鈕（過去 12 個月）
function buildMonthPickerMessage() {
  const twNow = taiwanNowParts();
  const items = [];
  for (let i = 0; i < 12; i++) {
    // 從台灣的本月往前推 i 個月
    const d = new Date(Date.UTC(twNow.y, (twNow.mo - 1) - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    // label 最多 20 字；postback 用 data 帶回年月
    const label = i === 0 ? `${m}月(本月)` : `${y}/${m}`;
    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: label,
        data: `query_month=${y}-${m}`,
        displayText: `查詢 ${y}年${m}月`
      }
    });
  }
  return {
    type: 'text',
    text: '請選擇要查詢的月份（可查過去一年）👇',
    quickReply: { items }
  };
}

// LINE Webhook
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    
    await Promise.all(events.map(async (event) => {
      if (event.type === 'message') {
        const { userId } = event.source;
        
        // 取得使用者資料
        const profile = await client.getProfile(userId);
        
        if (event.message.type === 'text') {
          const text = event.message.text.trim();

          // 處理指令
          if (text === '上班' || text === '打卡' || text.toLowerCase() === 'clock in') {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '請分享您的位置以完成上班打卡\n\n👇 點選下方「+」→「位置資訊」'
            });
          } else if (text === '下班' || text.toLowerCase() === 'clock out') {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '請分享您的位置以完成下班打卡\n\n👇 點選下方「+」→「位置資訊」'
            });
          } else if (text === '查詢' || text === '本月出勤' || text === '記錄' || text === '本月') {
            const messages = await getMonthlyAttendance(userId);
            await client.replyMessage(event.replyToken,
              messages.map(t => ({ type: 'text', text: t }))
            );
          } else if (text === '選擇月份' || text === '月份' || text === '其他月份' || text === '歷史查詢') {
            await client.replyMessage(event.replyToken, buildMonthPickerMessage());
          } else if (text === '幫助' || text === '說明' || text === '?') {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: `📱 LINE 打卡系統使用說明\n\n` +
                `上班打卡:\n1. 傳送「上班」\n2. 分享位置資訊\n\n` +
                `下班打卡:\n1. 傳送「下班」\n2. 分享位置資訊\n\n` +
                `查詢記錄:\n• 「查詢」- 查看本月完整出勤\n• 「選擇月份」- 查詢過去一年任一月份\n\n` +
                `其他指令:\n• 「幫助」- 顯示此說明`
            });
          } else {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '❓ 不認識的指令\n\n請傳送「幫助」查看使用說明'
            });
          }

        } else if (event.message.type === 'location') {
          // 處理位置資訊
          const { latitude, longitude } = event.message;

          // 用台灣時區判斷「今天」的範圍
          const tw = taiwanNowParts();
          const { startISO, endISO } = taiwanDayRangeISO(tw.y, tw.mo, tw.d);

          // 取得今天最後一筆打卡，依此決定這次是上班還是下班
          // 規則：最後一筆是上班 → 這次是下班；否則（最後是下班 / 今天還沒打）→ 這次是上班
          const { data: todayPunches } = await supabase
            .from('attendance')
            .select('*')
            .eq('user_id', userId)
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .order('created_at', { ascending: false })
            .limit(1);

          const lastPunch = (todayPunches && todayPunches.length > 0) ? todayPunches[0] : null;
          const type = (lastPunch && lastPunch.type === 'clock_in') ? 'clock_out' : 'clock_in';

          const result = await handleAttendance(
            userId,
            profile.displayName,
            type,
            latitude,
            longitude
          );

          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: result.message
          });
        }
      } else if (event.type === 'postback') {
        // 處理選擇月份按鈕
        const { userId } = event.source;
        const data = event.postback.data || '';
        const match = data.match(/^query_month=(\d{4})-(\d{1,2})$/);

        if (match) {
          const year = parseInt(match[1], 10);
          const month = parseInt(match[2], 10);
          const messages = await getMonthlyAttendance(userId, year, month);
          await client.replyMessage(event.replyToken,
            messages.map(t => ({ type: 'text', text: t }))
          );
        }
      } else if (event.type === 'follow') {
        // 新使用者加入
        const { userId } = event.source;
        const profile = await client.getProfile(userId);
        
        await supabase
          .from('users')
          .insert([
            {
              line_user_id: userId,
              name: profile.displayName,
              is_active: true
            }
          ]);

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `👋 歡迎 ${profile.displayName}！\n\n您已成功加入打卡系統\n\n傳送「幫助」查看使用說明`
        });
      }
    }));

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook 錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});

// 管理後台 API
app.use(cors());
app.use(express.json());

// ===== 後台 API 密碼保護 =====
// 設定環境變數 ADMIN_PASSWORD 後，所有 /api/ 開頭的請求都要在
// header 帶 x-admin-password 或 query 帶 ?password= 才能存取
// （未設定 ADMIN_PASSWORD 時不驗證，方便初期測試，但強烈建議設定）
function requireAdminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return next(); // 未設定就不驗證

  const provided = req.headers['x-admin-password'] || req.query.password;
  if (provided === adminPassword) return next();

  return res.status(401).json({ error: 'unauthorized', message: '需要管理員密碼' });
}

app.use('/api', requireAdminAuth);

// 取得所有員工列表
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新員工資料
app.put('/api/users/:lineUserId', async (req, res) => {
  try {
    const { lineUserId } = req.params;
    const { name, employee_no, department, phone, hire_date, is_active, notes } = req.body;

    // 組合要更新的欄位（只更新有傳進來的）
    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (employee_no !== undefined) updateData.employee_no = employee_no || null;
    if (department !== undefined) updateData.department = department || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (hire_date !== undefined) updateData.hire_date = hire_date || null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('line_user_id', lineUserId)
      .select()
      .single();

    if (error) throw error;

    // 如果改了姓名，同步更新該員工過去的打卡記錄，讓後台顯示一致
    if (name !== undefined) {
      await supabase
        .from('attendance')
        .update({ user_name: name })
        .eq('user_id', lineUserId);
    }

    res.json({ success: true, user: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 取得出勤記錄
app.get('/api/attendance', async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    
    let query = supabase
      .from('attendance')
      .select('*')
      .order('created_at', { ascending: false });

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手動補卡（管理員在後台幫員工補打卡記錄）
app.post('/api/attendance/manual', async (req, res) => {
  try {
    const { user_id, type, date, time } = req.body;
    // date 格式 YYYY-MM-DD、time 格式 HH:MM（皆為台灣時間）

    if (!user_id || !type || !date || !time) {
      return res.status(400).json({ error: '缺少必要欄位 (user_id, type, date, time)' });
    }
    if (type !== 'clock_in' && type !== 'clock_out') {
      return res.status(400).json({ error: 'type 必須是 clock_in 或 clock_out' });
    }

    const dateMatch = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!dateMatch || !timeMatch) {
      return res.status(400).json({ error: '日期或時間格式錯誤' });
    }

    // 取得員工姓名
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('line_user_id', user_id)
      .single();

    if (!user) {
      return res.status(404).json({ error: '找不到該員工' });
    }

    const createdAtISO = taiwanToUTC(
      parseInt(dateMatch[1]), parseInt(dateMatch[2]), parseInt(dateMatch[3]),
      parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0
    );

    const { data, error } = await supabase
      .from('attendance')
      .insert([{
        user_id: user_id,
        user_name: user.name,
        type: type,
        latitude: 0,
        longitude: 0,
        distance_from_company: 0,
        location_name: '管理員補卡',
        created_at: createdAtISO
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, record: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 刪除打卡記錄（補錯時可以刪掉重補）
app.delete('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 工時計算：指定月份，回傳每位員工每天的工時與月總工時
app.get('/api/work-hours', async (req, res) => {
  try {
    const tw = taiwanNowParts();
    const year = parseInt(req.query.year) || tw.y;
    const month = parseInt(req.query.month) || tw.mo; // 1-12

    const firstDay = taiwanToUTC(year, month, 1, 0, 0, 0, 0);
    const lastDayDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lastDay = taiwanToUTC(year, month, lastDayDate, 23, 59, 59, 999);

    const { data: punches, error } = await supabase
      .from('attendance')
      .select('*')
      .gte('created_at', firstDay)
      .lte('created_at', lastDay)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 依員工、依日期分組，然後配對上下班計算工時
    // 配對規則：依時間順序，每個 clock_in 對應下一個 clock_out
    const byUser = {};
    (punches || []).forEach(p => {
      if (!byUser[p.user_id]) byUser[p.user_id] = { user_name: p.user_name, byDate: {} };
      byUser[p.user_id].user_name = p.user_name; // 用最新的名字
      const dateKey = fmtTWDate(p.created_at);
      if (!byUser[p.user_id].byDate[dateKey]) byUser[p.user_id].byDate[dateKey] = [];
      byUser[p.user_id].byDate[dateKey].push(p);
    });

    const result = [];
    for (const userId of Object.keys(byUser)) {
      const { user_name, byDate } = byUser[userId];
      const days = [];
      let totalMinutes = 0;

      for (const dateKey of Object.keys(byDate)) {
        const dayPunches = byDate[dateKey]; // 已依時間排序
        let dayMinutes = 0;
        let pendingClockIn = null;
        let hasAutoClockOut = false;

        for (const p of dayPunches) {
          if (p.type === 'clock_in') {
            // 連續兩個上班：以較早那個為準（保守計算）
            if (!pendingClockIn) pendingClockIn = p;
          } else {
            if (pendingClockIn) {
              const mins = Math.floor((new Date(p.created_at) - new Date(pendingClockIn.created_at)) / 60000);
              if (mins > 0) dayMinutes += mins;
              pendingClockIn = null;
            }
            if (p.location_name === '系統自動下班') hasAutoClockOut = true;
          }
        }

        totalMinutes += dayMinutes;
        days.push({
          date: dateKey,
          minutes: dayMinutes,
          hours: Math.round(dayMinutes / 60 * 10) / 10, // 小數1位
          hasAutoClockOut: hasAutoClockOut,
          incomplete: pendingClockIn !== null // 有上班沒下班（未配對）
        });
      }

      result.push({
        user_id: userId,
        user_name: user_name,
        total_minutes: totalMinutes,
        total_hours: Math.round(totalMinutes / 60 * 10) / 10,
        days: days
      });
    }

    res.json({ year, month, employees: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== 系統設定 API =====

// 取得目前生效的設定
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getRuleSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新設定（upsert 到 settings 表）
app.put('/api/settings', async (req, res) => {
  try {
    const { minWorkMinutes, autoClockoutTime } = req.body;

    const upserts = [];
    if (minWorkMinutes !== undefined) {
      const m = parseInt(minWorkMinutes);
      if (!Number.isFinite(m) || m < 0 || m > 1440) {
        return res.status(400).json({ error: '下班間隔須為 0-1440 的分鐘數' });
      }
      upserts.push({ key: 'min_work_minutes', value: String(m), updated_at: new Date().toISOString() });
    }
    if (autoClockoutTime !== undefined) {
      if (!/^\d{1,2}:\d{2}$/.test(autoClockoutTime)) {
        return res.status(400).json({ error: '自動下班時間格式須為 HH:MM' });
      }
      upserts.push({ key: 'auto_clockout_time', value: autoClockoutTime, updated_at: new Date().toISOString() });
    }

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('settings')
        .upsert(upserts, { onConflict: 'key' });
      if (error) throw error;
    }

    const settings = await getRuleSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== 據點管理 API =====

// 列出所有據點（含停用的），並標示目前是否使用資料庫據點
app.get('/api/locations', async (req, res) => {
  try {
    let dbLocations = [];
    try {
      const { data } = await supabase
        .from('locations')
        .select('*')
        .order('created_at', { ascending: true });
      dbLocations = data || [];
    } catch (e) { /* 表不存在 */ }

    const usingDatabase = dbLocations.some(l => l.is_active);
    res.json({
      usingDatabase: usingDatabase,
      locations: dbLocations,
      // 資料庫沒有據點時，回傳目前生效的預設據點供匯入參考
      fallbackLocations: usingDatabase ? [] : COMPANY_LOCATIONS
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 一鍵匯入預設據點到資料庫（僅在資料庫尚無據點時允許）
app.post('/api/locations/import-defaults', async (req, res) => {
  try {
    const { data: existing } = await supabase.from('locations').select('id').limit(1);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: '資料庫已有據點，不可重複匯入' });
    }

    const rows = COMPANY_LOCATIONS.map(l => ({
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      radius_meters: l.radiusMeters,
      is_active: true
    }));

    const { error } = await supabase.from('locations').insert(rows);
    if (error) throw error;
    res.json({ success: true, imported: rows.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 新增據點
app.post('/api/locations', async (req, res) => {
  try {
    const { name, lat, lng, radius_meters } = req.body;
    if (!name || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: '缺少必要欄位 (name, lat, lng)' });
    }
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN) || latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
      return res.status(400).json({ error: '座標格式錯誤' });
    }

    const { data, error } = await supabase
      .from('locations')
      .insert([{
        name: name,
        lat: latN,
        lng: lngN,
        radius_meters: parseInt(radius_meters) || 200,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, location: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新據點（含啟用/停用）
app.put('/api/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, lat, lng, radius_meters, is_active } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (lat !== undefined) {
      const latN = parseFloat(lat);
      if (!Number.isFinite(latN) || latN < -90 || latN > 90) return res.status(400).json({ error: '緯度格式錯誤' });
      updateData.lat = latN;
    }
    if (lng !== undefined) {
      const lngN = parseFloat(lng);
      if (!Number.isFinite(lngN) || lngN < -180 || lngN > 180) return res.status(400).json({ error: '經度格式錯誤' });
      updateData.lng = lngN;
    }
    if (radius_meters !== undefined) updateData.radius_meters = parseInt(radius_meters) || 200;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('locations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, location: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== 自動補下班 =====
// 給外部排程服務（如 cron-job.org）每天台灣時間 23:59 呼叫一次
// 找出今天最後一筆是「上班」的員工，自動補一筆下班（時間記為當天 23:59）
// 用 ?token=xxx 簡單保護，需與環境變數 CRON_SECRET 相符（若未設定則不檢查）
app.get('/cron/auto-clockout', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.query.token !== secret) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // 台灣的今天
    const tw = taiwanNowParts();
    const { startISO, endISO } = taiwanDayRangeISO(tw.y, tw.mo, tw.d);
    // 自動下班時間（後台可設定，格式 HH:MM，預設 23:59）
    const ruleSettings = await getRuleSettings();
    const timeMatch = ruleSettings.autoClockoutTime.match(/^(\d{1,2}):(\d{2})$/);
    const autoHH = timeMatch ? parseInt(timeMatch[1], 10) : 23;
    const autoMM = timeMatch ? parseInt(timeMatch[2], 10) : 59;
    const autoClockOutISO = taiwanToUTC(tw.y, tw.mo, tw.d, autoHH, autoMM, 0, 0);

    // 取出今天所有打卡，依時間排序
    const { data: punches, error } = await supabase
      .from('attendance')
      .select('*')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!punches || punches.length === 0) {
      return res.json({ success: true, message: '今天沒有打卡記錄', autoClockOutCount: 0 });
    }

    // 依員工分組，找出每位員工今天的最後一筆
    // 同時記錄今天已被系統補過下班的員工（防止排程重複觸發時補兩次）
    const lastPunchByUser = {};
    const alreadyAutoClocked = new Set();
    punches.forEach(p => {
      lastPunchByUser[p.user_id] = p; // 已排序，後面的會覆蓋，最後留下最後一筆
      if (p.location_name === '系統自動下班') {
        alreadyAutoClocked.add(p.user_id);
      }
    });

    // 對「最後一筆是上班」且「今天還沒被自動補過」的員工補下班
    const toInsert = [];
    for (const userId of Object.keys(lastPunchByUser)) {
      const last = lastPunchByUser[userId];
      if (last.type === 'clock_in' && !alreadyAutoClocked.has(userId)) {
        toInsert.push({
          user_id: userId,
          user_name: last.user_name,
          type: 'clock_out',
          // 沿用最後一次上班的座標與地點，方便後台檢視
          latitude: last.latitude,
          longitude: last.longitude,
          distance_from_company: last.distance_from_company,
          location_name: '系統自動下班',
          created_at: autoClockOutISO
        });
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('attendance')
        .insert(toInsert);
      if (insertError) throw insertError;
    }

    return res.json({
      success: true,
      message: `已為 ${toInsert.length} 位忘記下班的員工自動補下班`,
      autoClockOutCount: toInsert.length,
      date: `${tw.y}/${tw.mo}/${tw.d}`
    });

  } catch (error) {
    console.error('自動補下班錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 伺服器運行在 port ${PORT}`);
});
