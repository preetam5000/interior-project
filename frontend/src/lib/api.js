import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export const api = axios.create({ baseURL: API, withCredentials: true });

let refreshing = null;
const NO_RETRY = ["/auth/login", "/auth/register", "/auth/refresh"];

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig = err.config || {};
    if (err.response?.status === 401 && !orig._retry && !NO_RETRY.some((u) => orig.url?.includes(u))) {
      orig._retry = true;
      refreshing = refreshing || api.post("/auth/refresh").finally(() => (refreshing = null));
      try {
        await refreshing;
        return api(orig);
      } catch (e) {
        window.dispatchEvent(new Event("auth:expired"));
      }
    }
    return Promise.reject(err);
  }
);

export function errMsg(e, fallback = "Something went wrong. Please try again.") {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return d.msg || String(d);
}

export const fetcher = (url) => api.get(url).then((r) => r.data);

export function formatBytes(b = 0) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 330;

export function formatIST(value, { timeOnly = false } = {}) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = timeOnly
    ? { hour: "2-digit", minute: "2-digit", hour12: true }
    : { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true };
  const formatted = new Intl.DateTimeFormat("en-IN", { ...options, timeZone: IST_TIME_ZONE })
    .format(date)
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
  return `${formatted} IST`;
}

export function utcToISTInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function istInputToUTC(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const istAsUTC = new Date(0);
  istAsUTC.setUTCFullYear(year, month - 1, day);
  istAsUTC.setUTCHours(hour, minute, 0, 0);
  if (istAsUTC.getUTCFullYear() !== year || istAsUTC.getUTCMonth() !== month - 1 || istAsUTC.getUTCDate() !== day) return null;
  return new Date(istAsUTC.getTime() - IST_OFFSET_MINUTES * 60000).toISOString();
}

export function istDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = Number(part.value);
    return result;
  }, {});
}

export function formatISTScheduleAction(action) {
  const match = /^Scheduled for (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) UTC$/.exec(action || "");
  if (!match) return action;
  const scheduledAt = new Date(`${match[1].replace(" ", "T")}:00Z`);
  return Number.isNaN(scheduledAt.getTime()) ? action : `Scheduled for ${formatIST(scheduledAt)}`;
}

export const PERMS = {
  upload: ["admin", "manager", "designer"],
  approve: ["admin", "manager"],
  deleteMedia: ["admin", "manager"],
  admin: ["admin"],
};
export const can = (user, perm) => !!user && PERMS[perm].includes(user.role);
export const ROLE_LABEL = { admin: "Admin", manager: "Social Media Manager", designer: "Designer", viewer: "Viewer" };
