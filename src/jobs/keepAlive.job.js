import cron from "node-cron";
import axios from "axios";

/**
 * 🚀 Keep-Alive Ping
 * Scheduled: Every 14 minutes
 * Purpose: Prevent Render Free Tier from going to sleep.
 * Render sleeps after 15 minutes of inactivity. Pinging itself keeps the instance awake.
 */
cron.schedule("*/14 * * * *", async () => {
    try {
        // Ping a fast, lightweight endpoint on the server itself
        // Ensure this URL matches your actual Render deployment URL
        const backendUrl = process.env.RENDER_EXTERNAL_URL || "https://backend-nckh-lm57.onrender.com";
        const pingUrl = `${backendUrl}/api/rain-station`; 
        
        await axios.get(pingUrl, { timeout: 10000 });
        console.log(`📡 [KeepAlive] Pinged ${pingUrl} successfully.`);
    } catch (err) {
        console.error("❌ [KeepAlive] Ping Error:", err.message);
    }
});
