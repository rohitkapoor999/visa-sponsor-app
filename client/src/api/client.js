const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  let data;
  try { data = await res.json(); } catch { throw new Error(`Non-JSON response (status ${res.status}). Is the backend running?`); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const getCvs = () => request("/cvs");
export const getCv = (id) => request(`/cvs/${id}`);
export const uploadCv = async (title, file) => {
  const form = new FormData();
  form.append("title", title);
  form.append("file", file);
  return request("/cvs", { method: "POST", body: form });
};
export const pinCv = (id) => request(`/cvs/${id}/pin`, { method: "PATCH" });
export const deleteCv = (id) => request(`/cvs/${id}`, { method: "DELETE" });

export const getEmployerLists = (country) => request(`/employers/${country}`);
export const getEmployerList = (country, id) => request(`/employers/${country}/${id}`);

// Step 1: extract company names from file
export const extractEmployerList = async (country, file) => {
  const form = new FormData();
  form.append("file", file);
  return request(`/employers/${country}/extract`, { method: "POST", body: form });
};

// Step 2: pre-filter extracted companies against a CV
export const prefilterEmployers = (country, companies, cvId) =>
  request(`/employers/${country}/prefilter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies, cvId }),
  });

// Step 3: save the approved list
export const saveEmployerList = (country, title, employers, source) =>
  request(`/employers/${country}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, employers, source }),
  });

export const aiSearchEmployers = (country) =>
  request(`/employers/${country}/ai-search`, { method: "POST" });
export const pinEmployerList = (country, id) =>
  request(`/employers/${country}/${id}/pin`, { method: "PATCH" });
export const deleteEmployerList = (country, id) =>
  request(`/employers/${country}/${id}`, { method: "DELETE" });

export const runJobSearch = (country, employerListId, cvId) =>
  request(`/jobs/${country}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employerListId, cvId }),
  });
export const getSearchResultsList = (country) => request(`/jobs/${country}/results`);
export const getSearchResult = (country, id) => request(`/jobs/${country}/results/${id}`);
export const toggleApplied = (country, id, jobIndex, applied) =>
  request(`/jobs/${country}/results/${id}/applied`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIndex, applied }),
  });
export const deleteSearchResult = (country, id) =>
  request(`/jobs/${country}/results/${id}`, { method: "DELETE" });
