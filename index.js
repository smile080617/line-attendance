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

    // 檢查今天是否已經有相同類型的打卡記錄
    const today = new Date().toISOString().split('T')[0];
    const { data: existingRecord } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .single();

    if (existingRecord) {
      const time = new Date(existingRecord.created_at).toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return {
        success: false,
        message: `⚠️ 您今天已經${type === 'clock_in' ? '上班' : '下班'}打卡了\n\n打卡時間: ${time}\n打卡地點: ${existingRecord.location_name || '未記錄'}`
      };
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

    const time = new Date(data.created_at).toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

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

// 查詢本月出勤記錄
async function getMonthlyAttendance(userId) {
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', firstDay)
      .lte('created_at', lastDay)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return '📊 本月尚無出勤記錄';
    }

    // 按日期分組
    const grouped = {};
    data.forEach(record => {
      const date = new Date(record.created_at).toLocaleDateString('zh-TW');
      if (!grouped[date]) grouped[date] = {};
      grouped[date][record.type] = new Date(record.created_at).toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit'
      });
    });

    let message = '📊 本月出勤記錄\n\n';
    Object.keys(grouped).slice(0, 10).forEach(date => {
      message += `${date}\n`;
      if (grouped[date].clock_in) message += `  上班: ${grouped[date].clock_in}\n`;
      if (grouped[date].clock_out) message += `  下班: ${grouped[date].clock_out}\n`;
      message += '\n';
    });

    if (Object.keys(grouped).length > 10) {
      message += `... 還有 ${Object.keys(grouped).length - 10} 天記錄\n`;
    }

    return message;

  } catch (error) {
    console.error('查詢錯誤:', error);
    return '❌ 查詢失敗，請稍後再試';
  }
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
          let replyMessage = '';

          // 處理指令
          if (text === '上班' || text === '打卡' || text.toLowerCase() === 'clock in') {
            replyMessage = '請分享您的位置以完成上班打卡\n\n👇 點選下方「+」→「位置資訊」';
          } else if (text === '下班' || text.toLowerCase() === 'clock out') {
            replyMessage = '請分享您的位置以完成下班打卡\n\n👇 點選下方「+」→「位置資訊」';
          } else if (text === '查詢' || text === '本月出勤' || text === '記錄') {
            replyMessage = await getMonthlyAttendance(userId);
          } else if (text === '幫助' || text === '說明' || text === '?') {
            replyMessage = `📱 LINE 打卡系統使用說明\n\n` +
              `上班打卡:\n1. 傳送「上班」\n2. 分享位置資訊\n\n` +
              `下班打卡:\n1. 傳送「下班」\n2. 分享位置資訊\n\n` +
              `其他指令:\n• 「查詢」- 查看本月出勤\n• 「幫助」- 顯示此說明`;
          } else {
            replyMessage = '❓ 不認識的指令\n\n請傳送「幫助」查看使用說明';
          }

          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: replyMessage
          });

        } else if (event.message.type === 'location') {
          // 處理位置資訊
          const { latitude, longitude } = event.message;
          
          // 判斷是上班還是下班（從最近一則訊息判斷）
          // 這裡簡化處理：如果今天還沒上班打卡，就是上班；否則是下班
          const today = new Date().toISOString().split('T')[0];
          const { data: todayClockIn } = await supabase
            .from('attendance')
            .select('*')
            .eq('user_id', userId)
            .eq('type', 'clock_in')
            .gte('created_at', `${today}T00:00:00`)
            .lte('created_at', `${today}T23:59:59`)
            .single();

          const type = todayClockIn ? 'clock_out' : 'clock_in';
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 伺服器運行在 port ${PORT}`);
});
