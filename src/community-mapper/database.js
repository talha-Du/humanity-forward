const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || './resources.db';

let db = null;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database.');
      }
    });
  }
  return db;
}

function initDatabase() {
  const database = getDb();

  database.run(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('water', 'food', 'health', 'education')) NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      description TEXT,
      contact TEXT,
      lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Resources table ready.');
      seedSampleData(database);
    }
  });

  return database;
}

function seedSampleData(database) {
  const sampleData = [
    {
      name: 'Central Community Water Station',
      type: 'water',
      lat: 52.5200,
      lng: 13.4050,
      description: 'Free clean drinking water station available 24/7. Bring your own bottle.',
      contact: 'water@community.org'
    },
    {
      name: 'Northside Food Pantry',
      type: 'food',
      lat: 52.5250,
      lng: 13.4100,
      description: 'Weekly food distribution every Tuesday and Friday, 10 AM - 2 PM.',
      contact: '+49 30 12345678'
    },
    {
      name: 'Eastside Health Clinic',
      type: 'health',
      lat: 52.5150,
      lng: 13.4200,
      description: 'Basic health services, vaccinations, and first aid. Walk-ins welcome.',
      contact: 'clinic@health-local.de'
    },
    {
      name: 'Community Learning Center',
      type: 'education',
      lat: 52.5300,
      lng: 13.4000,
      description: 'Free workshops, literacy classes, and computer skills training.',
      contact: 'learn@community-center.org'
    },
    {
      name: 'Southside Emergency Shelter',
      type: 'food',
      lat: 52.5100,
      lng: 13.3950,
      description: 'Overnight shelter with hot meals. Open 6 PM - 8 AM daily.',
      contact: 'shelter@helpinghands.org'
    }
  ];

  database.get('SELECT COUNT(*) as count FROM resources', [], (err, row) => {
    if (err) {
      console.error('Error checking resources:', err.message);
      return;
    }

    if (row.count === 0) {
      const insertStmt = database.prepare(`
        INSERT INTO resources (name, type, lat, lng, description, contact, lastUpdated)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      sampleData.forEach((resource) => {
        insertStmt.run(
          resource.name,
          resource.type,
          resource.lat,
          resource.lng,
          resource.description,
          resource.contact
        );
      });

      insertStmt.finalize();
      console.log('Sample data seeded successfully.');
    }
  });
}

function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed.');
      }
    });
    db = null;
  }
}

module.exports = {
  getDb,
  initDatabase,
  closeDatabase
};
