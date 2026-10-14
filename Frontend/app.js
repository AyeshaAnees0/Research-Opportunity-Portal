const API_URL = "/api/opportunities";
const opportunityModal = new bootstrap.Modal(document.getElementById("opportunityModal"));
const detailsModal = new bootstrap.Modal(document.getElementById("detailsModal"));

const form = document.getElementById("opportunityForm");
const list = document.getElementById("opportunityList");
const loadingState = document.getElementById("loadingState");
const emptyState = document.getElementById("emptyState");
const alertArea = document.getElementById("alertArea");
const formError = document.getElementById("formError");
const saveBtn = document.getElementById("saveBtn");

let opportunities = [];
let currentlyViewed = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function showAlert(message, type = "success") {
  alertArea.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${escapeHtml(message)}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function statusBadge(status) {
  const className = status === "Open" ? "status-open" : "status-closed";
  return `<span class="status-badge ${className}">${escapeHtml(status)}</span>`;
}

function formatDate(dateValue) {
  if (!dateValue) return "—";
  const parts = String(dateValue).slice(0, 10).split("-");
  if (parts.length !== 3) return escapeHtml(dateValue);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  let body;
  try { body = await response.json(); }
  catch { body = { message: "The server returned an unreadable response." }; }
  if (!response.ok) {
    const detail = Array.isArray(body.errors) ? body.errors.join(" ") : body.message;
    throw new Error(detail || `Request failed with status ${response.status}.`);
  }
  return body;
}

async function loadOpportunities() {
  loadingState.classList.remove("d-none");
  list.innerHTML = "";
  emptyState.classList.add("d-none");
  try {
    const result = await apiRequest(API_URL);
    opportunities = result.data || [];
    updateSummary();
    renderOpportunities();
  } catch (error) {
    showAlert(`Could not load opportunities. ${error.message}`, "danger");
  } finally {
    loadingState.classList.add("d-none");
  }
}

function updateSummary() {
  document.getElementById("totalCount").textContent = opportunities.length;
  document.getElementById("openCount").textContent = opportunities.filter((item) => item.status === "Open").length;
  document.getElementById("closedCount").textContent = opportunities.filter((item) => item.status === "Closed").length;
}

function renderOpportunities() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const filtered = opportunities.filter((item) => {
    const searchable = [
      item.title, item.description, item.research_area, item.faculty_name,
      item.department, item.required_skills
    ].join(" ").toLowerCase();
    return searchable.includes(search) && (status === "All" || item.status === status);
  });

  list.innerHTML = filtered.map((item) => `
    <div class="col-12 col-lg-6">
      <article class="opportunity-card">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <span class="small text-secondary">Opportunity #${item.id}</span>
          ${statusBadge(item.status)}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="card-description mb-3">${escapeHtml(item.description.length > 145 ? item.description.slice(0, 145) + "…" : item.description)}</p>
        <div class="row g-3 mb-3">
          <div class="col-6">
            <div class="meta-label">Research area</div>
            <div class="meta-value">${escapeHtml(item.research_area)}</div>
          </div>
          <div class="col-6">
            <div class="meta-label">Faculty member</div>
            <div class="meta-value">${escapeHtml(item.faculty_name)}</div>
          </div>
          <div class="col-6">
            <div class="meta-label">Positions</div>
            <div class="meta-value">${escapeHtml(item.positions)}</div>
          </div>
          <div class="col-6">
            <div class="meta-label">Deadline</div>
            <div class="meta-value">${formatDate(item.application_deadline)}</div>
          </div>
        </div>
        <div class="d-flex flex-wrap gap-2 pt-3 border-top">
          <button class="btn btn-sm btn-outline-primary" data-action="view" data-id="${item.id}">View details</button>
          <button class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${item.id}">Edit</button>
          ${item.status === "Open"
            ? `<button class="btn btn-sm btn-outline-warning" data-action="close" data-id="${item.id}">Close opportunity</button>`
            : `<button class="btn btn-sm btn-outline-success" data-action="open" data-id="${item.id}">Reopen</button>`}
          <button class="btn btn-sm btn-outline-danger ms-sm-auto" data-action="delete" data-id="${item.id}">Delete</button>
        </div>
      </article>
    </div>`).join("");

  emptyState.classList.toggle("d-none", filtered.length !== 0);
}

function clearForm() {
  form.reset();
  form.classList.remove("was-validated");
  document.getElementById("opportunityId").value = "";
  document.getElementById("status").value = "Open";
  formError.classList.add("d-none");
  formError.textContent = "";
}

function openCreateForm() {
  clearForm();
  document.getElementById("modalTitle").textContent = "Add research opportunity";
  saveBtn.textContent = "Save opportunity";
  opportunityModal.show();
}

function setFormValue(id, value) {
  document.getElementById(id).value = value ?? "";
}

async function openEditForm(id) {
  try {
    const result = await apiRequest(`${API_URL}/${id}`);
    const item = result.data;
    clearForm();
    document.getElementById("modalTitle").textContent = `Edit opportunity #${item.id}`;
    saveBtn.textContent = "Save changes";
    setFormValue("opportunityId", item.id);
    setFormValue("title", item.title);
    setFormValue("description", item.description);
    setFormValue("research_area", item.research_area);
    setFormValue("faculty_name", item.faculty_name);
    setFormValue("department", item.department);
    setFormValue("required_skills", item.required_skills);
    setFormValue("positions", item.positions);
    setFormValue("application_deadline", String(item.application_deadline).slice(0, 10));
    setFormValue("status", item.status);
    detailsModal.hide();
    opportunityModal.show();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

function detailItem(label, value, full = false) {
  return `<div class="detail-item ${full ? "full" : ""}">
    <div class="meta-label">${escapeHtml(label)}</div>
    <div class="detail-value">${escapeHtml(value ?? "—")}</div>
  </div>`;
}

async function viewDetails(id) {
  try {
    const result = await apiRequest(`${API_URL}/${id}`);
    const item = result.data;
    currentlyViewed = item.id;
    document.getElementById("detailsTitle").textContent = item.title;
    document.getElementById("detailsContent").innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span class="text-secondary small">Opportunity #${item.id}</span>${statusBadge(item.status)}
      </div>
      <div class="detail-grid">
        ${detailItem("Research description", item.description, true)}
        ${detailItem("Research area", item.research_area)}
        ${detailItem("Faculty member", item.faculty_name)}
        ${detailItem("Department", item.department)}
        ${detailItem("Required skills", item.required_skills, true)}
        ${detailItem("Available positions", item.positions)}
        ${detailItem("Application deadline", formatDate(item.application_deadline))}
        ${detailItem("Created", item.created_at ? String(item.created_at).slice(0, 10) : "—")}
        ${detailItem("Last updated", item.updated_at ? String(item.updated_at).slice(0, 10) : "—")}
      </div>`;
    detailsModal.show();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

async function changeStatus(id, newStatus) {
  try {
    await apiRequest(`${API_URL}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status: newStatus })
    });
    showAlert(`Opportunity #${id} is now ${newStatus.toLowerCase()}.`);
    await loadOpportunities();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

async function deleteOpportunity(id) {
  const item = opportunities.find((opportunity) => opportunity.id === Number(id));
  const title = item ? item.title : `opportunity #${id}`;
  if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
  try {
    const result = await apiRequest(`${API_URL}/${id}`, { method: "DELETE" });
    showAlert(result.message || "Opportunity deleted successfully.");
    await loadOpportunities();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

document.getElementById("newOpportunityBtn").addEventListener("click", openCreateForm);
document.getElementById("searchInput").addEventListener("input", renderOpportunities);
document.getElementById("statusFilter").addEventListener("change", renderOpportunities);

list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  switch (button.dataset.action) {
    case "view": await viewDetails(id); break;
    case "edit": await openEditForm(id); break;
    case "close": await changeStatus(id, "Closed"); break;
    case "open": await changeStatus(id, "Open"); break;
    case "delete": await deleteOpportunity(id); break;
  }
});

document.getElementById("editFromDetailsBtn").addEventListener("click", () => {
  if (currentlyViewed !== null) openEditForm(currentlyViewed);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  form.classList.add("was-validated");
  formError.classList.add("d-none");

  if (!form.checkValidity()) {
    formError.textContent = "Please complete all required fields and check the values.";
    formError.classList.remove("d-none");
    return;
  }

  const positions = Number(document.getElementById("positions").value);
  if (!Number.isInteger(positions) || positions < 1) {
    formError.textContent = "Available positions must be a whole number greater than zero.";
    formError.classList.remove("d-none");
    return;
  }

  const payload = {
    title: document.getElementById("title").value.trim(),
    description: document.getElementById("description").value.trim(),
    research_area: document.getElementById("research_area").value.trim(),
    faculty_name: document.getElementById("faculty_name").value.trim(),
    department: document.getElementById("department").value.trim(),
    required_skills: document.getElementById("required_skills").value.trim(),
    positions,
    application_deadline: document.getElementById("application_deadline").value,
    status: document.getElementById("status").value
  };
  const id = document.getElementById("opportunityId").value;
  saveBtn.disabled = true;
  saveBtn.textContent = id ? "Saving…" : "Creating…";

  try {
    const result = await apiRequest(id ? `${API_URL}/${id}` : API_URL, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    opportunityModal.hide();
    showAlert(result.message || (id ? "Opportunity updated." : "Opportunity created."));
    await loadOpportunities();
  } catch (error) {
    formError.textContent = error.message;
    formError.classList.remove("d-none");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = id ? "Save changes" : "Save opportunity";
  }
});

loadOpportunities();
