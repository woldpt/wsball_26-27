const fs = require('fs');
const path = require('path');
const db = require('./database');

const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

db.exec(schema, (err) => {
  if (err) {
    console.error('Error initializing schema:', err);
  } else {
    console.log('Database schema created/verified.');
  }
  db.close();
});
