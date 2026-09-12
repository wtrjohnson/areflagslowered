const coordinates: Record<string, [number, number]> = {
  AL: [32.3777, -86.3], AK: [58.3016, -134.42], AZ: [33.4481, -112.097], AR: [34.7466, -92.2889], CA: [38.5767, -121.4936], CO: [39.7392, -104.9903], CT: [41.764, -72.6822], DE: [39.1573, -75.5197], FL: [30.4381, -84.2813], GA: [33.749, -84.388], HI: [21.3074, -157.8574], ID: [43.6178, -116.1997], IL: [39.7984, -89.6544], IN: [39.7686, -86.1626], IA: [41.5911, -93.6037], KS: [39.0482, -95.6779], KY: [38.1867, -84.8753], LA: [30.4571, -91.1874], ME: [44.3072, -69.7817], MD: [38.9788, -76.4909], MA: [42.3582, -71.0637], MI: [42.7336, -84.5553], MN: [44.9551, -93.1022], MS: [32.3038, -90.1821], MO: [38.5792, -92.1729], MT: [46.5857, -112.0184], NE: [40.8081, -96.6997], NV: [39.1639, -119.7661], NH: [43.2069, -71.5379], NJ: [40.2206, -74.7699], NM: [35.6822, -105.9397], NY: [42.6528, -73.7579], NC: [35.7804, -78.6391], ND: [46.8208, -100.7833], OH: [39.9613, -82.9995], OK: [35.4922, -97.5033], OR: [44.9385, -123.0304], PA: [40.2644, -76.8836], RI: [41.8309, -71.4149], SC: [34.0003, -81.0332], SD: [44.367, -100.3464], TN: [36.1658, -86.7844], TX: [30.2747, -97.7403], UT: [40.7774, -111.8882], VT: [44.2624, -72.5805], VA: [37.5389, -77.4336], WA: [47.0358, -122.905], WV: [38.3362, -81.6123], WI: [43.0747, -89.3844], WY: [41.1403, -104.8202]
};

export function solarTime(date: string, kind: "sunrise" | "sunset", timeZone: string, stateCode?: string) {
  const [latitude, longitude] = coordinates[stateCode || ""] || [39, -98];
  const [year, month, day] = date.split("-").map(Number);
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);
  const rad = Math.PI / 180;
  const lngHour = longitude / 15;
  const t = dayOfYear + ((kind === "sunrise" ? 6 : 18) - lngHour) / 24;
  const meanAnomaly = 0.9856 * t - 3.289;
  const longitudeSun = (meanAnomaly + 1.916 * Math.sin(rad * meanAnomaly) + 0.02 * Math.sin(2 * rad * meanAnomaly) + 282.634) % 360;
  const rightAscension = (Math.atan(0.91764 * Math.tan(rad * longitudeSun)) / rad + 360) % 360;
  const rightAscensionHours = Math.floor(longitudeSun / 90) * 6;
  const rightAscensionAdjusted = (rightAscension + rightAscensionHours - Math.floor(rightAscension / 90) * 6) / 15;
  const sinDeclination = 0.39782 * Math.sin(rad * longitudeSun);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHourAngle = (Math.cos(90.833 * rad) - sinDeclination * Math.sin(rad * latitude)) / (cosDeclination * Math.cos(rad * latitude));
  if (cosHourAngle < -1 || cosHourAngle > 1) return undefined;
  const hourAngle = (Math.acos(cosHourAngle) / rad / 15) * (kind === "sunrise" ? -1 : 1);
  const localMeanTime = hourAngle + rightAscensionAdjusted - 0.06571 * t - 6.622;
  const utcMinutes = ((localMeanTime - lngHour) * 60 + 1440) % 1440;
  const instant = new Date(Date.UTC(year, month - 1, day) + utcMinutes * 60000);
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(instant).replace("24:", "00:");
}

export function normalizeClockTime(value?: string) {
  const normalized = value?.toLowerCase().replace(/\s|\./g, "");
  const match = normalized?.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!match) return undefined;
  let hour = Number(match[1]);
  if (match[3] === "pm" && hour !== 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${match[2] || "00"}`;
}
