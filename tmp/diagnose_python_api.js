import axios from 'axios';

const PYTHON_API_URL = "http://103.107.182.191:8000/predict";

async function diagnosePythonApi() {
    try {
        console.log(`🔄 Calling Python API: ${PYTHON_API_URL} for reservoir 1...`);
        const res = await axios.post(PYTHON_API_URL, { rid: 1 }, { timeout: 30000 });
        
        console.log("✅ Response Status:", res.status);
        if (res.data.predictions && res.data.predictions.length > 0) {
            const sample = res.data.predictions[0];
            console.log("SAMPLE PREDICTION (T+1):", JSON.stringify(sample, null, 2));
            
            // Check sorting
            if (sample.p10 > sample.p50 || sample.p50 > sample.p90) {
                console.warn("⚠️  WARNING: Data is NOT sorted! p10 > p50 or p50 > p90");
            } else {
                console.log("✅ Data is correctly sorted.");
            }
        } else {
            console.log("⚠️ No predictions returned.");
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

diagnosePythonApi();
