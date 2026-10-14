require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "research_portal",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

const allowedStatuses = ["Open", "Closed"];
const editableFields = [
  "title", "description", "research_area", "faculty_name", "department",
  "required_skills", "positions", "application_deadline", "status"
];

function validateOpportunity(data, isUpdate = false) {
  const errors = [];
  const requiredText = [
    ["title", "Research title"],
    ["description", "Research description"],
    ["research_area", "Research area"],
    ["faculty_name", "Faculty member's name"],
    ["department", "Department"],
    ["required_skills", "Required skills"]
  ];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["Request body must be a JSON object."];
  }

  for (const [field, label] of requiredText) {
    if (!isUpdate || Object.prototype.hasOwnProperty.call(data, field)) {
      if (typeof data[field] !== "string" || !data[field].trim()) {
        errors.push(`${label} is required and must be a non-empty string.`);
      }
    }
  }

  if (!isUpdate || Object.prototype.hasOwnProperty.call(data, "positions")) {
    const positions = data.positions;
    if (!Number.isInteger(positions) || positions < 1) {
      errors.push("Available positions must be a whole number greater than 0.");
    }
  }

  if (!isUpdate || Object.prototype.hasOwnProperty.call(data, "application_deadline")) {
    const deadline = data.application_deadline;
    if (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) ||
        Number.isNaN(Date.parse(`${deadline}T00:00:00Z`)) ||
        new Date(`${deadline}T00:00:00Z`).toISOString().slice(0, 10) !== deadline) {
      errors.push("Application deadline must be a valid date in YYYY-MM-DD format.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, "status") &&
      !allowedStatuses.includes(data.status)) {
    errors.push('Status must be either "Open" or "Closed".');
  }

  if (isUpdate) {
    const supplied = Object.keys(data);
    if (supplied.length === 0) errors.push("Provide at least one field to update.");
    const unknown = supplied.filter((key) => !editableFields.includes(key));
    if (unknown.length) errors.push(`Unknown or non-editable field(s): ${unknown.join(", ")}.`);
  }

  return errors;
}

function toOpportunity(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    research_area: row.research_area,
    faculty_name: row.faculty_name,
    department: row.department,
    required_skills: row.required_skills,
    positions: row.positions,
    application_deadline: row.application_deadline,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}


app.post("/api/opportunities", asyncRoute(async (req, res) => {
  const errors = validateOpportunity(req.body);
  if (errors.length) {
    return res.status(400).json({ success: false, message: "Validation failed.", errors });
  }

  const data = req.body;
  const sql = `INSERT INTO opportunities
    (title, description, research_area, faculty_name, department, required_skills,
     positions, application_deadline, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const values = [
    data.title.trim(), data.description.trim(), data.research_area.trim(),
    data.faculty_name.trim(), data.department.trim(), data.required_skills.trim(),
    data.positions, data.application_deadline, data.status || "Open"
  ];
  const [result] = await pool.execute(sql, values);
  const [rows] = await pool.execute("SELECT * FROM opportunities WHERE id = ?", [result.insertId]);
  return res.status(201).json({
    success: true,
    message: "Research opportunity created successfully.",
    data: toOpportunity(rows[0])
  });
}));


app.get("/api/opportunities", asyncRoute(async (_req, res) => {
  const [rows] = await pool.execute(
    "SELECT * FROM opportunities ORDER BY created_at DESC, id DESC"
  );
  res.status(200).json({ success: true, count: rows.length, data: rows.map(toOpportunity) });
}));


app.get("/api/opportunities/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: "ID must be a positive integer." });
  }
  const [rows] = await pool.execute("SELECT * FROM opportunities WHERE id = ?", [id]);
  if (!rows.length) {
    return res.status(404).json({ success: false, message: `Opportunity with ID ${id} was not found.` });
  }
  res.status(200).json({ success: true, data: toOpportunity(rows[0]) });
}));


app.put("/api/opportunities/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: "ID must be a positive integer." });
  }

  const errors = validateOpportunity(req.body, true);
  if (errors.length) {
    return res.status(400).json({ success: false, message: "Validation failed.", errors });
  }

  const [existing] = await pool.execute("SELECT id FROM opportunities WHERE id = ?", [id]);
  if (!existing.length) {
    return res.status(404).json({ success: false, message: `Opportunity with ID ${id} was not found.` });
  }

  const keys = Object.keys(req.body);
  const assignments = keys.map((key) => `\`${key}\` = ?`).join(", ");
  const values = keys.map((key) =>
    typeof req.body[key] === "string" &&
    ["title", "description", "research_area", "faculty_name", "department", "required_skills"].includes(key)
      ? req.body[key].trim()
      : req.body[key]
  );
  await pool.execute(`UPDATE opportunities SET ${assignments} WHERE id = ?`, [...values, id]);
  const [rows] = await pool.execute("SELECT * FROM opportunities WHERE id = ?", [id]);
  res.status(200).json({
    success: true,
    message: "Research opportunity updated successfully.",
    data: toOpportunity(rows[0])
  });
}));


app.delete("/api/opportunities/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: "ID must be a positive integer." });
  }
  const [result] = await pool.execute("DELETE FROM opportunities WHERE id = ?", [id]);
  if (!result.affectedRows) {
    return res.status(404).json({ success: false, message: `Opportunity with ID ${id} was not found.` });
  }
  res.status(200).json({ success: true, message: `Opportunity ${id} deleted successfully.` });
}));


app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found." });
});


app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Request body contains invalid JSON." });
  }
  if (err && err.code === "ER_NO_SUCH_TABLE") {
    return res.status(500).json({
      success: false,
      message: "Database table is missing. Run database/schema.sql first."
    });
  }
  res.status(500).json({ success: false, message: "Internal server error." });
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("Database connection successful.");
    app.listen(PORT, () => {
      console.log(`Research Opportunity Portal running at http://localhost:${PORT}`);
      console.log(`API endpoint: http://localhost:${PORT}/api/opportunities`);
    });
  } catch (error) {
    console.error("Could not connect to MySQL. Check that MySQL is running and .env settings are correct.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
