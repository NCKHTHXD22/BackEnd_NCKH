import axios from "axios";

export async function getRainLakeHistory(lakeId) {
  const url = `https://backend-nckh-lm57.onrender.com/api/rain-lake-history/${lakeId}`;
  const res = await axios.get(url);
  return res.data || [];
}
