import axiosClient from "./axiosClient";

const mapApi = {
    // Get all rain stations
    getRainStations: () => axiosClient.get("/rain-station").then((res) => res.data),

    // Get all water level stations
    getWaterLevelStations: () => axiosClient.get("/water-level").then((res) => res.data),

    // Get reservoirs (inflow lakes)
    getReservoirs: () => axiosClient.get("/inflowLake").then((res) => res.data),

    // Get live hydro data for a reservoir
    getLiveHydro: (lakeId) => axiosClient.get(`/inflowLake/live-hydro/${lakeId}`).then((res) => res.data),

    // Get published (approved) posts for the public view
    getPublicPosts: () => axiosClient.get("/posts").then((res) => res.data),

    // Forecast APIs
    getForecastLstm: (lakeId) => axiosClient.get(`/forecast-lstm/${lakeId}`).then((res) => res.data),
    getInflowHistory: (lakeId) => axiosClient.get(`/inflowlake-history/${lakeId}`).then((res) => res.data),
    getForecastHistory: (reservoirId, rainSource) =>
        axiosClient.get(`/forecast-history/${reservoirId}`, { params: { rainSource } }).then((res) => res.data),
    getRainLakeHistory: (lakeId) => axiosClient.get(`/rain-lake-history/${lakeId}`).then((res) => res.data),
    runForecastModel: (data) => axiosClient.post("/forecast", data).then((res) => res.data),

    // ── Lake Specs & Calculations ──────────────────────────────────────────────
    getLakeSpecs:   ()          => axiosClient.get("/lake-specs").then(r => r.data),
    getLakeSpec:    (lakeId)    => axiosClient.get(`/lake-specs/${lakeId}`).then(r => r.data),
    getZVCurve:     (lakeId)    => axiosClient.get(`/lake-specs/${lakeId}/zv-curve`).then(r => r.data),
    getVolume:      (lakeId, htl) =>
        axiosClient.get(`/lake-specs/${lakeId}/volume`, { params: { htl } }).then(r => r.data),
    getPower:       (lakeId, htl, q_turbine) =>
        axiosClient.get(`/lake-specs/${lakeId}/power`, { params: { htl, q_turbine } }).then(r => r.data),
    waterBalance:   (lakeId, body) =>
        axiosClient.post(`/lake-specs/${lakeId}/water-balance`, body).then(r => r.data),
    operationRec:   (lakeId, body) =>
        axiosClient.post(`/lake-specs/${lakeId}/operation-rec`, body).then(r => r.data),
};

export default mapApi;
