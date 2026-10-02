import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_URL } from "@/lib/env";

// Hàng đợi báo cáo ngập gửi thất bại do mất mạng — lưu lại trên máy và tự
// động gửi lại khi có mạng, thay vì người dùng phải nhập lại từ đầu.
// (Vùng ngập/mất sóng là đúng lúc người dùng cần báo cáo nhất.)
const QUEUE_KEY = "flood_post_queue:v1";

// Lỗi mạng thực sự (mất kết nối, timeout) — khác lỗi 4xx/5xx server đã trả lời
// (những lỗi đó không nên tự gửi lại, cần người dùng sửa dữ liệu).
function isNetworkError(err) {
  return !err.response;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// POST /api/posts giới hạn 5 request/phút/IP (strictLimit) — giãn cách giữa các
// lần gửi trong hàng đợi để không tự đụng rate limit khi có nhiều báo cáo tồn
// đọng cùng lúc (vd. offline cả buổi, tích luỹ vài báo cáo).
const QUEUE_SEND_DELAY_MS = 13000;

export async function getQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("Không lưu được hàng đợi báo cáo:", e.message);
  }
}

// `fields` là các cặp key/value đơn giản (string/number/boolean), `images` là
// mảng { uri } trỏ tới file cache cục bộ — vẫn còn khi app chưa bị xoá cache.
export async function enqueuePost(fields, images) {
  const queue = await getQueue();
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fields,
    images: images.map((img) => ({ uri: img.uri })),
    createdAt: Date.now(),
    attempts: 0,
  };
  queue.push(item);
  await saveQueue(queue);
  return item;
}

export async function removeFromQueue(id) {
  const queue = await getQueue();
  await saveQueue(queue.filter((q) => q.id !== id));
}

function buildFormData(item) {
  const formData = new FormData();
  Object.entries(item.fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) formData.append(key, value);
  });
  item.images.forEach((img, index) => {
    formData.append("images", {
      uri: img.uri,
      type: "image/jpeg",
      name: `queued_${item.id}_${index}.jpg`,
    });
  });
  return formData;
}

// Thử gửi từng báo cáo đang chờ trong hàng đợi. Dừng lại (giữ nguyên phần
// còn lại) ngay khi gặp lại lỗi mạng — tránh chờ timeout nhiều lần liên tiếp
// khi rõ ràng vẫn chưa có mạng.
export async function trySendQueue(getToken) {
  const queue = await getQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const remaining = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (i > 0) await sleep(QUEUE_SEND_DELAY_MS);
    try {
      const token = await getToken();
      await axios.post(`${API_URL}/api/posts`, buildFormData(item), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        timeout: 20000,
      });
      sent += 1;
    } catch (err) {
      if (isNetworkError(err)) {
        // Vẫn chưa có mạng — giữ nguyên báo cáo này và tất cả phía sau, thử lại sau.
        remaining.push(item, ...queue.slice(i + 1));
        break;
      }
      // 429 (rate limit) không phải lỗi dữ liệu — không tính vào số lần thử,
      // giữ nguyên để lần sync kế tiếp gửi lại.
      if (err.response.status !== 429) {
        item.attempts = (item.attempts || 0) + 1;
      }
      // Lỗi server khác (400/500...) — dữ liệu có vấn đề, không tự gửi lại vô hạn.
      // Sau 3 lần thử vẫn lỗi thì bỏ khỏi hàng đợi để tránh kẹt mãi.
      if ((item.attempts || 0) < 3) remaining.push(item);
      else failed += 1;
    }
  }

  await saveQueue(remaining);
  return { sent, remaining: remaining.length, failed };
}
