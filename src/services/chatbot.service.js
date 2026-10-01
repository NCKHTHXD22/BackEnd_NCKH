import axios from "axios";
import ReservoirAlert from "../core/entities/ReservoirAlert.js";
import Post from "../core/entities/FloodPost.js";
import RainStation from "../core/entities/RainStation.js";

// Chatbot hỗ trợ người dân — gọi Claude API từ server, key (ANTHROPIC_API_KEY)
// chỉ nằm ở .env, không bao giờ đi vào app mobile/web bundle.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Haiku: rẻ + nhanh, phù hợp endpoint công khai trả phí theo từng tin nhắn.
// Đổi sang model mạnh hơn bằng CHATBOT_MODEL trong .env nếu cần.
const MODEL = process.env.CHATBOT_MODEL || "claude-haiku-4-5-20251001";

const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_TURNS = 10;

const LEVEL_LABEL = { watch: "Theo dõi", warning: "Cảnh báo", danger: "Khẩn cấp" };

// Bán kính "xung quanh vị trí người dùng" khi trả lời câu hỏi kiểu "khu vực
// tôi có ngập không" — rộng hơn bán kính cảnh báo đẩy (300m) vì đây chỉ là
// ngữ cảnh tham khảo cho câu trả lời, không phải cảnh báo tự động.
const LOCAL_CONTEXT_RADIUS_KM = 5;
const LOCAL_RAIN_HEAVY_MM = 30;

function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SYSTEM_PROMPT = `Bạn là trợ lý AI của ứng dụng cảnh báo lũ lưu vực sông Vu Gia - Thu Bồn (Đà Nẵng - Quảng Nam), hỗ trợ người dân.

PHẠM VI ĐƯỢC HỖ TRỢ:
- Hướng dẫn dùng app: bản đồ hiện trạng, gửi báo cáo ngập/cây đổ/sạt lở, yêu cầu trợ giúp, "Tôi an toàn", thông báo đẩy, tab Thời tiết và dự báo lưu lượng hồ.
- Giải thích các thông tin hồ chứa, mực nước, lưu lượng, mức cảnh báo (theo dõi / cảnh báo / khẩn cấp) bằng ngôn ngữ dễ hiểu.
- Kiến thức an toàn lũ lụt phổ thông: chuẩn bị trước lũ, cần làm gì khi nước dâng, tránh điện giật, không đi qua dòng nước chảy xiết, v.v.

GIỚI HẠN BẮT BUỘC:
- KHÔNG thay thế cơ quan chức năng. Bạn không ra lệnh sơ tán, không khẳng định một khu vực cụ thể "an toàn" hay "chắc chắn ngập". Nếu người dùng hỏi về quyết định sơ tán/tình huống nguy hiểm, hãy khuyên theo dõi thông báo chính thức và liên hệ số khẩn cấp.
- Nếu người dùng đang gặp nguy hiểm tính mạng: nhắc gọi ngay số khẩn cấp (VP BCH PCTT & TKCN thành phố 0236 3626222, VP cứu nạn - cứu hộ 0236 3821884, Trung tâm IOC 1022), và dùng chức năng "Yêu cầu trợ giúp" trong app.
- Chỉ dựa vào dữ liệu ở mục DỮ LIỆU HIỆN TẠI khi nói về tình hình hồ chứa. Không bịa số liệu. Nếu không có dữ liệu, nói rõ là chưa có.
- Không trả lời chủ đề ngoài phạm vi (chính trị, tư vấn y tế/pháp lý chuyên sâu...); lịch sự từ chối và gợi ý quay lại chủ đề lũ lụt/app.

PHONG CÁCH: trả lời cùng ngôn ngữ người dùng (Việt hoặc Anh), ngắn gọn (tối đa khoảng 150 từ), dùng gạch đầu dòng khi liệt kê các bước, giọng bình tĩnh, rõ ràng.`;

class ChatbotService {
    // Tóm tắt cảnh báo hồ chứa đang hoạt động để chatbot trả lời có căn cứ
    async buildContext() {
        const alerts = await ReservoirAlert.find({ is_active: true })
            .sort({ checked_at: -1 })
            .limit(10)
            .lean();

        if (alerts.length === 0) {
            return "Hiện không có hồ chứa nào đang ở mức theo dõi/cảnh báo/khẩn cấp (theo lần kiểm tra gần nhất của hệ thống).";
        }

        const lines = alerts.map((a) => {
            const level = LEVEL_LABEL[a.alert_level] || a.alert_level;
            const parts = [`Hồ ${a.lake_name}: mức "${level}"`];
            if (a.htl_current != null) parts.push(`mực nước ${a.htl_current} m`);
            if (a.q_in != null) parts.push(`Q đến ${a.q_in} m³/s`);
            if (a.q_out != null) parts.push(`Q xả ${a.q_out} m³/s`);
            if (a.fill_pct != null) parts.push(`đầy ${Math.round(a.fill_pct)}%`);
            return "- " + parts.join(", ");
        });
        return lines.join("\n");
    }

    // Tóm tắt điểm ngập đã duyệt + trạm mưa cực lớn gần vị trí người dùng
    // (nếu app gửi kèm GPS) — giúp chatbot trả lời có căn cứ về khu vực cụ
    // thể thay vì chỉ nói chung chung về mực nước hồ chứa.
    async buildLocalContext(lat, lon) {
        if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
            return null;
        }

        const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // báo cáo trong 3 ngày gần nhất
        const [posts, rainStations] = await Promise.all([
            Post.find({
                status: "approved",
                "location.latitude": { $ne: null },
                "location.longitude": { $ne: null },
                createdAt: { $gte: since },
            })
                .select("reportType location floodLevel isFrequentFlood createdAt")
                .limit(200)
                .lean(),
            RainStation.find({ sumDepth: { $gte: LOCAL_RAIN_HEAVY_MM } })
                .select("name location sumDepth")
                .limit(100)
                .lean(),
        ]);

        const nearbyPosts = posts
            .filter((p) => distanceKm(lat, lon, p.location.latitude, p.location.longitude) <= LOCAL_CONTEXT_RADIUS_KM)
            .slice(0, 10);
        const nearbyRain = rainStations
            .filter((r) => r.location?.lat != null && distanceKm(lat, lon, r.location.lat, r.location.lng) <= LOCAL_CONTEXT_RADIUS_KM)
            .slice(0, 5);

        if (nearbyPosts.length === 0 && nearbyRain.length === 0) {
            return `Trong bán kính ${LOCAL_CONTEXT_RADIUS_KM}km quanh vị trí người dùng: không có báo cáo ngập nào được duyệt trong 3 ngày qua, không có trạm mưa cực lớn.`;
        }

        const lines = [`Trong bán kính ${LOCAL_CONTEXT_RADIUS_KM}km quanh vị trí người dùng:`];
        nearbyPosts.forEach((p) => {
            const kind = p.reportType === "fallen_tree" ? "cây ngã đổ" : p.reportType === "flood_road" ? "đường ngập" : "điểm ngập";
            lines.push(`- Báo cáo ${kind} tại ${p.location.address || p.location.district || "gần đó"}` +
                (p.floodLevel ? `, mức ${p.floodLevel}cm` : "") +
                (p.isFrequentFlood ? " (khu vực thường xuyên ngập)" : "") +
                `, ghi nhận ${new Date(p.createdAt).toLocaleDateString("vi-VN")}.`);
        });
        nearbyRain.forEach((r) => {
            lines.push(`- Trạm mưa ${r.name || "gần đó"}: lượng mưa tích luỹ ${r.sumDepth}mm — mức rất cao.`);
        });
        return lines.join("\n");
    }

    // history: [{ role: "user" | "assistant", content: string }]
    async reply(message, history = [], { lat, lon } = {}) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            const err = new Error("Chatbot chưa được cấu hình (thiếu ANTHROPIC_API_KEY).");
            err.status = 503;
            throw err;
        }

        const safeHistory = (Array.isArray(history) ? history : [])
            .filter(
                (m) =>
                    m &&
                    (m.role === "user" || m.role === "assistant") &&
                    typeof m.content === "string" &&
                    m.content.trim()
            )
            .slice(-MAX_HISTORY_TURNS)
            .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

        // API yêu cầu tin nhắn đầu tiên là "user" và các lượt xen kẽ nhau
        while (safeHistory.length > 0 && safeHistory[0].role !== "user") safeHistory.shift();
        const alternating = safeHistory.filter((m, i) => i === 0 || m.role !== safeHistory[i - 1].role);
        // Tin nhắn mới là "user" nên lịch sử không được kết thúc bằng "user"
        if (alternating.length > 0 && alternating[alternating.length - 1].role === "user") alternating.pop();

        const [context, localContext] = await Promise.all([
            this.buildContext(),
            this.buildLocalContext(lat, lon),
        ]);
        const localSection = localContext
            ? `\n\nDỮ LIỆU KHU VỰC NGƯỜI DÙNG (theo GPS ứng dụng gửi kèm — chỉ mang tính tham khảo, không phải cảnh báo chính thức):\n${localContext}`
            : "";

        const { data } = await axios.post(
            ANTHROPIC_URL,
            {
                model: MODEL,
                max_tokens: 600,
                system: `${SYSTEM_PROMPT}\n\nDỮ LIỆU HIỆN TẠI (cập nhật tự động mỗi 15 phút):\n${context}${localSection}`,
                messages: [...alternating, { role: "user", content: message }],
            },
            {
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                timeout: 30000,
            }
        );

        const text = (data.content || [])
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();

        return text || "Xin lỗi, tôi chưa thể trả lời lúc này. Vui lòng thử lại.";
    }
}

export const chatbotService = new ChatbotService();
export { MAX_MESSAGE_CHARS };
