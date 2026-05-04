import axios from "axios";

async function test() {
    console.log("Testing Bizfly API...");
    try {
        const res = await axios.get("http://103.107.182.191:8000/health");
        console.log("Health:", res.data);
    } catch (e) {
        console.error("Health Check Failed:", e.message);
    }

    try {
        const res = await axios.post("http://103.107.182.191:8000/predict", { rid: 4 }, { timeout: 30000 });
        console.log("Predict:", res.data);
    } catch (e) {
        console.error("Predict Failed:", e.message);
    }
}
test();
