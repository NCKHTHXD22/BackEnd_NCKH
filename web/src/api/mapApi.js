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
    getPublicPosts: () => axiosClient.get("/posts").then((res) => res.data), // Need to ensure backend has a public posts endpoint, otherwise we'll filter them.
};

export default mapApi;
