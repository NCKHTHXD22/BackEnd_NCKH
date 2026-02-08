import axios from "axios";
import { ENV } from "../../api/config/env.js";

export async function getHydroData(token, start, end, lakeId) {
  const url = `${ENV.HYDRO_BASE_URL}/baocaothuydiens_bieudo`;

  const res = await axios.get(url, {
    params: {
      ngaybatdau: start.toISOString(),
      ngayketthuc: end.toISOString(),
      thuydien_id: lakeId
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return res.data?.data || [];
}
