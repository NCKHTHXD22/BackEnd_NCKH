import axios from "axios";
import { ENV } from "../../api/config/env.js";

export async function getRainLakeHistory(lakeId) {
  const url = `http://127.0.0.1:${ENV.PORT || 5001}/api/rain-lake-history/${lakeId}`;
  const res = await axios.get(url);
  return res.data || [];
}
