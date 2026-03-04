export const setAdminToken = (token) => localStorage.setItem("adminToken", token);
export const getAdminToken = () => localStorage.getItem("adminToken");
export const removeAdminToken = () => localStorage.removeItem("adminToken");

export const setClerkToken = (t) => localStorage.setItem("clerkToken", t);
export const removeClerkToken = () => localStorage.removeItem("clerkToken");
