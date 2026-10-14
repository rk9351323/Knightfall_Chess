import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" }
});

export function getApiError(error) {
  return error?.response?.data?.message || "Could not reach the server. Check that the backend is running.";
}

export default api;
