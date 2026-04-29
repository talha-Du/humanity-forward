const express = require('express');
const cors = require('cors');
const { getDb, initDatabase, closeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize database
initDatabase();

// GET /api/resources - List all resources
app.get('/api/resources', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM resources ORDER BY lastUpdated DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// POST /api/resources - Add new resource
app.post('/api/resources', (req, res) => {
  const { name, type, lat, lng, description, contact } = req.body;

  if (!name || !type || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Missing required fields: name, type, lat, lng' });
  }

  const validTypes = ['water', 'food', 'health', 'education'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }

  const db = getDb();
  const sql = `
    INSERT INTO resources (name, type, lat, lng, description, contact, lastUpdated)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;

  db.run(sql, [name, type, lat, lng, description || '', contact || ''], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ id: this.lastID, name, type, lat, lng, description, contact });
  });
});

// PUT /api/resources/:id - Update resource
app.put('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const { name, type, lat, lng, description, contact } = req.body;

  const db = getDb();

  // Check if resource exists
  db.get('SELECT * FROM resources WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const sql = `
      UPDATE resources
      SET name = ?, type = ?, lat = ?, lng = ?, description = ?, contact = ?, lastUpdated = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, [
      name || row.name,
      type || row.type,
      lat !== undefined ? lat : row.lat,
      lng !== undefined ? lng : row.lng,
      description !== undefined ? description : row.description,
      contact !== undefined ? contact : row.contact,
      id
    ], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Resource updated successfully', changes: this.changes });
    });
  });
});

// DELETE /api/resources/:id - Delete resource
app.delete('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();

  db.run('DELETE FROM resources WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    res.json({ message: 'Resource deleted successfully' });
  });
});

// GET /api/resources/search - Search nearby resources
app.get('/api/resources/search', (req, res) => {
  const { type, lat, lng, radius } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Missing required query parameters: lat, lng' });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const searchRadius = parseFloat(radius) || 5000; // Default 5km radius

  const db = getDb();

  // Haversine formula to calculate distance in meters
  let sql = `
    SELECT *,
      (6371000 * acos(
        cos(radians(?)) * cos(radians(lat)) *
        cos(radians(lng) - radians(?)) +
        sin(radians(?)) * sin(radians(lat))
      )) AS distance
    FROM resources
    WHERE distance < ?
  `;

  const params = [latitude, longitude, latitude, searchRadius];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  sql += ' ORDER BY distance';

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// GET /api/export - Export all resources as JSON
app.get('/api/export', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM resources ORDER BY id', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.setHeader('Content-Disposition', 'attachment; filename="resources.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(rows);
  });
});

// POST /api/import - Import resources from JSON
app.post('/api/import', (req, res) => {
  const resources = req.body;

  if (!Array.isArray(resources)) {
    return res.status(400).json({ error: 'Expected an array of resources' });
  }

  const db = getDb();
  const imported = [];
  const errors = [];

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const stmt = db.prepare(`
      INSERT INTO resources (name, type, lat, lng, description, contact, lastUpdated)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    resources.forEach((resource, index) => {
      const { name, type, lat, lng, description, contact } = resource;

      if (!name || !type || lat === undefined || lng === undefined) {
        errors.push({ index, error: 'Missing required fields' });
        return;
      }

      const validTypes = ['water', 'food', 'health', 'education'];
      if (!validTypes.includes(type)) {
        errors.push({ index, error: `Invalid type: ${type}` });
        return;
      }

      stmt.run(name, type, lat, lng, description || '', contact || '', function (err) {
        if (err) {
          errors.push({ index, error: err.message });
        } else {
          imported.push({ id: this.lastID, ...resource });
        }
      });
    });

    stmt.finalize();
    db.run('COMMIT', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        message: 'Import completed',
        imported: imported.length,
        errors: errors.length > 0 ? errors : undefined
      });
    });
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  closeDatabase();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Community Resource Mapper API running on http://localhost:${PORT}`);
});

module.exports = app;
