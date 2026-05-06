const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Gửi push notification đến một hoặc nhiều Expo Push Token.
 * @param {string|string[]} tokens - Một token hoặc mảng tokens
 * @param {object} payload - { title, body, data }
 */
export async function sendExpoPush(tokens, { title, body, data = {} }) {
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    const valid = tokenList.filter(t => t && t.startsWith("ExponentPushToken["));
    if (valid.length === 0) return;

    // Expo cho phép batch tối đa 100 token mỗi request
    const BATCH = 100;
    for (let i = 0; i < valid.length; i += BATCH) {
        const batch = valid.slice(i, i + BATCH).map(to => ({
            to,
            title,
            body,
            data,
            sound: "default",
            priority: "high",
        }));

        try {
            const res = await fetch(EXPO_PUSH_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(batch),
            });
            const json = await res.json();
            const errors = (json.data || []).filter(r => r.status === "error");
            if (errors.length > 0) {
                console.warn("⚠️ Expo push errors:", errors);
            }
        } catch (err) {
            console.error("❌ sendExpoPush failed:", err.message);
        }
    }
}
