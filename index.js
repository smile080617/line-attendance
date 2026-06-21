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

// 公司位置設定 - 支援多個地點
const COMPANY_LOCATIONS = [
  {
    name: '民權總店',
    lat: parseFloat(process.env.LOCATION1_LAT || '25.06334'),
    lng: parseFloat(process.env.LOCATION1_LNG || '121.52144'),
    radiusMeters: parseInt(process.env.LOCATION1_RADIUS || '200')
  },
  {
    name: '松山分店',
    lat: parseFloat(process.env.LOCATION2_LAT || '25.04913'),
    lng: parseFloat(process.env.LOCATION2_LNG || '121.57901'),
    radiusMeters: parseInt(process.env.LOCATION2_RADIUS || '300')
  },
  {
    name: '宏匯百貨',
    lat: parseFloat(process.env.LOCATION3_LAT || '25.05965'),
    lng: parseFloat(process.env.LOCATION3_LNG || '121.44954'),
    radiusMeters: parseInt(process.env.LOCATION3_RADIUS || '200')
  },
  {
    name: '三創',
    lat: parseFloat(process.env.LOCATION4_LAT || '25.04552'),
    lng: parseFloat(process.env.LOCATION4_LNG || '121.53132'),
    radiusMeters: parseInt(process.env.LOCATION4_RADIUS || '200')
  },
  {
    name: '統一',
    lat: parseFloat(process.env.LOCATION5_LAT || '25.04087'),
    lng: parseFloat(process.env.LOCATION5_LNG || '121.56540'),
    radiusMeters: parseInt(process.env.LOCATION5_RADIUS || '200')
  },
  {
    name: '北藝中心',
    lat: parseFloat(process.env.LOCATION6_LAT || '25.0846858'),
    lng: parseFloat(process.env.LOCATION6_LNG || '121.5211427'),
    radiusMeters: parseInt(process.env.LOCATION6_RADIUS || '200')
  },
  {
    name: '中正紀念堂',
    lat: parseFloat(process.env.LOCATION7_LAT || '25.034611'),
    lng: parseFloat(process.env.LOCATION7_LNG || '121.52178'),
    radiusMeters: parseInt(process.env.LOCATION7_RADIUS || '200')
  }
];

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
function isWithinCompanyLocation(latitude, longitude) {
  let closestLocation = null;
  let minDistance = Infinity;
  
  // 檢查所有地點，找出最近的
  for (const location of COMPANY_LOCATIONS) {
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
    // 驗證 GPS
    const locationCheck = isWithinCompanyLocation(latitude, longitude);
    
    if (!locationCheck.valid) {
      return {
        success: false,
        message: `❌ 打卡失敗\n\n最近的地點: ${locationCheck.locationName}\n您距離 ${locationCheck.distance} 公尺\n超出允許範圍 ${locationCheck.allowedRadius} 公尺\n請在公司範圍內打卡`
      };
    }

    // 新邏輯：如果是下班打卡，檢查最近一次上班打卡是否在1小時內
    if (type === 'clock_out') {
      const { data: lastClockIn } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'clock_in')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastClockIn) {
        const lastClockInTime = new Date(lastClockIn.created_at);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastClockInTime) / 1000 / 60);

        if (diffMinutes < 60) {
          return {
            success: false,
            message: `⚠️ 下班打卡失敗\n\n您在 ${diffMinutes} 分鐘前剛上班打卡\n需要上班至少 1 小時後才能下班打卡\n\n還需要等待 ${60 - diffMinutes} 分鐘`
          };
        }
      }
    }

    // 先確保使用者存在
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('line_user_id', userId)
      .single();

    if (!user) {
      // 新增使用者
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

    // 記錄打卡（新增地點名稱）
    const { data, error } = await supabase
      .from('attendance')
      .insert([
        {
          user_id: userId,
          user_name: userName || '員工',
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
    const { name, employee_no, department, phone, hire_date, is_active } = req.body;

    // 組合要更新的欄位（只更新有傳進來的）
    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (employee_no !== undefined) updateData.employee_no = employee_no || null;
    if (department !== undefined) updateData.department = department || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (hire_date !== undefined) updateData.hire_date = hire_date || null;
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
    // 自動下班的時間記為今天台灣 23:59:00
    const autoClockOutISO = taiwanToUTC(tw.y, tw.mo, tw.d, 23, 59, 0, 0);

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
    const lastPunchByUser = {};
    punches.forEach(p => {
      lastPunchByUser[p.user_id] = p; // 已排序，後面的會覆蓋，最後留下最後一筆
    });

    // 對「最後一筆是上班」的員工補下班
    const toInsert = [];
    for (const userId of Object.keys(lastPunchByUser)) {
      const last = lastPunchByUser[userId];
      if (last.type === 'clock_in') {
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
